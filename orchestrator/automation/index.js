'use strict';
/**
 * orchestrator/automation/index.js — the orchestrator's /automation/* door, forwarded to COS (AE6 slice a, 2026-11-08).
 * comp_id: nexus.orchestrator.automation-forward
 *
 * James, 2026-11-06: "Have cos be the orchastrator complelelt." · 2026-11-08: "orchastrator as the engine, which need to be cos now."
 * The engine moved to COS (cos/manager/automation-door.js). Saved pages and other systems that still call the orchestrator's :9000/automation/*
 * are forwarded to COS's /api/cos/automation/*, by route, never by a require (§5.9): no dead route (AE5). COS down → said, never pretended.
 * The orchestrator no longer runs an engine. This file replaces the 101-line host that lived here (now COS's), so no JavaScript was added.
 */
const http = require('http');
const COS_PORT = Number(process.env.COS_MANAGER_PORT) || 7799;

function handle({ method, url, body = {}, headers = {}, rawBody = '' } = {}) {
  const tail = String(url || '').replace(/^\/automation/, '');
  const data = method === 'GET' || method === 'HEAD' ? null : Buffer.from(rawBody || JSON.stringify(body || {}));
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: COS_PORT, path: `/api/cos/automation${tail}`, method, timeout: 30000,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': data.length } : {}), ...(headers['x-nexus-token'] ? { 'X-Nexus-Token': headers['x-nexus-token'] } : {}) } },
    (res) => { let out = ''; res.setEncoding('utf8'); res.on('data', c => out += c);
      res.on('end', () => { let b; try { b = JSON.parse(out); } catch (_) { b = { ok: false, error: `COS answered non-JSON (HTTP ${res.statusCode})` }; } resolve({ status: res.statusCode, body: b }); }); });
    req.on('error', (e) => resolve({ status: 503, body: { ok: false, error: `the automation engine is COS's now, and COS did not answer (${e.code || e.message}) — start COS` } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, body: { ok: false, error: 'COS did not answer within 30 s' } }); });
    if (data) req.write(data);
    req.end();
  });
}
// the orchestrator used to give the engine its event stream; COS streams the engine's events now, so there is nothing to wire here
function setBus() { return null; }

module.exports = { handle, setBus, COS_PORT };
