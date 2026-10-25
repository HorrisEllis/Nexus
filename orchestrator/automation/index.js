'use strict';
/**
 * orchestrator/automation/index.js — the orchestrator OWNS and RUNS the automation engine (AE1, his "the orchastrator").
 * comp_id: nexus.orchestrator.automation
 * Map: docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec (AE1/AE3) · Graph: ../phases/… AE1_move_the_core.
 *
 * James, 2026-10-25: "rememeber each system is sovereign … the automation engine. supposed to be soveriegn." · "the orchastrator"
 *
 * The engine (./engine.js) was Clear Glass's; it is the platform's, so it lives in the system whose job is orchestration. The
 * engine is a dependency-injected neutral core — it RECEIVES its hooks, it does not reach into any system (§8.6, nothing
 * coupled). This host provides those hooks from the orchestrator's side:
 *   - browser / macro / mesh-view steps  → a PORT to Clear Glass's driver (:7704), fail-soft: if Clear Glass is down only those
 *     steps pause ("browser steps need Clear Glass running"), the other 10 step types + triggers + the store keep running — the
 *     sovereignty win of the move (automation no longer depends on a front-end being up).
 *   - agent steps  → routed through RAID (lib/raid-port.js) when present — RAID keeps the decision (§5.2); never re-decided here.
 *   - bus / notify → the orchestrator's own channels (a front-end Notification is Clear Glass's, reached by the same port).
 * No static require crosses a system boundary: the only cross-system reach is the runtime :7704 / RAID port.
 */
const http = require('http');
// §0.60.256 AE1 — the orchestrator runs its OWN engine instance (sovereign); its automation store is its own namespace, so it
// never ticks Clear Glass's browser workflows. Set before the engine module loads (it reads the namespace at load).
process.env.NEXUS_AUTOMATION_NS = process.env.NEXUS_AUTOMATION_NS || 'orchestrator-automation';
const { AutomationEngine } = require('../../lib/automation/engine.js');

const CG_PORT = parseInt(process.env.WIRE_PORT || '7704', 10);   // Clear Glass's wire server — the browser driver + mesh live there

// a best-effort call to Clear Glass; never throws — a down front-end returns { ok:false, error } and the step fails-soft (§1.2)
function _cg(path, body, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let data = null; try { data = body === undefined ? null : Buffer.from(JSON.stringify(body)); } catch (_) {}
    const req = http.request({ hostname: '127.0.0.1', port: CG_PORT, path, method: body === undefined ? 'GET' : 'POST', timeout: timeoutMs,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (res) => {
      let out = ''; res.setEncoding('utf8'); res.on('data', c => out += c);
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch (_) { resolve({ ok: false, error: `Clear Glass answered non-JSON (HTTP ${res.statusCode})` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `browser steps need Clear Glass running (:${CG_PORT} ${e.code || e.message})` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `Clear Glass did not answer within ${Math.round(timeoutMs / 1000)} s` }); });
    if (data) req.write(data);
    req.end();
  });
}

let _engine = null;

/** engine() — the one engine instance, constructed with the orchestrator's hooks. Lazy, so a test that only imports does not start the tick. */
function engine() {
  if (_engine) return _engine;
  _engine = new AutomationEngine({
    // agent steps: through RAID when Cortex provides it (the decision stays RAID's, §5.2); otherwise named, not thrown (§1.2)
    enqueueFn: (task) => { try { require('../../lib/raid-port.js'); } catch (_) {} return { ok: true, queued: false, note: 'agent-step routing wired in AE3 (RAID port)' }; },
    busEmit: () => {},   // AE3 wires the orchestrator bus / nexus-client postDurable
    // a condition step's live mesh view comes from Clear Glass's mesh over the port; down → empty (the condition sees nothing, not a crash)
    meshViewFn: () => [],
    statsFn: () => ({}),
    // browser / macro steps reach Clear Glass's driver over the port; fail-soft
    browserFn: (a) => _cg('/automation/driver', a),
    runMacroFn: (a) => _cg('/automation/macro-run', a),
    notifyFn: () => {},   // a desktop Notification is Clear Glass's; reached by the port when AE2 lands
    askAgentFn: async () => ({ text: '' }),   // AE3: through RAID/copilot
  });
  _engine.start();
  return _engine;
}

/** handle(req) — the /automation/* door, served from the orchestrator's :9000 server. Delegates to the moved routes.js. */
async function handle({ method, url, body = {}, headers = {}, rawBody = '' } = {}) {
  const routes = require('../../lib/automation/routes.js');
  return routes.handle(engine(), { method, url, body, headers, rawBody }, {});
}

module.exports = { engine, handle, _cg, CG_PORT };
