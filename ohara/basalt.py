"""Recast of a CIPW norm into the Yoder & Tilley (1962) basalt tetrahedron.

Vertices Di - Ol - Ne - Qz, using the identities of Yoder & Tilley

    albite      NaAlSi3O8 = NaAlSiO4 + 2 SiO2    (Ab = Ne + 2 Qz)
    hypersthene Mg2Si2O6  = Mg2SiO4  +   SiO2    (Hy = Ol +   Qz)

Anorthite and the potassic feldspars cannot be expressed in these four
components. Two documented treatments are offered:

  'plag' (default) - project from plagioclase: normative An, Ab and Or are
         removed before plotting. Geometrically exact; O'Hara's practice.
  'ab'   - Yoder & Tilley's simple-system reading: Ab recast as Ne + 2Qz,
         An and Or omitted.

Fe-Ti-Cr oxides, apatite, wollastonite, larnite, leucite and kalsilite lie
outside the tetrahedron; each exclusion is reported as an assumption.
"""
from __future__ import annotations

import numpy as np

from .spaces import BASALT_W


def tetra_from_norm(norm, plag_mode="plag"):
    """Return (vector(Di,Ol,Ne,Qz) in wt units, mole dict, notes)."""
    if plag_mode not in ("plag", "ab"):
        raise ValueError("plag_mode must be 'plag' or 'ab'")
    m = norm["_moles"]
    notes = []
    # formula units: Hy = MSiO3 -> 1/2 Ol + 1/2 Qz; Ab unit = Na2O.Al2O3.6SiO2
    # -> 1 Ne unit (Na2O.Al2O3.2SiO2) + 4 Qz
    ol_t = m["ol"] + m["hy"] / 2.0
    qz_t = m["qz"] + m["hy"] / 2.0
    ne_t = m["ne"]
    if m["hy"] > 0:
        notes.append("normative hypersthene recast as olivine + silica "
                     "(Mg2Si2O6 = Mg2SiO4 + SiO2)")
    if plag_mode == "ab":
        ne_t += m["ab"]
        qz_t += 4 * m["ab"]
        if m["ab"]:
            notes.append("normative albite recast as nepheline + 2 silica "
                         "(NaAlSi3O8 = NaAlSiO4 + 2SiO2)")
        if m["an"]:
            notes.append("normative anorthite omitted: it has no "
                         "representation in Di-Ol-Ne-Qz")
        if m["or"]:
            notes.append("normative orthoclase omitted (no K vertex)")
    elif m["ab"] or m["an"] or m["or"]:
        notes.append("composition projected from plagioclase: normative "
                     "anorthite, albite and orthoclase removed before plotting")
    for k, label in (("lc", "leucite"), ("ks", "kalsilite"), ("cs", "larnite")):
        if m.get(k):
            notes.append("normative %s present - the composition lies outside "
                         "the basalt tetrahedron and the plotted point is an "
                         "approximation" % label)
    for k in ("magnetite", "ilmenite", "chromite", "apatite", "hematite",
              "rutile", "corundum", "wollastonite"):
        if norm.get(k):
            notes.append("%s excluded (outside the tetrahedron)" % k)

    moles = {"Di": m["di"], "Ol": ol_t, "Ne": ne_t, "Qz": qz_t}
    vec = np.array([m["di"], ol_t, ne_t, qz_t], float) * BASALT_W
    return vec, moles, notes


def yoder_tilley_group(norm):
    """The five normative groups of Yoder & Tilley (1962, p.352)."""
    m = norm["_moles"]
    t = 1e-6
    if m["ab"] + m["an"] + m["or"] + m["lc"] + m["ks"] <= t:
        return ("feldspar-free: outside the Yoder & Tilley basalt "
                "classification (a mineral or an ultramafic composition)")
    if m["ne"] > t or m["lc"] > t or m["ks"] > t or m["cs"] > t:
        if m["cs"] > t or m["lc"] > t or m["ks"] > t:
            return ("5. alkali basalt group, beyond the tetrahedron "
                    "(nepheline-normative with larnite, leucite or kalsilite; "
                    "cf. melilite-bearing types)")
        return "5. alkali basalt (nepheline-normative)"
    if m["qz"] > t and m["hy"] > t:
        return "1. tholeiite, oversaturated (normative quartz and hypersthene)"
    if m["hy"] > t and m["ol"] <= t and m["qz"] <= t:
        return "2. tholeiite, saturated / hypersthene basalt (normative hypersthene)"
    if m["hy"] > t and m["ol"] > t:
        return "3. olivine tholeiite, undersaturated (normative hypersthene and olivine)"
    if m["ol"] > t and m["hy"] <= t:
        return "4. olivine basalt (normative olivine, no hypersthene, no nepheline)"
    return "unclassified (no normative Qz, Hy, Ol or Ne)"
