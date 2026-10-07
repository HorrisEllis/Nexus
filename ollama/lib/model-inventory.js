'use strict';
/**
 * ollama/lib/model-inventory.js — what Ollama has installed (with sizes) and what it holds in memory now. §0.39.364
 *
 * James's console, 2026-10-06:
 *   bridge job b08eba1d (ask) · deepseek-coder-v2 · FAILED: ollama HTTP 404 for model "deepseek-coder-v2"
 * while deepseek-coder-v2:16b-lite-instruct-q4_K_M was installed. A name with no tag means ":latest" to Ollama, and
 * nothing was pulled under that. resolve() maps a name to the installed tag it means: exact, then the same name in
 * another case, then the one installed tag of that name. Two or more candidates, or none: the name as given, so
 * Ollama's own error says what is missing (never a guessed model).
 *
 * inventory() -> { ok, models: [{ name, size }], loaded: [{ name, size }] } — /api/tags and /api/ps, cached 15 s. The
 * sizes are what a memory-aware ladder needs (lib/resource-monitor.js fitsModel).
 */
const http = require('http');
const config = require('../config.js');

const TTL_MS = 15000;
let _cache = null;

function _get(pathname, timeout = 4000) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(pathname, config.OLLAMA_HOST); } catch (_) { resolve(null); return; }
    const req = http.get({ hostname: u.hostname, port: u.port || 11434, path: u.pathname, timeout }, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function inventory({ fresh = false } = {}) {
  if (!fresh && _cache && Date.now() - _cache.at < TTL_MS) return _cache.value;
  const [tags, ps] = await Promise.all([_get('/api/tags'), _get('/api/ps')]);
  const value = {
    ok: !!(tags && Array.isArray(tags.models)),
    models: ((tags && tags.models) || []).map((m) => ({ name: m.name, size: Number(m.size) || null })),
    loaded: ((ps && ps.models) || []).map((m) => ({ name: m.name, size: Number(m.size) || null })),
  };
  _cache = { at: Date.now(), value };
  return value;
}

/** pick(model, names) — pure: the installed tag a name means, or the name unchanged */
function pick(model, names = []) {
  const want = String(model || '').trim();
  if (!want || !names.length || names.includes(want)) return want;
  const lower = want.toLowerCase();
  const sameCase = names.filter((n) => n.toLowerCase() === lower);
  if (sameCase.length === 1) return sameCase[0];
  const base = lower.includes(':') ? null : lower;
  if (!base) return want;
  const tagged = names.filter((n) => n.toLowerCase().split(':')[0] === base);
  return tagged.length === 1 ? tagged[0] : want;
}

async function resolve(model) {
  if (!model) return model;
  const inv = await inventory();
  return inv.ok ? pick(model, inv.models.map((m) => m.name)) : model;
}

module.exports = { inventory, resolve, pick, TTL_MS };
