// Dependency-free static server for the UI preview harness.
// Usage: node tests/ui-preview/server.js  (from the repository root)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 8123;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function isServable(urlPath, file) {
  const insideRoot = file.startsWith(ROOT + path.sep);
  const hasDotSegment = urlPath.split('/').some((segment) => segment.startsWith('.'));
  return insideRoot && !hasDotSegment;
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (urlPath === '/') {
    res.writeHead(302, { Location: '/tests/ui-preview/index.html' });
    res.end();
    return;
  }

  const file = path.join(ROOT, urlPath);
  if (!isServable(urlPath, file)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`FoxLog UI preview: http://foxlog.lightning.force.com.localhost:${PORT}`);
});
