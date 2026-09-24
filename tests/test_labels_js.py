"""Label placement (app/labels.js): no two placed labels overlap, no label
covers another point's marker, required labels are always placed.

Uses the real reference phases of every preset projection plus the 25
analyses of Yoder & Tilley's Table 2 as a crowded worst case."""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCRIPT = r"""
const app = process.argv[1];
global.OHARA_DEFS = require(app + '/definitions.js');
const O = require(app + '/ohara.js'), L = require(app + '/labels.js');
const DS = require(app + '/datasets.js');
let fails = 0, checked = 0;
const W = 620, H = 600, pad = 70, side = W - 2 * pad, top = 110;
function P(x, y) { return [pad + x * side, top + (Math.sqrt(3) / 2) * side - y * side]; }
O.PROJECTIONS.filter(p => p.basis.length === 3).forEach(function (spec) {
  const items = [];
  const keys = Object.keys(spec.space === 'cmas' ? O.CMAS_ENDMEMBERS : O.BASALT_ENDMEMBERS);
  keys.forEach(function (k) {
    const fake = {vector: () => O.vec(spec.space, k), assumptions: []};
    let r; try { r = O.projectSpec(fake, spec); } catch (e) { return; }
    const p = P(r.xy[0], r.xy[1]);
    if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return;
    items.push({x: p[0], y: p[1], text: k, size: 10, r: 3, priority: 1});
  });
  DS.yoder_tilley_1962.rows.forEach(function (row, i) {
    try {
      const c = new O.Composition(row.oxides);
      const r = O.projectSpec(c, spec);
      const p = P(r.xy[0], r.xy[1]);
      if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return;
      items.push({x: p[0], y: p[1], text: row.no, size: 10, r: 4, priority: 2});
    } catch (e) {}
  });
  items.push({x: W / 2, y: H / 2, text: 'my sample with a long label', size: 12, r: 6,
              priority: 10, required: true});
  L.place(items, [], {x0: 0, y0: 0, x1: W, y1: H});
  checked++;
  const o = L.anyOverlap(items);
  if (o) { fails++; console.log('FAIL ' + spec.id + ': labels overlap ' + o.join(' / ')); }
  items.forEach(function (it, i) {
    if (!it.placed) { if (it.required) { fails++; console.log('FAIL required label dropped'); } return; }
    items.forEach(function (m, j) {
      if (i === j || it.required) return;
      const r = (m.r || 3);
      if (L.overlaps(it.box, {x0: m.x - r, y0: m.y - r, x1: m.x + r, y1: m.y + r})) {
        fails++; console.log('FAIL ' + spec.id + ': label ' + it.text + ' covers marker ' + m.text);
      }
    });
  });
});
console.log('labels.js: ' + checked + ' crowded diagrams, ' + (fails ? fails + ' FAILED' : 'no overlaps'));
process.exit(fails ? 1 : 0);
"""


def run():
    try:
        subprocess.check_output(["node", "--version"])
    except Exception:
        print("SKIP: Node.js not available")
        return 0
    return subprocess.call(["node", "-e", SCRIPT, os.path.join(ROOT, "app")])


def test_labels_do_not_overlap():
    assert run() == 0


if __name__ == "__main__":
    sys.exit(run())
