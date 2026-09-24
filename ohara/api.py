"""High-level API: composition in, classification and projections out."""
from __future__ import annotations

import numpy as np

from . import basalt as _basalt
from . import geometry as geo
from . import spaces
from .components import (InputError, cipw_norm, cmas, cmas_wt_percent,
                         parse_oxides)

__all__ = ["Composition", "InputError", "classify", "subspace", "project",
           "project_spec", "available_projections", "report"]


class Composition(object):
    """A validated composition, reduced to both working spaces.

    Raises InputError for unusable input (see components.parse_oxides).
    """

    def __init__(self, oxides, label="sample", fe_ratio=0.15,
                 plag_mode="plag", lenient=False):
        if plag_mode not in ("plag", "ab"):
            raise InputError("plag_mode must be 'plag' or 'ab'")
        self.label = label
        self.raw = dict(oxides)
        self.oxides, notes = parse_oxides(oxides, fe_ratio=fe_ratio,
                                          lenient=lenient)
        self.assumptions = list(notes)

        self.cmas, n2 = cmas(self.oxides)
        self.assumptions += n2
        self.cmas_vec = np.array([self.cmas[k] for k in ("C", "M", "A", "S")])
        try:
            self.cmas_pct = cmas_wt_percent(self.cmas)
        except InputError:
            self.cmas_pct = {k: 0.0 for k in ("C", "M", "A", "S")}

        self.norm, n3 = cipw_norm(self.oxides)
        self.assumptions += n3
        self.basalt_vec, self.basalt_moles, n4 = _basalt.tetra_from_norm(
            self.norm, plag_mode=plag_mode)
        self.assumptions += n4
        self.plag_mode = plag_mode
        self.fe_ratio = fe_ratio
        self.yt_group = _basalt.yoder_tilley_group(self.norm)

    def vector(self, space):
        return self.cmas_vec if space == "cmas" else self.basalt_vec

    def norm_wt(self):
        return {k: v for k, v in self.norm.items() if k != "_moles"}


def classify(comp, space):
    """Locate the composition relative to the dividing planes of `space`."""
    x = comp.vector(space)
    out = []
    for pl in spaces.planes(space):
        if np.linalg.norm(x) == 0:
            out.append(dict(id=pl["id"], plane=pl["label"], side="undefined",
                            sign="?", value=0.0))
            continue
        P = [spaces.vector(space, k) for k in pl["plane"]]
        ref = spaces.vector(space, pl["ref"])
        side, value = geo.side_of_plane(x, P, ref)
        where = pl["pos"] if side > 0 else (pl["neg"] if side < 0 else
                                            "exactly on the plane")
        out.append(dict(id=pl["id"], plane=pl["label"], side=where,
                        value=value,
                        sign=("+" if side > 0 else "-" if side < 0 else "0")))
    return out


def subspace(comp, space):
    """Name the compositional subvolume containing the composition."""
    if space == "basalt":
        return comp.yt_group
    tests = {t["id"]: t["sign"] for t in classify(comp, "cmas")}
    if tests.get("critical_undersaturation") == "-":
        return ("critically undersaturated volume (Di-Ol-An-Ne side): "
                "nepheline-normative, alkalic")
    if tests.get("silica_saturation") == "+":
        return ("oversaturated volume (beyond the plane of silica "
                "saturation Di-Hy-An): quartz-normative tholeiitic")
    if tests.get("silica_saturation") == "-":
        return ("undersaturated volume between the Di-Ol-An and Di-Hy-An "
                "planes: olivine- and hypersthene-normative tholeiitic")
    return "on a bounding plane of the tetrahedron"


def project(comp, projection_id, basis="weight"):
    spec = spaces.PROJECTION_BY_ID[projection_id]
    return project_spec(comp, spec, basis=basis)


def project_spec(comp, spec, basis="weight"):
    """Project using any spec {space, points, basis[, id, title, ...]}."""
    space = spec["space"]
    x = comp.vector(space)
    if float(np.sum(np.abs(x))) < 1e-12:
        raise geo.ProjectionError(
            "the composition has no components in the %s space (for the "
            "basalt tetrahedron this happens when the whole analysis is "
            "feldspar, which is removed by the projection from plagioclase)"
            % space)
    P = [spaces.vector(space, k) for k in spec["points"]]
    B = [spaces.vector(space, k) for k in spec["basis"]]

    a, b_units, cond = geo.solve_projection(x, P, B, return_cond=True)
    b = geo.to_weight(b_units, B) if basis == "weight" else b_units
    coords = geo.normalised(b)

    labels = spec["basis"]
    warnings = []
    if cond > geo.COND_WARN:
        warnings.append("numerically ill-conditioned (condition number "
                        "%.1e): the projection point lies very close to the "
                        "target plane, so small analytical errors move the "
                        "plotted point a long way" % cond)
    neg = [labels[i] for i, c in enumerate(coords) if c < -1e-9]
    if neg:
        warnings.append("the projected point falls outside the triangle "
                        "(negative %s); it is a valid projection but plots "
                        "beyond the edge of the diagram" % ", ".join(neg))
    scale = float(np.sum(np.abs(b))) / max(float(np.sum(np.abs(x))), 1e-300)
    if scale < 1e-3:
        warnings.append("the composition is (within rounding) the projection "
                        "point itself, so its projected position is "
                        "indeterminate")
    names = spaces.endmembers(space)
    directions = [
        "%s: coefficient %.4f (%s %s to reach the plane)"
        % (k, a[i], "subtract" if a[i] > 0 else "add",
           names[k]["name"].split(" (")[0])
        for i, k in enumerate(spec["points"])]

    result = dict(
        id=spec.get("id", "custom"),
        title=spec.get("title") or ("from %s into %s" % (
            " + ".join(spec["points"]), "-".join(spec["basis"]))),
        source=spec.get("source", ""), note=spec.get("note", ""), space=space,
        projected_from=[dict(key=k, name=names[k]["name"],
                             coefficient=float(a[i]))
                        for i, k in enumerate(spec["points"])],
        onto=[dict(key=k, name=names[k]["name"]) for k in spec["basis"]],
        components={k: float(v) for k, v in zip(labels, coords)},
        basis=basis,
        raw_coefficients={k: float(v) for k, v in zip(labels, b)},
        formula_units={k: float(v) for k, v in zip(labels, b_units)},
        condition_number=cond,
        warnings=warnings, projection_line=directions,
        assumptions=list(comp.assumptions),
    )
    if len(labels) == 3:
        result["xy"] = geo.ternary_xy(coords)
        result["diagram"] = "ternary"
    else:
        result["xy"] = (float(coords[1]) / 100.0, 0.0)
        result["diagram"] = "binary"
    return result


def available_projections(comp, space=None):
    """Every preset projection, with a validity verdict for this sample."""
    out = []
    for spec in spaces.PROJECTIONS:
        if space and spec["space"] != space:
            continue
        rec = dict(id=spec["id"], title=spec["title"], space=spec["space"],
                   points=spec["points"], basis=spec["basis"])
        try:
            res = project(comp, spec["id"])
            rec["valid"] = True
            rec["inside_triangle"] = all(
                v >= -1e-9 for v in res["components"].values())
            rec["warnings"] = res["warnings"]
        except geo.ProjectionError as exc:
            rec["valid"] = False
            rec["reason"] = str(exc)
        out.append(rec)
    return out


def _pct(vec, keys):
    tot = float(np.sum(vec))
    if abs(tot) <= 1e-12 * max(float(np.sum(np.abs(vec))), 1e-300):
        return {k: 0.0 for k in keys}
    return {k: 100.0 * float(v) / tot for k, v in zip(keys, vec)}


def report(comp):
    """Everything the GUI and the CLI need for one composition."""
    return dict(
        label=comp.label,
        oxides={k: v for k, v in comp.oxides.items() if v},
        cmas=comp.cmas, cmas_pct=comp.cmas_pct,
        norm=comp.norm_wt(),
        basalt_vector=dict(zip(("Di", "Ol", "Ne", "Qz"),
                               [float(v) for v in comp.basalt_vec])),
        basalt_pct=_pct(comp.basalt_vec, ("Di", "Ol", "Ne", "Qz")),
        yoder_tilley_group=comp.yt_group,
        cmas_subspace=subspace(comp, "cmas"),
        cmas_planes=classify(comp, "cmas"),
        basalt_planes=classify(comp, "basalt"),
        assumptions=comp.assumptions,
        xyz_cmas=geo.tetra_xyz(comp.cmas_vec),
        xyz_basalt=geo.tetra_xyz(comp.basalt_vec),
    )
