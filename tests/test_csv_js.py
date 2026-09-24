"""The browser CSV parser (app/csv.js) against Python's csv module.

The reviewer's case - a quoted label containing a comma, from
data/example_suite.csv - used to shift every oxide one column to the right.
"""
import csv
import io
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CASES = [
    open(os.path.join(ROOT, "data", "example_suite.csv"), encoding="utf-8").read(),
    open(os.path.join(ROOT, "data", "yoder_tilley_1962_table2.csv"),
         encoding="utf-8").read(),
    'label,SiO2\r\n"a, b",1\r\n"say ""hi""",2\r\n',
    'label,SiO2\n"multi\nline",3\n\n',
    '﻿label,SiO2\nx,4',
    'a,b\n,\n"",""\n',
]
SEMICOLON = 'label;SiO2;MgO\n"x; y";49,5;7\n'


def run():
    try:
        subprocess.check_output(["node", "--version"])
    except Exception:
        print("SKIP: Node.js not available")
        return 0
    tmp = tempfile.mkdtemp()
    data = os.path.join(tmp, "cases.json")
    with open(data, "w", encoding="utf-8") as fh:
        json.dump(CASES + [SEMICOLON], fh)
    script = ("const C=require(process.argv[1]);"
              "const cs=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));"
              "process.stdout.write(JSON.stringify(cs.map(t=>C.parse(t))));")
    out = json.loads(subprocess.check_output(
        ["node", "-e", script, os.path.join(ROOT, "app", "csv.js"), data]
    ).decode("utf-8"))
    fails = 0
    for text, got in zip(CASES, out):
        t = text.lstrip("﻿")
        exp = [r for r in csv.reader(io.StringIO(t, newline=""))
               if not (len(r) == 1 and r[0].strip() == "") and r != []]
        if got != exp:
            fails += 1
            print("FAIL\n  input %r\n  js   %r\n  py   %r" % (text[:80], got, exp))
    exp_semi = [["label", "SiO2", "MgO"], ["x; y", "49,5", "7"]]
    if out[-1] != exp_semi:
        fails += 1
        print("FAIL semicolon: %r" % out[-1])
    # the reviewer's regression: every row must keep its oxide columns aligned
    rows = out[0]
    width = len(rows[0])
    if any(len(r) != width for r in rows):
        fails += 1
        print("FAIL example_suite rows have unequal widths")
    print("csv.js: %d cases, %s" % (len(out), "all match Python's csv module"
                                    if not fails else "%d FAILED" % fails))
    return 1 if fails else 0


def test_csv_parser():
    assert run() == 0


if __name__ == "__main__":
    sys.exit(run())
