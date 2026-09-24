"""Compare the engine with points digitised from O'Hara (1968) Figs 4, 5, 9,
10 and 11.

data/ohara_1968_digitised.csv holds pixel positions (300-dpi renders of the
PDF pages) of printed tick marks and of plotted compositions: pure phases
(diopside, pyrope, forsterite, enstatite, anorthite), the synthetic
diopside-pyrope mixtures that O'Hara labels by weight per cent pyrope, and
natural rocks whose analyses are in this repository (Yoder & Tilley 1962
Table 2; Tilley, Yoder & Schairer 1963, 1964). Rows with status
"discrepancy" are documented disagreements in the original figure and are
reported but not scored. Each figure is calibrated by a
least-squares affine map fitted to its own tick marks only - nothing from
the engine enters the calibration - and every plotted point is converted to
O'Hara's coordinates and compared with the engine's projection of the exact
composition.

    python tools/figure_check.py          # table of residuals
"""
import csv
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ohara.api import Composition, project            # noqa: E402
from ohara.components import MW                        # noqa: E402
from ohara.spaces import PROJECTION_BY_ID              # noqa: E402

CSV = os.path.join(ROOT, "data", "ohara_1968_digitised.csv")

# exact end-member formulas as molar oxide amounts
FORMULA = {"diopside": {"CaO": 1, "MgO": 1, "SiO2": 2},
           "pyrope": {"MgO": 3, "Al2O3": 1, "SiO2": 3},
           "forsterite": {"MgO": 2, "SiO2": 1},
           "enstatite": {"MgO": 1, "SiO2": 1},
           "anorthite": {"CaO": 1, "Al2O3": 1, "SiO2": 2}}
OXIDE_COLS = ["SiO2", "TiO2", "Al2O3", "Cr2O3", "Fe2O3", "FeO", "MnO", "NiO",
              "MgO", "CaO", "Na2O", "K2O", "P2O5"]
ANALYSES = {"YT1962": ("data/yoder_tilley_1962_table2.csv", "no"),
            "TYS": ("data/tilley_yoder_1963_1964_analyses.csv", "ohara_label")}


def _analysis(ref):
    """'YT1962:14' or 'TYS:PB' -> oxide dict from the transcribed tables."""
    src, key = ref.split(":", 1)
    path, col = ANALYSES[src]
    with open(os.path.join(ROOT, path), newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r[col] == key:
                return {k: float(r[k]) for k in OXIDE_COLS if r.get(k)}
    raise KeyError(ref)


def oxides_wt(mineral):
    return {k: n * MW[k] for k, n in FORMULA[mineral].items()}


def composition(name):
    """A mineral name, 'Di<a>Py<b>' (mixture by weight), or a reference to a
    transcribed analysis ('YT1962:14', 'TYS:PB')."""
    if ":" in name:
        return _analysis(name)
    if name in FORMULA:
        ox = oxides_wt(name)
        tot = sum(ox.values())
        return {k: 100 * v / tot for k, v in ox.items()}
    di_w = float(name[2:name.index("Py")]) / 100.0
    py_w = float(name[name.index("Py") + 2:]) / 100.0
    out = {}
    for mineral, w in (("diopside", di_w), ("pyrope", py_w)):
        for k, v in composition(mineral).items():
            out[k] = out.get(k, 0.0) + w * v
    return out


def load():
    with open(CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    figs = {}
    for r in rows:
        figs.setdefault(r["figure"], []).append(r)
    return figs


def calibrate(ticks, basis):
    """Least-squares affine map from two barycentric coordinates to pixels.
    Returns (forward(c) -> px, inverse(px) -> full coordinates, rms_px,
    wt_per_px)."""
    names = [ticks[0]["c1"], ticks[0]["c2"]]
    A, X, Y = [], [], []
    for t in ticks:
        vals = {t["c1"]: float(t["v1"]), t["c2"]: float(t["v2"])}
        A.append([1.0, vals[names[0]], vals[names[1]]])
        X.append(float(t["x_px"]))
        Y.append(float(t["y_px"]))
    A = np.array(A)
    px, *_ = np.linalg.lstsq(A, np.array(X), rcond=None)
    py, *_ = np.linalg.lstsq(A, np.array(Y), rcond=None)
    res = np.hypot(A @ px - X, A @ py - Y)
    M = np.array([[px[1], px[2]], [py[1], py[2]]])
    Minv = np.linalg.inv(M)

    def inverse(x, y):
        c = Minv @ (np.array([x, y]) - np.array([px[0], py[0]]))
        out = {names[0]: c[0], names[1]: c[1]}
        third = [b for b in basis if b not in names][0]
        out[third] = 100.0 - c[0] - c[1]
        return out
    # pixels per 1 wt% (mean of the two axis scales)
    ppw = 0.5 * (np.hypot(px[1], py[1]) + np.hypot(px[2], py[2]))
    return inverse, float(np.sqrt(np.mean(res ** 2))), float(res.max()), ppw


def evaluate():
    results = []
    for fig, rows in load().items():
        spec = PROJECTION_BY_ID[rows[0]["projection"]]
        ticks = [r for r in rows if r["kind"] == "tick"]
        inverse, rms, worst, ppw = calibrate(ticks, spec["basis"])
        for r in rows:
            if r["kind"] != "point":
                continue
            read = inverse(float(r["x_px"]), float(r["y_px"]))
            comp = Composition(composition(r["composition"]), label=r["label"])
            eng = project(comp, spec["id"])["components"]
            diff = {k: read[k] - eng[k] for k in spec["basis"]}
            big = max(diff, key=lambda k: abs(diff[k]))
            # reading uncertainty of the point + calibration scatter, in wt%
            unc = (float(r["uncertainty_px"]) + rms) / ppw
            results.append(dict(figure=fig, label=r["label"],
                                status=r.get("status") or "validate",
                                natural=":" in r["composition"],
                                read=read, engine=eng, diff=diff,
                                worst_component=big, worst=diff[big],
                                uncertainty=unc, tick_rms_px=rms,
                                tick_max_px=worst, px_per_wt=ppw,
                                basis=spec["basis"]))
    return results


def main():
    res = evaluate()
    print("%-4s %-12s %-28s %-28s %8s %6s" % ("fig", "point", "read from figure (wt%)",
                                               "engine (wt%)", "max diff", "+-unc"))
    for r in res:
        fmt = lambda d: " ".join("%s %5.2f" % (k, d[k]) for k in r["basis"])
        print("%-4s %-12s %-32s %-32s %+8.2f %6.2f %s" % (
            r["figure"], r["label"], fmt(r["read"]), fmt(r["engine"]),
            r["worst"], r["uncertainty"],
            "" if r["status"] == "validate" else "(" + r["status"] + ")"))
    figs = sorted({r["figure"] for r in res})
    for f in figs:
        rr = [r for r in res if r["figure"] == f and r["status"] == "validate"]
        print("Fig %-3s calibration: tick RMS %.1f px (max %.1f) = %.2f wt%%; "
              "points: mean |diff| %.2f, max %.2f wt%%" % (
                  f, rr[0]["tick_rms_px"], rr[0]["tick_max_px"],
                  rr[0]["tick_rms_px"] / rr[0]["px_per_wt"],
                  np.mean([abs(r["worst"]) for r in rr]),
                  max(abs(r["worst"]) for r in rr)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
