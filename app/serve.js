// Local static server for the workbench:  node app/serve.js [port]
// Binds to 127.0.0.1 only. Paths are resolved and must stay inside app/.
const http = require('http'), fs = require('fs'), path = require('path');
const root = fs.realpathSync(__dirname);
const port = Number(process.argv[2] || 8765);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.csv': 'text/csv', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml'};

function inside(file) {
  const rel = path.relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (p === '/') p = '/index.html';
  const file = path.resolve(root, '.' + p);
  if (!inside(file)) { res.writeHead(403); return res.end('forbidden'); }
  fs.realpath(file, (err, real) => {
    if (err || !inside(real)) { res.writeHead(404); return res.end('not found'); }
    fs.readFile(real, (e, data) => {
      if (e) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {'Content-Type': types[path.extname(real)] || 'application/octet-stream',
                          'X-Content-Type-Options': 'nosniff'});
      res.end(data);
    });
  });
});
server.listen(port, '127.0.0.1', () =>
  console.log('serving ' + root + ' on http://localhost:' + server.address().port));
