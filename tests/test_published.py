"""Validation against published data: Yoder & Tilley (1962), Table 2.

data/yoder_tilley_1962_table2.csv was transcribed from the rendered pages of
the paper (pp. 361-362). Every analysis and every norm reproduces its printed
total (checked below), so transcription errors would be caught.

What is compared:
  1. the CIPW norm computed here against the printed norm, mineral by mineral;
  2. the Yoder & Tilley normative group (which of Qz, Hy, Ol, Ne are present),
     which fixes the subvolume of the basalt tetrahedron.

Known, documented differences:
  * analyses 10-13: the printed magnetite and ilmenite values are transposed
    (e.g. no. 10 prints Mt 5.78, Il 2.55, but Fe2O3 = 1.72 wt% can make at
    most 2.49 wt% magnetite, while TiO2 = 3.02 wt% makes 5.74 wt% ilmenite).
    Mt and Il are therefore compared crosswise for those four analyses.
  * residual differences of up to 1.39 wt% (analysis 15) remain in the
    Di-Hy-Ol split of a few analyses and are not removed by rounding
    molecular proportions as in 1962, so they are attributed to the hand
    calculation. The tolerances below are stated explicitly.
  * analyses 16 and 22 lie on the critical plane of silica undersaturation:
    the deciding normative mineral is below 1 wt% in both norms, so the
    group can flip either way; they are tested as "borderline".
"""
import csv
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ohara.api import Composition                               # noqa: E402
from ohara.components import cipw_norm, parse_oxides            # noqa: E402

CSV = os.path.join(ROOT, "data", "yoder_tilley_1962_table2.csv")
OXIDES = ["SiO2", "Al2O3", "Fe2O3", "FeO", "MnO", "MgO", "CaO", "Na2O",
          "K2O", "P2O5", "TiO2", "Cr2O3", "NiO"]
ALL_OXIDE_COLS = OXIDES[:9] + ["H2O+", "H2O-"] + OXIDES[9:11] + [
    "Cr2O3", "SrO", "NiO", "CO2", "SO3"]
NORM_COLS = {"n_Qz": "quartz", "n_Or": "orthoclase", "n_Ab": "albite",
             "n_Ne": "nepheline", "n_An": "anorthite", "n_Di": "diopside",
             "n_Hy": "hypersthene", "n_Ol": "olivine", "n_Mt": "magnetite",
             "n_Il": "ilmenite", "n_Ap": "apatite", "n_Cs": "larnite",
             "n_Ks": "kalsilite"}
PROV_CSV = os.path.join(ROOT, "data", "yoder_tilley_1962_table2.provenance.csv")
PROV_JSON = os.path.join(ROOT, "data", "yoder_tilley_1962_table2.provenance.json")
with open(PROV_JSON, encoding="utf-8") as _fh:
    PROVENANCE = json.load(_fh)
# the documented Mt/Il transposition is read from the provenance record
MT_IL_TRANSPOSED = set(next(c["analyses"] for c in PROVENANCE["corrections"]
                            if c["columns"] == ["n_Mt", "n_Il"]))
BORDERLINE = {"16", "22"}
TOL_FELSIC = 0.8      # Qz Or Ab Ne An, Ap, Cs, Ks
TOL_MAFIC = 1.8       # Di Hy Ol - hand-rounding of the Mg-Fe split
TOL_OXIDE = 0.4       # Mt Il


def _f(v):
    return float(v) if v not in ("", None) else 0.0


def rows():
    with open(CSV, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _norm(row):
    ox, _ = parse_oxides({k: _f(row[k]) for k in OXIDES})
    return cipw_norm(ox)[0]


def test_transcription_reproduces_printed_totals():
    norm_cols = list(NORM_COLS) + ["n_Ct", "n_Rest"]
    for r in rows():
        s_ox = sum(_f(r[k]) for k in ALL_OXIDE_COLS)
        s_nm = sum(_f(r[k]) for k in norm_cols)
        assert abs(s_ox - _f(r["total"])) <= 0.015, (r["no"], s_ox)
        assert abs(s_nm - _f(r["n_total"])) <= 0.015, (r["no"], s_nm)


def test_every_transcribed_value_has_provenance():
    with open(PROV_CSV, newline="", encoding="utf-8") as fh:
        prov = {(p["no"], p["column"]): p for p in csv.DictReader(fh)}
    pages = PROVENANCE["source"]["pages"]
    first_page = {"361": set("1 2 3 4 5 6 7 7a 8 9 10 11".split())}
    for r in rows():
        for col in ALL_OXIDE_COLS + ["total"] + list(NORM_COLS) + [
                "n_Ct", "n_Rest", "n_total"]:
            p = prov.get((r["no"], col))
            assert p, ("no provenance", r["no"], col)
            assert p["value"] == r[col], (r["no"], col, p["value"], r[col])
            assert str(p["page"]) in pages
            assert (str(p["page"]) == "361") == (r["no"] in first_page["361"])
            tok = p["printed"]
            if tok in ("nil", "tr."):
                assert r[col] == "0"
            elif tok in ("n.d.", "—"):
                assert r[col] == ""
            else:
                assert tok.split(" ")[0].replace("·", ".") == r[col], (
                    r["no"], col, tok)
            if r["no"] in MT_IL_TRANSPOSED and col in ("n_Mt", "n_Il"):
                assert "transposed" in p["note"]


TYS_CSV = os.path.join(ROOT, "data", "tilley_yoder_1963_1964_analyses.csv")
TYS_OX = ["SiO2", "Al2O3", "Fe2O3", "FeO", "MnO", "MgO", "CaO", "Na2O", "K2O",
          "H2O+", "H2O-", "TiO2", "P2O5", "Cr2O3", "S", "F"]
TYS_NORM = {"n_Qz": "quartz", "n_Or": "orthoclase", "n_Ab": "albite",
            "n_Ne": "nepheline", "n_An": "anorthite", "n_Di": "diopside",
            "n_Hy": "hypersthene", "n_Ol": "olivine", "n_Il": "ilmenite",
            "n_Mt": "magnetite", "n_Ap": "apatite"}


def _tys_rows():
    with open(TYS_CSV, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def test_tilley_yoder_schairer_transcription_and_norms():
    """Year Book 62 Table 3 and Year Book 63 Table 1: every transcribed
    analysis and norm reproduces its printed total, and this engine's CIPW
    norm matches the printed norm (MK's printed Mt includes chromite)."""
    fails = []
    for r in _tys_rows():
        so = sum(_f(r[k]) for k in TYS_OX)
        sn = sum(_f(r[k]) for k in list(TYS_NORM) + ["n_Rest"])
        assert abs(so - _f(r["total"])) <= 0.015, (r["ohara_label"], so)
        assert abs(sn - _f(r["n_total"])) <= 0.015, (r["ohara_label"], sn)
        ox, _ = parse_oxides({k: _f(r[k]) for k in OXIDES if k in r})
        n = cipw_norm(ox)[0]
        for col, key in TYS_NORM.items():
            mine = n.get(key, 0.0)
            if r["ohara_label"] == "MK" and col == "n_Mt":
                mine += n.get("chromite", 0.0)
            tol = TOL_MAFIC if col in ("n_Di", "n_Hy", "n_Ol") else TOL_FELSIC
            if abs(mine - _f(r[col])) > tol:
                fails.append("%s %s: %.2f vs %.2f" % (r["ohara_label"], col,
                                                      mine, _f(r[col])))
    assert not fails, fails


def test_tilley_yoder_schairer_provenance():
    path = os.path.join(ROOT, "data",
                        "tilley_yoder_1963_1964_analyses.provenance.csv")
    with open(path, newline="", encoding="utf-8") as fh:
        prov = {(p["ohara_label"], p["column"]): p for p in csv.DictReader(fh)}
    for r in _tys_rows():
        for col in TYS_OX + ["total"] + list(TYS_NORM) + ["n_Rest", "n_total"]:
            p = prov[(r["ohara_label"], col)]
            assert p["value"] == r[col], (r["ohara_label"], col)
            if p["printed"] == "Nil":
                assert r[col] == "0"
            elif p["printed"] in ("n.d.", "...", "---", "n.d.*"):
                assert r[col] == ""
            else:
                assert p["printed"].rstrip("*\u2020") == r[col], (r["ohara_label"], col)


def test_norm_matches_published_norm():
    fails = []
    for r in rows():
        n = _norm(r)
        mine = {col: n.get(key, 0.0) for col, key in NORM_COLS.items()}
        if r["no"] in MT_IL_TRANSPOSED:
            mine["n_Mt"], mine["n_Il"] = mine["n_Il"], mine["n_Mt"]
        for col in NORM_COLS:
            tol = (TOL_MAFIC if col in ("n_Di", "n_Hy", "n_Ol") else
                   TOL_OXIDE if col in ("n_Mt", "n_Il") else TOL_FELSIC)
            d = mine[col] - _f(r[col])
            if abs(d) > tol:
                fails.append("%s %s: computed %.2f, published %.2f"
                             % (r["no"], col[2:], mine[col], _f(r[col])))
    assert not fails, "\n".join(fails)


def _signature(q, hy, ol, ne):
    return "".join(c for c, v in zip("QHON", (q, hy, ol, ne)) if v > 0.005)


def test_normative_group_matches_published():
    for r in rows():
        n = _norm(r)
        pub = _signature(_f(r["n_Qz"]), _f(r["n_Hy"]), _f(r["n_Ol"]),
                         _f(r["n_Ne"]))
        me = _signature(n.get("quartz", 0), n.get("hypersthene", 0),
                        n.get("olivine", 0), n.get("nepheline", 0))
        if r["no"] in BORDERLINE:
            # both norms must agree that the deciding mineral is < 1 wt%
            for key, col in (("quartz", "n_Qz"), ("hypersthene", "n_Hy"),
                             ("nepheline", "n_Ne")):
                a, b = n.get(key, 0.0), _f(r[col])
                if (a > 0) != (b > 0):
                    assert max(a, b) < 1.0, (r["no"], key, a, b)
            continue
        assert pub == me, (r["no"], pub, me)


def test_rocks_studied_experimentally_are_classified():
    """The asterisked (experimentally studied) rocks span groups 1, 3 and 5
    between them - a smoke test of the whole pipeline on real analyses."""
    groups = set()
    for r in rows():
        if r["investigated"] == "yes":
            c = Composition({k: _f(r[k]) for k in OXIDES}, label=r["no"])
            groups.add(c.yt_group.split(".")[0])
    assert {"1", "3", "5"} <= groups, groups


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("PASS %s" % name)
            except AssertionError as exc:
                fails += 1
                print("FAIL %s:\n%s" % (name, exc))
    print("\n%s" % ("all checks passed" if not fails else "%d FAILED" % fails))
    sys.exit(1 if fails else 0)
