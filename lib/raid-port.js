'use strict';
/**
 * lib/raid-port.js — the one door to RAID for every system that is not Cortex. RAID is reached, never loaded.
 * comp_id: nexus.lib.raid-port
 * Map: docs/2026-10-24-guardian-into-cos-phasemap.spec GD_D0 / GD1 (decided by his axioms: §9.1 RAID is the only write authority for the
 * system's own decisions, §5.2 routing goes through RAID, §1.2 nothing fails silently, DB6 a capability is a route).
 *
 * James, 2026-10-24: "focus on just decoupling so we can get every system in a cos compartment. maybe start with one at a time? like guardian?"
 *
 * Why: Guardian required cortex/core/raid and ran _approveTool and _decide in its own process: a second RAID, with its own in-memory
 * health and weights, deciding beside Cortex's (and in a compartment it could not load at all). Through this port there is one RAID.
 *   in the Cortex process   Cortex provides RAID at boot (provide()), and the port calls it in-process
 *   in any other process    the port calls Cortex's routes (CORTEX_PORT, or Cortex's entry in lib/nexus-self/systems.js)
 * Approval FAILS CLOSED: if RAID cannot be asked, the answer is { approved: false, reason: 'RAID unreachable: …' }.
 * decide() and outcome() fail open and say so (a route choice falls back the way the caller already did; a lost outcome is logged).
 *
 *   provide({ approveTool, decide, outcome, listQueue })     Cortex's boot
 *   approveTool(source, command, opts)  → { approved, reason, ... }     POST /api/raid/approve-tool
 *   decide(intent)                      → { agent, reason, ... } | { ok: false, error }   GET /api/raid/decide?intent=
 *   outcome({ agent, ok, cluster, transport, ms })  → { ok, recorded } POST /api/raid/feedback (the route's own shape)
 *   listQueue({ n })                    → [row]                          GET /api/raid/queue
 *   via()                               → 'in-process' | 'route'
 */
const http = require('http');

const MODULE_ID = 'nexus.lib.raid-port';
const VERSION = '1.0.0';
let _impl = null;

function provide(impl) { const prev = _impl; _impl = impl || null; return prev; }
function via() { return _impl ? 'in-process' : 'route'; }

function _port() {
  if (process.env.CORTEX_PORT) return parseInt(process.env.CORTEX_PORT, 10);
  try { const s = require('./nexus-self/systems.js').get('cortex'); if (s && s.port) return s.port; } catch (_) {}
  return 3748;
}

function _call(method, p, body, timeoutMs = 15000) {
  const data = body == null ? null : JSON.stringify(body);
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: _port(), path: p, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, timeout: timeoutMs }, (res) => {
      let buf = ''; res.on('data', c => { buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (_) { resolve({ ok: false, error: `Cortex answered ${res.statusCode} with no JSON` }); } });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `RAID unreachable: Cortex did not answer ${p} in ${timeoutMs} ms` }); });
    req.on('error', (e) => resolve({ ok: false, error: `RAID unreachable: Cortex is not answering on :${_port()} (${e.code || e.message})` }));
    if (data) req.write(data);
    req.end();
  });
}

// only what can cross a process: a jaa handle or a function in opts stays behind (RAID in Cortex has its own store)
function _plain(opts) { const o = { ...(opts || {}) }; delete o.jaa; try { return JSON.parse(JSON.stringify(o)); } catch (_) { return {}; } }

async function approveTool(source, command, opts = {}) {
  if (_impl && _impl.approveTool) return _impl.approveTool(source, command, opts);
  const r = await _call('POST', '/api/raid/approve-tool', { source, command: String(command || '').slice(0, 2000), opts: _plain(opts) });
  if (r && typeof r.approved === 'boolean') return r;
  return { approved: false, source, reason: (r && r.error) || 'RAID unreachable: no answer' };   // fails closed
}

async function decide(intent) {
  if (_impl && _impl.decide) return _impl.decide(intent);
  return _call('GET', `/api/raid/decide?intent=${encodeURIComponent(String(intent || '').slice(0, 1000))}`, null, 5000);
}

async function outcome({ agent, ok, cluster = 'seam', transport, ms, fallbackReason } = {}) {
  if (_impl && _impl.outcome) return _impl.outcome({ agent, ok, cluster, transport, ms, fallbackReason });
  const r = await _call('POST', '/api/raid/feedback', { provider: agent, ok, cluster, transport, ms, fallbackReason }, 5000);
  if (!r || r.ok === false) console.warn(`[raid-port] outcome for ${agent} not recorded: ${(r && r.error) || 'no answer'}`);
  return r;
}

async function listQueue({ n = 50 } = {}) {
  if (_impl && _impl.listQueue) return _impl.listQueue({ n });
  const r = await _call('GET', `/api/raid/queue?n=${n}`, null, 5000);
  return (r && r.contracts) || [];
}

module.exports = { MODULE_ID, VERSION, provide, via, approveTool, decide, outcome, listQueue };
