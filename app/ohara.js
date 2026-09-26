/* O'Hara basalt-tetrahedron projection engine (browser + Node).
 *
 * All scientific data (molar masses, O'Hara multipliers, endmembers, planes,
 * projections, norm recipes, validation limits) come from definitions.js,
 * which is generated from ohara/data/definitions.json - the same file the Python
 * package reads. The algorithms below mirror ohara/*.py line for line;
 * tests/test_parity.py runs both engines over a large randomised input set
 * (both feldspar modes, several Fe ratios, total-iron input, malformed input)
 * and compares every reported field.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./definitions.js"));
  else root.Ohara = factory(root.OHARA_DEFS);
}(typeof self !== "undefined" ? self : this, function (DEFS) {
  "use strict";
  if (!DEFS) throw new Error("definitions.js must be loaded before ohara.js");

  var MW = DEFS.molar_mass;
  var OXIDES = Object.keys(MW);
  var EXTRA_MW = DEFS.extra_molar_mass;
  var MW_C = DEFS.ohara_multipliers.C, MW_M = DEFS.ohara_multipliers.M,
      MW_A = DEFS.ohara_multipliers.A, MW_S = DEFS.ohara_multipliers.S;
  var ALIASES = DEFS.aliases;
  var IGNORED = {};
  DEFS.ignored_components.forEach(function (c) { IGNORED[c.toLowerCase()] = c; });
  function normKey(key) { return String(key).trim().toLowerCase().replace(/\s+/g, ""); }
  /* spelling hint, same rule as ohara.components.suggest */
  function suggest(key) {
    var probe = normKey(key).replace(/0/g, "o");
    var keys = Object.keys(ALIASES).sort();
    for (var i = 0; i < keys.length; i++)
      if (keys[i].replace(/0/g, "o") === probe) return ALIASES[keys[i]];
    return null;
  }
  var TOTAL_MIN = DEFS.validation.total_min, TOTAL_MAX = DEFS.validation.total_max;
  var VOLATILES = { H2O: 1, CO2: 1 };
  var COND_FAIL = 1e10, COND_WARN = 1e3, REL_TOL = 1e-9;
  var NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

  var NORM_MW = {};
  Object.keys(DEFS.norm_recipes).forEach(function (k) {
    if (k.charAt(0) === "_") return;
    var r = DEFS.norm_recipes[k], w = 0;
    Object.keys(r).forEach(function (ox) { w += r[ox] * (MW[ox] || EXTRA_MW[ox]); });
    NORM_MW[k] = w;
  });

  function InputError(message) {
    var e = new Error(message); e.name = "InputError"; return e;
  }
  function ProjectionError(message) {
    var e = new Error(message); e.name = "ProjectionError"; return e;
  }

  // ------------------------------------------------------------ endmembers
  var CMAS_ENDMEMBERS = {}, BASALT_ENDMEMBERS = {}, CMAS_NAMES = {}, BASALT_NAMES = {};
  Object.keys(DEFS.cmas_endmembers).forEach(function (k) {
    CMAS_ENDMEMBERS[k] = DEFS.cmas_endmembers[k].f; CMAS_NAMES[k] = DEFS.cmas_endmembers[k].name;
  });
  Object.keys(DEFS.basalt_endmembers).forEach(function (k) {
    BASALT_ENDMEMBERS[k] = DEFS.basalt_endmembers[k].f; BASALT_NAMES[k] = DEFS.basalt_endmembers[k].name;
  });
  var CMAS_W = [MW_C, MW_M, MW_A, MW_S];
  var BASALT_W = DEFS.basalt_vertex_weights;
  var CMAS_PLANES = DEFS.cmas_planes, BASALT_PLANES = DEFS.basalt_planes;
  var PROJECTIONS = DEFS.projections;

  function vec(space, key) {
    var f = space === "cmas" ? CMAS_ENDMEMBERS[key] : BASALT_ENDMEMBERS[key];
    if (!f) throw ProjectionError("unknown endmember '" + key + "' in the " + space + " space");
    var w = space === "cmas" ? CMAS_W : BASALT_W;
    return f.map(function (v, i) { return v * w[i]; });
  }
  function endmemberName(space, key) {
    return (space === "cmas" ? CMAS_NAMES : BASALT_NAMES)[key];
  }

  // -------------------------------------------------------- linear algebra
  // "%.1e" formatting identical to Python's (two-digit exponent)
  function pyExp(v) { return v.toExponential(1).replace(/e([+-])(\d)$/, "e$10$2"); }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function norm2(a) { return Math.sqrt(sum(a.map(function (v) { return v * v; }))); }
  function absSum(a) { return sum(a.map(Math.abs)); }

  function toRows(cols) {
    var m = [];
    for (var i = 0; i < 4; i++) m.push([cols[0][i], cols[1][i], cols[2][i], cols[3][i]]);
    return m;
  }
  function inverse4(A) {
    var n = 4, M = A.map(function (r, i) {
      return r.concat([0, 0, 0, 0].map(function (_, j) { return i === j ? 1 : 0; }));
    });
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (M[p][c] === 0) return null;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      var d = M[c][c];
      for (var k = 0; k < 2 * n; k++) M[c][k] /= d;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === c) continue;
        var f = M[r2][c];
        if (f !== 0) for (var k2 = 0; k2 < 2 * n; k2++) M[r2][k2] -= f * M[c][k2];
      }
    }
    return M.map(function (r) { return r.slice(n); });
  }
  function norm1(A) {                         // max column abs sum
    var best = 0;
    for (var j = 0; j < 4; j++) {
      var s = 0;
      for (var i = 0; i < 4; i++) s += Math.abs(A[i][j]);
      if (s > best) best = s;
    }
    return best;
  }
  function conditionNumber(cols) {
    var M = toRows(cols.map(function (c) { var n = norm2(c); return c.map(function (v) { return v / n; }); }));
    var inv = inverse4(M);
    if (!inv) return Infinity;
    var c = norm1(M) * norm1(inv);
    return isFinite(c) ? c : Infinity;
  }
  function det4(cols) {
    var m = toRows(cols), d = 1;
    for (var col = 0; col < 4; col++) {
      var p = col;
      for (var r = col + 1; r < 4; r++) if (Math.abs(m[r][col]) > Math.abs(m[p][col])) p = r;
      if (m[p][col] === 0) return 0;
      if (p !== col) { var t = m[col]; m[col] = m[p]; m[p] = t; d = -d; }
      d *= m[col][col];
      for (var r2 = col + 1; r2 < 4; r2++) {
        var f = m[r2][col] / m[col][col];
        for (var k = col; k < 4; k++) m[r2][k] -= f * m[col][k];
      }
    }
    return d;
  }

  function solveProjection(x, points, basis) {
    var cols = points.concat(basis);
    if (cols.length !== 4)
      throw ProjectionError("a projection needs four reference points in total: " + points.length
        + " projection point(s) and " + basis.length + " target vertices");
    var norms = cols.map(norm2);
    if (norms.some(function (n) { return n === 0; })) throw ProjectionError("a reference point is the null vector");
    var cond = conditionNumber(cols);
    if (!isFinite(cond) || cond > COND_FAIL)
      throw ProjectionError("the projection point(s) and the target plane are coplanar - this projection is geometrically undefined");
    var xs = norm2(x);
    if (xs === 0) throw ProjectionError("the composition is the null vector");
    var Mn = toRows(cols.map(function (c, j) { return c.map(function (v) { return v / norms[j]; }); }));
    var inv = inverse4(Mn), xu = x.map(function (v) { return v / xs; });
    var y = inv.map(function (row) { return row[0] * xu[0] + row[1] * xu[1] + row[2] * xu[2] + row[3] * xu[3]; });
    var sol = y.map(function (v, j) { return v / norms[j] * xs; });
    return { a: sol.slice(0, points.length), b: sol.slice(points.length), cond: cond };
  }

  function normalised(b) {
    var tot = sum(b);
    if (Math.abs(tot) <= REL_TOL * Math.max(absSum(b), 1e-300))
      throw ProjectionError("composition projects to infinity: it lies on the plane through the projection point parallel to the target plane");
    return b.map(function (v) { return 100 * v / tot; });
  }

  function sideOfPlane(x, plane, reference) {
    function u(v) { var n = norm2(v); return v.map(function (t) { return t / n; }); }
    var P = plane.map(u);
    var dx = det4([P[0], P[1], P[2], u(x)]);
    var dr = det4([P[0], P[1], P[2], u(reference)]);
    if (Math.abs(dr) < REL_TOL) throw ProjectionError("reference point lies on the dividing plane");
    if (Math.abs(dx) < REL_TOL) return { sign: 0, ratio: 0 };
    var ratio = dx / dr;
    return { sign: ratio > 0 ? 1 : -1, ratio: ratio };
  }

  // ----------------------------------------------------------------- input
  function toNumber(key, val) {
    if (typeof val === "boolean") throw InputError("'" + key + "' is not a number");
    if (typeof val === "string") {
      if (!NUMBER_RE.test(val.trim())) throw InputError("'" + key + "' is not a number (got '" + val + "')");
      val = parseFloat(val.trim());
    }
    if (typeof val !== "number" || isNaN(val)) throw InputError("'" + key + "' is not a number (got " + val + ")");
    if (!isFinite(val)) throw InputError("'" + key + "' is not a finite number (got " + val + ")");
    if (val < 0) throw InputError("'" + key + "' is negative (" + val + "); oxide contents cannot be negative");
    return val;
  }

  /* [[column, hint]] for keys parseOxides would reject (same rule as
   * ohara.components.unknown_columns) */
  function unknownColumns(keys) {
    var bad = [];
    keys.forEach(function (key) {
      var nk = normKey(key), k = ALIASES[nk] || String(key).trim();
      if (MW.hasOwnProperty(k) || k === "FeO*" || k === "Fe2O3*" || IGNORED.hasOwnProperty(nk)) return;
      bad.push([key, suggest(key)]);
    });
    return bad;
  }

  function parseOxides(raw, feRatio, lenient) {
    if (feRatio === undefined) feRatio = 0.15;
    if (typeof feRatio !== "number" || !isFinite(feRatio) || feRatio < 0 || feRatio > 1)
      throw InputError("Fe3+/total Fe ratio must be a number between 0 and 1 (got " + feRatio + ")");
    var ox = {}, notes = [], feTotal = null, splitIron = false;
    OXIDES.forEach(function (k) { ox[k] = 0; });
    Object.keys(raw).forEach(function (key) {
      var val = raw[key];
      if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) return;
      var nk = normKey(key);
      var k = ALIASES[nk] || String(key).trim();
      if (!ox.hasOwnProperty(k) && k !== "FeO*" && k !== "Fe2O3*") {
        if (IGNORED.hasOwnProperty(nk)) {
          toNumber(key, val);
          notes.push(IGNORED[nk] + " is not used by this model and was excluded");
          return;
        }
        var hint = suggest(key);
        if (!lenient) throw InputError("unrecognised column '" + key + "'"
          + (hint ? " - did you mean " + hint + "?" : " - not an oxide this program knows"));
        notes.push("WARNING: ignored unrecognised column '" + key + "'" + (hint ? " (did you mean " + hint + "?)" : ""));
        return;
      }
      var v = toNumber(key, val);
      if (k === "FeO*" || k === "Fe2O3*") {
        if (feTotal) throw InputError("total iron was given twice");
        feTotal = [k, v]; return;
      }
      if ((k === "FeO" || k === "Fe2O3") && v > 0) splitIron = true;
      ox[k] += v;
    });
    if (feTotal) {
      if (splitIron) throw InputError("give either total iron (FeO*/FeOT/Fe2O3T) or FeO and Fe2O3, not both");
      var feoTot = feTotal[0] === "FeO*" ? feTotal[1] : feTotal[1] * (2 * MW.FeO) / MW.Fe2O3;
      var nTot = feoTot / MW.FeO, nFe3 = nTot * feRatio;
      ox.Fe2O3 += nFe3 / 2 * MW.Fe2O3;
      ox.FeO += (nTot - nFe3) * MW.FeO;
      notes.push("total iron split with atomic Fe3+/total Fe = " + feRatio.toFixed(3)
        + "; affects A (via Fe2O3) and M (via FeO)");
    }
    var anhydrous = 0;
    OXIDES.forEach(function (k) { if (!VOLATILES[k]) anhydrous += ox[k]; });
    if (anhydrous <= 0) throw InputError("the analysis contains no non-volatile oxides");
    if (anhydrous < TOTAL_MIN || anhydrous > TOTAL_MAX)
      notes.push("WARNING: anhydrous oxide total is "
        + (Math.floor(Math.round(anhydrous * 1e6) / 1e4 + 0.5) / 100).toFixed(2) + " wt%, outside "
        + TOTAL_MIN.toFixed(0) + "-" + TOTAL_MAX.toFixed(0)
        + "; check the analysis (all calculations are ratio-based and will still run)");
    return { oxides: ox, notes: notes };
  }

  function molProps(ox) {
    var n = {};
    OXIDES.forEach(function (k) { n[k] = (ox[k] || 0) / MW[k]; });
    return n;
  }

  // ------------------------------------------------------------------ CMAS
  function cmas(ox) {
    var n = molProps(ox), notes = [];
    var C = (n.CaO - 10 / 3 * n.P2O5 + 2 * n.Na2O + 2 * n.K2O) * MW_C;
    var M = (n.MgO + n.FeO + n.MnO + n.NiO - n.TiO2) * MW_M;
    var A = (n.Al2O3 + n.Cr2O3 + n.Fe2O3 + n.Na2O + n.K2O + n.TiO2) * MW_A;
    var S = (n.SiO2 - 2 * n.Na2O - 2 * n.K2O) * MW_S;
    if (n.P2O5 > 0) notes.push("apatite removed: CaO reduced by 10/3 x P2O5");
    if (n.Na2O + n.K2O > 0) notes.push("albite and orthoclase recast as the equivalent weight of anorthite (CAS2); jadeite/aegirine recast as CaTs (CAS)");
    if (n.TiO2 > 0) notes.push("TiO2 recast with the spinel component: M reduced and A increased by mol TiO2");
    if (n.Fe2O3 + n.Cr2O3 > 0) notes.push("magnetite and chromite recast as spinel (Fe2O3, Cr2O3 -> A)");
    if (n.FeO + n.MnO + n.NiO > 0) notes.push("FeO, MnO and NiO treated as MgO; all olivines plot as forsterite (M2S)");
    [["C", C], ["M", M], ["A", A], ["S", S]].forEach(function (p) {
      if (p[1] < 0) notes.push("WARNING: component " + p[0] + " is negative (" + p[1].toFixed(3)
        + ") - the composition lies outside the range for which this reduction is defined");
    });
    return { comp: { C: C, M: M, A: A, S: S }, notes: notes };
  }

  // ------------------------------------------------------------- CIPW norm
  function cipwNorm(ox, molRound) {
    var notes = [], n = molProps(ox), x;
    if (molRound !== undefined && molRound !== null) {
      var f10 = Math.pow(10, molRound);
      Object.keys(n).forEach(function (k) { n[k] = Math.round(n[k] * f10) / f10; });
    }
    var ap = n.P2O5, caNeed = 10 / 3 * ap;
    if (caNeed > n.CaO) {
      ap = n.CaO * 3 / 10;
      notes.push("WARNING: P2O5 exceeds what the CaO can take up as apatite; "
        + (n.P2O5 - ap).toFixed(4) + " mol P2O5 left unallocated (outside the scope of the CIPW norm)");
      caNeed = n.CaO;
    }
    n.CaO = Math.max(n.CaO - caNeed, 0);
    if (ap) notes.push("apatite taken from P2O5, CaO reduced by 10/3 P2O5");

    var cm = Math.min(n.Cr2O3, n.FeO); n.Cr2O3 -= cm; n.FeO -= cm;
    if (n.Cr2O3 > 1e-12) notes.push("Cr2O3 in excess of FeO left unallocated");
    var il = Math.min(n.TiO2, n.FeO); n.TiO2 -= il; n.FeO -= il;
    var ru = n.TiO2;
    if (ru > 1e-12) notes.push("TiO2 in excess of FeO (" + ru.toFixed(4) + " mol) left as rutile and excluded from the silicate norm");
    var mt = Math.min(n.Fe2O3, n.FeO); n.Fe2O3 -= mt; n.FeO -= mt;
    var hm = n.Fe2O3;

    var mg = n.MgO, fe = n.FeO + n.MnO + n.NiO;
    if (n.MnO + n.NiO > 0) notes.push("MnO and NiO pooled with FeO");
    var pool = mg + fe, xmg = pool > 0 ? mg / pool : 1;

    var or_ = Math.min(n.K2O, n.Al2O3);
    if (n.K2O - or_ > 1e-12) notes.push("WARNING: K2O exceeds Al2O3 (peralkaline); excess K2O not allocated - outside the scope of this norm");
    var al = n.Al2O3 - or_;
    var ab = Math.min(n.Na2O, al);
    if (n.Na2O - ab > 1e-12) notes.push("WARNING: Na2O exceeds the Al2O3 left after orthoclase (peralkaline); acmite and sodium metasilicate are not computed - excess Na2O not allocated");
    al -= ab;
    var an = Math.min(al, n.CaO); al -= an;
    var ca = n.CaO - an, co = al;
    var di = Math.min(ca, pool); ca -= di;
    var wo = ca, hy = pool - di;

    var si = n.SiO2 - 6 * or_ - 6 * ab - 2 * an - 2 * di - wo - hy;
    var ne = 0, lc = 0, ks = 0, cs = 0, ol = 0;
    if (si < 0) {
      var d = -si;
      x = Math.min(d, hy / 2); ol += x; hy -= 2 * x; d -= x;
      if (d > 1e-12) { x = Math.min(d / 4, ab); ne += x; ab -= x; d -= 4 * x;
        notes.push("silica deficiency: albite converted to nepheline"); }
      if (d > 1e-12) { x = Math.min(d / 2, or_); lc += x; or_ -= x; d -= 2 * x;
        notes.push("silica deficiency: orthoclase converted to leucite"); }
      if (d > 1e-12) { x = Math.min(d / 2, lc); ks += x; lc -= x; d -= 2 * x;
        if (x) notes.push("silica deficiency: leucite converted to kalsilite (Ks)"); }
      if (d > 1e-12) { x = Math.min(d, wo / 2); cs += x; wo -= 2 * x; d -= x;
        if (x) notes.push("silica deficiency: wollastonite converted to larnite (Cs)"); }
      if (d > 1e-12) { x = Math.min(d / 2, di / 2); cs += x; ol += x; di -= 2 * x; d -= 2 * x;
        if (x) notes.push("silica deficiency: diopside converted to larnite (Cs) + olivine"); }
      if (d > 1e-9) notes.push("WARNING: a silica deficiency of " + d.toFixed(4)
        + " mol remains after every CIPW conversion - outside the scope of the norm");
      si = 0;
    }
    var qz = si;
    if (wo > 1e-12) notes.push("CaO in excess of the mafic oxides carried as wollastonite");

    var W = NORM_MW;
    var norm = {
      apatite: ap * W.apatite, chromite: cm * W.chromite, ilmenite: il * W.ilmenite,
      magnetite: mt * W.magnetite, hematite: hm * W.hematite, rutile: ru * W.rutile,
      quartz: qz * W.quartz, orthoclase: or_ * W.orthoclase, albite: ab * W.albite,
      anorthite: an * W.anorthite, nepheline: ne * W.nepheline, leucite: lc * W.leucite,
      kalsilite: ks * W.kalsilite, corundum: co * W.corundum,
      wollastonite: wo * W.wollastonite, larnite: cs * W.larnite,
      diopside: di * (xmg * W.di_mg + (1 - xmg) * W.di_fe),
      hypersthene: hy * (xmg * W.enstatite + (1 - xmg) * W.ferrosilite),
      olivine: ol * (xmg * W.forsterite + (1 - xmg) * W.fayalite)
    };
    var out = {};
    Object.keys(norm).forEach(function (k) { if (norm[k] > 1e-9) out[k] = norm[k]; });
    out._moles = { qz: qz, or: or_, ab: ab, an: an, ne: ne, lc: lc, ks: ks, cs: cs,
                   wo: wo, di: di, hy: hy, ol: ol, xmg: xmg };
    return { norm: out, notes: notes };
  }

  function tetraFromNorm(norm, plagMode) {
    if (plagMode !== "plag" && plagMode !== "ab") throw InputError("plag_mode must be 'plag' or 'ab'");
    var m = norm._moles, notes = [];
    var olT = m.ol + m.hy / 2, qzT = m.qz + m.hy / 2, neT = m.ne;
    if (m.hy > 0) notes.push("normative hypersthene recast as olivine + silica (Mg2Si2O6 = Mg2SiO4 + SiO2)");
    if (plagMode === "ab") {
      neT += m.ab; qzT += 4 * m.ab;
      if (m.ab) notes.push("normative albite recast as nepheline + 2 silica (NaAlSi3O8 = NaAlSiO4 + 2SiO2)");
      if (m.an) notes.push("normative anorthite omitted: it has no representation in Di-Ol-Ne-Qz");
      if (m.or) notes.push("normative orthoclase omitted (no K vertex)");
    } else if (m.ab || m.an || m.or) {
      notes.push("composition projected from plagioclase: normative anorthite, albite and orthoclase removed before plotting");
    }
    [["lc", "leucite"], ["ks", "kalsilite"], ["cs", "larnite"]].forEach(function (p) {
      if (m[p[0]]) notes.push("normative " + p[1] + " present - the composition lies outside the basalt tetrahedron and the plotted point is an approximation");
    });
    ["magnetite", "ilmenite", "chromite", "apatite", "hematite", "rutile", "corundum", "wollastonite"].forEach(function (k) {
      if (norm[k]) notes.push(k + " excluded (outside the tetrahedron)");
    });
    var moles = [m.di, olT, neT, qzT];
    return { vector: moles.map(function (v, i) { return v * BASALT_W[i]; }),
             moles: { Di: m.di, Ol: olT, Ne: neT, Qz: qzT }, notes: notes };
  }

  function yoderTilleyGroup(norm) {
    var m = norm._moles, t = 1e-6;
    if (m.ab + m.an + m.or + m.lc + m.ks <= t)
      return "feldspar-free: outside the Yoder & Tilley basalt classification (a mineral or an ultramafic composition)";
    if (m.ne > t || m.lc > t || m.ks > t || m.cs > t) {
      if (m.cs > t || m.lc > t || m.ks > t)
        return "5. alkali basalt group, beyond the tetrahedron (nepheline-normative with larnite, leucite or kalsilite; cf. melilite-bearing types)";
      return "5. alkali basalt (nepheline-normative)";
    }
    if (m.qz > t && m.hy > t) return "1. tholeiite, oversaturated (normative quartz and hypersthene)";
    if (m.hy > t && m.ol <= t && m.qz <= t) return "2. tholeiite, saturated / hypersthene basalt (normative hypersthene)";
    if (m.hy > t && m.ol > t) return "3. olivine tholeiite, undersaturated (normative hypersthene and olivine)";
    if (m.ol > t && m.hy <= t) return "4. olivine basalt (normative olivine, no hypersthene, no nepheline)";
    return "unclassified (no normative Qz, Hy, Ol or Ne)";
  }

  // ------------------------------------------------------------- the model
  function Composition(raw, opts) {
    opts = opts || {};
    var feRatio = opts.feRatio === undefined ? 0.15 : opts.feRatio;
    var plagMode = opts.plagMode || "plag";
    if (plagMode !== "plag" && plagMode !== "ab") throw InputError("plag_mode must be 'plag' or 'ab'");
    var p = parseOxides(raw, feRatio, !!opts.lenient);
    this.label = opts.label || "sample";
    this.raw = raw;
    this.oxides = p.oxides;
    this.assumptions = p.notes.slice();
    var c = cmas(this.oxides);
    this.cmas = c.comp;
    this.assumptions = this.assumptions.concat(c.notes);
    this.cmasVec = [c.comp.C, c.comp.M, c.comp.A, c.comp.S];
    var nn = cipwNorm(this.oxides);
    this.norm = nn.norm;
    this.assumptions = this.assumptions.concat(nn.notes);
    var tt = tetraFromNorm(nn.norm, plagMode);
    this.basaltVec = tt.vector;
    this.basaltMoles = tt.moles;
    this.assumptions = this.assumptions.concat(tt.notes);
    this.plagMode = plagMode;
    this.feRatio = feRatio;
    this.ytGroup = yoderTilleyGroup(nn.norm);
  }
  Composition.prototype.vector = function (space) {
    return space === "cmas" ? this.cmasVec : this.basaltVec;
  };

  function pct(v, keys) {
    var t = sum(v), out = {};
    var degenerate = Math.abs(t) <= 1e-12 * Math.max(absSum(v), 1e-300);
    keys.forEach(function (k, i) { out[k] = degenerate ? 0 : 100 * v[i] / t; });
    return out;
  }

  function classify(comp, space) {
    var x = comp.vector(space);
    var planes = space === "cmas" ? CMAS_PLANES : BASALT_PLANES;
    return planes.map(function (pl) {
      if (norm2(x) === 0) return { id: pl.id, plane: pl.label, side: "undefined", sign: "?", value: 0 };
      var P = pl.plane.map(function (k) { return vec(space, k); });
      var s = sideOfPlane(x, P, vec(space, pl.ref));
      return { id: pl.id, plane: pl.label,
               side: s.sign > 0 ? pl.pos : (s.sign < 0 ? pl.neg : "exactly on the plane"),
               sign: s.sign > 0 ? "+" : (s.sign < 0 ? "-" : "0"), value: s.ratio };
    });
  }

  function subspace(comp, space) {
    if (space === "basalt") return comp.ytGroup;
    var t = {};
    classify(comp, "cmas").forEach(function (r) { t[r.id] = r.sign; });
    if (t.critical_undersaturation === "-")
      return "critically undersaturated volume (Di-Ol-An-Ne side): nepheline-normative, alkalic";
    if (t.silica_saturation === "+")
      return "oversaturated volume (beyond the plane of silica saturation Di-Hy-An): quartz-normative tholeiitic";
    if (t.silica_saturation === "-")
      return "undersaturated volume between the Di-Ol-An and Di-Hy-An planes: olivine- and hypersthene-normative tholeiitic";
    return "on a bounding plane of the tetrahedron";
  }

  function ternaryXY(b) {
    return [(b[1] + 0.5 * b[2]) / 100, (Math.sqrt(3) / 2) * b[2] / 100];
  }

  var TETRA_VERTS = [[0, 0, 0], [1, 0, 0], [0.5, Math.sqrt(3) / 2, 0],
                     [0.5, Math.sqrt(3) / 6, Math.sqrt(6) / 3]];
  function tetraXYZ(v) {
    var t = sum(v);
    if (Math.abs(t) <= REL_TOL * Math.max(absSum(v), 1e-300)) return null;
    var out = [0, 0, 0];
    v.forEach(function (val, i) {
      for (var j = 0; j < 3; j++) out[j] += (val / t) * TETRA_VERTS[i][j];
    });
    return out;
  }

  function project(comp, id, opts) {
    var spec = PROJECTIONS.filter(function (p) { return p.id === id; })[0];
    if (!spec) throw ProjectionError("unknown projection " + id);
    return projectSpec(comp, spec, opts);
  }

  function projectSpec(comp, spec, opts) {
    opts = opts || {};
    var space = spec.space, x = comp.vector(space);
    if (absSum(x) < 1e-12)
      throw ProjectionError("the composition has no components in the " + space
        + " space (for the basalt tetrahedron this happens when the whole analysis is feldspar, which is removed by the projection from plagioclase)");
    var P = spec.points.map(function (k) { return vec(space, k); });
    var B = spec.basis.map(function (k) { return vec(space, k); });
    var s = solveProjection(x, P, B);
    var useWeight = opts.basis !== "units";
    var b = useWeight ? s.b.map(function (u, i) { return u * sum(B[i]); }) : s.b.slice();
    var coords = normalised(b);

    var warnings = [];
    if (s.cond > COND_WARN)
      warnings.push("numerically ill-conditioned (condition number " + pyExp(s.cond)
        + "): the projection point lies very close to the target plane, so small analytical errors move the plotted point a long way");
    var neg = spec.basis.filter(function (k, i) { return coords[i] < -1e-9; });
    if (neg.length) warnings.push("the projected point falls outside the triangle (negative "
      + neg.join(", ") + "); it is a valid projection but plots beyond the edge of the diagram");
    if (absSum(b) / Math.max(absSum(x), 1e-300) < 1e-3)
      warnings.push("the composition is (within rounding) the projection point itself, so its projected position is indeterminate");

    var res = {
      id: spec.id || "custom",
      title: spec.title || ("from " + spec.points.join(" + ") + " into " + spec.basis.join("-")),
      source: spec.source || "", note: spec.note || "", space: space,
      basis: useWeight ? "weight" : "units",
      projectedFrom: spec.points.map(function (k, i) {
        return { key: k, name: endmemberName(space, k), coefficient: s.a[i] };
      }),
      onto: spec.basis.map(function (k) { return { key: k, name: endmemberName(space, k) }; }),
      components: {}, rawCoefficients: {}, formulaUnits: {}, conditionNumber: s.cond,
      warnings: warnings,
      projectionLine: spec.points.map(function (k, i) {
        return k + ": coefficient " + s.a[i].toFixed(4) + " (" + (s.a[i] > 0 ? "subtract " : "add ")
          + endmemberName(space, k).split(" (")[0] + " to reach the plane)";
      }),
      assumptions: comp.assumptions.slice()
    };
    spec.basis.forEach(function (k, i) {
      res.components[k] = coords[i]; res.rawCoefficients[k] = b[i]; res.formulaUnits[k] = s.b[i];
    });
    res.diagram = spec.basis.length === 3 ? "ternary" : "binary";
    res.xy = spec.basis.length === 3 ? ternaryXY(coords) : [coords[1] / 100, 0];
    return res;
  }

  function availableProjections(comp, space) {
    return PROJECTIONS.filter(function (p) { return !space || p.space === space; }).map(function (spec) {
      var rec = { id: spec.id, title: spec.title, space: spec.space, points: spec.points, basis: spec.basis };
      try {
        var r = project(comp, spec.id);
        rec.valid = true;
        rec.insideTriangle = Object.keys(r.components).every(function (k) { return r.components[k] >= -1e-9; });
        rec.warnings = r.warnings;
      } catch (e) {
        if (e.name !== "ProjectionError") throw e;
        rec.valid = false; rec.reason = e.message;
      }
      return rec;
    });
  }

  function report(comp) {
    var normWt = {};
    Object.keys(comp.norm).forEach(function (k) { if (k !== "_moles") normWt[k] = comp.norm[k]; });
    var cmasPct;
    try { cmasPct = pct(comp.cmasVec, ["C", "M", "A", "S"]); }
    catch (e) { cmasPct = { C: 0, M: 0, A: 0, S: 0 }; }
    return {
      label: comp.label, oxides: comp.oxides, cmas: comp.cmas, cmasPct: cmasPct,
      norm: normWt,
      basaltVector: { Di: comp.basaltVec[0], Ol: comp.basaltVec[1], Ne: comp.basaltVec[2], Qz: comp.basaltVec[3] },
      basaltPct: pct(comp.basaltVec, ["Di", "Ol", "Ne", "Qz"]),
      ytGroup: comp.ytGroup,
      cmasSubspace: subspace(comp, "cmas"),
      cmasPlanes: classify(comp, "cmas"),
      basaltPlanes: classify(comp, "basalt"),
      assumptions: comp.assumptions,
      xyzCmas: tetraXYZ(comp.cmasVec),
      xyzBasalt: tetraXYZ(comp.basaltVec)
    };
  }

  return {
    DEFS: DEFS, MW: MW, OXIDES: OXIDES, PROJECTIONS: PROJECTIONS, NORM_MW: NORM_MW,
    CMAS_ENDMEMBERS: CMAS_ENDMEMBERS, BASALT_ENDMEMBERS: BASALT_ENDMEMBERS,
    CMAS_PLANES: CMAS_PLANES, BASALT_PLANES: BASALT_PLANES, TETRA_VERTS: TETRA_VERTS,
    COND_WARN: COND_WARN, COND_FAIL: COND_FAIL,
    Composition: Composition, project: project, projectSpec: projectSpec,
    classify: classify, subspace: subspace, report: report, vec: vec,
    tetraXYZ: tetraXYZ, ternaryXY: ternaryXY, availableProjections: availableProjections,
    endmemberName: endmemberName, cipwNorm: cipwNorm, cmas: cmas,
    parseOxides: parseOxides, suggest: suggest, unknownColumns: unknownColumns, solveProjection: solveProjection,
    conditionNumber: conditionNumber, sideOfPlane: sideOfPlane
  };
}));
