"""Validation against O'Hara (1968) Figs 4A, 4C, 5, 9, 10 and 11 (digitised).

Points digitised from the published figures (data/ohara_1968_digitised.csv;
method in data/ohara_1968_digitised.provenance.json) are converted to
O'Hara's coordinates with a calibration fitted only to each figure's printed
tick marks, then compared with the engine. Two kinds of point:

  * pure phases and O'Hara & Yoder's synthetic diopside-pyrope mixtures
    (exact compositions) - these test the projection geometry and the
    weight-per-cent convention;
  * natural rocks whose analyses are transcribed in this repository
    (Yoder & Tilley 1962 Table 2; Tilley, Yoder & Schairer 1963, 1964) -
    these also test O'Hara's CMAS reduction of Na, K, Ti, P, Cr and Fe3+.

Criteria (set from the scatter of a hand-drafted 1968 figure - 0.6 wt% is
about 1.5 mm on the printed page - and stated here, not tuned per point):
  * every scored point within 0.6 wt% in every coordinate;
  * mean |difference| per figure within 0.35 wt%;
  * negative controls: molecular instead of weight units, and a naive
    reduction without O'Hara's alkali/Ti/P/Fe3+ terms, must both fail;
  * the one documented discrepancy (Fig. 5 "1921") must stay as documented.
"""
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))

import figure_check as fc                                   # noqa: E402
from ohara.api import Composition, project                  # noqa: E402
from ohara.components import MW, MW_A, MW_C, MW_M, MW_S     # noqa: E402
from ohara.geometry import normalised, solve_projection, to_weight  # noqa: E402
from ohara.spaces import PROJECTION_BY_ID, cmas_vector      # noqa: E402

POINT_TOL = 0.6
MEAN_TOL = 0.35


def scored():
    return [r for r in fc.evaluate() if r["status"] == "validate"]


def test_every_digitised_point_agrees():
    bad = ["Fig %s %s: %+.2f wt%% %s" % (r["figure"], r["label"], r["worst"],
                                          r["worst_component"])
           for r in scored() if abs(r["worst"]) > POINT_TOL]
    assert not bad, "\n".join(bad)


def test_mean_agreement_per_figure():
    res = scored()
    for fig in sorted({r["figure"] for r in res}):
        m = np.mean([abs(r["worst"]) for r in res if r["figure"] == fig])
        assert m <= MEAN_TOL, (fig, m)


def test_coverage():
    res = scored()
    assert sorted({r["figure"] for r in res}) == ["10", "11", "4A", "4C", "5", "9"]
    assert len(res) == 44
    assert sum(r["natural"] for r in res) == 11


def test_natural_rocks_agree_closely():
    """Real analyses through O'Hara's full reduction: tighter than drafting
    tolerance in practice (all within 0.25 wt% when this test was written)."""
    nat = [r for r in scored() if r["natural"]]
    assert max(abs(r["worst"]) for r in nat) <= 0.35, [
        (r["figure"], r["label"], r["worst"]) for r in nat]


def test_calibrations_are_tight():
    for r in fc.evaluate():
        assert r["tick_rms_px"] / r["px_per_wt"] < 0.15, r["figure"]


def _read_points(filter_fn):
    for fig, rows in fc.load().items():
        spec = PROJECTION_BY_ID[rows[0]["projection"]]
        inv, *_ = fc.calibrate([r for r in rows if r["kind"] == "tick"],
                               spec["basis"])
        for r in rows:
            if r["kind"] == "point" and r["status"] == "validate" and filter_fn(r):
                yield spec, inv(float(r["x_px"]), float(r["y_px"])), r


def test_negative_control_molecular_units_fail():
    diffs = []
    for spec, read, r in _read_points(lambda r: True):
        eng = project(Composition(fc.composition(r["composition"])),
                      spec["id"], basis="units")["components"]
        diffs.append(max(abs(read[k] - eng[k]) for k in spec["basis"]))
    assert np.mean(diffs) > 2.0, np.mean(diffs)


def test_negative_control_naive_reduction_fails_for_natural_rocks():
    """C = CaO, M = MgO + FeO, A = Al2O3, S = SiO2 (no recasting of alkalis,
    Ti, P or Fe3+) must not reproduce O'Hara's plotted natural rocks."""
    diffs = []
    for spec, read, r in _read_points(lambda r: ":" in r["composition"]):
        ox = fc.composition(r["composition"])
        n = {k: ox.get(k, 0.0) / MW[k] for k in MW}
        x = np.array([n["CaO"] * MW_C, (n["MgO"] + n["FeO"]) * MW_M,
                      n["Al2O3"] * MW_A, n["SiO2"] * MW_S])
        B = [cmas_vector(k) for k in spec["basis"]]
        _, b = solve_projection(x, [cmas_vector(p) for p in spec["points"]], B)
        c = dict(zip(spec["basis"], normalised(to_weight(b, B))))
        diffs.append(max(abs(read[k] - c[k]) for k in spec["basis"]))
    assert len(diffs) == 11 and min(diffs) > POINT_TOL, diffs


def test_documented_discrepancy_fig5_1921():
    """Fig. 5's '1921' point lies 3 wt% from analysis 14 (used for 1921 in
    Fig. 4C, where it agrees to 0.25 wt%) but within 0.2 wt% of Yoder &
    Tilley's analysis 12 of the same lava."""
    res = {(r["figure"], r["label"]): r for r in fc.evaluate()}
    r5 = res[("5", "1921")]
    assert r5["status"] == "discrepancy" and abs(r5["worst"]) > 2.0
    assert abs(res[("4C", "1921")]["worst"]) <= POINT_TOL
    eng12 = project(Composition(fc.composition("YT1962:12")),
                    "cmas_opx_M2S_C2S3_A2S3")["components"]
    assert max(abs(r5["read"][k] - eng12[k]) for k in r5["basis"]) < 0.2


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("PASS %s" % name)
            except AssertionError as exc:
                fails += 1
                print("FAIL %s: %s" % (name, exc))
    print("\n%s" % ("all checks passed" if not fails else "%d FAILED" % fails))
    sys.exit(1 if fails else 0)
