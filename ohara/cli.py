"""Command-line interface.

Examples
--------
  ohara --oxides "SiO2=48.5,Al2O3=13,FeO=9.8,MgO=11.5,CaO=10.5,Na2O=2.1"
  ohara --oxides "..." --projection cmas_ol_CS_MS_A --json
  ohara --csv data/example_suite.csv --projection basalt_ab_Di_Ol_Qz
  ohara --csv data/yoder_tilley_1962_table2.csv --ignore-columns "n_*"
  ohara --list

Exit status: 0 success; 1 some CSV rows or projections could not be
computed (the others are still reported); 2 unusable input or options.
Errors are reported as one-line messages on stderr, never as tracebacks.
"""
from __future__ import annotations

import argparse
import csv
import fnmatch
import json
import sys

from .api import Composition, available_projections, project, report
from .components import InputError, unknown_columns
from .defs import DEFS
from .geometry import ProjectionError
from .spaces import PROJECTION_BY_ID, PROJECTIONS

METADATA = [c.lower() for c in DEFS["metadata_columns"]]
LABEL_COLUMNS = ["label", "sample", "sample name", "name", "id", "no", "no."]


class UsageError(Exception):
    pass


def _parse_pairs(text):
    out = {}
    for n, part in enumerate(text.replace(";", ",").split(","), 1):
        part = part.strip()
        if not part:
            continue
        if "=" not in part:
            raise UsageError("--oxides item %d ('%s') is not of the form "
                             "OXIDE=value" % (n, part))
        k, _, v = part.partition("=")
        if not k.strip():
            raise UsageError("--oxides item %d ('%s') has no oxide name"
                             % (n, part))
        out[k.strip()] = v.strip()          # validated by the engine
    if not out:
        raise UsageError("--oxides is empty")
    return out


def _is_ignored(col, patterns):
    c = col.strip().lower()
    return c in METADATA or any(fnmatch.fnmatch(c, p.lower()) for p in patterns)


def read_csv(path, patterns, lenient):
    """Yield (line_no, label, oxides). Raises UsageError for file/header problems."""
    try:
        fh = open(path, newline="", encoding="utf-8-sig")
    except OSError as exc:
        raise UsageError("cannot read %s: %s" % (path, exc.strerror or exc))
    with fh:
        reader = csv.reader(fh)
        try:
            header = next(reader)
        except StopIteration:
            raise UsageError("%s is empty" % path)
        except csv.Error as exc:
            raise UsageError("%s line 1: %s" % (path, exc))
        header = [h.strip() for h in header]
        lower = [h.lower() for h in header]
        label_col = next((lower.index(c) for c in LABEL_COLUMNS if c in lower),
                         None)
        use = [i for i, h in enumerate(header) if not _is_ignored(h, patterns)]
        bad = unknown_columns([header[i] for i in use])
        if bad and not lenient:
            # checked once on the header, so a typo is one clear message
            # rather than the same error on every row
            raise UsageError(
                "%s: unrecognised column%s %s. Rename, list in "
                "--ignore-columns, or use --lenient." % (
                    path, "s" if len(bad) > 1 else "",
                    ", ".join("'%s'%s" % (c, " (did you mean %s?)" % h if h
                                          else "") for c, h in bad)))
        try:
            for row in reader:
                line = reader.line_num
                if not any(c.strip() for c in row):
                    continue
                if len(row) > len(header):
                    yield line, None, InputError(
                        "%d fields but the header has %d (unquoted comma?)"
                        % (len(row), len(header)))
                    continue
                label = (row[label_col].strip() if label_col is not None
                         and label_col < len(row) else "") or "line %d" % line
                ox = {header[i]: row[i] for i in use if i < len(row)}
                yield line, label, ox
        except csv.Error as exc:
            raise UsageError("%s line %d: %s" % (path, reader.line_num, exc))


def _print_report(rep):
    print("sample: %s" % rep["label"])
    print("\nCMAS components (weight units, O'Hara 1968):")
    for k in ("C", "M", "A", "S"):
        print("   %-2s %9.3f   (%6.2f wt%%)" % (k, rep["cmas"][k],
                                                rep["cmas_pct"][k]))
    print("\nbasalt-tetrahedron components (wt% of Di-Ol-Ne-Qz):")
    for k in ("Di", "Ol", "Ne", "Qz"):
        print("   %-2s %6.2f" % (k, rep["basalt_pct"][k]))
    print("\nCIPW norm (wt%):")
    for k, v in sorted(rep["norm"].items(), key=lambda kv: -kv[1]):
        print("   %-12s %6.2f" % (k, v))
    print("\nclassification:")
    print("   Yoder & Tilley group : %s" % rep["yoder_tilley_group"])
    print("   CMAS subspace        : %s" % rep["cmas_subspace"])
    for t in rep["cmas_planes"]:
        print("   %-52s %s" % (t["plane"], t["side"]))
    print("\nassumptions and normalisations applied:")
    for a in rep["assumptions"]:
        print("   - %s" % a)


def _print_projection(res):
    print("\nprojection: %s" % res["title"])
    if res.get("error"):
        print("   not available: %s" % res["error"])
        return
    if res["source"]:
        print("   source: %s" % res["source"])
    print("   projected from : %s" % ", ".join(
        "%s (%s)" % (p["key"], p["name"]) for p in res["projected_from"]))
    print("   onto           : %s" % " - ".join(o["key"] for o in res["onto"]))
    print("   coordinates (weight %):")
    for k, v in res["components"].items():
        print("      %-6s %8.3f" % (k, v))
    print("   %s x, y = %.4f, %.4f" % (res["diagram"], res["xy"][0],
                                       res["xy"][1]))
    for line in res.get("projection_line", []):
        print("   %s" % line)
    for w in res["warnings"]:
        print("   ! %s" % w)


def _err(msg):
    sys.stderr.write("ohara: error: %s\n" % msg)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="ohara", description="O'Hara basalt-"
                                 "tetrahedron projection calculator")
    ap.add_argument("--oxides", help="comma-separated OXIDE=wt%% pairs")
    ap.add_argument("--csv", help="CSV file, one analysis per row")
    ap.add_argument("--label", default="sample")
    ap.add_argument("--projection", action="append", default=[],
                    help="projection id (repeatable); default: all valid ones")
    ap.add_argument("--fe-ratio", type=float, default=0.15,
                    help="atomic Fe3+/total Fe when only total Fe is given")
    ap.add_argument("--plag-mode", choices=("plag", "ab"), default="plag",
                    help="basalt-tetrahedron treatment of feldspar")
    ap.add_argument("--ignore-columns", default="",
                    help="comma-separated CSV column names or glob patterns to "
                         "skip (in addition to label/rock/locality/total/...)")
    ap.add_argument("--lenient", action="store_true",
                    help="ignore (and report) unrecognised oxide columns "
                         "instead of stopping")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--list", action="store_true", help="list projections")
    args = ap.parse_args(argv)

    if args.list:
        for p in PROJECTIONS:
            print("%-28s [%s] %s" % (p["id"], p["space"], p["title"]))
        return 0

    try:
        unknown = [p for p in args.projection if p not in PROJECTION_BY_ID]
        if unknown:
            raise UsageError("unknown projection %s (see --list)"
                             % ", ".join(unknown))
        if not args.oxides and not args.csv:
            raise UsageError("give --oxides or --csv")
        samples = []
        if args.oxides:
            samples.append((None, args.label, _parse_pairs(args.oxides)))
        if args.csv:
            patterns = [p.strip() for p in args.ignore_columns.split(",")
                        if p.strip()]
            samples.extend(read_csv(args.csv, patterns, args.lenient))
        samples = list(samples)
    except UsageError as exc:
        _err(exc)
        return 2

    out, failures = [], 0
    for line, label, ox in samples:
        where = ("%s line %d" % (args.csv, line)) if line else "--oxides"
        try:
            if isinstance(ox, InputError):
                raise ox
            comp = Composition(ox, label=label, fe_ratio=args.fe_ratio,
                               plag_mode=args.plag_mode, lenient=args.lenient)
        except InputError as exc:
            _err("%s: %s" % (where, exc))
            if not line:            # the single --oxides sample is unusable
                return 2
            failures += 1
            continue
        rep = report(comp)
        ids = args.projection or [p["id"] for p in available_projections(comp)
                                  if p["valid"]]
        rep["projections"] = []
        for pid in ids:
            try:
                rep["projections"].append(project(comp, pid))
            except ProjectionError as exc:
                failures += 1
                sys.stderr.write("ohara: %s (%s): %s: %s\n"
                                 % (where, label, pid, exc))
                rep["projections"].append(dict(
                    id=pid, error=str(exc), title=PROJECTION_BY_ID[pid]["title"],
                    source="", warnings=[str(exc)], components={}))
        if line:
            rep["csv_line"] = line
        out.append(rep)

    if args.json:
        json.dump(out if (args.csv or len(out) > 1) else out[0], sys.stdout,
                  indent=2)
        print()
    else:
        for rep in out:
            print("=" * 72)
            _print_report(rep)
            for res in rep["projections"]:
                _print_projection(res)
            print()
    if failures:
        sys.stderr.write("ohara: %d problem(s) reported above; %d sample(s) "
                         "computed\n" % (failures, len(out)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
