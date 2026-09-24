"""Endmembers, dividing planes and the projection registry.

All definitions are read from ohara/data/definitions.json (see ohara/defs.py) so
that the Python and browser engines use literally the same data.

CMAS   - O'Hara's simplified system CaO-MgO-Al2O3-SiO2, components C, M, A, S
         in weight units. Endmembers are molar amounts of the four oxides.
BASALT - the Yoder & Tilley (1962) generalised normative tetrahedron
         Di-Ol-Ne-Qz, built from the CIPW norm.
"""
from __future__ import annotations

import numpy as np

from .components import MW_A, MW_C, MW_M, MW_S
from .defs import DEFS

CMAS_ENDMEMBERS = {k: dict(f=tuple(v["f"]), name=v["name"])
                   for k, v in DEFS["cmas_endmembers"].items()}
BASALT_ENDMEMBERS = {k: dict(f=tuple(v["f"]), name=v["name"])
                     for k, v in DEFS["basalt_endmembers"].items()}
BASALT_W = np.array(DEFS["basalt_vertex_weights"], float)
CMAS_PLANES = DEFS["cmas_planes"]
BASALT_PLANES = DEFS["basalt_planes"]
PROJECTIONS = DEFS["projections"]
PROJECTION_BY_ID = {p["id"]: p for p in PROJECTIONS}

_CMAS_W = np.array([MW_C, MW_M, MW_A, MW_S])


def cmas_vector(key):
    """Weight-unit (C,M,A,S) vector of a named CMAS endmember."""
    return np.array(CMAS_ENDMEMBERS[key]["f"], float) * _CMAS_W


def basalt_vector(key, weight=True):
    f = np.array(BASALT_ENDMEMBERS[key]["f"], float)
    return f * BASALT_W if weight else f


def vector(space, key):
    return cmas_vector(key) if space == "cmas" else basalt_vector(key)


def endmembers(space):
    return CMAS_ENDMEMBERS if space == "cmas" else BASALT_ENDMEMBERS


def planes(space):
    return CMAS_PLANES if space == "cmas" else BASALT_PLANES
