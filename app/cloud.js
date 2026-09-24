/* Optional Google sign-in and collection sync (browser + Node for tests).
 *
 * Uses the same Firebase project layout as RockMin ID, so one Google account
 * works in both apps and saved samples appear in both:
 *   users/{uid}/savedSamples/{id}  - schema checked by RockMin's
 *                                    firestore.rules (isValidSavedSample)
 *   feedback/{id}                  - see ui.js
 *
 * Sign-in uses the bundled Firebase Auth SDK (app/vendor, hash-pinned),
 * loaded only when the visitor clicks "Sign in" or was signed in before;
 * data goes through the Firestore REST API with the user's ID token, so the
 * large Firestore SDK is not needed. Everything is inert unless
 * window.OHARA_CONFIG.firebase is set (app/config.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OharaCloud = factory();
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SDK = [
    { src: "vendor/firebase-app-compat-12.19.0.js",
      sri: "sha512-4vhrvql0JRsm7uZqS5fzHvGi7gVUiqTRe0y/kyhsCYkyB7mEWZZBIkBlzW0+LA6wGFRCsxZhGl1IZNP0b852WA==" },
    { src: "vendor/firebase-auth-compat-12.19.0.js",
      sri: "sha512-ahLV4v/pGu9QcmfbZjdmF00a3HVnWcH9tj/werwQldaqKqyya8QPYONrLoRfPT3BwB1YKEQf+B/1EYGeglNZvA==" }
  ];
  var SIGNED_IN_FLAG = "ohara_signed_in";
  var ID_RE = /^[a-zA-Z0-9_\-]+$/;

  // ------------------------------------------------ Firestore REST values
  function encodeValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") {
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    }
    if (typeof v === "string") return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
    var fields = {};
    Object.keys(v).forEach(function (k) { if (v[k] !== undefined) fields[k] = encodeValue(v[k]); });
    return { mapValue: { fields: fields } };
  }
  function decodeValue(v) {
    if (!v || "nullValue" in v) return null;
    if ("booleanValue" in v) return v.booleanValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("stringValue" in v) return v.stringValue;
    if ("timestampValue" in v) return v.timestampValue;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
    if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
    return null;
  }
  function encodeFields(obj) { return encodeValue(obj).mapValue.fields; }
  function decodeFields(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (k) { out[k] = decodeValue(fields[k]); });
    return out;
  }

  // ------------------------------------------- collection <-> RockMin schema
  function newId() {
    return "tetrascope_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }
  function ensureIds(list) {
    var changed = false;
    list.forEach(function (it) {
      if (!it.id || !ID_RE.test(it.id)) { it.id = newId(); changed = true; }
      if (!it.savedAt) { it.savedAt = new Date().toISOString(); changed = true; }
    });
    return changed;
  }
  /* A TetraScope collection item -> a document that satisfies RockMin ID's
   * isValidSavedSample rule. Oxide strings become numbers; unusable values
   * are dropped (the item was validated when saved). */
  function toSavedSample(item, uid) {
    var oxides = {};
    Object.keys(item.oxides || {}).forEach(function (k) {
      var v = Number(String(item.oxides[k]).trim());
      if (String(item.oxides[k]).trim() !== "" && isFinite(v)) oxides[k === "FeO*" ? "FeOT" : k] = v;
    });
    var doc = {
      id: item.id, userId: uid,
      name: String(item.label || "sample").slice(0, 120) || "sample",
      sampleType: "custom",
      oxides: oxides,
      notes: "Saved in TetraScope (O'Hara projection workbench)",
      tags: ["tetrascope"],
      createdAt: String(item.savedAt || new Date().toISOString()).slice(0, 40),
      tetrascope: { feRatio: typeof item.feRatio === "number" && isFinite(item.feRatio) ? item.feRatio : 0.15,
                    plagMode: item.plagMode === "ab" ? "ab" : "plag" }
    };
    return doc;
  }
  function fromSavedSample(doc) {
    var ox = {};
    Object.keys(doc.oxides || {}).forEach(function (k) { ox[k === "FeOT" ? "FeO*" : k] = String(doc.oxides[k]); });
    var ts = doc.tetrascope || {};
    return { id: doc.id, label: doc.name || "sample", oxides: ox,
             feRatio: typeof ts.feRatio === "number" ? ts.feRatio : 0.15,
             plagMode: ts.plagMode === "ab" ? "ab" : "plag",
             savedAt: doc.createdAt, source: (doc.tags || []).indexOf("tetrascope") >= 0 ? "tetrascope" : "rockmin" };
  }
  /* The constraints of RockMin's isValidSavedSample, for tests. */
  function isValidSavedSample(d, uid) {
    return typeof d.id === "string" && d.id.length <= 128 && ID_RE.test(d.id) &&
      d.userId === uid &&
      typeof d.name === "string" && d.name.length > 0 && d.name.length <= 120 &&
      ["rock", "mineral", "custom"].indexOf(d.sampleType) >= 0 &&
      d.oxides && typeof d.oxides === "object" && !Array.isArray(d.oxides) &&
      (!("notes" in d) || (typeof d.notes === "string" && d.notes.length <= 2000)) &&
      (!("tags" in d) || (Array.isArray(d.tags) && d.tags.length <= 15)) &&
      typeof d.createdAt === "string" && d.createdAt.length <= 40;
  }
  /* Union by id. Returns {merged, upload}: items only held locally must be
   * uploaded; items in the cloud but not here are added locally. */
  function mergeCollections(local, cloud) {
    var byId = {}, merged = [], upload = [];
    cloud.forEach(function (c) { byId[c.id] = c; });
    local.forEach(function (l) {
      if (!byId[l.id]) upload.push(l);
      merged.push(l);
      delete byId[l.id];
    });
    Object.keys(byId).forEach(function (id) { merged.push(byId[id]); });
    merged.sort(function (a, b) { return String(b.savedAt).localeCompare(String(a.savedAt)); });
    return { merged: merged, upload: upload };
  }

  // ------------------------------------------------------------- browser
  var state = { cfg: null, app: null, user: null, listeners: [], loading: null };

  function configured(cfg) {
    return !!(cfg && cfg.apiKey && cfg.projectId && cfg.authDomain && cfg.appId);
  }
  function flag(v) {
    try {
      if (v === undefined) return localStorage.getItem(SIGNED_IN_FLAG) === "1";
      if (v) localStorage.setItem(SIGNED_IN_FLAG, "1"); else localStorage.removeItem(SIGNED_IN_FLAG);
    } catch (e) { return false; }
  }
  function loadScript(s) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = s.src;
      if (/^https?:$/.test(location.protocol)) { el.integrity = s.sri; el.crossOrigin = "anonymous"; }
      el.onload = resolve;
      el.onerror = function () { reject(new Error("could not load " + s.src)); };
      document.head.appendChild(el);
    });
  }
  function loadSdk() {
    if (state.loading) return state.loading;
    state.loading = loadScript(SDK[0]).then(function () { return loadScript(SDK[1]); }).then(function () {
      var fb = window.firebase;
      state.app = fb.apps.length ? fb.app() : fb.initializeApp({
        apiKey: state.cfg.apiKey, authDomain: state.cfg.authDomain,
        projectId: state.cfg.projectId, appId: state.cfg.appId });
      state.app.auth().onAuthStateChanged(function (u) {
        state.user = u ? { uid: u.uid, email: u.email || "", name: u.displayName || "",
                           photo: u.photoURL || "", raw: u } : null;
        flag(!!u);
        state.listeners.forEach(function (fn) { try { fn(state.user); } catch (e) {} });
      });
      return state.app;
    });
    return state.loading;
  }

  function init(cfg) {
    state.cfg = cfg || null;
    if (!configured(cfg)) return false;
    if (flag()) loadSdk().catch(function () { flag(false); });   // restore a previous session
    return true;
  }
  function onChange(fn) { state.listeners.push(fn); }
  function currentUser() { return state.user; }

  function signIn() {
    if (!configured(state.cfg)) return Promise.reject(new Error("sign-in is not configured for this site"));
    return loadSdk().then(function (app) {
      var provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return app.auth().signInWithPopup(provider).catch(function (e) {
        if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment"))
          return app.auth().signInWithRedirect(provider);
        throw e;
      });
    });
  }
  function signOut() {
    flag(false);
    return state.app ? state.app.auth().signOut() : Promise.resolve();
  }

  function base() {
    return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(state.cfg.projectId)
      + "/databases/" + encodeURIComponent(state.cfg.databaseId || "(default)") + "/documents/";
  }
  function authed(method, path, body) {
    if (!state.user) return Promise.reject(new Error("not signed in"));
    return state.user.raw.getIdToken().then(function (token) {
      return fetch(base() + path, {
        method: method,
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined });
    }).then(function (r) {
      if (!r.ok && !(method === "DELETE" && r.status === 404))
        return r.text().then(function (t) { throw new Error("cloud " + method + " failed (" + r.status + "): " + t.slice(0, 200)); });
      return method === "DELETE" ? null : r.json();
    });
  }
  function samplesPath() { return "users/" + encodeURIComponent(state.user.uid) + "/savedSamples"; }

  function listSamples() {
    var out = [];
    function page(token) {
      return authed("GET", samplesPath() + "?pageSize=300" + (token ? "&pageToken=" + encodeURIComponent(token) : ""))
        .then(function (res) {
          (res.documents || []).forEach(function (d) { out.push(fromSavedSample(decodeFields(d.fields))); });
          return res.nextPageToken ? page(res.nextPageToken) : out;
        });
    }
    return page(null);
  }
  function putSample(item) {
    var doc = toSavedSample(item, state.user.uid);
    return authed("PATCH", samplesPath() + "/" + encodeURIComponent(item.id), { fields: encodeFields(doc) });
  }
  function deleteSample(id) {
    return authed("DELETE", samplesPath() + "/" + encodeURIComponent(id));
  }
  /* Merge the local collection with the account's, upload what is only
   * local, and return the merged list for the caller to store locally. */
  function sync(local) {
    ensureIds(local);
    return listSamples().then(function (cloud) {
      var m = mergeCollections(local, cloud);
      return Promise.all(m.upload.map(putSample)).then(function () {
        return { merged: m.merged, uploaded: m.upload.length, downloaded: m.merged.length - local.length };
      });
    });
  }

  return {
    SDK: SDK, encodeValue: encodeValue, decodeValue: decodeValue,
    encodeFields: encodeFields, decodeFields: decodeFields,
    toSavedSample: toSavedSample, fromSavedSample: fromSavedSample,
    isValidSavedSample: isValidSavedSample, mergeCollections: mergeCollections,
    ensureIds: ensureIds, configured: configured,
    init: init, onChange: onChange, currentUser: currentUser,
    signIn: signIn, signOut: signOut, sync: sync,
    putSample: putSample, deleteSample: deleteSample
  };
}));
