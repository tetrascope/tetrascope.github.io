"""Runs the browser end-to-end suite (tests/e2e/workbench.e2e.js) when
playwright-core is installed (npm install) and a Chromium is available;
reported as skipped otherwise. Set E2E_BROWSER=bundled in CI."""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run():
    if not shutil.which("node") or not os.path.isdir(
            os.path.join(ROOT, "node_modules", "playwright-core")):
        print("SKIP: browser tests need Node.js and `npm install`")
        return 0
    return subprocess.call(["node", os.path.join(ROOT, "tests", "e2e",
                                                 "workbench.e2e.js")], cwd=ROOT)


def test_browser_workflows():
    assert run() == 0


if __name__ == "__main__":
    sys.exit(run())
