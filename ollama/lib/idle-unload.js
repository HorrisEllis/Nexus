'use strict';
/**
 * ollama/lib/idle-unload.js — 0.60.123 MP — a model nobody is using does not hold the machine's memory under pressure.
 *
 * James (2026-10-13): "can we fix the memory issue. all of the resource optimization as possible. also failure modes are
 * to prevent problems not solutionsn". His log fell to 0.1% free with a 7b model resident (Ollama keeps a model loaded
 * for 5 min after its last request; a 7b coder is ~5 GB). Here, when memory is not ok (or a recent crisis left no
 * headroom, lib/prevention.js) and the bridge has no job running or queued, and none ended in the last idleMs, each
 * loaded model is told to unload now (Ollama's own keep_alive: 0). The next request loads it again.
 *
 *   createIdleUnload({ loaded, unload, busy, lastActivity, allowed, idleMs, log }) → { tick }   (all injected: testable)
 *   startIdleUnload({ state, config })   → the real one, every 30 s, in the bridge process
 */
const http = require('http');

const VERSION = '1.0.0';

function createIdleUnload({ loaded, unload, busy, lastActivity, allowed, idleMs = 60000, log = console.log, now = () => Date.now() }) {
  let said = new Set();
  async function tick() {
    const a = allowed();
    if (a.ok) { said = new Set(); return { unloaded: [], why: 'memory ok' }; }
    if (busy()) return { unloaded: [], why: 'a job is running or queued' };
    if (now() - (lastActivity() || 0) < idleMs) return { unloaded: [], why: 'a job ended under a minute ago' };
    const models = (await loaded()) || [];
    const out = [];
    for (const m of models) {
      const r = await unload(m.name);
      if (r && r.ok) { out.push(m.name); if (!said.has(m.name)) { said.add(m.name); log(`[ollama-bridge] unloaded ${m.name}${m.size ? ` (${Math.round(m.size / 1e8) / 10} GB)` : ''} — idle while ${a.why}; it loads again on its next request`); } }
    }
    return { unloaded: out, why: a.why };
  }
  return { tick };
}

function _post(host, body, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let u; try { u = new URL('/api/generate', host); } catch (_) { return resolve({ ok: false }); }
    const data = JSON.stringify(body);
    const req = http.request({ hostname: u.hostname, port: u.port || 11434, path: u.pathname, method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => { res.resume(); res.on('end', () => resolve({ ok: res.statusCode < 400 })); });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.on('error', () => resolve({ ok: false }));
    req.end(data);
  });
}

function startIdleUnload({ state, config, intervalMs = 30000 }) {
  const MI = require('./model-inventory.js');
  const P = require('../../lib/prevention.js');
  const lastActivity = () => Math.max(0, ...[...(state.complete || [])].map(j => j.completedAt || j.endedAt || j.finishedAt || 0));
  const u = createIdleUnload({
    loaded: async () => (await MI.inventory({ fresh: true })).loaded,
    unload: (model) => _post(config.OLLAMA_HOST, { model, keep_alive: 0 }),
    busy: () => state.running.size > 0 || state.queue.length > 0,
    lastActivity,
    allowed: () => P.heavyAllowedHere('ollama-bridge'),
  });
  const t = setInterval(() => { u.tick().catch(() => {}); }, intervalMs);
  if (t.unref) t.unref();
  return u;
}

module.exports = { VERSION, createIdleUnload, startIdleUnload };
