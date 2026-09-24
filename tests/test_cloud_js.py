"""app/cloud.js: the pure parts of Google sign-in / collection sync.

* Firestore REST value encoding round-trips;
* every collection item becomes a document that satisfies RockMin ID's
  firestore.rules isValidSavedSample (checked against a transcription of
  that rule, including awkward labels and inputs);
* documents round-trip back into collection items (FeO* <-> FeOT);
* merging local and cloud collections uploads only local-only items and
  adds cloud-only items, without duplicates;
* the SDK pins in cloud.js match app/vendor/VENDOR.json.
Requires Node.js (skipped otherwise).
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCRIPT = r"""
const C = require(process.argv[1] + '/app/cloud.js');
const vendor = require(process.argv[1] + '/app/vendor/VENDOR.json');
let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.log('FAIL ' + msg); } }
const uid = 'uid_ABC123';

// 1. value encoding round trip
const obj = {a: 'x', b: 3, c: 2.5, d: true, e: null, f: [1, 'two', {g: 4.25}], h: {i: {j: 'k'}}};
check(JSON.stringify(C.decodeFields(C.encodeFields(obj))) === JSON.stringify(obj), 'encode/decode round trip');
check(C.encodeValue(3).integerValue === '3' && C.encodeValue(2.5).doubleValue === 2.5, 'number encodings');

// 2. RockMin schema for a range of items
const items = [
  {label: 'Y&T 14* Olivine tholeiite', oxides: {SiO2: '49.16', Al2O3: '13.33', 'FeO*': '11', MgO: '10.41'}, feRatio: 0.15, plagMode: 'plag', savedAt: '2026-09-24T10:00:00.000Z'},
  {label: 'x'.repeat(300), oxides: {SiO2: 50}, feRatio: 1, plagMode: 'ab'},
  {label: '', oxides: {SiO2: '50', MgO: ''}, feRatio: NaN},
  {label: 'weird "quotes", commas; & <html>', oxides: {}, plagMode: 'bogus', id: 'bad id with spaces'}
];
C.ensureIds(items);
items.forEach(function (it, i) {
  check(/^[A-Za-z0-9_\-]+$/.test(it.id) && it.id.length <= 128, 'id valid for item ' + i);
  const doc = C.toSavedSample(it, uid);
  check(C.isValidSavedSample(doc, uid), 'item ' + i + ' satisfies isValidSavedSample: ' + JSON.stringify(doc).slice(0, 120));
  check(Object.keys(doc.oxides).every(k => typeof doc.oxides[k] === 'number' && isFinite(doc.oxides[k])), 'oxides numeric ' + i);
  check(!C.isValidSavedSample(doc, 'someone_else'), 'userId must equal the signed-in uid ' + i);
  // 3. round trip through the REST encoding
  const back = C.fromSavedSample(C.decodeFields(C.encodeFields(doc)));
  check(back.id === it.id, 'id survives ' + i);
});
const d0 = C.toSavedSample(items[0], uid);
check(d0.oxides.FeOT === 11 && !('FeO*' in d0.oxides), 'FeO* stored as FeOT');
const b0 = C.fromSavedSample(d0);
check(b0.oxides['FeO*'] === '11' && b0.feRatio === 0.15 && b0.plagMode === 'plag', 'FeOT back to FeO*, options kept');
check(C.toSavedSample(items[2], uid).tetrascope.feRatio === 0.15, 'non-finite Fe ratio falls back to 0.15');
check(C.toSavedSample(items[3], uid).tetrascope.plagMode === 'plag', 'unknown plag mode falls back');
check(C.toSavedSample(items[2], uid).name === 'sample', 'empty label gets a name');
// a RockMin-created sample (no tetrascope block) is read sensibly
const rm = C.fromSavedSample({id: 'sample_1', userId: uid, name: 'Basalt from RockMin', sampleType: 'rock', oxides: {SiO2: 49.5}, createdAt: '2026-01-01', tags: []});
check(rm.oxides.SiO2 === '49.5' && rm.source === 'rockmin' && rm.feRatio === 0.15, 'RockMin sample imported');

// 4. merge
const local = [{id: 'a', savedAt: '3'}, {id: 'b', savedAt: '2'}];
const cloud = [{id: 'b', savedAt: '2'}, {id: 'c', savedAt: '1'}];
const m = C.mergeCollections(local, cloud);
check(m.merged.map(x => x.id).join() === 'a,b,c', 'merged union, newest first: ' + m.merged.map(x => x.id));
check(m.upload.map(x => x.id).join() === 'a', 'only local-only items uploaded');
const again = C.mergeCollections(m.merged, m.merged);
check(again.upload.length === 0 && again.merged.length === 3, 'merge is idempotent');

// 5. pins
C.SDK.forEach(function (s) {
  const meta = vendor[s.src.replace('vendor/', '')];
  check(meta && meta.sri === s.sri, 'SDK pin matches VENDOR.json for ' + s.src);
});
check(!C.configured(null) && !C.configured({apiKey: 'x'}) &&
      C.configured({apiKey: 'k', projectId: 'p', authDomain: 'd', appId: 'a'}), 'configured() requires all four keys');

console.log('cloud.js: ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);
"""


def run():
    try:
        subprocess.check_output(["node", "--version"])
    except Exception:
        print("SKIP: Node.js not available")
        return 0
    return subprocess.call(["node", "-e", SCRIPT, ROOT])


def test_cloud_module():
    assert run() == 0


if __name__ == "__main__":
    sys.exit(run())
