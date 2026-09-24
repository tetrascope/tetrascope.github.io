"""Projection geometry in a four-component (3-simplex) composition space.

Every diagram in O'Hara's scheme is the same operation: a composition X is
written as a linear combination of the projection point(s) and the vertices
of the target plane (or join),

    X = a1 P1 [+ a2 P2] + b1 B1 + b2 B2 [+ b3 B3]

and the b's, converted to weights and renormalised to 100, are the plotted
coordinates. With four components the system is square; it is singular
exactly when the projection point(s) lie in the target plane, which is the
geometric-validity test.

Tolerances are scale-free: each column is normalised to unit length before
solving and validity is judged on the 1-norm condition number, so the result
does not depend on the units or magnitude of the input.
"""
from __future__ import annotations

import numpy as np

COND_FAIL = 1e10      # numerically singular: refuse
COND_WARN = 1e3       # errors amplified >1000x: warn (presets are all < 20)
REL_TOL = 1e-9


class ProjectionError(ValueError):
    pass


def condition_number(cols):
    """1-norm condition number of the column-normalised matrix."""
    M = np.column_stack([np.asarray(c, float) / np.linalg.norm(c) for c in cols])
    try:
        inv = np.linalg.inv(M)
    except np.linalg.LinAlgError:
        return float("inf")
    return float(np.abs(M).sum(axis=0).max() * np.abs(inv).sum(axis=0).max())


def solve_projection(x, points, basis, return_cond=False):
    """Solve X = sum(a_i P_i) + sum(b_j B_j).

    Returns (a, b) raw coefficients, plus the condition number when
    `return_cond` is true.
    """
    x = np.asarray(x, dtype=float)
    cols = [np.asarray(p, float) for p in points] + [np.asarray(b, float)
                                                     for b in basis]
    if len(cols) != 4:
        raise ProjectionError(
            "a projection needs four reference points in total: %d projection "
            "point(s) and %d target vertices" % (len(points), len(basis)))
    norms = np.array([np.linalg.norm(c) for c in cols])
    if np.any(norms == 0):
        raise ProjectionError("a reference point is the null vector")
    cond = condition_number(cols)
    if not np.isfinite(cond) or cond > COND_FAIL:
        raise ProjectionError(
            "the projection point(s) and the target plane are coplanar - this "
            "projection is geometrically undefined")
    xs = np.linalg.norm(x)
    if xs == 0:
        raise ProjectionError("the composition is the null vector")
    M = np.column_stack([c / n for c, n in zip(cols, norms)])
    y = np.linalg.solve(M, x / xs)
    sol = y / norms * xs
    np_ = len(points)
    if return_cond:
        return sol[:np_], sol[np_:], cond
    return sol[:np_], sol[np_:]


def to_weight(b, basis):
    """Formula-unit coefficients -> weights of the basis endmembers.

    O'Hara's diagrams are weight-per-cent plots, so this is applied before
    normalising.
    """
    w = np.array([np.sum(np.asarray(v, float)) for v in basis])
    return np.asarray(b, float) * w


def normalised(b):
    b = np.asarray(b, float)
    tot = b.sum()
    if abs(tot) <= REL_TOL * max(np.abs(b).sum(), 1e-300):
        raise ProjectionError("composition projects to infinity: it lies on "
                              "the plane through the projection point parallel "
                              "to the target plane")
    return 100.0 * b / tot


def ternary_xy(b, side=1.0):
    """Cartesian coordinates for a ternary (b1 left, b2 right, b3 apex)."""
    b1, b2, b3 = [v / 100.0 for v in b]
    x = side * (b2 + 0.5 * b3)
    y = side * (np.sqrt(3.0) / 2.0) * b3
    return float(x), float(y)


TETRA_VERTS = np.array([[0.0, 0.0, 0.0],
                        [1.0, 0.0, 0.0],
                        [0.5, np.sqrt(3) / 2.0, 0.0],
                        [0.5, np.sqrt(3) / 6.0, np.sqrt(6) / 3.0]])


def tetra_xyz(v):
    """Cartesian position of a 4-component composition in a unit tetrahedron."""
    v = np.asarray(v, float)
    s = v.sum()
    if abs(s) <= REL_TOL * max(np.abs(v).sum(), 1e-300):
        return None
    return tuple(float(t) for t in (v / s).dot(TETRA_VERTS))


def side_of_plane(x, plane, reference):
    """Signed side of the plane through three endmembers.

    All vectors are normalised to unit length first, so the determinant lies
    in [-1, 1] whatever the units; |det| below REL_TOL counts as on the
    plane. Returns (sign, ratio) where sign is +1 on the side of
    `reference`, -1 on the other side, 0 on the plane.
    """
    def u(v):
        v = np.asarray(v, float)
        return v / np.linalg.norm(v)
    P = [u(p) for p in plane]
    d_x = np.linalg.det(np.column_stack(P + [u(x)]))
    d_r = np.linalg.det(np.column_stack(P + [u(reference)]))
    if abs(d_r) < REL_TOL:
        raise ProjectionError("reference point lies on the dividing plane")
    if abs(d_x) < REL_TOL:
        return 0, 0.0
    ratio = d_x / d_r
    return (1 if ratio > 0 else -1), float(ratio)
