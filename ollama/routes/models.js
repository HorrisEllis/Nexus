'use strict';
/**
 * ollama/routes/models.js
 * GET /api/models, PUT /api/model — matches registry-components.js: models.list
 */

const http   = require('http');
const config = require('../config.js');
const { state } = require('../lib/state.js');
const { json, readBody } = require('../lib/http-utils.js');

const OLLAMA_HOST = config.OLLAMA_HOST;

async function handle(req, res, { method, pathname }) {
  if (method === 'GET' && pathname === '/api/models') {
    const u = new URL(`${OLLAMA_HOST}/api/tags`);
    http.get(
      { hostname: u.hostname, port: u.port || 11434, path: u.pathname, timeout: config.HEALTH_CHECK_TIMEOUT_MS },
      r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try {
            const t = JSON.parse(d);
            // §0.39.364 — sizes and what Ollama holds now, for the memory-aware ladder (lib/resource-monitor fitsModel)
            const sizes = {}; for (const m of t.models || []) if (m && m.name) sizes[m.name] = Number(m.size) || null;
            require('../lib/model-inventory.js').inventory().then(inv => {
              json(res, 200, { ok: true, models: (t.models || []).map(m => m.name), active: state.defaultModel, sizes, loaded: inv.loaded });
            }).catch(() => json(res, 200, { ok: true, models: (t.models || []).map(m => m.name), active: state.defaultModel, sizes, loaded: [] }));
          } catch (_) {
            // §CT4 0.39.350 — not a guessed list: [defaultModel] here claimed a model was installed when Ollama never said so
            json(res, 200, { ok: false, models: [], active: state.defaultModel, error: 'Ollama answered /api/tags with something that is not JSON' });
          }
        });
      }
    ).on('error', () => json(res, 200, { ok: false, models: [], active: state.defaultModel }));
    return true;
  }

  // PUT /api/model — validated against what's ACTUALLY pulled before
  // accepting it, not just accepted blind: an override to a model that
  // was never pulled would fail loud on the NEXT generation request
  // instead of right here, where the operator can see it immediately.
  if (method === 'PUT' && pathname === '/api/model') {
    const body = await readBody(req);
    const wanted = (body.model || '').trim();
    if (!wanted) { json(res, 400, { ok: false, error: 'PUT /api/model requires {"model": "<real, exact tag>"}' }); return true; }
    const u = new URL(`${OLLAMA_HOST}/api/tags`);
    http.get(
      { hostname: u.hostname, port: u.port || 11434, path: u.pathname, timeout: config.HEALTH_CHECK_TIMEOUT_MS },
      r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          let installed = [];
          try { installed = (JSON.parse(d).models || []).map(m => m.name); } catch (_) {}
          if (!installed.includes(wanted)) {
            json(res, 409, { ok: false, error: `"${wanted}" is not in Ollama's real, installed model list — pull it first (ollama pull ${wanted})`, installed });
            return;
          }
          const previous = state.defaultModel;
          state.defaultModel = wanted;
          json(res, 200, { ok: true, active: state.defaultModel, previous, note: 'in-memory for this process only — ollama/config.js\'s own default is unchanged on the next boot' });
        });
      }
    ).on('error', (e) => json(res, 503, { ok: false, error: `couldn't verify against Ollama's real model list: ${e.message}` }));
    return true;
  }

  // 2026-11-18 (OL5a) — James: "no 30b for all of its steps per pipeline or request. then unload." A build tells Ollama a model's
  // work is done; Ollama frees its memory now (keep_alive 0) instead of holding it for OLLAMA_KEEP_ALIVE.
  if (method === 'POST' && pathname === '/api/models/unload') {
    const body = await readBody(req);
    const model = String((body && body.model) || '').trim();
    if (!model) { json(res, 400, { ok: false, error: 'POST /api/models/unload requires {"model": "<tag>"}' }); return true; }
    const r = await require('../lib/idle-unload.js').unloadNow(OLLAMA_HOST, model);
    json(res, r.ok ? 200 : 502, { ok: !!r.ok, model, why: r.ok ? 'unloaded (keep_alive 0)' : 'Ollama did not accept the unload' });
    return true;
  }

  return false;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'GET', path: '/api/models' },
  { method: 'PUT', path: '/api/model', description: 'validated against ollama\'s real /api/tags before accepting' },
  { method: 'POST', path: '/api/models/unload', description: 'free a model\'s memory now (keep_alive 0); a build calls it when that model\'s chunks are done (OL5a)' },
];
