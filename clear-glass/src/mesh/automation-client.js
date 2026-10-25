'use strict';
/**
 * clear-glass/src/mesh/automation-client.js — Clear Glass reaches the automation engine by PORT, not by require (AE1).
 * comp_id: cg.mesh.automation-client
 *
 * James, 2026-10-25: "the orchastrator" · "just make sure you dont couple anything."
 *
 * The engine moved to the orchestrator (it is the platform's, and each system is sovereign). Clear Glass no longer OWNS it —
 * it talks to the orchestrator's /automation/* door over a runtime port (:9000). This client keeps the exact method surface
 * agent-mesh exposed, so nothing that called mesh.listWorkflows()/runWorkflow()/… has to change:
 *   - reads (list/get/nextRunAt/getLog) are served SYNC from a small snapshot cache, refreshed over the port after every write
 *     and on a slow unref'd interval — so a down orchestrator degrades to a stale/empty list, never a crash (§1.2);
 *   - writes (create/update/remove/run/…steps/emitEvent) POST to the door and refresh the cache.
 * No static require crosses into the orchestrator (sovereignty): the only reach is this HTTP port.
 * Browser steps still run through Clear Glass — the orchestrator's engine calls back here (orchestrator/automation/index.js
 * _cg), so setHooks() here is a no-op: the hooks live with the engine now.
 */
const http = require('http');

const ORCH_PORT = parseInt(process.env.ORCHESTRATOR_PORT || '9000', 10);

function _call(method, path, body, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let data = null; try { data = body === undefined ? null : Buffer.from(JSON.stringify(body)); } catch (_) {}
    const req = http.request({ hostname: '127.0.0.1', port: ORCH_PORT, path, method, timeout: timeoutMs,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (res) => {
      let out = ''; res.setEncoding('utf8'); res.on('data', c => out += c);
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch (_) { resolve({ ok: false, error: `the orchestrator answered non-JSON (HTTP ${res.statusCode})` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `automation engine not reachable on :${ORCH_PORT} (${e.code || e.message}) — is the orchestrator up?` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `the orchestrator did not answer within ${Math.round(timeoutMs / 1000)} s` }); });
    if (data) req.write(data);
    req.end();
  });
}
const enc = encodeURIComponent;

class AutomationClient {
  constructor() { this._cache = []; this._timer = null; }
  async _refresh() { const r = await _call('GET', '/automation/workflows'); if (r && r.ok !== false && Array.isArray(r.workflows)) this._cache = r.workflows; return this._cache; }
  start() { this._refresh().catch(() => {}); if (!this._timer) { this._timer = setInterval(() => this._refresh().catch(() => {}), 15000); if (this._timer.unref) this._timer.unref(); } }
  stop() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
  setHooks() { /* the engine's hooks live in the orchestrator now (orchestrator/automation/index.js) */ }

  // reads — sync from the snapshot cache (the door's listView already carries nextRunAt)
  list() { return this._cache.slice(); }
  get(id) { return this._cache.find(w => w.id === id) || null; }
  find(idOrName) { return this.get(idOrName) || this._cache.find(w => String(w.name).toLowerCase() === String(idOrName || '').toLowerCase()) || null; }
  nextRunAt(wf) { const w = wf && (this.get(wf.id) || wf); return (w && w.nextRunAt) || null; }

  // writes — through the door, then refresh
  async create(fields) { const r = await _call('POST', '/automation/workflows', fields); await this._refresh().catch(() => {}); return r; }
  async update(id, patch) { const r = await _call('PATCH', `/automation/workflows/${enc(id)}`, patch); await this._refresh().catch(() => {}); return r; }
  async remove(id) { const r = await _call('DELETE', `/automation/workflows/${enc(id)}`); await this._refresh().catch(() => {}); return r; }
  async run(id, reason, opts) { return _call('POST', `/automation/workflows/${enc(id)}/run`, { reason, ...(opts || {}) }); }
  async getLog(limit, workflowId) { const r = await _call('GET', `/automation/log?limit=${limit || 50}${workflowId ? `&workflowId=${enc(workflowId)}` : ''}`); return (r && r.log) || []; }
  async addStep(id, step) { const r = await _call('POST', `/automation/workflows/${enc(id)}/steps`, { step }); await this._refresh().catch(() => {}); return r; }
  async updateStep(id, stepId, patch) { const r = await _call('PATCH', `/automation/workflows/${enc(id)}/steps/${enc(stepId)}`, patch); await this._refresh().catch(() => {}); return r; }
  async removeStep(id, stepId) { const r = await _call('DELETE', `/automation/workflows/${enc(id)}/steps/${enc(stepId)}`); await this._refresh().catch(() => {}); return r; }
  async moveStep(id, stepId, dir) { const r = await _call('POST', `/automation/workflows/${enc(id)}/steps/${enc(stepId)}/move`, { dir }); await this._refresh().catch(() => {}); return r; }
  async emitEvent(name, payload) { return _call('POST', `/automation/events/${enc(name)}`, payload || {}); }
  get automation() { return this; }
}

module.exports = { AutomationClient, createAutomationClient: () => new AutomationClient() };
