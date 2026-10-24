'use strict';
/**
 * engines/ui/lib/static.js — serves engines/ui/public.
 *
 * The panel's markup, CSS and JS are real files now rather than strings built
 * inside a template literal. This is what serves them.
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const PUBLIC = path.join(__dirname, '..', 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);

/** Resolve a URL path inside PUBLIC, or null if it escapes the root. */
function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel   = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const abs   = path.resolve(PUBLIC, rel);
  // path.resolve collapses ../ — anything landing outside PUBLIC is refused.
  if (abs !== PUBLIC && !abs.startsWith(PUBLIC + path.sep)) return null;
  return abs;
}

/**
 * @returns {boolean} true if the request was served
 */
function serve(req, res, urlPath) {
  const abs = resolve(urlPath);
  if (!abs) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return true;
  }

  let stat;
  try { stat = fs.statSync(abs); } catch { return false; }
  if (!stat.isFile()) return false;

  const ext  = path.extname(abs).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return true;
  }

  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'ETag': etag,
    // The panel is a live control surface; revalidate rather than cache blind.
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };

  const accepts = String(req.headers['accept-encoding'] || '');
  const body    = fs.readFileSync(abs);

  if (COMPRESSIBLE.has(ext) && body.length > 1024 && /\bgzip\b/.test(accepts)) {
    const gz = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length']   = gz.length;
    headers['Vary']             = 'Accept-Encoding';
    res.writeHead(200, headers);
    res.end(gz);
    return true;
  }

  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(body);
  return true;
}

module.exports = { serve, PUBLIC };
