#!/usr/bin/env node
/* ERAVOS local server — Node built-ins only (http, fs, path, child_process). No dependencies.
 * Why: browsers grant MIDI, microphone and reliable storage to http://localhost, not to file:// pages
 * (Firefox refuses Web MIDI on file:// entirely). Serves this folder at a FIXED address, because browser
 * storage (autosaves, presets, samples) is keyed to the address — a changing port would orphan your saves.
 *   node serve.js            → http://localhost:4747
 *   node serve.js --open     → also opens it in your default browser
 *   node serve.js --port 5000
 * Binds 127.0.0.1 only: nothing on your network can reach it. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { exec } = require('child_process');
const ROOT = __dirname;
const argv = process.argv.slice(2);
const PORT = (() => { const i = argv.indexOf('--port'); const p = i >= 0 ? parseInt(argv[i + 1], 10) : 4747; return p > 0 && p < 65536 ? p : 4747; })();
const OPEN = argv.includes('--open');
const URL = `http://localhost:${PORT}/`;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.spec': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.mid': 'audio/midi', '.midi': 'audio/midi',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8',
};
const BLOCK = /(^|[\\/])(node_modules|\.git)([\\/]|$)/;
function send(res, code, body, type) { res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(body); }
function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  let rel;
  try { rel = decodeURIComponent(new globalThis.URL(req.url, 'http://x').pathname); } catch (e) { return send(res, 400, 'bad request'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'forbidden');   // no path traversal
  if (BLOCK.test(path.relative(ROOT, file))) return send(res, 404, 'not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found: ' + rel);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}
function openBrowser() {
  const cmd = process.platform === 'win32' ? `start "" "${URL}"` : process.platform === 'darwin' ? `open "${URL}"` : `xdg-open "${URL}"`;
  exec(cmd, (e) => { if (e) console.log('Open this in your browser: ' + URL); });
}
// "localhost" resolves to 127.0.0.1 on some machines and ::1 (IPv6) on others (common on Windows) — listen on both.
// Loopback only: nothing on your network can reach it. IPv6 is optional (skipped quietly if the machine has none).
function listen(host) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.once('error', (e) => resolve({ host, err: e }));
    srv.listen(PORT, host, () => resolve({ host, srv }));
  });
}
(async () => {
  const [v4, v6] = await Promise.all([listen('127.0.0.1'), listen('::1')]);
  if (v4.err && v4.err.code === 'EADDRINUSE') {
    // most likely ERAVOS is already running — reuse it rather than moving to another port (saves are per address)
    console.log(`Port ${PORT} is already in use — ERAVOS is probably already running at ${URL}`);
    if (v6.srv) v6.srv.close();
    if (OPEN) openBrowser(); else process.exitCode = 1;
    return;
  }
  if (v4.err) { console.error('ERAVOS could not start: ' + v4.err.message); process.exitCode = 1; if (v6.srv) v6.srv.close(); return; }
  console.log(`ERAVOS is running at ${URL}${v6.srv ? '' : '  (IPv4 only)'}`);
  console.log('Keep this window open while you make music. Close it (or press Ctrl+C) to stop.');
  if (OPEN) openBrowser();
})();
