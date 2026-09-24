"""Parity between the Python package and the browser engine (app/ohara.js).

Both engines read the same ohara/data/definitions.json (the browser via the
generated app/definitions.js), so constants, endmembers, planes and
projections cannot differ. This test checks the algorithms:

  * app/definitions.js is up to date with ohara/data/definitions.json;
  * a seeded random set of compositions spanning ultramafic to peralkaline,
    each run with both feldspar treatments and, for total-iron input,
    several Fe3+/sum-Fe ratios - every report field (CMAS, norm, tetrahedron
    components, groups, plane sides, 3-D positions, assumption text) and every
    projection field (coordinates, formula units, coefficients, xy,
    condition number, warnings) must agree to 1e-8 relative;
  * Yoder & Tilley's Table 2 and the example suite, likewise;
  * malformed inputs must be rejected by both engines as InputError.

Requires Node.js on PATH (reported as skipped otherwise).
"""
import csv
import json
import os
import random
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))

from ohara.api import (Composition, InputError, classify, project,  # noqa
                       report)
from ohara.geometry import ProjectionError                          # noqa
from ohara.spaces import PROJECTIONS                                # noqa
import build_definitions                                            # noqa

TOL = 1e-8

JS_RUNNER = r"""
const Ohara = require(process.argv[2]);
const cases = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8'));
const out = cases.map(function (c) {
  let comp;
  try {
    comp = new Ohara.Composition(c.oxides, {label: c.label, feRatio: c.fe_ratio, plagMode: c.plag_mode, lenient: !!c.lenient});
  } catch (e) { return {error: e.name}; }
  const rep = Ohara.report(comp);
  const projections = {};
  Ohara.PROJECTIONS.forEach(function (p) {
    try {
      const r = Ohara.project(comp, p.id);
      projections[p.id] = {components: r.components, formula_units: r.formulaUnits,
        coefficients: r.projectedFrom.map(function (q) { return q.coefficient; }),
        xy: r.xy, cond: r.conditionNumber, warnings: r.warnings};
    } catch (e) { projections[p.id] = {error: e.name}; }
  });
  return {cmas: rep.cmas, cmas_pct: rep.cmasPct, basalt_pct: rep.basaltPct,
          norm: rep.norm, group: rep.ytGroup, subspace: rep.cmasSubspace,
          cmas_signs: rep.cmasPlanes.map(function (p) { return p.sign; }),
          basalt_signs: rep.basaltPlanes.map(function (p) { return p.sign; }),
          xyz_cmas: rep.xyzCmas, xyz_basalt: rep.xyzBasalt,
          assumptions: rep.assumptions, projections: projections};
});
process.stdout.write(JSON.stringify(out));
"""

MALFORMED = [
    {"SiO2": -1, "MgO": 40},
    {"SiO2": "abc", "MgO": 40},
    {"SiO2": "0x10", "MgO": 40},
    {"SiO2": "1e999", "MgO": 40},
    {"SiO2": "NaN", "MgO": 40},
    {"SiO2": "Infinity", "MgO": 40},
    {"SiO2": True, "MgO": 40},
    {"SiO2": 50, "FeO": 8, "FeOT": 10},
    {},
    {"H2O": 3},
    {"Si02": 50, "MgO": 40},                  # typo: zero for O
    {"SiO2": 50, "MgO": 40, "Colour": 3},     # not an oxide
    {"SiO2": 50, "MgO": 40, "SrO": "x"},      # known-unused but not a number
]
LENIENT_AND_UNUSED = [
    dict(oxides={"Si02": 50, "MgO": 40, "sio2": 1}, lenient=True),
    dict(oxides={"SiO2": 50, "MgO": 40, "Foo": 2}, lenient=True),
    dict(oxides={"SiO2": 48, "MgO": 10, "CaO": 11, "Al2O3": 15, "SrO": 0.1,
                 "SO3": 0.07, "H2O-": 0.2, "BaO": 0.05}, lenient=False),
]


def random_cases(n=250, seed=1968):
    rng = random.Random(seed)
    cases = []
    for i in range(n):
        kind = rng.choice(["basalt", "alkaline", "ultramafic", "felsic",
                           "sparse", "peralkaline", "phosphate"])
        ox = {}
        if kind == "basalt":
            ox = dict(SiO2=rng.uniform(44, 54), TiO2=rng.uniform(0.5, 4),
                      Al2O3=rng.uniform(11, 19), Fe2O3=rng.uniform(0, 5),
                      FeO=rng.uniform(5, 12), MnO=rng.uniform(0, 0.3),
                      MgO=rng.uniform(4, 14), CaO=rng.uniform(7, 13),
                      Na2O=rng.uniform(1, 4), K2O=rng.uniform(0, 1.5),
                      P2O5=rng.uniform(0, 0.8))
        elif kind == "alkaline":
            ox = dict(SiO2=rng.uniform(36, 46), TiO2=rng.uniform(1, 4),
                      Al2O3=rng.uniform(9, 16), Fe2O3=rng.uniform(2, 6),
                      FeO=rng.uniform(5, 10), MgO=rng.uniform(6, 15),
                      CaO=rng.uniform(10, 16), Na2O=rng.uniform(2.5, 6),
                      K2O=rng.uniform(0.5, 4), P2O5=rng.uniform(0.3, 1.5))
        elif kind == "ultramafic":
            ox = dict(SiO2=rng.uniform(40, 46), Al2O3=rng.uniform(0.5, 5),
                      FeO=rng.uniform(6, 10), MgO=rng.uniform(30, 46),
                      CaO=rng.uniform(0.3, 4), Na2O=rng.uniform(0, 0.4),
                      Cr2O3=rng.uniform(0, 0.6), NiO=rng.uniform(0, 0.3))
        elif kind == "felsic":
            ox = dict(SiO2=rng.uniform(60, 76), Al2O3=rng.uniform(12, 17),
                      FeO=rng.uniform(0.5, 5), MgO=rng.uniform(0.1, 3),
                      CaO=rng.uniform(0.5, 5), Na2O=rng.uniform(3, 5),
                      K2O=rng.uniform(2, 5))
        elif kind == "sparse":
            for k in rng.sample(["SiO2", "Al2O3", "MgO", "CaO", "FeO", "Na2O",
                                 "K2O", "TiO2"], rng.randint(1, 4)):
                ox[k] = rng.uniform(1, 60)
        elif kind == "peralkaline":
            ox = dict(SiO2=rng.uniform(65, 74), Al2O3=rng.uniform(6, 10),
                      FeO=rng.uniform(3, 8), CaO=rng.uniform(0.1, 1),
                      Na2O=rng.uniform(5, 8), K2O=rng.uniform(4, 6),
                      MgO=rng.uniform(0, 0.5))
        else:
            ox = dict(SiO2=rng.uniform(20, 45), Al2O3=rng.uniform(5, 15),
                      CaO=rng.uniform(1, 10), P2O5=rng.uniform(3, 15),
                      MgO=rng.uniform(5, 20), FeO=rng.uniform(5, 15))
        ox = {k: round(v, 3) for k, v in ox.items()}
        if rng.random() < 0.3 and "FeO" in ox:              # total-iron input
            ox["FeOT"] = ox.pop("FeO") + ox.pop("Fe2O3", 0.0) * 0.8998
        for plag in ("plag", "ab"):
            for fe in ((0.0, 0.15, 1.0) if "FeOT" in ox else (0.15,)):
                cases.append(dict(label="r%d" % i, oxides=ox, fe_ratio=fe,
                                  plag_mode=plag))
    return cases


def file_cases():
    out = []
    for path, lab in (("data/yoder_tilley_1962_table2.csv", "no"),
                      ("data/example_suite.csv", "label")):
        with open(os.path.join(ROOT, path), newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                ox = {k: float(v) for k, v in r.items()
                      if k in ("SiO2", "TiO2", "Al2O3", "Cr2O3", "Fe2O3", "FeO",
                               "MnO", "NiO", "MgO", "CaO", "Na2O", "K2O",
                               "P2O5") and v not in ("", None)}
                for plag in ("plag", "ab"):
                    out.append(dict(label=r[lab], oxides=ox, fe_ratio=0.15,
                                    plag_mode=plag))
    return out


def python_result(c):
    try:
        comp = Composition(c["oxides"], label=c["label"],
                           fe_ratio=c["fe_ratio"], plag_mode=c["plag_mode"],
                           lenient=c.get("lenient", False))
    except InputError:
        return {"error": "InputError"}
    rep = report(comp)
    projections = {}
    for spec in PROJECTIONS:
        try:
            r = project(comp, spec["id"])
            projections[spec["id"]] = dict(
                components=r["components"], formula_units=r["formula_units"],
                coefficients=[p["coefficient"] for p in r["projected_from"]],
                xy=list(r["xy"]), cond=r["condition_number"],
                warnings=r["warnings"])
        except ProjectionError:
            projections[spec["id"]] = {"error": "ProjectionError"}
    return dict(cmas=rep["cmas"], cmas_pct=rep["cmas_pct"],
                basalt_pct=rep["basalt_pct"], norm=rep["norm"],
                group=rep["yoder_tilley_group"], subspace=rep["cmas_subspace"],
                cmas_signs=[p["sign"] for p in rep["cmas_planes"]],
                basalt_signs=[p["sign"] for p in rep["basalt_planes"]],
                xyz_cmas=list(rep["xyz_cmas"]) if rep["xyz_cmas"] else None,
                xyz_basalt=list(rep["xyz_basalt"]) if rep["xyz_basalt"] else None,
                assumptions=rep["assumptions"], projections=projections)


def compare(a, b, path, errors):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(a) | set(b):
            if k not in a or k not in b:
                # a mineral present at 1e-9 in one engine only is not a bug
                v = a.get(k, b.get(k))
                if isinstance(v, (int, float)) and abs(v) < 1e-6:
                    continue
                errors.append("%s.%s missing in %s" % (path, k,
                              "python" if k not in a else "js"))
                continue
            compare(a[k], b[k], "%s.%s" % (path, k), errors)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            errors.append("%s: length %d vs %d" % (path, len(a), len(b)))
            return
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, "%s[%d]" % (path, i), errors)
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) \
            and not isinstance(a, bool):
        if abs(a - b) > TOL * max(1.0, abs(a), abs(b)):
            errors.append("%s: %r vs %r" % (path, a, b))
    elif a != b:
        errors.append("%s: %r vs %r" % (path, a, b))


def run():
    if build_definitions.main(["--check"]):
        return 1
    import check_vendor
    if check_vendor.main():
        return 1
    try:
        subprocess.check_output(["node", "--version"])
    except Exception:
        print("SKIP: Node.js not available")
        return 0

    cases = random_cases() + file_cases() + [
        dict(label="bad%d" % i, oxides=o, fe_ratio=0.15, plag_mode="plag")
        for i, o in enumerate(MALFORMED)] + [
        dict(label="badfe", oxides={"SiO2": 50, "MgO": 40}, fe_ratio=r,
             plag_mode="plag") for r in (-0.1, 1.5)] + [
        dict(label="len%d" % i, fe_ratio=0.15, plag_mode="plag", **c)
        for i, c in enumerate(LENIENT_AND_UNUSED)]

    tmp = tempfile.mkdtemp()
    runner = os.path.join(tmp, "runner.js")
    data = os.path.join(tmp, "cases.json")
    with open(runner, "w") as fh:
        fh.write(JS_RUNNER)
    with open(data, "w") as fh:
        json.dump(cases, fh)
    js = json.loads(subprocess.check_output(
        ["node", runner, os.path.join(ROOT, "app", "ohara.js"), data]).decode())

    errors = []
    for c, j in zip(cases, js):
        compare(python_result(c), j,
                "%s[%s,fe=%s]" % (c["label"], c["plag_mode"], c["fe_ratio"]),
                errors)
    n_proj = sum(1 for c in cases for _ in PROJECTIONS)
    rejected = sum(1 for j in js if "error" in j)
    print("compared %d cases (%d projections, %d malformed inputs rejected by "
          "both engines): %s" % (len(cases), n_proj, rejected,
                                 "identical" if not errors else
                                 "%d MISMATCHES" % len(errors)))
    for e in errors[:40]:
        print("  " + e)
    return 1 if errors else 0


def test_js_matches_python():
    assert run() == 0


if __name__ == "__main__":
    sys.exit(run())
