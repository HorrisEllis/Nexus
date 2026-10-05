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
            json(res, 200, { ok: true, models: (t.models || []).map(m => m.name), active: state.defaultModel });
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

  return false;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'GET', path: '/api/models' },
  { method: 'PUT', path: '/api/model', description: 'validated against ollama\'s real /api/tags before accepting' },
];
