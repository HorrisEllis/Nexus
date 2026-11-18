'use strict';
/**
 * ollama/routes/ollama-compat.js — Ollama's own API, served by the Ollama system under /ollama/ (OL5c, docs/2026-11-18-ollama-local-agent-phasemap.spec).
 * James, 2026-11-18: "i was using ollama in the background." · "yes but also the resource manager. and sigmas."
 * A client he points at http://127.0.0.1:3749/ollama (instead of :11434) is passed through to Ollama unchanged, streaming included; a call that runs a
 * model (chat, generate, embed, embeddings) waits its turn in the one line (lib/model-turns.js), so it no longer evicts a build's model and is
 * measured like every other turn. Everything else (tags, ps, show, pull, version) passes straight through.
 */
const http = require('http');
const config = require('../config.js');

const PREFIX = '/ollama';
const MODEL_CALLS = new Set(['/api/chat', '/api/generate', '/api/embed', '/api/embeddings']);

function readRaw(req) {
  return new Promise((resolve, reject) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); req.on('error', reject); });
}

// forward one request to Ollama and pipe its answer back; resolves when the answer has ended (the turn ends with it)
function forward(req, res, pathAndQuery, body) {
  return new Promise((resolve) => {
    let u; try { u = new URL(pathAndQuery, config.OLLAMA_HOST); } catch (e) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `Ollama's address is not a URL: ${e.message}` })); return resolve({ ok: false, error: e.message }); }
    const headers = { ...req.headers }; delete headers.host; if (body) headers['content-length'] = String(body.length);
    const up = http.request({ hostname: u.hostname, port: u.port || 11434, path: u.pathname + u.search, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
      r.on('end', () => resolve({ ok: (r.statusCode || 502) < 400, status: r.statusCode }));
      r.on('error', (e) => resolve({ ok: false, error: e.message }));
    });
    up.on('error', (e) => { if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `Ollama did not answer: ${e.code || e.message}` })); } resolve({ ok: false, error: e.code || e.message }); });
    req.on('close', () => { if (!res.writableEnded) up.destroy(); });   // the client went away: stop the model call too
    if (body && body.length) up.write(body);
    up.end();
  });
}

async function handle(req, res, { method, pathname }) {
  if (pathname !== PREFIX && !pathname.startsWith(PREFIX + '/')) return false;
  const inner = pathname.slice(PREFIX.length) || '/';
  const query = (req.url.indexOf('?') >= 0) ? req.url.slice(req.url.indexOf('?')) : '';
  const body = method === 'GET' || method === 'HEAD' ? null : await readRaw(req);
  if (method === 'POST' && MODEL_CALLS.has(inner)) {
    let model = null; try { model = JSON.parse(body.toString('utf8')).model || null; } catch (_) {}
    const caller = String(req.headers['user-agent'] || 'a client').slice(0, 60);
    try {
      await require('../lib/model-turns.js').shared().run(model || 'unknown', { caller, door: `ollama${inner}` }, async () => {
        const r = await forward(req, res, inner + query, body);
        if (!r.ok) throw new Error(r.error || `Ollama answered ${r.status}`);
        return r;
      });
    } catch (_) { /* the answer (or its error) has already gone back to the client; the turn recorded it */ }
    return true;
  }
  await forward(req, res, inner + query, body);
  return true;
}

module.exports = { handle, PREFIX };
module.exports.commands = [
  { method: 'POST', path: '/ollama/api/chat', description: 'Ollama\'s own chat API, through the Ollama system\'s one line (OL5c): point a client at http://127.0.0.1:3749/ollama' },
  { method: 'GET', path: '/ollama/api/tags', description: 'Ollama\'s own API, passed through (OL5c)' },
];
