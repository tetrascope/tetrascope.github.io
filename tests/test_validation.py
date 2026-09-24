"""Validation of the reduction and the projection algebra.

Every expected value here is an independent hand calculation from the
stoichiometry of the phase concerned, using the multipliers quoted by O'Hara
(1968, caption to Fig.4). Run with:  python -m pytest -q   (or python tests/test_validation.py)
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ohara.api import Composition, project, subspace          # noqa: E402
from ohara.components import MW, cmas, parse_oxides           # noqa: E402
from ohara.geometry import (normalised, solve_projection,       # noqa: E402
                            to_weight)
from ohara.spaces import cmas_vector                          # noqa: E402

MWC, MWM, MWA, MWS = 56.08, 40.31, 101.96, 60.09


def _ox(**kw):
    return parse_oxides(kw)[0]


def _cmas_mol(oxides):
    """CMAS components expressed back in molar units."""
    c = cmas(oxides)[0]
    return (c["C"] / MWC, c["M"] / MWM, c["A"] / MWA, c["S"] / MWS)


# --------------------------------------------------- the reduction itself ---
def test_forsterite_is_M2S():
    o = _ox(MgO=2 * MW["MgO"], SiO2=MW["SiO2"])
    assert np.allclose(_cmas_mol(o), (0, 2, 0, 1))


def test_fayalite_plots_as_forsterite():
    o = _ox(FeO=2 * MW["FeO"], SiO2=MW["SiO2"])
    assert np.allclose(_cmas_mol(o), (0, 2, 0, 1))


def test_albite_plots_as_anorthite_CAS2():
    # NaAlSi3O8 -> 0.5 Na2O + 0.5 Al2O3 + 3 SiO2
    o = _ox(Na2O=0.5 * MW["Na2O"], Al2O3=0.5 * MW["Al2O3"], SiO2=3 * MW["SiO2"])
    assert np.allclose(_cmas_mol(o), (1, 0, 1, 2))


def test_orthoclase_plots_as_anorthite_CAS2():
    o = _ox(K2O=0.5 * MW["K2O"], Al2O3=0.5 * MW["Al2O3"], SiO2=3 * MW["SiO2"])
    assert np.allclose(_cmas_mol(o), (1, 0, 1, 2))


def test_jadeite_plots_as_CaTschermak():
    o = _ox(Na2O=0.5 * MW["Na2O"], Al2O3=0.5 * MW["Al2O3"], SiO2=2 * MW["SiO2"])
    assert np.allclose(_cmas_mol(o), (1, 0, 1, 1))


def test_aegirine_plots_as_CaTschermak():
    o = _ox(Na2O=0.5 * MW["Na2O"], Fe2O3=0.5 * MW["Fe2O3"], SiO2=2 * MW["SiO2"])
    assert np.allclose(_cmas_mol(o), (1, 0, 1, 1))


def test_ulvospinel_plots_as_spinel_MA():
    o = _ox(FeO=2 * MW["FeO"], TiO2=MW["TiO2"])
    assert np.allclose(_cmas_mol(o), (0, 1, 1, 0))


def test_magnetite_plots_as_spinel_MA():
    o = _ox(FeO=MW["FeO"], Fe2O3=MW["Fe2O3"])
    assert np.allclose(_cmas_mol(o), (0, 1, 1, 0))


def test_apatite_ca_is_removed():
    o = _ox(CaO=10.0 / 3.0 * MW["CaO"], P2O5=MW["P2O5"])
    assert abs(_cmas_mol(o)[0]) < 1e-10


def test_almandine_plots_on_pyrope_grossular_join():
    # Fe3Al2Si3O12 -> must land exactly on M3AS3 (pyrope)
    o = _ox(FeO=3 * MW["FeO"], Al2O3=MW["Al2O3"], SiO2=3 * MW["SiO2"])
    assert np.allclose(_cmas_mol(o), (0, 3, 1, 3))


# ------------------------------------------------- projection arithmetic ----
def _project_endmember(key, points, basis, weight=True):
    """Weight-per-cent projected coordinates of a named CMAS endmember."""
    B = [cmas_vector(v) for v in basis]
    a, b = solve_projection(cmas_vector(key), [cmas_vector(p) for p in points], B)
    return a, normalised(to_weight(b, B) if weight else b), b


def test_diopside_from_olivine_into_CS_MS_A():
    # CMS2 = CS + MS exactly -> no olivine involved, A = 0
    a, b, _ = _project_endmember("CMS2", ["M2S"], ["CS", "MS", "A"])
    exp = np.array([MWC + MWS, MWM + MWS, 0.0])
    assert abs(a[0]) < 1e-9
    assert np.allclose(b, 100 * exp / exp.sum())
    assert abs(b[0] - 53.64) < 0.01


def test_anorthite_from_olivine_into_CS_MS_A():
    # CAS2 + M2S = CS + 2 MS + A  (hand balance)
    a, b, _ = _project_endmember("CAS2", ["M2S"], ["CS", "MS", "A"])
    exp = np.array([MWC + MWS, 2 * (MWM + MWS), MWA])
    assert np.allclose(b, 100 * exp / exp.sum(), atol=1e-6)
    assert abs(a[0] + 1.0) < 1e-9          # one olivine must be added


def test_pyrope_from_olivine_into_CS_MS_A():
    # M3AS3 = 3 MS + A, olivine coefficient zero
    a, b, _ = _project_endmember("M3AS3", ["M2S"], ["CS", "MS", "A"])
    exp = np.array([0.0, 3 * (MWM + MWS), MWA])
    assert abs(a[0]) < 1e-9
    assert np.allclose(b, 100 * exp / exp.sum(), atol=1e-6)


def test_enstatite_is_the_MS_apex():
    a, b, _ = _project_endmember("MS", ["M2S"], ["CS", "MS", "A"])
    assert np.allclose(b, [0, 100, 0], atol=1e-6)


def test_spinel_projects_far_outside_the_triangle():
    # MA = M2S - MS + A: one formula unit of MS must be subtracted, so spinel
    # plots off the diagram on the far side of the MS apex.
    a, b, units = _project_endmember("MA", ["M2S"], ["CS", "MS", "A"])
    assert abs(units[1] + 1.0) < 1e-9 and abs(units[2] - 1.0) < 1e-9
    assert b[1] < 0 and abs(b[1]) > 100


def test_diopside_and_pyrope_from_enstatite_lie_on_the_diagram_edges():
    """Hand balance: CMS2 = 0.5 M2S + 0.5 C2S3 and M3AS3 = 1.5 M2S + 0.5 A2S3,
    both with a zero enstatite coefficient - diopside plots on the M2S-C2S3
    edge and pyrope on the M2S-A2S3 edge of O'Hara's Fig.5/Fig.10 triangle."""
    a, b, u = _project_endmember("CMS2", ["MS"], ["M2S", "C2S3", "A2S3"])
    assert abs(a[0]) < 1e-9 and np.allclose(u, [0.5, 0.5, 0.0])
    a, b, u = _project_endmember("M3AS3", ["MS"], ["M2S", "C2S3", "A2S3"])
    assert abs(a[0]) < 1e-9 and np.allclose(u, [1.5, 0.0, 0.5])


def test_CS_MS_A_plane_is_seen_edge_on_from_enstatite():
    """O'Hara Fig.10: because enstatite lies in the plane CS-MS-A, everything
    in that plane projects onto a single straight line - which is why the
    diopside-pyrope and clinopyroxene-garnet joins plot on top of each other."""
    from ohara.geometry import ternary_xy
    pts = []
    for mix in ((1, 0, 0), (0, 0, 1), (0.5, 0.0, 0.5), (0.3, 0.2, 0.5)):
        v = sum(m * cmas_vector(k) for m, k in zip(mix, ("CS", "MS", "A")))
        B = [cmas_vector(k) for k in ("M2S", "C2S3", "A2S3")]
        _, b = solve_projection(v, [cmas_vector("MS")], B)
        pts.append(ternary_xy(normalised(to_weight(b, B))))
    (x0, y0), (x1, y1) = pts[0], pts[1]
    for x, y in pts[2:]:
        area = abs((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0))
        assert area < 1e-9, (x, y, area)


def test_weight_positions_from_enstatite():
    """Hand calculation: M2S weighs 140.71, C2S3 292.43, A2S3 384.19 units."""
    _, b, _ = _project_endmember("CMS2", ["MS"], ["M2S", "C2S3", "A2S3"])
    assert abs(b[0] - 32.49) < 0.01 and abs(b[1] - 67.51) < 0.01
    _, b, _ = _project_endmember("M3AS3", ["MS"], ["M2S", "C2S3", "A2S3"])
    assert abs(b[0] - 52.35) < 0.01 and abs(b[2] - 47.65) < 0.01


def test_forsterite_is_the_M2S_apex_from_enstatite():
    a, b, _ = _project_endmember("M2S", ["MS"], ["M2S", "C2S3", "A2S3"])
    assert np.allclose(b, [100, 0, 0], atol=1e-6)


def test_projection_is_scale_invariant():
    x = cmas_vector("CAS2")
    _, b1 = solve_projection(x, [cmas_vector("M2S")],
                             [cmas_vector(k) for k in ("CS", "MS", "A")])
    _, b2 = solve_projection(3.7 * x, [cmas_vector("M2S")],
                             [cmas_vector(k) for k in ("CS", "MS", "A")])
    assert np.allclose(normalised(b1), normalised(b2))


# --------------------------------------------------------- classification ---
TH_QZ = dict(SiO2=52.5, TiO2=1.4, Al2O3=14.0, Fe2O3=1.3, FeO=9.5, MgO=6.3,
             CaO=10.0, Na2O=2.4, K2O=0.5, P2O5=0.2)
OL_THOL = dict(SiO2=48.5, TiO2=2.2, Al2O3=13.0, Fe2O3=1.4, FeO=9.8, MgO=11.5,
               CaO=10.5, Na2O=2.1, K2O=0.4, P2O5=0.2)
ALKALI = dict(SiO2=47.5, TiO2=2.5, Al2O3=15.5, Fe2O3=3.2, FeO=8.0, MnO=0.17,
              MgO=6.8, CaO=9.4, Na2O=3.5, K2O=1.3, P2O5=0.5)


def test_group_quartz_tholeiite():
    c = Composition(TH_QZ)
    assert c.yt_group.startswith("1.")
    assert "oversaturated" in subspace(c, "cmas")


def test_group_olivine_tholeiite():
    c = Composition(OL_THOL)
    assert c.yt_group.startswith("3.")


def test_group_alkali_basalt():
    c = Composition(ALKALI)
    assert "alkali basalt" in c.yt_group
    assert "undersaturated" in subspace(c, "cmas")


def test_norm_sums_to_the_analysis():
    c = Composition(OL_THOL)
    assert abs(sum(c.norm_wt().values()) - sum(OL_THOL.values())) < 0.6


def test_every_projection_runs_for_a_real_basalt():
    from ohara.api import available_projections
    c = Composition(OL_THOL)
    recs = available_projections(c)
    assert recs and all(r["valid"] for r in recs)


def test_ternary_coordinates_sum_to_100():
    c = Composition(OL_THOL)
    r = project(c, "cmas_ol_CS_MS_A")
    assert abs(sum(r["components"].values()) - 100.0) < 1e-9


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(list(globals().items())):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("PASS %s" % name)
            except AssertionError as exc:
                fails += 1
                print("FAIL %s: %s" % (name, exc))
    print("\n%s" % ("all checks passed" if not fails else "%d FAILED" % fails))
    sys.exit(1 if fails else 0)
