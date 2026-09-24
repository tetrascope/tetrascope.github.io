/* Workbench user interface. All science lives in ohara.js; this file only
 * reads inputs, calls the engine and draws results. */
(function () {
"use strict";

var O = window.Ohara, CSV = window.OharaCSV, LABELS = window.OharaLabels;
var DATA = window.OHARA_DATASETS || {};
var CONFIG = window.OHARA_CONFIG || {};
var OXIDE_FIELDS = ["SiO2", "TiO2", "Al2O3", "Cr2O3", "Fe2O3", "FeO", "FeO*", "MnO",
                    "NiO", "MgO", "CaO", "Na2O", "K2O", "P2O5"];
var NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
var KEY_THEME = "ohara_theme_preference", KEY_COLL = "ohara_collection_v1",
    KEY_FB = "ohara_feedback_history_v1";

var state = { comp: null, rep: null, res: null, err: null, spec: null, dataset: [],
              datasetName: "", dataRes: [], space: "cmas", custom: false,
              rotX: -0.45, rotY: 0.7 };

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/[<>&"']/g, function (c) {
    return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function fmt(v, d) { return (v === null || v === undefined || !isFinite(v)) ? "-" : v.toFixed(d === undefined ? 2 : d); }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { return null; }
}
function toast(msg) {
  var t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 2400);
}
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext)
    return navigator.clipboard.writeText(text).then(function () { toast("Copied"); });
  var ta = document.createElement("textarea");
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); toast("Copied"); } catch (e) { toast("Copy failed - select and copy manually"); }
  ta.remove();
  return Promise.resolve();
}
function download(name, type, data) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}
function csvCell(s) { s = String(s); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

// ------------------------------------------------------------------- theme
function effectiveTheme() {
  var t = document.documentElement.getAttribute("data-theme");
  if (t === "light" || t === "dark") return t;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function syncThemeSwitch() {
  var light = effectiveTheme() === "light", sw = $("themeSwitch");
  sw.setAttribute("aria-checked", light ? "true" : "false");
  sw.title = "Switch to " + (light ? "dark" : "light") + " mode";
  $("themeThumb").innerHTML = light ? SUN : MOON;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#ffffff" : "#1f2124");
}
$("themeSwitch").addEventListener("click", function () {
  var next = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(KEY_THEME, next); } catch (e) {}
  syncThemeSwitch(); draw3D(); draw2D();
});
if (window.matchMedia) {
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  var onScheme = function () { syncThemeSwitch(); draw3D(); draw2D(); };
  if (mq.addEventListener) mq.addEventListener("change", onScheme); else if (mq.addListener) mq.addListener(onScheme);
}

// ------------------------------------------------------------ input panel
var grid = $("oxgrid");
OXIDE_FIELDS.forEach(function (ox) {
  var d = document.createElement("div"), id = "ox_" + ox.replace("*", "T");
  d.innerHTML = '<label for="' + id + '">' + (ox === "FeO*" ? "FeO* (total)" : ox) + '</label>'
    + '<input id="' + id + '" data-ox="' + ox + '" inputmode="decimal" placeholder="0" autocomplete="off">';
  grid.appendChild(d);
});
grid.addEventListener("input", function (e) {
  var v = e.target.value.trim();
  e.target.setAttribute("aria-invalid", v !== "" && (!NUMBER_RE.test(v) || parseFloat(v) < 0) ? "true" : "false");
});

var EXAMPLES = {};
((DATA.examples && DATA.examples.rows) || []).forEach(function (r) { EXAMPLES[r.label] = r.oxides; });
((DATA.yoder_tilley_1962 && DATA.yoder_tilley_1962.rows) || []).forEach(function (r) { EXAMPLES[r.label] = r.oxides; });
((DATA.tilley_yoder_schairer && DATA.tilley_yoder_schairer.rows) || []).forEach(function (r) { EXAMPLES[r.label] = r.oxides; });
Object.keys(EXAMPLES).forEach(function (k) {
  var o = document.createElement("option"); o.value = k; o.textContent = k; $("examples").appendChild(o);
});

function readOxides() {
  var out = {};
  grid.querySelectorAll("input").forEach(function (i) { if (i.value.trim() !== "") out[i.dataset.ox] = i.value.trim(); });
  return out;
}
function writeOxides(ox) {
  grid.querySelectorAll("input").forEach(function (i) {
    var v = ox[i.dataset.ox];
    i.value = (v !== undefined && v !== null) ? v : "";
    i.setAttribute("aria-invalid", "false");
  });
}
function readOptions() {
  var fr = $("feratio").value.trim();
  return { label: $("label").value.trim() || "sample",
           feRatio: fr === "" ? NaN : Number(fr),
           plagMode: $("plagmode").value };
}
function showInputError(msg) {
  var el = $("inputError");
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg; el.classList.remove("hidden");
}

function fillProjections() {
  var sel = $("proj"), prev = sel.value;
  sel.innerHTML = "";
  O.PROJECTIONS.filter(function (p) { return p.space === state.space; }).forEach(function (p) {
    var o = document.createElement("option"); o.value = p.id; o.textContent = p.title; sel.appendChild(o);
  });
  if (Array.prototype.some.call(sel.options, function (o) { return o.value === prev; })) sel.value = prev;
  var keys = Object.keys(state.space === "cmas" ? O.CMAS_ENDMEMBERS : O.BASALT_ENDMEMBERS);
  ["p1", "p2", "b1", "b2", "b3"].forEach(function (id) {
    var s = $(id); s.innerHTML = "";
    if (id === "p2" || id === "b3") {
      var none = document.createElement("option"); none.value = ""; none.textContent = "(none)"; s.appendChild(none);
    }
    keys.forEach(function (k) {
      var o = document.createElement("option"); o.value = k;
      o.textContent = k + " - " + O.endmemberName(state.space, k); s.appendChild(o);
    });
  });
  var defs = state.space === "cmas" ? ["M2S", "", "CS", "MS", "A"] : ["Di", "", "Ol", "Ne", "Qz"];
  ["p1", "p2", "b1", "b2", "b3"].forEach(function (id, i) { $(id).value = defs[i]; });
  updateCustomNote();
}
function currentSpec() {
  if (!state.custom) {
    var id = $("proj").value;
    return O.PROJECTIONS.filter(function (p) { return p.id === id; })[0];
  }
  var pts = [$("p1").value]; if ($("p2").value) pts.push($("p2").value);
  var basis = [$("b1").value, $("b2").value]; if ($("b3").value) basis.push($("b3").value);
  return { space: state.space, points: pts, basis: basis, id: "custom", source: "user-defined",
           title: "from " + pts.join(" + ") + " into " + basis.join("-") };
}
function updateCustomNote() {
  var spec = currentSpec(); if (!state.custom || !spec) return;
  var n = spec.points.length + spec.basis.length;
  $("customnote").textContent = n === 4
    ? "valid shape: " + spec.points.length + " projection point(s) + " + spec.basis.length + " target vertices"
    : "a projection needs four reference points in total (currently " + n + ")";
}

// ------------------------------------------------------------ calculation
function calculate(silent) {
  var opts = readOptions(), ox = readOxides();
  try {
    state.comp = new O.Composition(ox, opts);
  } catch (e) {
    if (e.name !== "InputError") throw e;
    state.comp = null; state.rep = null; state.res = null;
    showInputError(e.message);
    renderAll();
    return false;
  }
  showInputError(null);
  state.rep = O.report(state.comp);
  runProjection();
  if (!silent) writeHash();
  return true;
}

function runProjection() {
  var spec = currentSpec();
  state.spec = spec;
  if (state.comp) {
    try { state.res = O.projectSpec(state.comp, spec); state.err = null; }
    catch (e) { if (e.name !== "ProjectionError") throw e; state.res = null; state.err = e.message; }
  }
  state.dataRes = state.dataset.map(function (d) {
    var r = null, err = null;
    try { r = O.projectSpec(d.comp, spec); } catch (e) { err = e.message; }
    return { label: d.label, comp: d.comp, res: r, err: err, rep: d.rep };
  });
  renderAll();
}

// -------------------------------------------------------------- rendering
function renderAll() {
  renderClass(); renderProj(); renderComp(); renderAssume(); renderTable();
  draw3D(); draw2D();
}
function renderClass() {
  var r = state.rep, el = $("classout");
  if (!r) { el.innerHTML = '<span class="muted">enter a composition and press Calculate</span>'; return; }
  var h = '<div><b>' + esc(r.ytGroup) + '</b></div>'
    + '<div class="muted" style="margin-top:6px">CMAS subvolume</div><div>' + esc(r.cmasSubspace) + '</div>'
    + '<div class="muted" style="margin-top:8px">position relative to the dividing planes</div><table>';
  (state.space === "cmas" ? r.cmasPlanes : r.basaltPlanes).forEach(function (p) {
    h += '<tr><td>' + esc(p.plane) + '</td><td class="n">' + esc(p.sign) + '</td><td>' + esc(p.side) + '</td></tr>';
  });
  el.innerHTML = h + '</table>';
}
function renderProj() {
  var el = $("projout");
  if (state.err) { el.innerHTML = '<div class="bad">' + esc(state.err) + '</div>'; return; }
  var r = state.res; if (!r) { el.innerHTML = "&mdash;"; return; }
  var h = '<div><b>' + esc(r.title) + '</b></div>' + (r.source ? '<div class="muted">' + esc(r.source) + '</div>' : "")
    + '<table style="margin-top:6px"><tr><th>component</th><th class="n">wt %</th><th class="n">formula units</th></tr>';
  Object.keys(r.components).forEach(function (k) {
    h += '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(r.components[k], 3) + '</td><td class="n">' + fmt(r.formulaUnits[k], 4) + '</td></tr>';
  });
  h += '</table><div class="muted" style="margin-top:6px">plot coordinates: x = ' + fmt(r.xy[0], 4) + ', y = ' + fmt(r.xy[1], 4)
    + ' (unit-side ' + (r.diagram === "ternary" ? "triangle" : "join") + '); condition number ' + fmt(r.conditionNumber, 1) + '</div>';
  r.projectionLine.forEach(function (l) { h += '<div class="muted">' + esc(l) + '</div>'; });
  if (r.note) h += '<div class="muted" style="margin-top:6px">' + esc(r.note) + '</div>';
  r.warnings.forEach(function (w) { h += '<div class="warn" style="margin-top:6px">&#9888; ' + esc(w) + '</div>'; });
  el.innerHTML = h;
}
function renderComp() {
  var r = state.rep, el = $("compout");
  if (!r) { el.innerHTML = "&mdash;"; return; }
  var h = '<table><tr><th>CMAS</th><th class="n">weight units</th><th class="n">wt %</th></tr>';
  ["C", "M", "A", "S"].forEach(function (k) {
    h += '<tr><td>' + k + '</td><td class="n">' + fmt(r.cmas[k], 3) + '</td><td class="n">' + fmt(r.cmasPct[k], 2) + '</td></tr>';
  });
  h += '</table><table style="margin-top:8px"><tr><th>tetrahedron</th><th class="n">wt %</th></tr>';
  ["Di", "Ol", "Ne", "Qz"].forEach(function (k) { h += '<tr><td>' + k + '</td><td class="n">' + fmt(r.basaltPct[k], 2) + '</td></tr>'; });
  h += '</table><table style="margin-top:8px"><tr><th>CIPW norm</th><th class="n">wt %</th></tr>';
  Object.keys(r.norm).sort(function (a, b) { return r.norm[b] - r.norm[a]; }).forEach(function (k) {
    h += '<tr><td>' + esc(k) + '</td><td class="n">' + fmt(r.norm[k], 2) + '</td></tr>';
  });
  el.innerHTML = h + '</table>';
}
function renderAssume() {
  var el = $("assumeout");
  if (!state.rep) { el.innerHTML = "&mdash;"; return; }
  var list = state.rep.assumptions;
  el.innerHTML = list.length ? '<ul>' + list.map(function (a) {
    return '<li' + (/^WARNING/.test(a) ? ' class="warn"' : "") + '>' + esc(a) + '</li>';
  }).join("") + '</ul>' : '<span class="muted">none beyond the standard reduction</span>';
}
function resultRows() {
  var rows = [];
  if (state.res) rows.push({ label: state.comp.label, rep: state.rep, res: state.res });
  state.dataRes.forEach(function (d) { if (d.res) rows.push({ label: d.label, rep: d.rep, res: d.res }); });
  return rows;
}
function renderTable() {
  var el = $("tabout"), rows = resultRows();
  if (!rows.length) { el.innerHTML = '<div class="muted">nothing calculated yet</div>'; return; }
  var keys = Object.keys(rows[0].res.components);
  var h = '<table><tr><th>sample</th>' + keys.map(function (k) { return '<th class="n">' + esc(k) + '</th>'; }).join("")
    + '<th class="n">x</th><th class="n">y</th><th>Yoder &amp; Tilley group</th></tr>';
  rows.forEach(function (r) {
    h += '<tr><td>' + esc(r.label) + '</td>' + keys.map(function (k) { return '<td class="n">' + fmt(r.res.components[k], 2) + '</td>'; }).join("")
      + '<td class="n">' + fmt(r.res.xy[0], 4) + '</td><td class="n">' + fmt(r.res.xy[1], 4) + '</td><td>' + esc(r.rep.ytGroup.split(" (")[0]) + '</td></tr>';
  });
  var skipped = state.dataRes.filter(function (d) { return d.err; });
  if (skipped.length) h += '<tr><td colspan="' + (keys.length + 4) + '" class="warn">' + skipped.length
    + ' dataset composition(s) cannot be shown in this projection: ' + esc(skipped[0].err) + '</td></tr>';
  el.innerHTML = h + '</table>';
}

// -------------------------------------------------------------------- 2-D
var SVG_W = 640, SVG_H = 640, PAD = 70, TOP = 96;
function draw2D() {
  var wrap = $("svgwrap"), spec = state.spec;
  if (!spec) { wrap.innerHTML = ""; return; }
  var ink = cssVar("--ink"), muted = cssVar("--muted"), line = cssVar("--line"), panel = cssVar("--panel");
  var cSample = cssVar("--sample"), cData = cssVar("--data"), cRef = cssVar("--ref");
  var side = SVG_W - 2 * PAD, binary = spec.basis.length === 2;
  var baseY = binary ? TOP + 220 : TOP + (Math.sqrt(3) / 2) * side + 10;
  var H = binary ? TOP + 330 : SVG_H;
  function P(x, y) { return [PAD + x * side, baseY - y * side]; }
  var s = [], reserved = [], items = [], offDiagram = [], ticks = [], markers = [];
  var bounds = { x0: 4, y0: TOP - 10, x1: SVG_W - 4, y1: H - 4 };
  function inView(p) { return p[0] >= bounds.x0 && p[0] <= bounds.x1 && p[1] >= bounds.y0 && p[1] <= bounds.y1; }
  function txt(x, y, t, anchor, size, fill, weight) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '" font-size="' + size
      + '" fill="' + fill + '"' + (weight ? ' font-weight="' + weight + '"' : "") + '>' + esc(t) + '</text>';
  }
  function ln(a, b, c, w, dash) {
    return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1)
      + '" stroke="' + c + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") + '/>';
  }
  function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }

  s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SVG_W + ' ' + H + '" font-family="Segoe UI, Arial, sans-serif" role="img" aria-label="' + esc(spec.title || "projection") + '">');
  s.push('<rect width="100%" height="100%" fill="' + panel + '"/>');
  // title block (reserved)
  s.push(txt(SVG_W / 2, 30, spec.title || "", "middle", 15, ink, 600));
  s.push(txt(SVG_W / 2, 50, "projected from " + spec.points.join(" + ") + " — weight per cent", "middle", 12, muted));
  if (spec.source) s.push(txt(SVG_W / 2, 67, spec.source, "middle", 11, muted));
  reserved.push({ x0: 0, y0: 0, x1: SVG_W, y1: 76 });

  var vertexPts;
  if (binary) {
    var a = P(0, 0), b = P(1, 0);
    vertexPts = [a, b];
    s.push(ln(a, b, ink, 1.6));
    for (var i = 0; i <= 10; i++) {
      var p = P(i / 10, 0);
      s.push(ln(p, [p[0], p[1] + 7], ink, 1));
      ticks.push({ x: p[0], y: p[1] + 21, t: String(i * 10) });
    }
    s.push(txt(a[0], a[1] - 16, spec.basis[0], "middle", 14, ink, 600));
    s.push(txt(b[0], b[1] - 16, spec.basis[1], "middle", 14, ink, 600));
    s.push(txt(SVG_W / 2, a[1] + 42, "wt % " + spec.basis[1] + " (of " + spec.basis[0] + " + " + spec.basis[1] + ")", "middle", 11, muted));
    reserved.push({ x0: 0, y0: a[1] + 2, x1: SVG_W, y1: a[1] + 48 });
    [a, b].forEach(function (v) { reserved.push({ x0: v[0] - 20, y0: v[1] - 32, x1: v[0] + 20, y1: v[1] - 10 }); });
  } else {
    var v0 = P(0, 0), v1 = P(1, 0), v2 = P(0.5, Math.sqrt(3) / 2);
    vertexPts = [v0, v1, v2];
    for (var g = 1; g < 10; g++) {
      var f = g / 10;
      s.push(ln(mix(v0, v2, f), mix(v1, v2, f), line, 0.7));
      s.push(ln(mix(v0, v1, f), mix(v0, v2, f), line, 0.7));
      s.push(ln(mix(v1, v0, f), mix(v1, v2, f), line, 0.7));
    }
    s.push('<polygon points="' + [v0, v1, v2].map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ")
      + '" fill="none" stroke="' + ink + '" stroke-width="1.6"/>');
    // tick labels on the base (percent of the right-hand vertex)
    for (var t = 20; t <= 80; t += 20) {
      var tp = P(t / 100, 0);
      ticks.push({ x: tp[0], y: tp[1] + 15, t: String(t) });
    }
    s.push(txt(v0[0] - 10, v0[1] + 30, spec.basis[0], "end", 14, ink, 600));
    s.push(txt(v1[0] + 10, v1[1] + 30, spec.basis[1], "start", 14, ink, 600));
    s.push(txt(v2[0], v2[1] - 12, spec.basis[2], "middle", 14, ink, 600));
    reserved.push({ x0: 0, y0: v0[1] + 4, x1: SVG_W, y1: v0[1] + 36 });
    reserved.push({ x0: v2[0] - 40, y0: v2[1] - 30, x1: v2[0] + 40, y1: v2[1] - 6 });
  }

  var tickInsert = s.length;
  // reference phases
  var keys = Object.keys(spec.space === "cmas" ? O.CMAS_ENDMEMBERS : O.BASALT_ENDMEMBERS);
  var refMarks = [];
  keys.forEach(function (k) {
    var fake = { vector: function () { return O.vec(spec.space, k); }, assumptions: [] };
    var r; try { r = O.projectSpec(fake, spec); } catch (e) { return; }
    var p = binary ? P(r.xy[0], 0) : P(r.xy[0], r.xy[1]);
    if (!inView(p)) return;
    var atVertex = vertexPts.some(function (v) { return Math.abs(v[0] - p[0]) < 4 && Math.abs(v[1] - p[1]) < 4; });
    var dup = refMarks.some(function (m) { return Math.abs(m.p[0] - p[0]) < 1 && Math.abs(m.p[1] - p[1]) < 1; });
    refMarks.push({ p: p, k: k });
    markers.push({ x: p[0], y: p[1], r: 3 });
    s.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + cRef + '"><title>'
      + esc(k + " - " + O.endmemberName(spec.space, k)) + '</title></circle>');
    if (!atVertex && !dup) items.push({ x: p[0], y: p[1], text: k, size: 10.5, r: 3, priority: 1, fill: cRef });
    else reserved.push({ x0: p[0] - 4, y0: p[1] - 4, x1: p[0] + 4, y1: p[1] + 4 });
  });

  var showDataLabels = $("showDataLabels").checked;
  state.dataRes.forEach(function (d) {
    if (!d.res) return;
    var p = binary ? P(d.res.xy[0], 0) : P(d.res.xy[0], d.res.xy[1]);
    if (!inView(p)) { offDiagram.push(d.label); return; }
    markers.push({ x: p[0], y: p[1], r: 4.5 });
    s.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4.5" fill="' + cData
      + '" fill-opacity="0.85"><title>' + esc(d.label + ": " + Object.keys(d.res.components).map(function (k) {
        return k + " " + d.res.components[k].toFixed(1); }).join(", ")) + '</title></circle>');
    if (showDataLabels) items.push({ x: p[0], y: p[1], text: shortLabel(d.label), size: 10, r: 4.5, priority: 2, fill: cData });
    else reserved.push({ x0: p[0] - 5.5, y0: p[1] - 5.5, x1: p[0] + 5.5, y1: p[1] + 5.5 });   // obstacle only
  });
  if (state.res) {
    var sp = binary ? P(state.res.xy[0], 0) : P(state.res.xy[0], state.res.xy[1]);
    if (inView(sp)) {
      markers.push({ x: sp[0], y: sp[1], r: 6.5 });
      s.push('<circle cx="' + sp[0].toFixed(1) + '" cy="' + sp[1].toFixed(1) + '" r="6.5" fill="' + cSample
        + '" stroke="' + panel + '" stroke-width="1.5"><title>' + esc(state.comp.label) + '</title></circle>');
      items.push({ x: sp[0], y: sp[1], text: state.comp.label, size: 12.5, r: 7, priority: 10, required: true, fill: cSample, weight: 600 });
    } else offDiagram.unshift(state.comp.label + " (sample)");
  }

  // tick labels are drawn only where they do not sit on a data point
  ticks.forEach(function (tk) {
    var w = measureText(tk.t, 9.5) / 2 + 1;
    var box = { x0: tk.x - w, y0: tk.y - 10, x1: tk.x + w, y1: tk.y + 2 };
    var hit = markers.some(function (m) { return LABELS.overlaps(box, { x0: m.x - m.r, y0: m.y - m.r, x1: m.x + m.r, y1: m.y + m.r }); });
    if (!hit) s.splice(tickInsert, 0, txt(tk.x, tk.y, tk.t, "middle", 9.5, muted));
  });
  LABELS.place(items, reserved, bounds, { measure: measureText });
  items.forEach(function (it) {
    if (!it.placed) return;
    if (it.leader) {
      var bx = Math.min(Math.max(it.x, it.box.x0), it.box.x1), by = Math.min(Math.max(it.y, it.box.y0), it.box.y1);
      s.push(ln([it.x, it.y], [bx, by], it.fill, 0.8));
    }
    s.push(txt(it.lx, it.ly, it.text, "start", it.size, it.fill, it.weight));
  });
  s.push('</svg>');
  wrap.innerHTML = s.join("");

  var cap = (spec.source ? spec.source + ". " : "") + "Grey points are the reference phases of the system in this projection (hover for names).";
  var hidden = items.filter(function (i) { return !i.placed; }).length;
  if (hidden) cap += " " + hidden + " label(s) omitted to avoid overlaps; hover the points.";
  if (offDiagram.length) cap += " Outside the visible diagram: " + offDiagram.slice(0, 6).join(", ")
    + (offDiagram.length > 6 ? " and " + (offDiagram.length - 6) + " more" : "") + " (see the table of results).";
  $("cap2d").textContent = cap;
}
var measureCtx = document.createElement("canvas").getContext("2d");
function measureText(text, size, weight) {
  measureCtx.font = (weight || 400) + " " + size + "px Segoe UI, Arial, sans-serif";
  return measureCtx.measureText(String(text)).width;
}
function shortLabel(l) { l = String(l); return l.length > 22 ? l.slice(0, 21) + "…" : l; }

// -------------------------------------------------------------------- 3-D
var cv = $("cv"), ctx = cv.getContext("2d");
function resize() {
  var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (!r.width) return;
  cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw3D();
}
window.addEventListener("resize", function () { resize(); });
function rot(p) {
  var cx = Math.cos(state.rotX), sx = Math.sin(state.rotX), cy = Math.cos(state.rotY), sy = Math.sin(state.rotY);
  var x = p[0] - 0.5, y = p[1] - 0.29, z = p[2] - 0.2;
  var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}
function proj3(p) {
  var r = rot(p), w = cv.clientWidth, h = cv.clientHeight, sc = Math.min(w, h) * 0.62, d = 3.2 / (3.2 - r[2]);
  return [w / 2 + r[0] * sc * d, h / 2 - r[1] * sc * d];
}
function rgba(triplet, a) { return "rgba(" + triplet + "," + a + ")"; }
function draw3D() {
  var w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  ctx.clearRect(0, 0, w, h);
  var space = state.space, V = O.TETRA_VERTS;
  var labels = space === "cmas" ? ["C", "M", "A", "S"] : ["Di", "Ol", "Ne", "Qz"];
  var ink = cssVar("--ink"), muted = cssVar("--muted"), ref = cssVar("--ref");
  var planeCols = [cssVar("--plane1"), cssVar("--plane2")];
  if ($("showplanes").checked) {
    var planes = space === "cmas" ? O.CMAS_PLANES.slice(0, 2) : O.BASALT_PLANES;
    planes.forEach(function (pl, i) {
      var pts = pl.plane.map(function (k) { return O.tetraXYZ(O.vec(space, k)); });
      if (pts.some(function (p) { return !p; })) return;
      var q = pts.map(proj3);
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath();
      ctx.fillStyle = rgba(planeCols[i % 2], 0.2); ctx.fill();
      ctx.strokeStyle = rgba(planeCols[i % 2], 0.8); ctx.lineWidth = 1; ctx.stroke();
    });
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
  [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].forEach(function (e) {
    var a = proj3(V[e[0]]), b = proj3(V[e[1]]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  });
  ctx.font = "600 14px Segoe UI, sans-serif"; ctx.fillStyle = ink;
  var cen = proj3([0.5, 0.29, 0.2]);
  V.forEach(function (v, i) {
    var p = proj3(v), dx = p[0] - cen[0], dy = p[1] - cen[1], n = Math.hypot(dx, dy) || 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(labels[i], p[0] + dx / n * 16, p[1] + dy / n * 16);
  });
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = "11px Segoe UI, sans-serif";
  var placed3 = [];
  Object.keys(space === "cmas" ? O.CMAS_ENDMEMBERS : O.BASALT_ENDMEMBERS).forEach(function (k) {
    if (labels.indexOf(k) >= 0) return;
    var xyz = O.tetraXYZ(O.vec(space, k)); if (!xyz) return;
    var p = proj3(xyz);
    ctx.fillStyle = ref; ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, 6.3); ctx.fill();
    var box = { x0: p[0] + 4, y0: p[1] - 13, x1: p[0] + 6 + ctx.measureText(k).width, y1: p[1] - 1 };
    if (!placed3.some(function (b) { return LABELS.overlaps(b, box); })) {
      placed3.push(box); ctx.fillStyle = muted; ctx.fillText(k, p[0] + 5, p[1] - 3);
    }
  });
  var cData = cssVar("--data"), cSample = cssVar("--sample");
  state.dataRes.forEach(function (d) {
    var xyz = space === "cmas" ? d.rep.xyzCmas : d.rep.xyzBasalt; if (!xyz) return;
    var p = proj3(xyz); ctx.fillStyle = cData; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
  });
  if (state.rep) {
    var sx = space === "cmas" ? state.rep.xyzCmas : state.rep.xyzBasalt;
    if (sx) {
      var sp = proj3(sx);
      if ($("showline").checked && state.spec && state.spec.space === space) {
        var q = O.tetraXYZ(O.vec(space, state.spec.points[0]));
        if (q) {
          var a = proj3(q), dir = [sx[0] - q[0], sx[1] - q[1], sx[2] - q[2]];
          var far = proj3([q[0] + dir[0] * 2.2, q[1] + dir[1] * 2.2, q[2] + dir[2] * 2.2]);
          ctx.setLineDash([5, 4]); ctx.strokeStyle = cSample; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(far[0], far[1]); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = cSample; ctx.beginPath(); ctx.arc(a[0], a[1], 3.5, 0, 6.3); ctx.fill();
        }
      }
      ctx.fillStyle = cSample; ctx.beginPath(); ctx.arc(sp[0], sp[1], 6, 0, 6.3); ctx.fill();
      ctx.fillStyle = ink; ctx.font = "600 12px Segoe UI, sans-serif";
      ctx.fillText(state.comp.label, sp[0] + 9, sp[1] - 8);
    }
  }
  $("cap3d").textContent = space === "cmas"
    ? "CMAS tetrahedron C-M-A-S with the critical plane of silica undersaturation (Di-Ol-An) and the plane of silica saturation (Di-Hy-An). Drag to rotate."
    : "Yoder & Tilley basalt tetrahedron Di-Ol-Ne-Qz with the critical plane of silica undersaturation (Cpx-Ol-Pl) and the plane of silica saturation (Cpx-Opx-Pl). Drag to rotate.";
  $("legend3d").innerHTML =
    '<span><span class="sw" style="background:' + rgba(planeCols[0], 0.7) + '"></span>critical plane of undersaturation</span>'
    + '<span><span class="sw" style="background:' + rgba(planeCols[1], 0.7) + '"></span>plane of silica saturation</span>'
    + '<span><span class="sw" style="background:var(--sample)"></span>sample</span>'
    + '<span><span class="sw" style="background:var(--data)"></span>dataset</span>'
    + '<span><span class="sw" style="background:var(--ref)"></span>reference phases</span>';
}
var drag = null;
cv.addEventListener("pointerdown", function (e) { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", function (e) {
  if (!drag) return;
  state.rotY += (e.clientX - drag[0]) * 0.01; state.rotX += (e.clientY - drag[1]) * 0.01;
  drag = [e.clientX, e.clientY]; draw3D();
});
cv.addEventListener("pointerup", function () { drag = null; });
setInterval(function () { if ($("spin").checked && !$("t3d").classList.contains("hidden")) { state.rotY += 0.006; draw3D(); } }, 50);

// -------------------------------------------------------------- datasets
function loadRecords(records, name) {
  var opts = readOptions(), skipped = [];
  if (!(opts.feRatio >= 0 && opts.feRatio <= 1)) opts.feRatio = 0.15;
  state.dataset = [];
  records.forEach(function (rec, i) {
    var label = rec.label || ("row " + (i + 1));
    try {
      if (rec.error) throw { name: "InputError", message: rec.error };
      var c = new O.Composition(rec.oxides, { label: label, feRatio: opts.feRatio, plagMode: opts.plagMode,
                                              lenient: $("csvLenient").checked });
      state.dataset.push({ label: label, comp: c, rep: O.report(c) });
    } catch (e) {
      if (e.name !== "InputError") throw e;
      skipped.push((rec.line ? "line " + rec.line : label) + ": " + e.message);
    }
  });
  state.datasetName = name;
  $("csvReport").innerHTML = esc(name) + ": " + state.dataset.length + " plotted"
    + (skipped.length ? ', <span class="warn">' + skipped.length + " skipped</span><ul>"
      + skipped.slice(0, 8).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>" : "");
  runProjection();
}
var METADATA = O.DEFS.metadata_columns.map(function (c) { return c.toLowerCase(); });
var LABEL_COLS = ["label", "sample", "sample name", "name", "id", "no", "no."];
/* Same column rules as the command line: metadata columns are skipped,
 * any other unknown column stops the import unless "lenient" is ticked. */
function recordsFromCSV(text) {
  var parsed = CSV.parseObjects(text), lenient = $("csvLenient").checked;
  var lower = parsed.header.map(function (h) { return h.toLowerCase(); });
  var labelKey = null;
  LABEL_COLS.some(function (c) { var i = lower.indexOf(c); if (i >= 0) { labelKey = parsed.header[i]; return true; } return false; });
  var use = parsed.header.filter(function (h) { return METADATA.indexOf(h.toLowerCase()) < 0; });
  var bad = O.unknownColumns(use);
  if (bad.length && !lenient)
    throw new Error("unrecognised column" + (bad.length > 1 ? "s " : " ") + bad.map(function (b) {
      return "'" + b[0] + "'" + (b[1] ? " (did you mean " + b[1] + "?)" : ""); }).join(", ")
      + ". Rename the column" + (bad.length > 1 ? "s" : "") + ", or tick “lenient import” to ignore them.");
  return parsed.records.map(function (r) {
    var ox = {};
    use.forEach(function (h) { if (r[h] !== undefined && String(r[h]).trim() !== "") ox[h] = r[h]; });
    if (r.__extra) return { label: labelKey ? r[labelKey] : null, oxides: ox, line: r.__line,
                            error: r.__extra + " more field(s) than the header (unquoted comma?)" };
    return { label: labelKey ? r[labelKey] : null, oxides: ox, line: r.__line };
  });
}
$("loadcsv").addEventListener("click", function () {
  var text = $("csv").value;
  if (!text.trim()) { toast("Paste CSV text first"); return; }
  try { loadRecords(recordsFromCSV(text), "pasted CSV"); }
  catch (e) { $("csvReport").innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }
});
$("csvFile").addEventListener("change", function () {
  var f = this.files && this.files[0]; if (!f) return;
  var reader = new FileReader();
  reader.onload = function () {
    try { loadRecords(recordsFromCSV(String(reader.result)), f.name); }
    catch (e) { $("csvReport").innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }
  };
  reader.readAsText(f);
  this.value = "";
});
$("dropcsv").addEventListener("click", function () { state.dataset = []; $("csvReport").textContent = ""; runProjection(); });
$("loadYT").addEventListener("click", function () {
  loadRecords(DATA.yoder_tilley_1962.rows.map(function (r) { return { label: r.label, oxides: r.oxides }; }),
              "Yoder & Tilley (1962) Table 2");
});
$("showDataLabels").addEventListener("change", draw2D);

// ------------------------------------------------------------ collection
function collection() { return store(KEY_COLL) || []; }
function renderCollection() {
  var list = collection(), ul = $("collection");
  $("collectionEmpty").classList.toggle("hidden", list.length > 0);
  $("collectionActions").classList.toggle("hidden", list.length === 0);
  ul.innerHTML = list.map(function (it, i) {
    return '<li><span title="' + esc(it.label) + '">' + esc(it.label) + '</span><span style="display:flex;gap:4px">'
      + '<button class="btn ghost" data-load="' + i + '">Load</button><button class="btn ghost" data-del="' + i + '" aria-label="Delete ' + esc(it.label) + '">&times;</button></span></li>';
  }).join("");
}
$("collection").addEventListener("click", function (e) {
  var t = e.target.closest("button"); if (!t) return;
  var list = collection();
  if (t.dataset.load !== undefined) {
    var it = list[+t.dataset.load]; applySaved(it); calculate();
  } else if (t.dataset.del !== undefined) {
    var gone = list.splice(+t.dataset.del, 1)[0]; store(KEY_COLL, list); renderCollection();
    toast("Removed " + gone.label);
  }
});
function applySaved(it) {
  writeOxides(it.oxides); $("label").value = it.label;
  if (it.feRatio !== undefined) $("feratio").value = it.feRatio;
  if (it.plagMode) $("plagmode").value = it.plagMode;
}
$("saveSample").addEventListener("click", function () {
  if (!calculate(true)) return;
  var list = collection(), o = readOptions();
  list.unshift({ label: o.label, oxides: readOxides(), feRatio: o.feRatio, plagMode: o.plagMode,
                 savedAt: new Date().toISOString() });
  store(KEY_COLL, list.slice(0, 200)); renderCollection(); toast("Saved " + o.label);
});
$("plotCollection").addEventListener("click", function () {
  loadRecords(collection().map(function (it) { return { label: it.label, oxides: it.oxides }; }), "my collection");
});
$("exportCollection").addEventListener("click", function () {
  var list = collection(), cols = ["label"].concat(OXIDE_FIELDS);
  var rows = [cols.join(",")].concat(list.map(function (it) {
    return cols.map(function (c) { return csvCell(c === "label" ? it.label : (it.oxides[c] || "")); }).join(",");
  }));
  download("ohara_collection.csv", "text/csv", rows.join("\r\n"));
});

// ------------------------------------------------------------ validation
var VAL_CASES = [
  { name: "diopside from olivine into CS-MS-A", em: "CMS2", points: ["M2S"], basis: ["CS", "MS", "A"], expect: [53.64, 46.36, 0], why: "CMS2 = CS + MS exactly" },
  { name: "anorthite from olivine into CS-MS-A", em: "CAS2", points: ["M2S"], basis: ["CS", "MS", "A"], expect: [27.73, 47.93, 24.34], why: "CAS2 + M2S = CS + 2 MS + A" },
  { name: "pyrope from olivine into CS-MS-A", em: "M3AS3", points: ["M2S"], basis: ["CS", "MS", "A"], expect: [0, 74.7, 25.3], why: "M3AS3 = 3 MS + A" },
  { name: "enstatite is the MS apex", em: "MS", points: ["M2S"], basis: ["CS", "MS", "A"], expect: [0, 100, 0], why: "by definition" },
  { name: "forsterite is the M2S apex from enstatite", em: "M2S", points: ["MS"], basis: ["M2S", "C2S3", "A2S3"], expect: [100, 0, 0], why: "by definition" },
  { name: "diopside from enstatite", em: "CMS2", points: ["MS"], basis: ["M2S", "C2S3", "A2S3"], expect: [32.49, 67.51, 0], why: "CMS2 = 0.5 M2S + 0.5 C2S3" },
  { name: "pyrope from enstatite", em: "M3AS3", points: ["MS"], basis: ["M2S", "C2S3", "A2S3"], expect: [52.35, 0, 47.65], why: "M3AS3 = 1.5 M2S + 0.5 A2S3" }
];
var NORM_MAP = { Qz: "quartz", Or: "orthoclase", Ab: "albite", Ne: "nepheline", An: "anorthite", Di: "diopside",
                 Hy: "hypersthene", Ol: "olivine", Mt: "magnetite", Il: "ilmenite", Ap: "apatite", Cs: "larnite", Ks: "kalsilite" };
var MT_IL_SWAPPED = { "10": 1, "11": 1, "12": 1, "13": 1 }, BORDERLINE = { "16": 1, "22": 1 };
function runValidation() {
  var bad = 0, h = '<h4 style="margin:12px 0 4px">A. Projected positions of pure phases (weight %)</h4><div class="tablewrap"><table><tr><th>check</th><th class="n">expected</th><th class="n">calculated</th><th></th></tr>';
  VAL_CASES.forEach(function (c) {
    var fake = { vector: function () { return O.vec("cmas", c.em); }, assumptions: [] };
    var r = O.projectSpec(fake, { space: "cmas", points: c.points, basis: c.basis });
    var got = c.basis.map(function (k) { return r.components[k]; });
    var ok = got.every(function (v, i) { return Math.abs(v - c.expect[i]) < 0.01; });
    if (!ok) bad++;
    h += '<tr><td>' + esc(c.name) + '<div class="muted">' + esc(c.why) + '</div></td><td class="n">' + c.expect.map(function (v) { return fmt(v); }).join(" / ")
      + '</td><td class="n">' + got.map(function (v) { return fmt(v); }).join(" / ") + '</td><td class="' + (ok ? "ok" : "bad") + '">' + (ok ? "pass" : "FAIL") + '</td></tr>';
  });
  h += '</table></div><h4 style="margin:14px 0 4px">B. CIPW norm against Yoder &amp; Tilley (1962) Table 2</h4>'
    + '<div class="muted">Tolerances: 0.8 wt% felsic minerals, 1.8 wt% Di/Hy/Ol (hand rounding of the 1962 norms), 0.4 wt% Mt/Il. '
    + 'For analyses 10&ndash;13 the printed Mt and Il are transposed in the original and are compared crosswise. '
    + '16 and 22 lie on the critical plane (deciding mineral &lt; 1 wt% in both norms).</div>'
    + '<div class="tablewrap"><table><tr><th>no.</th><th>rock</th><th>group (this norm)</th><th>group (published norm)</th><th class="n">largest |&Delta;| wt%</th><th></th></tr>';
  (DATA.yoder_tilley_1962 ? DATA.yoder_tilley_1962.rows : []).forEach(function (row) {
    var n = O.cipwNorm(O.parseOxides(row.oxides).oxides).norm, pub = row.published_norm, worst = 0, worstK = "", ok = true;
    Object.keys(NORM_MAP).forEach(function (k) {
      var mine = n[NORM_MAP[k]] || 0;
      if (MT_IL_SWAPPED[row.no] && k === "Mt") mine = n.ilmenite || 0;
      if (MT_IL_SWAPPED[row.no] && k === "Il") mine = n.magnetite || 0;
      var d = Math.abs(mine - (pub[k] || 0));
      var tol = (k === "Di" || k === "Hy" || k === "Ol") ? 1.8 : (k === "Mt" || k === "Il") ? 0.4 : 0.8;
      if (d > tol) ok = false;
      if (d > worst) { worst = d; worstK = k; }
    });
    function sig(q, hy, ol, ne) { return ["Qz", "Hy", "Ol", "Ne"].filter(function (_, i) { return [q, hy, ol, ne][i] > 0.005; }).join("+") || "-"; }
    var me = sig(n.quartz || 0, n.hypersthene || 0, n.olivine || 0, n.nepheline || 0);
    var pb = sig(pub.Qz || 0, pub.Hy || 0, pub.Ol || 0, pub.Ne || 0);
    var groupOk = me === pb || BORDERLINE[row.no];
    if (!groupOk) ok = false;
    if (!ok) bad++;
    h += '<tr><td>' + esc(row.no) + '</td><td>' + esc(row.rock) + '</td><td>' + esc(me) + '</td><td>' + esc(pb)
      + (BORDERLINE[row.no] && me !== pb ? ' <span class="muted">(on plane)</span>' : "") + '</td><td class="n">'
      + fmt(worst) + ' ' + esc(worstK) + '</td><td class="' + (ok ? "ok" : "bad") + '">' + (ok ? "pass" : "FAIL") + '</td></tr>';
  });
  h += '</table></div>';
  var fig = figureValidation();
  bad += fig.bad;
  h += fig.html;
  h += '<div style="margin-top:8px" class="' + (bad ? "bad" : "ok") + '">'
    + (bad ? bad + " check(s) failed" : "all checks pass") + '</div>';
  $("valout").innerHTML = h;
}

/* Part C: points digitised from O'Hara's own figures. Each figure is
 * calibrated by a least-squares affine map fitted to its printed ticks only
 * (same method as tools/figure_check.py), then compared with the engine. */
function solve3(A, b) {                       // 3x3 Gaussian elimination
  var M = A.map(function (r, i) { return r.concat([b[i]]); });
  for (var c = 0; c < 3; c++) {
    var p = c;
    for (var r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    var t = M[c]; M[c] = M[p]; M[p] = t;
    for (var r2 = c + 1; r2 < 3; r2++) {
      var f = M[r2][c] / M[c][c];
      for (var k = c; k < 4; k++) M[r2][k] -= f * M[c][k];
    }
  }
  var x = [0, 0, 0];
  for (var i = 2; i >= 0; i--) {
    var acc = M[i][3];
    for (var j = i + 1; j < 3; j++) acc -= M[i][j] * x[j];
    x[i] = acc / M[i][i];
  }
  return x;
}
function lsq(rows, target) {                  // least squares via normal equations
  var AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Atb = [0, 0, 0];
  rows.forEach(function (r, n) {
    for (var i = 0; i < 3; i++) { Atb[i] += r[i] * target[n]; for (var j = 0; j < 3; j++) AtA[i][j] += r[i] * r[j]; }
  });
  return solve3(AtA, Atb);
}
function figureValidation() {
  var F = DATA.ohara_1968_figures;
  if (!F) return { bad: 0, html: "" };
  var byFig = {}, order = [];
  F.rows.forEach(function (r) { if (!byFig[r.figure]) { byFig[r.figure] = []; order.push(r.figure); } byFig[r.figure].push(r); });
  var bad = 0, h = '<h4 style="margin:14px 0 4px">C. Positions digitised from O’Hara (1968) Figs 4A, 4C, 5, 9, 10, 11</h4>'
    + '<div class="muted">Each figure is calibrated only from its own printed tick marks; the plotted diopside, pyrope and '
    + 'diopside-pyrope mixtures (labelled by wt% pyrope), and natural basalts whose analyses are in the Yoder & Tilley (1962) '
    + 'and Tilley, Yoder & Schairer (1963, 1964) tables, are then read in O’Hara’s coordinates. The Fig. 5 “1921” point is a '
    + 'documented discrepancy in the original (it matches Yoder & Tilley analysis 12, not the cited analysis 14) and is not scored. Tolerance '
    + F.point_tolerance + ' wt% per point (about 1.5 mm on the printed page), ' + F.mean_tolerance + ' wt% mean per figure.</div>'
    + '<div class="tablewrap"><table><tr><th>fig.</th><th>point</th><th>read from figure</th><th>this engine</th><th class="n">max |&Delta;| wt%</th><th></th></tr>';
  order.forEach(function (fg) {
    var rows = byFig[fg], spec = O.PROJECTIONS.filter(function (p) { return p.id === rows[0].projection; })[0];
    var ticks = rows.filter(function (r) { return r.kind === "tick"; });
    var n1 = ticks[0].c1, n2 = ticks[0].c2, third = spec.basis.filter(function (b) { return b !== n1 && b !== n2; })[0];
    var A = ticks.map(function (t) { var v = {}; v[t.c1] = +t.v1; v[t.c2] = +t.v2; return [1, v[n1], v[n2]]; });
    var px = lsq(A, ticks.map(function (t) { return +t.x_px; })), py = lsq(A, ticks.map(function (t) { return +t.y_px; }));
    var det = px[1] * py[2] - px[2] * py[1], sum = 0, cnt = 0;
    rows.filter(function (r) { return r.kind === "point"; }).forEach(function (r) {
      var scored = (r.status || "validate") === "validate";
      var dx = +r.x_px - px[0], dy = +r.y_px - py[0], read = {};
      read[n1] = (py[2] * dx - px[2] * dy) / det; read[n2] = (-py[1] * dx + px[1] * dy) / det;
      read[third] = 100 - read[n1] - read[n2];
      var eng = O.projectSpec(new O.Composition(F.compositions[r.composition]), spec).components;
      var worst = Math.max.apply(null, spec.basis.map(function (k) { return Math.abs(read[k] - eng[k]); }));
      var ok = worst <= F.point_tolerance;
      if (scored) { sum += worst; cnt++; if (!ok) bad++; }
      function show(o) { return spec.basis.map(function (k) { return k + " " + fmt(o[k], 1); }).join(", "); }
      h += '<tr><td>' + esc(fg) + '</td><td>' + esc(r.label) + '</td><td>' + esc(show(read)) + '</td><td>' + esc(show(eng))
        + '</td><td class="n">' + fmt(worst) + '</td>'
        + (scored ? '<td class="' + (ok ? "ok" : "bad") + '">' + (ok ? "pass" : "FAIL") + '</td>'
                  : '<td class="warn" title="documented discrepancy in the original figure; not scored">noted</td>') + '</tr>';
    });
    var mean = sum / cnt, okm = mean <= F.mean_tolerance; if (!okm) bad++;
    h += '<tr><td></td><td colspan="3" class="muted">Fig. ' + esc(fg) + ': mean |&Delta;| over ' + cnt + ' points</td><td class="n">'
      + fmt(mean) + '</td><td class="' + (okm ? "ok" : "bad") + '">' + (okm ? "pass" : "FAIL") + '</td></tr>';
  });
  return { bad: bad, html: h + '</table></div>' };
}

// --------------------------------------------------------- share / state
function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  return decodeURIComponent(escape(atob(s)));
}
function stateSnapshot(withData) {
  var o = readOptions(), snap = { v: 1, sp: state.space };
  if (state.custom) { var sp = currentSpec(); snap.cu = { p: sp.points, b: sp.basis }; }
  else snap.pr = $("proj").value;
  if (withData) { snap.l = o.label; snap.o = readOxides(); snap.f = o.feRatio; snap.m = o.plagMode; }
  return snap;
}
function writeHash() {
  try { history.replaceState(null, "", "#s=" + b64urlEncode(JSON.stringify(stateSnapshot(true)))); } catch (e) {}
}
function readHash() {
  var m = /[#&]s=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return false;
  var snap;
  try { snap = JSON.parse(b64urlDecode(m[1])); } catch (e) { toast("The shared link could not be read"); return false; }
  if (!snap || snap.v !== 1) return false;
  if (snap.sp === "cmas" || snap.sp === "basalt") { state.space = snap.sp; $("space").value = snap.sp; }
  fillProjections();
  if (snap.cu && snap.cu.p && snap.cu.b) {
    setCustom(true);
    $("p1").value = snap.cu.p[0] || ""; $("p2").value = snap.cu.p[1] || "";
    $("b1").value = snap.cu.b[0] || ""; $("b2").value = snap.cu.b[1] || ""; $("b3").value = snap.cu.b[2] || "";
    updateCustomNote();
  } else if (snap.pr) { $("proj").value = snap.pr; }
  if (snap.o && typeof snap.o === "object") {
    writeOxides(snap.o);
    $("label").value = typeof snap.l === "string" ? snap.l.slice(0, 120) : "shared sample";
    if (typeof snap.f === "number") $("feratio").value = snap.f;
    if (snap.m === "plag" || snap.m === "ab") $("plagmode").value = snap.m;
    return true;
  }
  return "diagram-only";
}
function shareBase() {
  var base = CONFIG.appUrl || (location.origin + location.pathname);
  if (location.protocol === "file:") base = location.href.split("#")[0];
  return base;
}
function shareLink() {
  var withData = $("shareWithData").checked;
  return shareBase() + "#s=" + b64urlEncode(JSON.stringify(stateSnapshot(withData)));
}
function summaryText() {
  if (!state.rep) return "O'Hara projection workbench - basalt tetrahedron and CMAS projections.";
  var lines = [state.comp.label + ": " + state.rep.ytGroup,
               "CMAS: " + ["C", "M", "A", "S"].map(function (k) { return k + " " + state.rep.cmasPct[k].toFixed(2); }).join(", ")];
  if (state.res) lines.push(state.res.title + ": " + Object.keys(state.res.components).map(function (k) {
    return k + " " + state.res.components[k].toFixed(2); }).join(", ") + " (wt%)");
  return lines.join("\n");
}
function refreshShare() {
  var link = shareLink(), text = summaryText();
  $("shareLink").value = link; $("shareText").value = text + "\n" + link;
  var enc = encodeURIComponent;
  $("shEmail").href = "mailto:?subject=" + enc("O'Hara projection: " + (state.comp ? state.comp.label : "workbench")) + "&body=" + enc(text + "\n\n" + link);
  $("shWhatsApp").href = "https://wa.me/?text=" + enc(text + "\n" + link);
  $("shX").href = "https://twitter.com/intent/tweet?text=" + enc(text.split("\n")[0]) + "&url=" + enc(link);
  $("shLinkedIn").href = "https://www.linkedin.com/sharing/share-offsite/?url=" + enc(link);
  var local = location.protocol === "file:" || /^(localhost|127\.)/.test(location.hostname);
  $("shareNote").textContent = local && !CONFIG.appUrl
    ? "This copy is running on your own computer, so the link only opens here. Publish the app folder (or set appUrl in config.js) to share it with others."
    : "Anyone with the link sees the same composition, options and diagram; nothing is stored on a server.";
  $("nativeShare").classList.toggle("hidden", !navigator.share);
  $("qr").innerHTML = "";
}
$("shareWithData").addEventListener("change", refreshShare);
$("copyLink").addEventListener("click", function () { copyText($("shareLink").value); });
$("copyText").addEventListener("click", function () { copyText($("shareText").value); });
$("nativeShare").addEventListener("click", function () {
  if (!navigator.share) return;
  navigator.share({ title: "O'Hara projection workbench", text: summaryText(), url: shareLink() })
    .catch(function (e) { if (e && e.name !== "AbortError") toast("Sharing failed"); });
});
$("shQR").addEventListener("click", function () {
  var box = $("qr"); box.innerHTML = '<span class="muted">loading&hellip;</span>';
  function draw() {
    box.innerHTML = "";
    try { new window.QRCode(box, { text: shareLink(), width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.L }); }
    catch (e) { box.innerHTML = '<span class="warn">The link is too long for a QR code; untick "include the composition" or copy the link instead.</span>'; }
  }
  if (window.QRCode) return draw();
  // bundled, version-pinned copy (app/vendor/VENDOR.json); the integrity pin
  // is enforced when served over http(s) - browsers cannot check it on file://
  var s = document.createElement("script");
  s.src = "vendor/qrcode-1.0.0.min.js";
  if (/^https?:$/.test(location.protocol)) s.integrity = QR_SRI;
  s.onload = draw;
  s.onerror = function () { box.innerHTML = '<span class="warn">The bundled QR code library failed to load or its integrity check failed.</span>'; };
  document.head.appendChild(s);
});

var QR_SRI = "sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==";

// --------------------------------------------------------------- dialogs
function openDialog(id) {
  var d = $(id);
  if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
}
document.querySelectorAll("dialog").forEach(function (d) {
  d.addEventListener("click", function (e) { if (e.target === d || e.target.hasAttribute("data-close")) d.close(); });
});
$("btnShare").addEventListener("click", function () { refreshShare(); openDialog("dlgShare"); });
$("btnFeedback").addEventListener("click", openFeedback);
$("footFeedback").addEventListener("click", openFeedback);
$("btnHelp").addEventListener("click", function () { showDoc("manual"); openDialog("dlgDocs"); });
$("footPrivacy").addEventListener("click", function () { showDoc("privacy"); openDialog("dlgDocs"); });
$("footCite").addEventListener("click", function () { showDoc("cite"); openDialog("dlgDocs"); });
function showDoc(name) {
  document.querySelectorAll("[data-doc]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.doc === name ? "true" : "false"); });
  document.querySelectorAll("[data-docpane]").forEach(function (p) { p.classList.toggle("hidden", p.dataset.docpane !== name); });
}
document.querySelectorAll("[data-doc]").forEach(function (b) { b.addEventListener("click", function () { showDoc(b.dataset.doc); }); });
var TODAY = new Date().toISOString().slice(0, 10);
var TOOL_CITE = "O'Hara projection workbench (2026). Interactive implementation of O'Hara's (1968) CMAS projections and the Yoder & Tilley (1962) basalt tetrahedron, version 0.2.0. Accessed " + TODAY + ".";
$("citeTool").textContent = TOOL_CITE;
$("copyCite").addEventListener("click", function () {
  copyText("O'Hara, M. J. (1968). The bearing of phase equilibria studies in synthetic and natural systems on the origin and evolution of basic and ultrabasic rocks. Earth-Science Reviews, 4, 69-133.\n"
    + "Yoder, H. S. & Tilley, C. E. (1962). Origin of basalt magmas: an experimental study of natural and synthetic rock systems. Journal of Petrology, 3, 342-532.\n" + TOOL_CITE);
});
$("copyBib").addEventListener("click", function () {
  copyText("@article{OHara1968,\n  author = {O'Hara, M. J.},\n  title = {The bearing of phase equilibria studies in synthetic and natural systems on the origin and evolution of basic and ultrabasic rocks},\n  journal = {Earth-Science Reviews}, volume = {4}, pages = {69--133}, year = {1968}\n}\n"
    + "@article{YoderTilley1962,\n  author = {Yoder, H. S. and Tilley, C. E.},\n  title = {Origin of basalt magmas: an experimental study of natural and synthetic rock systems},\n  journal = {Journal of Petrology}, volume = {3}, pages = {342--532}, year = {1962}\n}\n"
    + "@misc{OHaraWorkbench,\n  title = {O'Hara projection workbench, version 0.2.0},\n  note = {Accessed " + TODAY + "}, year = {2026}\n}\n");
});
$("privacyCloud").textContent = CONFIG.firebase
  ? "This deployment sends feedback to a cloud database (project " + CONFIG.firebase.projectId + ")."
  : "This deployment has no cloud database configured: feedback stays in your browser.";

// -------------------------------------------------------------- feedback
var fbState = { category: "feature", rating: 5 };
(function buildStars() {
  var box = $("fbStars");
  for (var i = 1; i <= 5; i++) {
    var b = document.createElement("button");
    b.type = "button"; b.dataset.r = i; b.innerHTML = "&#9733;";
    b.setAttribute("role", "radio"); b.setAttribute("aria-label", i + " star" + (i > 1 ? "s" : ""));
    box.appendChild(b);
  }
  box.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    fbState.rating = +b.dataset.r; paintStars();
  });
})();
function paintStars() {
  $("fbStars").querySelectorAll("button").forEach(function (b) {
    var on = +b.dataset.r <= fbState.rating;
    b.classList.toggle("on", on); b.setAttribute("aria-checked", +b.dataset.r === fbState.rating ? "true" : "false");
  });
}
$("fbCats").addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return;
  fbState.category = b.dataset.cat;
  $("fbCats").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
});
$("fbMsg").addEventListener("input", function () { $("fbCount").textContent = this.value.length + " / 3000"; });
function openFeedback() { paintStars(); renderFbHistory(); $("fbStatus").textContent = ""; openDialog("dlgFeedback"); }
function fbHistory() { return store(KEY_FB) || []; }
function renderFbHistory() {
  var list = fbHistory();
  $("fbHistory").innerHTML = list.length ? "<ul>" + list.slice(0, 10).map(function (f) {
    return "<li>" + esc(f.createdAt.slice(0, 10)) + " &middot; " + esc(f.category) + " &middot; " + "&#9733;".repeat(f.rating)
      + " &middot; " + esc(f.message.slice(0, 80)) + (f.message.length > 80 ? "&hellip;" : "")
      + ' <span class="' + (f.cloudSynced ? "ok" : "muted") + '">(' + (f.cloudSynced ? "sent" : "saved locally") + ")</span></li>";
  }).join("") + "</ul>" : "none yet";
}
function sampleContext() {
  if (!$("fbContext").checked) return undefined;
  var o = readOxides(), parts = ["[O'Hara workbench]"];
  parts.push("label=" + readOptions().label);
  parts.push("oxides=" + Object.keys(o).map(function (k) { return k + ":" + o[k]; }).join(","));
  parts.push("space=" + state.space + " projection=" + (state.spec ? (state.spec.id + " " + state.spec.points.join("+") + "->" + state.spec.basis.join("-")) : "-"));
  if (state.rep) parts.push("group=" + state.rep.ytGroup.split(" (")[0]);
  if (state.err) parts.push("error=" + state.err);
  return parts.join(" | ").slice(0, 1000);
}
function firestoreFields(rec) {
  var f = {};
  Object.keys(rec).forEach(function (k) {
    var v = rec[k]; if (v === undefined) return;
    f[k] = typeof v === "number" ? { integerValue: String(v) } : { stringValue: String(v) };
  });
  return f;
}
function sendToCloud(rec) {
  var fb = CONFIG.firebase;
  if (!fb || !fb.apiKey || !fb.projectId) return Promise.resolve(false);
  var url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(fb.projectId) + "/databases/"
    + encodeURIComponent(fb.databaseId || "(default)") + "/documents/feedback?documentId=" + encodeURIComponent(rec.id)
    + "&key=" + encodeURIComponent(fb.apiKey);
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ fields: firestoreFields(rec) }) })
    .then(function (r) { return r.ok; }).catch(function () { return false; });
}
$("fbForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var msg = $("fbMsg").value.trim(), email = $("fbEmail").value.trim();
  if (msg.length < 3) { $("fbStatus").innerHTML = '<span class="bad">Please write at least 3 characters.</span>'; return; }
  if (email && !$("fbEmail").checkValidity()) { $("fbStatus").innerHTML = '<span class="bad">That email address does not look valid.</span>'; return; }
  // same document schema as RockMin ID's feedback collection (firestore.rules: isValidFeedback)
  var rec = { id: "fb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8), userId: "anonymous",
              category: fbState.category, rating: Math.max(1, Math.min(5, Math.round(fbState.rating))),
              message: msg.slice(0, 3000), createdAt: new Date().toISOString() };
  if (email) rec.userEmail = email.slice(0, 200);
  var ctx = sampleContext(); if (ctx) rec.sampleContext = ctx;
  $("fbSubmit").disabled = true; $("fbStatus").textContent = "Saving…";
  sendToCloud(rec).then(function (synced) {
    var hist = fbHistory(); rec.cloudSynced = synced; hist.unshift(rec); store(KEY_FB, hist.slice(0, 50));
    $("fbSubmit").disabled = false;
    $("fbStatus").innerHTML = synced
      ? '<span class="ok">Thank you! Your feedback has been sent.</span>'
      : '<span class="ok">Thank you! Your feedback is saved in this browser.</span>'
        + (CONFIG.firebase ? ' <span class="warn">It could not be sent right now (offline?).</span>'
                           : ' <span class="muted">This copy has no cloud inbox configured; use "Download my feedback" to pass it on.</span>');
    $("fbMsg").value = ""; $("fbCount").textContent = "0 / 3000";
    renderFbHistory();
  });
});
$("fbExport").addEventListener("click", function () {
  download("ohara_feedback.json", "application/json", JSON.stringify(fbHistory(), null, 2));
});

// --------------------------------------------------------------- exports
function svgString() { var svg = document.querySelector("#svgwrap svg"); return svg ? svg.outerHTML : null; }
$("dlsvg").addEventListener("click", function () {
  var s = svgString(); if (s) download("ohara_projection.svg", "image/svg+xml", s);
});
$("dlpng").addEventListener("click", function () {
  var s = svgString(); if (!s) return;
  var svg = document.querySelector("#svgwrap svg"), vb = svg.viewBox.baseVal, scale = 3;
  var img = new Image(), url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
  img.onload = function () {
    var c = document.createElement("canvas"); c.width = vb.width * scale; c.height = vb.height * scale;
    var g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    c.toBlob(function (b) { download("ohara_projection.png", "image/png", b); });
  };
  img.src = url;
});
$("dlcsv").addEventListener("click", function () {
  var rows = resultRows(); if (!rows.length) return;
  var keys = Object.keys(rows[0].res.components);
  var out = [["label"].concat(keys, ["x", "y", "condition_number", "yoder_tilley_group", "projection"]).map(csvCell).join(",")];
  rows.forEach(function (r) {
    out.push([r.label].concat(keys.map(function (k) { return r.res.components[k].toFixed(4); }),
      [r.res.xy[0].toFixed(5), r.res.xy[1].toFixed(5), r.res.conditionNumber.toFixed(2), r.rep.ytGroup, r.res.title]).map(csvCell).join(","));
  });
  download("ohara_coordinates.csv", "text/csv", out.join("\r\n"));
});

// ------------------------------------------------------------------ PWA
var deferredInstall = null;
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault(); deferredInstall = e; $("btnInstall").classList.remove("hidden");
});
$("btnInstall").addEventListener("click", function () {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  deferredInstall.userChoice.then(function () { deferredInstall = null; $("btnInstall").classList.add("hidden"); });
});
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}

// ---------------------------------------------------------------- events
$("calc").addEventListener("click", function () { calculate(); });
$("clear").addEventListener("click", function () { writeOxides({}); showInputError(null); });
$("loadex").addEventListener("click", function () {
  var k = $("examples").value; writeOxides(EXAMPLES[k]); $("label").value = k; calculate();
});
$("space").addEventListener("change", function () { state.space = this.value; fillProjections(); runProjection(); writeHash(); });
$("proj").addEventListener("change", function () { runProjection(); writeHash(); });
["p1", "p2", "b1", "b2", "b3"].forEach(function (id) {
  $(id).addEventListener("change", function () { updateCustomNote(); runProjection(); writeHash(); });
});
function setCustom(on) {
  state.custom = on;
  $("custom").classList.toggle("hidden", !on);
  $("proj").disabled = on;
  $("togglecustom").textContent = on ? "Use a preset diagram" : "Build a custom projection";
  $("togglecustom").setAttribute("aria-expanded", on ? "true" : "false");
}
$("togglecustom").addEventListener("click", function () { setCustom(!state.custom); updateCustomNote(); runProjection(); writeHash(); });
$("plagmode").addEventListener("change", function () { if (state.comp) calculate(); });
$("feratio").addEventListener("change", function () { if (state.comp) calculate(); });
["showplanes", "showline"].forEach(function (id) { $(id).addEventListener("change", draw3D); });
document.querySelectorAll(".tabs [data-tab]").forEach(function (b) {
  b.addEventListener("click", function () {
    document.querySelectorAll(".tabs [data-tab]").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
    ["t3d", "t2d", "ttab", "tval"].forEach(function (t) { $(t).classList.toggle("hidden", t !== b.dataset.tab); });
    if (b.dataset.tab === "t3d") resize();
    if (b.dataset.tab === "tval") runValidation();
  });
});
window.addEventListener("hashchange", function () { if (readHash() === true) calculate(true); else runProjection(); });

// ----------------------------------------------------------------- start
syncThemeSwitch();
fillProjections();
renderCollection();
var restored = readHash();
if (restored !== true) {
  var first = "Y&T 14* Olivine tholeiite";
  writeOxides(EXAMPLES[first] || EXAMPLES[Object.keys(EXAMPLES)[0]]);
  $("label").value = EXAMPLES[first] ? first : Object.keys(EXAMPLES)[0];
  $("examples").value = $("label").value;
}
resize();
calculate(true);
})();
