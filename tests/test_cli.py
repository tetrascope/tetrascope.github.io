"""Command-line behaviour: clean one-line errors (never a traceback), the
documented exit codes, CSV line numbers, strict column names."""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cli(*args):
    p = subprocess.run([sys.executable, "-m", "ohara.cli"] + list(args),
                       cwd=ROOT, capture_output=True, text=True)
    assert "Traceback" not in p.stderr, p.stderr
    return p.returncode, p.stdout, p.stderr


def _csv(text):
    fd, path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, "w", newline="") as fh:
        fh.write(text)
    return path


def test_ok():
    rc, out, _ = cli("--oxides", "SiO2=43.19,Al2O3=36.65,CaO=20.16",
                     "--projection", "cmas_ol_CS_MS_A", "--json")
    assert rc == 0
    c = json.loads(out)["projections"][0]["components"]
    assert abs(c["CS"] - 27.73) < 0.05


def test_bad_oxides_are_usage_errors():
    for arg, needle in (("SiO2=50,MgO=abc", "not a number"),
                        ("SiO2=50,MgO", "OXIDE=value"),
                        ("Si02=50,MgO=40", "did you mean SiO2"),
                        ("SiO2=-1,MgO=40", "negative")):
        rc, _, err = cli("--oxides", arg)
        assert rc == 2 and needle in err, (arg, err)


def test_bad_options():
    assert cli("--oxides", "SiO2=50,MgO=40", "--projection", "nope")[0] == 2
    assert cli("--oxides", "SiO2=50,MgO=40", "--fe-ratio", "2")[0] == 2
    assert cli()[0] == 2
    assert cli("--csv", os.path.join(ROOT, "no_such_file.csv"))[0] == 2


def test_csv_rows_report_line_numbers_and_continue():
    path = _csv('label,SiO2,MgO,CaO\nok,50,20,10\nneg,-3,20,10\n'
                '"quoted, label",51,19,9\nbad,abc,1,1\nwide,50,20,10,99\n')
    rc, out, err = cli("--csv", path, "--projection", "cmas_ol_CS_MS_A", "--json")
    assert rc == 1
    for n in (3, 5, 6):
        assert "line %d" % n in err, err
    labels = [r["label"] for r in json.loads(out)]
    assert labels == ["ok", "quoted, label"], labels


def test_csv_unknown_header_is_one_clear_error():
    path = _csv("label,Si02,MgO\nx,50,40\n")
    rc, _, err = cli("--csv", path)
    assert rc == 2 and "Si02" in err and "did you mean SiO2" in err
    rc, out, err = cli("--csv", path, "--lenient", "--projection", "cmas_ol_CS_MS_A")
    assert rc == 0 and "ignored unrecognised column 'Si02'" in out


def test_csv_template_is_valid():
    """The template users download must import cleanly: strict headers,
    every row computed, no warnings about the analyses."""
    rc, out, err = cli("--csv", "app/tetrascope_template.csv",
                       "--projection", "cmas_ol_CS_MS_A", "--json")
    assert rc == 0 and not err, err
    rows = json.loads(out)
    assert len(rows) == 3
    for r in rows:
        assert not r["projections"][0]["warnings"], r["label"]
        assert not any(a.startswith("WARNING") for a in r["assumptions"]), r["label"]


def test_table2_with_ignored_columns():
    rc, out, _ = cli("--csv", "data/yoder_tilley_1962_table2.csv",
                     "--ignore-columns", "n_*", "--projection", "cmas_ol_CS_MS_A",
                     "--json")
    assert rc == 0 and len(json.loads(out)) == 25


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
