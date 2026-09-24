"""Generate the browser copies of the shared data.

  ohara/data/definitions.json -> app/definitions.js   (constants, endmembers,
                                                    planes, projections)
  data/*.csv              -> app/datasets.js      (built-in reference data)
  tools/sw.template.js    -> app/sw.js            (offline cache; the cache
                                                    name is version + a hash
                                                    of every cached file)

The JSON/CSV files are the single source of truth; the Python package reads
them directly, the browser (which cannot read local files from file://) gets
these generated copies. tests/test_parity.py fails if a copy is stale.

    python tools/build_definitions.py           # regenerate
    python tools/build_definitions.py --check   # exit 1 if a copy is stale
"""
import csv
import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "ohara", "data", "definitions.json")
DST = os.path.join(ROOT, "app", "definitions.js")
DATASETS = os.path.join(ROOT, "app", "datasets.js")
OXIDE_COLS = ["SiO2", "TiO2", "Al2O3", "Cr2O3", "Fe2O3", "FeO", "MnO", "NiO",
              "MgO", "CaO", "Na2O", "K2O", "P2O5"]


def _wrap(source, var, body):
    return ("/* GENERATED from %s by tools/build_definitions.py - do not edit "
            "by hand. */\n" % source
            + "(function (root) {\n  var DATA = " + body + ";\n"
            "  if (typeof module === \"object\" && module.exports) module.exports = DATA;\n"
            "  else root." + var + " = DATA;\n"
            "}(typeof self !== \"undefined\" ? self : this));\n")


def render():
    with open(SRC, encoding="utf-8") as fh:
        data = json.load(fh)
    return _wrap("ohara/data/definitions.json", "OHARA_DEFS",
                 json.dumps(data, indent=1, sort_keys=True))


def _read(path):
    with open(os.path.join(ROOT, path), newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def render_datasets():
    yt = []
    for r in _read("data/yoder_tilley_1962_table2.csv"):
        yt.append({
            "label": "Y&T %s%s %s" % (r["no"], "*" if r["investigated"] == "yes"
                                      else "", r["rock"]),
            "no": r["no"], "rock": r["rock"], "locality": r["locality"],
            "source": r["source"],
            "oxides": {k: float(r[k]) for k in OXIDE_COLS if r.get(k)},
            "published_norm": {k[2:]: float(v) for k, v in r.items()
                               if k.startswith("n_") and k != "n_total" and v}})
    tys = [{"label": "TYS %s %s" % (r["ohara_label"], r["rock"].split(",")[0]),
            "oxides": {k: float(r[k]) for k in OXIDE_COLS if r.get(k)}}
           for r in _read("data/tilley_yoder_1963_1964_analyses.csv")]
    ex = [{"label": r["label"],
           "oxides": {k: float(r[k]) for k in OXIDE_COLS if r.get(k)}}
          for r in _read("data/example_suite.csv")]
    import sys
    sys.path.insert(0, ROOT)
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import figure_check
    fig_rows = _read("data/ohara_1968_digitised.csv")
    comps = sorted({r["composition"] for r in fig_rows if r["composition"]})
    figures = {
        "title": "Points digitised from O'Hara (1968) Figs 4, 5, 9 and 10",
        "rows": [{k: r[k] for k in ("figure", "projection", "kind", "label",
                                    "x_px", "y_px", "c1", "v1", "c2", "v2",
                                    "composition", "status")} for r in fig_rows],
        "compositions": {c: {k: round(v, 10) for k, v in
                             figure_check.composition(c).items()} for c in comps},
        "point_tolerance": 0.6, "mean_tolerance": 0.35}
    data = {
        "ohara_1968_figures": figures,
        "yoder_tilley_1962": {
            "title": "Yoder & Tilley (1962) Table 2 - basalts investigated (*) "
                     "and closely related rocks",
            "citation": "Yoder, H. S. & Tilley, C. E. (1962). Origin of basalt "
                        "magmas. Journal of Petrology 3, 342-532, Table 2 "
                        "(pp. 361-362).",
            "rows": yt},
        "tilley_yoder_schairer": {
            "title": "Tilley, Yoder & Schairer (1963, 1964) - basalts plotted by O'Hara (1968)",
            "rows": tys},
        "examples": {"title": "Reference compositions and end members",
                     "rows": ex}}
    return _wrap("data/*.csv", "OHARA_DATASETS",
                 json.dumps(data, indent=1, sort_keys=True))


SW = os.path.join(ROOT, "app", "sw.js")
SW_TEMPLATE = os.path.join(ROOT, "tools", "sw.template.js")
SW_EXCLUDE = {"sw.js", "serve.js", "VENDOR.json"}


def app_version():
    with open(os.path.join(ROOT, "pyproject.toml"), encoding="utf-8") as fh:
        return re.search(r'^version\s*=\s*"([^"]+)"', fh.read(), re.M).group(1)


def shell_files(generated):
    """Every file the page needs offline, as paths relative to app/.
    `generated` maps relative paths to content not yet written to disk."""
    files = set(generated)
    app = os.path.join(ROOT, "app")
    for dirpath, _, names in os.walk(app):
        for n in names:
            rel = os.path.relpath(os.path.join(dirpath, n), app).replace(os.sep, "/")
            if n not in SW_EXCLUDE:
                files.add(rel)
    return sorted(files)


def render_sw(generated):
    """sw.js with a cache name = version + hash of every cached file, so any
    change to the app (or a new release) invalidates old offline caches."""
    h = hashlib.sha256()
    for rel in shell_files(generated):
        if rel in generated:
            data = generated[rel].encode("utf-8")
        else:
            with open(os.path.join(ROOT, "app", rel), "rb") as fh:
                data = fh.read()
        h.update(rel.encode() + b"\0" + data + b"\0")
    cache = "ohara-workbench-%s-%s" % (app_version(), h.hexdigest()[:12])
    shell = ["./"] + ["./" + f for f in shell_files(generated)]
    with open(SW_TEMPLATE, encoding="utf-8") as fh:
        tpl = fh.read()
    return (tpl.replace("__CACHE__", cache)
               .replace("__SHELL__", json.dumps(shell, indent=2)))


def main(argv):
    check = "--check" in argv
    stale = []
    defs, data = render(), render_datasets()
    sw = render_sw({"definitions.js": defs, "datasets.js": data})
    for dst, out in ((DST, defs), (DATASETS, data), (SW, sw)):
        rel = os.path.relpath(dst, ROOT)
        if check:
            try:
                with open(dst, encoding="utf-8") as fh:
                    same = fh.read() == out
            except OSError:
                same = False
            if not same:
                stale.append(rel)
            continue
        with open(dst, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(out)
        print("wrote %s (%d bytes)" % (rel, len(out)))
    if check:
        if stale:
            print("STALE: %s - run python tools/build_definitions.py"
                  % ", ".join(stale))
            return 1
        print("generated browser assets are up to date")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main(sys.argv[1:]))
