/* RFC 4180 CSV parsing for the workbench (browser + Node).
 *
 * Handles quoted fields containing commas, line breaks and escaped quotes
 * (""), CRLF / LF / CR line endings, a UTF-8 byte-order mark, and blank
 * lines. The delimiter is detected from the header line (comma, semicolon
 * or tab, counted outside quotes) unless given. Tested in tests/test_csv_js.py.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OharaCSV = factory();
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function detectDelimiter(text) {
    var counts = { ",": 0, ";": 0, "\t": 0 }, inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && (ch === "\n" || ch === "\r")) break;
      else if (!inQ && counts.hasOwnProperty(ch)) counts[ch]++;
    }
    var best = ",";
    Object.keys(counts).forEach(function (d) { if (counts[d] > counts[best]) best = d; });
    return best;
  }

  function parse(text, delimiter) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var d = delimiter || detectDelimiter(text);
    var rows = [], row = [], field = "", i = 0, inQ = false, n = text.length;
    while (i < n) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"' && field === "") { inQ = true; i++; continue; }
      if (ch === d) { row.push(field); field = ""; i++; continue; }
      if (ch === "\r" || ch === "\n") {
        row.push(field); field = "";
        rows.push(row); row = [];
        if (ch === "\r" && text[i + 1] === "\n") i++;
        i++; continue;
      }
      field += ch; i++;
    }
    if (inQ) throw new Error("unterminated quoted field in CSV");
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) {
      return !(r.length === 1 && r[0].trim() === "");
    });
  }

  /* Rows as objects keyed by the (trimmed) header. */
  function parseObjects(text, delimiter) {
    var rows = parse(text, delimiter);
    if (!rows.length) return { header: [], records: [] };
    var header = rows[0].map(function (h) { return h.trim(); });
    var records = rows.slice(1).map(function (r, idx) {
      var o = { __line: idx + 2 };
      header.forEach(function (h, j) { o[h] = r[j] === undefined ? "" : r[j]; });
      if (r.length > header.length) o.__extra = r.length - header.length;
      return o;
    });
    return { header: header, records: records };
  }

  return { parse: parse, parseObjects: parseObjects, detectDelimiter: detectDelimiter };
}));
