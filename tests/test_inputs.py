"""Regression tests for input validation, norm edge cases and numerics."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ohara.api import Composition, InputError, project, project_spec  # noqa
from ohara.components import cipw_norm, parse_oxides                  # noqa
from ohara.geometry import (ProjectionError, side_of_plane,            # noqa
                            solve_projection)
from ohara.spaces import cmas_vector                                  # noqa

BASALT = dict(SiO2=48.5, TiO2=2.2, Al2O3=13.0, Fe2O3=1.4, FeO=9.8, MnO=0.17,
              MgO=11.5, CaO=10.5, Na2O=2.1, K2O=0.4, P2O5=0.2)


def _raises(fn, *a, **k):
    try:
        fn(*a, **k)
    except (InputError, ProjectionError):
        return True
    return False


# ------------------------------------------------------------ validation --
def test_negative_oxide_rejected():
    assert _raises(Composition, dict(BASALT, MgO=-1))


def test_nan_and_infinite_rejected():
    for bad in (float("nan"), float("inf"), "abc", "1e999"):
        assert _raises(Composition, dict(BASALT, CaO=bad)), bad


def test_boolean_rejected():
    assert _raises(Composition, dict(BASALT, CaO=True))


def test_fe_ratio_must_be_between_0_and_1():
    for r in (-0.1, 1.1, float("nan"), "0.2"):
        assert _raises(Composition, BASALT, fe_ratio=r), r
    Composition(BASALT, fe_ratio=0.0)
    Composition(BASALT, fe_ratio=1.0)


def test_total_iron_cannot_be_mixed_with_split_iron():
    assert _raises(Composition, dict(BASALT, FeOT=10.0))


def test_empty_analysis_rejected():
    assert _raises(Composition, {})
    assert _raises(Composition, {"H2O": 5.0})


def test_implausible_total_warns_but_runs():
    c = Composition({k: v * 0.5 for k, v in BASALT.items()})
    assert any("anhydrous oxide total" in a for a in c.assumptions)
    ok = Composition(BASALT)
    assert not any("anhydrous oxide total" in a for a in ok.assumptions)


def test_blank_values_are_ignored():
    c = Composition(dict(BASALT, Cr2O3="", NiO=None))
    assert c.oxides["Cr2O3"] == 0


# --------------------------------------------------------------- the norm --
def test_phosphate_rich_input_never_gives_negative_minerals():
    """Reviewer's case: apatite used to exhaust CaO and make anorthite -15.7%."""
    ox, _ = parse_oxides(dict(SiO2=40, Al2O3=15, CaO=5, P2O5=10, MgO=10,
                              FeO=10, Na2O=2))
    norm, notes = cipw_norm(ox)
    assert all(v >= 0 for k, v in norm.items() if k != "_moles"), norm
    assert any("P2O5 exceeds" in n for n in notes)


def test_peralkaline_input_is_flagged_not_negative():
    ox, _ = parse_oxides(dict(SiO2=70, Al2O3=8, Na2O=8, K2O=5, FeO=5, CaO=1,
                              MgO=0.5))
    norm, notes = cipw_norm(ox)
    assert all(v >= 0 for k, v in norm.items() if k != "_moles")
    assert any("peralkaline" in n for n in notes)


def test_norm_conserves_mass():
    ox, _ = parse_oxides(BASALT)
    norm, _ = cipw_norm(ox)
    total = sum(v for k, v in norm.items() if k != "_moles")
    # apatite carries 1/3 CaF2 per P2O5 by convention, so allow for it
    assert abs(total - sum(BASALT.values())) < 0.05


def test_silica_deficient_cascade_frees_the_right_silica():
    """Nepheline-normative input: after the cascade, oxide SiO2 must equal the
    silica bound in the normative minerals (formula-unit bookkeeping)."""
    ox, _ = parse_oxides(dict(SiO2=40, Al2O3=12, Fe2O3=4, FeO=8, MgO=13,
                              CaO=13, Na2O=4, K2O=1.2, TiO2=2.5, P2O5=0.6))
    norm, _ = cipw_norm(ox)
    m = norm["_moles"]
    si_bound = (6 * m["or"] + 6 * m["ab"] + 2 * m["an"] + 2 * m["ne"]
                + 4 * m["lc"] + 2 * m["ks"] + m["wo"] + m["cs"]
                + 2 * m["di"] + m["hy"] + m["ol"] + m["qz"])
    assert abs(si_bound - 40 / 60.0843) < 1e-9


# ------------------------------------------------------------- numerics ----
def test_projection_is_invariant_to_scale_of_input():
    c1 = Composition(BASALT)
    c2 = Composition({k: v * 1e-4 for k, v in BASALT.items()})
    r1 = project(c1, "cmas_ol_CS_MS_A")["components"]
    r2 = project(c2, "cmas_ol_CS_MS_A")["components"]
    for k in r1:
        assert abs(r1[k] - r2[k]) < 1e-9


def test_side_of_plane_is_scale_free():
    P = [cmas_vector(k) for k in ("CMS2", "M2S", "CAS2")]
    x = cmas_vector("S") * 1e-9
    assert side_of_plane(x, P, cmas_vector("S"))[0] == 1
    assert side_of_plane(x * 1e12, P, cmas_vector("S"))[0] == 1


def test_coplanar_projection_refused():
    # enstatite lies in CS-MS-A
    assert _raises(solve_projection, cmas_vector("CAS2"), [cmas_vector("MS")],
                   [cmas_vector(k) for k in ("CS", "MS", "A")])


def test_near_coplanar_projection_warns():
    c = Composition(BASALT)
    nearly_ms = cmas_vector("MS") + 1e-5 * cmas_vector("M2S")
    spec = dict(space="cmas", points=["MS"], basis=["CS", "MS", "A"])
    # direct: build a spec whose point is almost in the plane
    from ohara import spaces
    spaces.CMAS_ENDMEMBERS["_nearMS"] = dict(
        f=tuple(nearly_ms / np.array([56.08, 40.31, 101.96, 60.09])),
        name="nearly enstatite")
    try:
        r = project_spec(c, dict(space="cmas", points=["_nearMS"],
                                 basis=["CS", "MS", "A"]))
        assert any("ill-conditioned" in w for w in r["warnings"])
    finally:
        del spaces.CMAS_ENDMEMBERS["_nearMS"]


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
