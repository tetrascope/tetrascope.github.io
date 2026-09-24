"""Verify every vendored browser library against its pin in app/vendor/VENDOR.json.

Recomputes the SHA-512 of each file and compares it with the recorded SRI
value, and checks that the page loads the file with that same integrity
value. Exit 1 on any mismatch.

    python tools/check_vendor.py
"""
import base64
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "app", "vendor")


def sri(path):
    with open(path, "rb") as fh:
        return "sha512-" + base64.b64encode(hashlib.sha512(fh.read()).digest()).decode()


def main():
    with open(os.path.join(VENDOR, "VENDOR.json"), encoding="utf-8") as fh:
        pins = json.load(fh)
    ui = ""
    for name in sorted(os.listdir(os.path.join(ROOT, "app"))):
        if name.endswith(".js") and name not in ("sw.js", "serve.js"):
            with open(os.path.join(ROOT, "app", name), encoding="utf-8") as fh:
                ui += fh.read()
    listed = set(pins)
    present = {f for f in os.listdir(VENDOR) if f != "VENDOR.json"}
    errors = []
    for f in sorted(present - listed):
        errors.append("%s is in app/vendor but has no pin in VENDOR.json" % f)
    for name, meta in sorted(pins.items()):
        path = os.path.join(VENDOR, name)
        if not os.path.exists(path):
            errors.append("%s is pinned but missing" % name)
            continue
        got = sri(path)
        if got != meta["sri"]:
            errors.append("%s: SHA-512 %s does not match the pin %s" % (name, got, meta["sri"]))
        elif meta["sri"] not in ui:
            errors.append("%s: no app script loads it with the pinned integrity value" % name)
        else:
            print("ok  %s  %s %s  %s" % (name, meta["package"], meta["version"], got[:30] + "..."))
    for e in errors:
        print("FAIL " + e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
