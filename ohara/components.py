"""Oxide input handling, O'Hara (1968) CMAS reduction, and CIPW norm.

The CMAS reduction follows the caption to Fig.4 of O'Hara (1968, Earth-Sci.
Rev., 4, 69-133):

    C = (CaO - 10/3 P2O5 + 2 Na2O + 2 K2O) x 56.08
    M = (MgO + FeO + MnO + NiO - TiO2)     x 40.31
    A = (Al2O3 + Cr2O3 + Fe2O3 + Na2O + K2O + TiO2) x 101.96
    S = (SiO2 - 2 Na2O - 2 K2O)            x 60.09

all terms being molecular proportions; the multipliers convert back to the
weight of the equivalent simple-system oxide.

Consequences stated by O'Hara (checked in tests/test_validation.py): albite
and orthoclase plot as the equivalent weight of anorthite, jadeite and
aegirine as Ca-Tschermak's molecule, Fe-Ti-Cr oxides as spinel, all olivines
as forsterite, all garnets on the grossular-pyrope join.

Every constant comes from ohara/data/definitions.json, which the browser engine
also uses.
"""
from __future__ import annotations

import math
import re

from .defs import DEFS

MW = dict(DEFS["molar_mass"])
OXIDES = list(MW)
_EXTRA_MW = dict(DEFS["extra_molar_mass"])
_MULT = DEFS["ohara_multipliers"]
MW_C, MW_M, MW_A, MW_S = _MULT["C"], _MULT["M"], _MULT["A"], _MULT["S"]
ALIASES = dict(DEFS["aliases"])
IGNORED = {c.lower(): c for c in DEFS["ignored_components"]}
TOTAL_MIN = DEFS["validation"]["total_min"]
TOTAL_MAX = DEFS["validation"]["total_max"]
VOLATILES = ("H2O", "CO2")


def _recipe_mw(recipe):
    return sum(n * (MW.get(ox) or _EXTRA_MW[ox]) for ox, n in recipe.items())


NORM_MW = {k: _recipe_mw(v) for k, v in DEFS["norm_recipes"].items()
           if not k.startswith("_")}


class InputError(ValueError):
    """The analysis cannot be used; the message says why."""


# ------------------------------------------------------------------- input --
# the one number syntax accepted for text input, in both engines
_NUMBER_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


def _to_number(key, val):
    if isinstance(val, bool):
        raise InputError("'%s' is not a number" % key)
    if isinstance(val, str):
        if not _NUMBER_RE.match(val.strip()):
            raise InputError("'%s' is not a number (got %r)" % (key, val))
        val = val.strip()
    try:
        v = float(val)
    except (TypeError, ValueError):
        raise InputError("'%s' is not a number (got %r)" % (key, val))
    if not math.isfinite(v):
        raise InputError("'%s' is not a finite number (got %r)" % (key, val))
    if v < 0:
        raise InputError("'%s' is negative (%g); oxide contents cannot be "
                         "negative" % (key, v))
    return v


def _normkey(key):
    return str(key).strip().lower().replace(" ", "")


def suggest(key):
    """Deterministic spelling hint (same rule in ohara.js): compare after
    lower-casing and reading the digit 0 as the letter O."""
    probe = _normkey(key).replace("0", "o")
    for alias, canon in sorted(ALIASES.items()):
        if alias.replace("0", "o") == probe:
            return canon
    return None


def unknown_columns(keys):
    """[(column, hint)] for every key that is neither an oxide/alias nor a
    known-but-unused component - the columns parse_oxides would reject."""
    bad = []
    for key in keys:
        nk = _normkey(key)
        k = ALIASES.get(nk, str(key).strip())
        if k in MW or k in ("FeO*", "Fe2O3*") or nk in IGNORED:
            continue
        bad.append((key, suggest(key)))
    return bad


def parse_oxides(raw, fe_ratio=0.15, lenient=False):
    """Validate and normalise an oxide dict to the internal oxide set.

    Rules (identical in app/ohara.js):
      * blank / None values are ignored;
      * every key must be a recognised oxide (or alias). Keys for components
        the model does not use (SrO, BaO, SO3, ...) are accepted, excluded and
        reported. Any other key is an error - a typo such as 'Si02' would
        otherwise silently drop an oxide - unless lenient=True, when it is
        ignored and reported;
      * every other value must be a finite, non-negative number;
      * `fe_ratio` (atomic Fe3+/total Fe, used only for total-iron input)
        must be a finite number between 0 and 1;
      * total iron (FeO*, FeOT, Fe2O3T) may not be combined with FeO or
        Fe2O3 in the same analysis;
      * an empty analysis is rejected; an anhydrous total outside
        TOTAL_MIN..TOTAL_MAX wt% is accepted with a warning.

    Returns (oxides, notes). Raises InputError.
    """
    if not isinstance(fe_ratio, (int, float)) or isinstance(fe_ratio, bool) \
            or not math.isfinite(fe_ratio) or not 0.0 <= fe_ratio <= 1.0:
        raise InputError("Fe3+/total Fe ratio must be a number between 0 "
                         "and 1 (got %r)" % (fe_ratio,))
    notes = []
    ox = {k: 0.0 for k in OXIDES}
    fe_total = None
    split_iron = False
    for key, val in raw.items():
        if val is None or (isinstance(val, str) and val.strip() == ""):
            continue
        nk = _normkey(key)
        k = ALIASES.get(nk, str(key).strip())
        if k not in ox and k not in ("FeO*", "Fe2O3*"):
            if nk in IGNORED:
                _to_number(key, val)
                notes.append("%s is not used by this model and was excluded"
                             % IGNORED[nk])
                continue
            hint = suggest(key)
            if not lenient:
                raise InputError("unrecognised column '%s'%s" % (
                    key, (" - did you mean %s?" % hint) if hint else
                    " - not an oxide this program knows"))
            notes.append("WARNING: ignored unrecognised column '%s'%s" % (
                key, (" (did you mean %s?)" % hint) if hint else ""))
            continue
        v = _to_number(key, val)
        if k in ("FeO*", "Fe2O3*"):
            if fe_total is not None:
                raise InputError("total iron was given twice")
            fe_total = (k, v)
            continue
        if k in ("FeO", "Fe2O3") and v > 0:
            split_iron = True
        ox[k] += v

    if fe_total is not None:
        if split_iron:
            raise InputError("give either total iron (FeO*/FeOT/Fe2O3T) or "
                             "FeO and Fe2O3, not both")
        kind, v = fe_total
        feo_tot = v if kind == "FeO*" else v * (2 * MW["FeO"]) / MW["Fe2O3"]
        n_tot = feo_tot / MW["FeO"]
        n_fe3 = n_tot * fe_ratio
        ox["Fe2O3"] += n_fe3 / 2.0 * MW["Fe2O3"]
        ox["FeO"] += (n_tot - n_fe3) * MW["FeO"]
        notes.append("total iron split with atomic Fe3+/total Fe = %.3f; "
                     "affects A (via Fe2O3) and M (via FeO)" % fe_ratio)

    anhydrous = sum(v for k, v in ox.items() if k not in VOLATILES)
    if anhydrous <= 0:
        raise InputError("the analysis contains no non-volatile oxides")
    if not TOTAL_MIN <= anhydrous <= TOTAL_MAX:
        # round half-up after removing float noise, identically in ohara.js
        shown = math.floor(round(anhydrous * 1e6) / 1e4 + 0.5) / 100
        notes.append("WARNING: anhydrous oxide total is %.2f wt%%, outside "
                     "%.0f-%.0f; check the analysis (all calculations are "
                     "ratio-based and will still run)"
                     % (shown, TOTAL_MIN, TOTAL_MAX))
    return ox, notes


def mol_props(ox):
    return {k: ox.get(k, 0.0) / MW[k] for k in OXIDES}


# -------------------------------------------------------------------- CMAS --
def cmas(ox):
    """O'Hara (1968) four-component reduction. Returns (dict C,M,A,S, notes)."""
    n = mol_props(ox)
    notes = []
    C = (n["CaO"] - 10.0 / 3.0 * n["P2O5"] + 2 * n["Na2O"] + 2 * n["K2O"]) * MW_C
    M = (n["MgO"] + n["FeO"] + n["MnO"] + n["NiO"] - n["TiO2"]) * MW_M
    A = (n["Al2O3"] + n["Cr2O3"] + n["Fe2O3"] + n["Na2O"] + n["K2O"]
         + n["TiO2"]) * MW_A
    S = (n["SiO2"] - 2 * n["Na2O"] - 2 * n["K2O"]) * MW_S

    if n["P2O5"] > 0:
        notes.append("apatite removed: CaO reduced by 10/3 x P2O5")
    if n["Na2O"] + n["K2O"] > 0:
        notes.append("albite and orthoclase recast as the equivalent weight of "
                     "anorthite (CAS2); jadeite/aegirine recast as CaTs (CAS)")
    if n["TiO2"] > 0:
        notes.append("TiO2 recast with the spinel component: M reduced and A "
                     "increased by mol TiO2")
    if n["Fe2O3"] + n["Cr2O3"] > 0:
        notes.append("magnetite and chromite recast as spinel (Fe2O3, Cr2O3 -> A)")
    if n["FeO"] + n["MnO"] + n["NiO"] > 0:
        notes.append("FeO, MnO and NiO treated as MgO; all olivines plot as "
                     "forsterite (M2S)")
    for name, v in (("C", C), ("M", M), ("A", A), ("S", S)):
        if v < 0:
            notes.append("WARNING: component %s is negative (%.3f) - the "
                         "composition lies outside the range for which this "
                         "reduction is defined" % (name, v))
    return {"C": C, "M": M, "A": A, "S": S}, notes


def cmas_wt_percent(comp):
    tot = sum(comp.values())
    scale = sum(abs(v) for v in comp.values())
    if scale == 0 or abs(tot) < 1e-12 * scale:
        raise InputError("the CMAS components sum to zero")
    return {k: 100.0 * v / tot for k, v in comp.items()}


# --------------------------------------------------------------- CIPW norm --
def cipw_norm(ox, mol_round=None):
    """Classic weight CIPW norm, anhydrous basis.

    Allocation order (Cross, Iddings, Pirsson & Washington; as used by
    Yoder & Tilley 1962): apatite, chromite, ilmenite, magnetite, hematite,
    orthoclase, albite, anorthite, corundum, diopside, wollastonite,
    hypersthene, quartz; a silica deficiency is then removed in the order
    Hy->Ol, Ab->Ne, Or->Lc, Lc->Ks, Wo->Cs, Di->Cs+Ol. (Putting Lc->Ks before
    the larnite steps is the order that reproduces Yoder & Tilley's printed
    norm for their olivine nephelinite, analysis 24.)

    Amounts are carried as formula units of the recipes in
    ohara/data/definitions.json (e.g. one albite unit = Na2O.Al2O3.6SiO2), so the
    silica released by each conversion is: Hy->Ol 1 per Ol, Ab->Ne 4, Or->Lc
    2, Wo->Cs 1 per Cs, Di->Cs+Ol 2 per Cs, Lc->Ks 2.

    By default molecular proportions are not rounded. Hand-calculated norms
    of the period (including Yoder & Tilley's Table 2) rounded them to 3
    decimals; pass mol_round=3 to reproduce such a norm exactly.

    Returns (norm dict in wt%, notes); norm['_moles'] holds the formula-unit
    amounts used by the tetrahedron recast.
    """
    notes = []
    n = dict(mol_props(ox))
    if mol_round is not None:
        n = {k: round(v, mol_round) for k, v in n.items()}

    # apatite - 10/3 CaO per P2O5 (traditional CIPW, F balancing as CaF2)
    ap = n["P2O5"]
    ca_need = 10.0 / 3.0 * ap
    if ca_need > n["CaO"]:
        ap = n["CaO"] * 3.0 / 10.0
        notes.append("WARNING: P2O5 exceeds what the CaO can take up as "
                     "apatite; %.4f mol P2O5 left unallocated (outside the "
                     "scope of the CIPW norm)" % (n["P2O5"] - ap))
        ca_need = n["CaO"]
    n["CaO"] = max(n["CaO"] - ca_need, 0.0)
    if ap:
        notes.append("apatite taken from P2O5, CaO reduced by 10/3 P2O5")

    cm = min(n["Cr2O3"], n["FeO"])
    n["Cr2O3"] -= cm
    n["FeO"] -= cm
    if n["Cr2O3"] > 1e-12:
        notes.append("Cr2O3 in excess of FeO left unallocated")

    il = min(n["TiO2"], n["FeO"])
    n["TiO2"] -= il
    n["FeO"] -= il
    ru = n["TiO2"]
    if ru > 1e-12:
        notes.append("TiO2 in excess of FeO (%.4f mol) left as rutile and "
                     "excluded from the silicate norm" % ru)

    mt = min(n["Fe2O3"], n["FeO"])
    n["Fe2O3"] -= mt
    n["FeO"] -= mt
    hm = n["Fe2O3"]

    mg = n["MgO"]
    fe = n["FeO"] + n["MnO"] + n["NiO"]
    if n["MnO"] + n["NiO"] > 0:
        notes.append("MnO and NiO pooled with FeO")
    pool = mg + fe
    xmg = mg / pool if pool > 0 else 1.0

    or_ = min(n["K2O"], n["Al2O3"])
    if n["K2O"] - or_ > 1e-12:
        notes.append("WARNING: K2O exceeds Al2O3 (peralkaline); excess K2O not "
                     "allocated - outside the scope of this norm")
    al = n["Al2O3"] - or_
    ab = min(n["Na2O"], al)
    if n["Na2O"] - ab > 1e-12:
        notes.append("WARNING: Na2O exceeds the Al2O3 left after orthoclase "
                     "(peralkaline); acmite and sodium metasilicate are not "
                     "computed - excess Na2O not allocated")
    al -= ab
    an = min(al, n["CaO"])
    al -= an
    ca = n["CaO"] - an
    co = al

    di = min(ca, pool)
    ca -= di
    wo = ca
    hy = pool - di

    si = n["SiO2"] - 6 * or_ - 6 * ab - 2 * an - 2 * di - wo - hy
    ne = lc = ks = cs = ol = 0.0
    if si < 0:
        d = -si
        x = min(d, hy / 2.0)
        ol += x; hy -= 2 * x; d -= x
        if d > 1e-12:
            x = min(d / 4.0, ab)
            ne += x; ab -= x; d -= 4 * x
            notes.append("silica deficiency: albite converted to nepheline")
        if d > 1e-12:
            x = min(d / 2.0, or_)
            lc += x; or_ -= x; d -= 2 * x
            notes.append("silica deficiency: orthoclase converted to leucite")
        if d > 1e-12:
            x = min(d / 2.0, lc)
            ks += x; lc -= x; d -= 2 * x
            if x:
                notes.append("silica deficiency: leucite converted to "
                             "kalsilite (Ks)")
        if d > 1e-12:
            x = min(d, wo / 2.0)
            cs += x; wo -= 2 * x; d -= x
            if x:
                notes.append("silica deficiency: wollastonite converted to "
                             "larnite (Cs)")
        if d > 1e-12:
            x = min(d / 2.0, di / 2.0)
            cs += x; ol += x; di -= 2 * x; d -= 2 * x
            if x:
                notes.append("silica deficiency: diopside converted to larnite "
                             "(Cs) + olivine")
        if d > 1e-9:
            notes.append("WARNING: a silica deficiency of %.4f mol remains "
                         "after every CIPW conversion - outside the scope of "
                         "the norm" % d)
        si = 0.0
    qz = si
    if wo > 1e-12:
        notes.append("CaO in excess of the mafic oxides carried as "
                     "wollastonite")

    W = NORM_MW
    norm = {
        "apatite": ap * W["apatite"], "chromite": cm * W["chromite"],
        "ilmenite": il * W["ilmenite"], "magnetite": mt * W["magnetite"],
        "hematite": hm * W["hematite"], "rutile": ru * W["rutile"],
        "quartz": qz * W["quartz"], "orthoclase": or_ * W["orthoclase"],
        "albite": ab * W["albite"], "anorthite": an * W["anorthite"],
        "nepheline": ne * W["nepheline"], "leucite": lc * W["leucite"],
        "kalsilite": ks * W["kalsilite"], "corundum": co * W["corundum"],
        "wollastonite": wo * W["wollastonite"], "larnite": cs * W["larnite"],
        "diopside": di * (xmg * W["di_mg"] + (1 - xmg) * W["di_fe"]),
        "hypersthene": hy * (xmg * W["enstatite"] + (1 - xmg) * W["ferrosilite"]),
        "olivine": ol * (xmg * W["forsterite"] + (1 - xmg) * W["fayalite"]),
    }
    out = {k: v for k, v in norm.items() if v > 1e-9}
    for k, v in out.items():                      # invariant, never negative
        assert v >= 0, (k, v)
    out["_moles"] = {"qz": qz, "or": or_, "ab": ab, "an": an, "ne": ne,
                     "lc": lc, "ks": ks, "cs": cs, "wo": wo, "di": di,
                     "hy": hy, "ol": ol, "xmg": xmg}
    return out, notes
