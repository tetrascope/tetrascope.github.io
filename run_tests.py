"""Run every test suite with one command:  python run_tests.py

Works with or without pytest installed. Node.js is needed for the
browser-parity suite (it reports itself as skipped otherwise).
Tested with Python 3.9+ and Node.js 18+.
"""
import importlib.util
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SUITES = ["test_validation", "test_published", "test_inputs", "test_parity",
          "test_csv_js", "test_labels_js", "test_cli", "test_figures", "test_e2e"]


def main():
    if importlib.util.find_spec("pytest"):
        return subprocess.call([sys.executable, "-m", "pytest", "-q",
                                os.path.join(ROOT, "tests")])
    failed = []
    for name in SUITES:
        print("=" * 20, name)
        rc = subprocess.call([sys.executable,
                              os.path.join(ROOT, "tests", name + ".py")])
        if rc:
            failed.append(name)
    print("\n" + ("ALL SUITES PASSED" if not failed else
                  "FAILED: " + ", ".join(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
