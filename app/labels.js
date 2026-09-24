/* Collision-free label placement for the 2-D diagrams (browser + Node).
 *
 * Greedy placement in priority order. Each label tries eight positions
 * around its point at increasing distances; a position is accepted only if
 * its box overlaps no marker, no already-placed label, no reserved region
 * (vertex labels, title) and stays inside the drawing bounds. Labels that
 * had to move away from their point get a leader line; optional labels that
 * cannot be placed are dropped (their point keeps a hover tooltip).
 * Tested in tests/test_labels_js.py.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OharaLabels = factory();
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]];

  function textWidth(text, size) { return 0.58 * size * String(text).length + 2; }

  function overlaps(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }

  /* items: [{x, y, text, size, r (marker radius), priority (higher first),
   *          required (never drop)}]
   * reserved: [{x0,y0,x1,y1}]  bounds: {x0,y0,x1,y1}
   * opts.measure(text, size, weight) -> rendered width in px (the browser
   * passes a canvas measureText; the width estimate is only a fallback).
   * returns items with {lx, ly, anchor, box, leader, placed} filled in. */
  function place(items, reserved, bounds, opts) {
    var measure = (opts && opts.measure) || function (t, size) { return textWidth(t, size); };
    var boxes = (reserved || []).slice();
    items.forEach(function (it) {
      var r = (it.r || 3) + 1;
      boxes.push({ x0: it.x - r, y0: it.y - r, x1: it.x + r, y1: it.y + r, marker: true });
    });
    var order = items.map(function (_, i) { return i; }).sort(function (a, b) {
      return (items[b].priority || 0) - (items[a].priority || 0);
    });
    order.forEach(function (idx) {
      var it = items[idx], size = it.size || 11, w = measure(it.text, size, it.weight) + 3,
          h = Math.ceil(size * 1.4);
      var best = null;
      for (var ring = 0; ring < 5 && !best; ring++) {
        var gap = (it.r || 3) + 3 + ring * (size * 0.9);
        for (var k = 0; k < DIRS.length; k++) {
          var dx = DIRS[k][0], dy = DIRS[k][1];
          var cx = it.x + dx * gap, cy = it.y + dy * gap;
          var x0 = dx > 0 ? cx : dx < 0 ? cx - w : cx - w / 2;
          var y0 = dy > 0 ? cy : dy < 0 ? cy - h : cy - h / 2;
          var box = { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h };
          if (bounds && (box.x0 < bounds.x0 || box.x1 > bounds.x1 ||
                         box.y0 < bounds.y0 || box.y1 > bounds.y1)) continue;
          var hit = false;
          for (var j = 0; j < boxes.length; j++) {
            if (boxes[j].owner === idx) continue;
            if (overlaps(box, boxes[j])) { hit = true; break; }
          }
          if (!hit) { best = { box: box, ring: ring }; break; }
        }
      }
      if (!best && it.required) {
        // last resort: straight above, clamped into bounds
        var bx = Math.min(Math.max(it.x - w / 2, bounds ? bounds.x0 : -1e9), (bounds ? bounds.x1 : 1e9) - w);
        var by = Math.max(it.y - (it.r || 3) - 4 - h, bounds ? bounds.y0 : -1e9);
        best = { box: { x0: bx, y0: by, x1: bx + w, y1: by + h }, ring: 5 };
      }
      if (best) {
        best.box.owner = idx;
        boxes.push(best.box);
        it.placed = true;
        it.box = best.box;
        it.lx = best.box.x0 + 1.5;
        it.ly = best.box.y0 + size * 1.1;
        it.anchor = "start";
        it.leader = best.ring > 0;
      } else {
        it.placed = false;
      }
    });
    return items;
  }

  function anyOverlap(items) {
    var placed = items.filter(function (i) { return i.placed; });
    for (var a = 0; a < placed.length; a++)
      for (var b = a + 1; b < placed.length; b++)
        if (overlaps(placed[a].box, placed[b].box)) return [placed[a].text, placed[b].text];
    return null;
  }

  return { place: place, textWidth: textWidth, overlaps: overlaps, anyOverlap: anyOverlap };
}));
