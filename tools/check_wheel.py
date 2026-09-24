"""Build the wheel, install it into a clean virtual environment, and run the
installed package from outside the source tree.

    python tools/check_wheel.py            # uses system numpy (no download)
    python tools/check_wheel.py --isolated # fully clean venv, installs numpy

Fails if the installed package cannot find its data (ohara/data/
definitions.json), if the console script is missing, or if the installed
CLI gives a wrong answer for a reference composition.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(cmd, **kw):
    print("$ " + " ".join(cmd))
    return subprocess.run(cmd, check=True, **kw)


def main():
    isolated = "--isolated" in sys.argv
    tmp = tempfile.mkdtemp(prefix="ohara-wheel-")
    dist = os.path.join(tmp, "dist")
    # isolated build: pip provides the build backend declared in pyproject.toml
    run([sys.executable, "-m", "pip", "wheel", ROOT, "--no-deps",
         "-w", dist, "-q"])
    wheels = glob.glob(os.path.join(dist, "ohara_projection-*.whl"))
    assert len(wheels) == 1, wheels

    venv = os.path.join(tmp, "venv")
    args = [sys.executable, "-m", "venv", venv]
    if not isolated:
        args.insert(3, "--system-site-packages")
    run(args)
    bindir = os.path.join(venv, "Scripts" if os.name == "nt" else "bin")
    py = os.path.join(bindir, "python")
    # without --isolated numpy comes from the system site-packages, so nothing
    # is downloaded (--no-index); the ohara package itself is only in the wheel
    run([py, "-m", "pip", "install", "-q"] + ([] if isolated else ["--no-index"])
        + [wheels[0]])

    elsewhere = tempfile.mkdtemp(prefix="ohara-run-")         # not the source tree
    where = subprocess.check_output(
        [py, "-c", "import ohara, os; print(os.path.dirname(ohara.__file__))"],
        cwd=elsewhere).decode().strip()
    assert os.path.normcase(os.path.abspath(ROOT)) not in os.path.normcase(where), \
        "imported the source tree instead of the installed wheel: " + where
    print("installed package at " + where)

    out = subprocess.check_output(
        [os.path.join(bindir, "ohara"), "--json", "--projection", "cmas_ol_CS_MS_A",
         "--oxides", "SiO2=43.19,Al2O3=36.65,CaO=20.16"], cwd=elsewhere)
    res = json.loads(out.decode())
    comps = res["projections"][0]["components"]
    # anorthite projected from olivine: hand balance CAS2 + M2S = CS + 2MS + A
    exp = {"CS": 27.73, "MS": 47.93, "A": 24.34}
    assert all(abs(comps[k] - v) < 0.05 for k, v in exp.items()), comps
    print("installed CLI OK: anorthite from olivine -> %s" %
          ", ".join("%s %.2f" % kv for kv in comps.items()))

    bad = subprocess.run([os.path.join(bindir, "ohara"), "--oxides", "Si02=50,MgO=40"],
                         cwd=elsewhere, capture_output=True, text=True)
    assert bad.returncode == 2 and "Traceback" not in bad.stderr, bad.stderr
    print("installed CLI rejects a typo cleanly: " + bad.stderr.strip().splitlines()[-1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
