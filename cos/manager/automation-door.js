'use strict';
/**
 * cos/manager/automation-door.js — COS OWNS and RUNS the automation engine (AE6 slice a, his "Have cos be the orchastrator complelelt").
 * comp_id: nexus.cos.automation
 * James, 2026-11-06: "Cos I feel like. Have cos be the orchastrator complelelt." (AE_D3, superseding AE_D1 "the orchastrator") · 2026-11-08:
 * "Automation needs done, orchastrator as the engine, which need to be cos now." Moved here from orchestrator/automation/index.js (git mv):
 * COS's manager serves it at /api/cos/automation/* and streams its run events; the orchestrator's /automation/* forwards here. The engine's
 * files stay in lib/automation/ until Clear Glass stops running its own copy (AE5), then move into cos/automation/ (AE6 slice b).
 * 0.60.534 SW5i slice a (expands AE6 slice b, order flipped): moved now, by git mv, to cos/automation/; lib/automation/ keeps forwarders
 * until Clear Glass reaches COS by route. James, 2026-11-14: "migrating brainos backed not the ui".
 * Its store keeps the namespace 'orchestrator-automation', so no workflow written before the move is lost (§0.3); a rename comes with a
 * migration, never by a silent new namespace.
 * (History, kept: this door was the orchestrator's from 0.60.256 to 0.60.448.)
 * Map: docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec (AE1 done 0.60.256; AE3 wired 0.60.317) · Graph: ../phases/… AE1_move_the_core.
 *
 * James, 2026-10-25: "rememeber each system is sovereign … the automation engine. supposed to be soveriegn." · "the orchastrator"
 * 2026-10-30: "need to finish the automation in orchestrator."
 *
 * The engine (cos/automation/engine.js; was lib/automation/engine.js) is the platform's, run by the system whose job is orchestration. It is a dependency-
 * injected neutral core — it RECEIVES its hooks and never reaches into a system (§8.6). This host provides those hooks from the
 * orchestrator's side, each a RUNTIME PORT (no static cross-system require), fail-soft (§1.2):
 *   - agent steps   → RAID DECIDES the provider (lib/raid-port.js, §5.2 — the decision stays RAID's), then the task is dispatched
 *                     to GUARDIAN (:7820 /command), the orchestrator's existing runner. A down RAID → the step's own agentKey is
 *                     the provider; a down Guardian → the step fails-soft with the reason, the rest of the workflow keeps running.
 *   - browser/macro → a PORT to Clear Glass's driver (:7704); down → only those steps pause (the sovereignty win of the move).
 *   - bus           → the orchestrator injects its own event stream with setBus() at boot; until then events are dropped, not thrown.
 * AE3 wiring (0.60.317): agent dispatch + the real bus. AE2 (Clear Glass serving :7704) and AE5 (the automation UI) remain his-machine.
 */
const http = require('http');
// §0.60.256 AE1 — one engine instance, its store its own namespace, set before the engine loads (AE6: the same namespace, now run by COS).
process.env.NEXUS_AUTOMATION_NS = process.env.NEXUS_AUTOMATION_NS || 'orchestrator-automation';
const { AutomationEngine } = require('../automation/engine.js');

const CG_PORT = parseInt(process.env.WIRE_PORT || '7704', 10);         // Clear Glass's wire server (browser driver + mesh)
const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820', 10); // Guardian — the agent runner

// a best-effort JSON call to a local port; never throws — a down peer returns { ok:false, error } so the step fails-soft (§1.2)
function _port(port, path, body, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let data = null; try { data = body === undefined ? null : Buffer.from(JSON.stringify(body)); } catch (_) {}
    const req = http.request({ hostname: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST', timeout: timeoutMs,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (res) => {
      let out = ''; res.setEncoding('utf8'); res.on('data', c => out += c);
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch (_) { resolve({ ok: false, error: `peer answered non-JSON (HTTP ${res.statusCode})` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `${e.code || e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `no answer within ${Math.round(timeoutMs / 1000)} s` }); });
    if (data) req.write(data);
    req.end();
  });
}
const _cg       = (path, body, ms) => _port(CG_PORT, path, body, ms).then(r => (r && r.error && /ECONN|ENOTFOUND|no answer/.test(r.error)) ? { ok: false, error: `browser steps need Clear Glass running (:${CG_PORT} ${r.error})` } : r);
const _guardian = (path, body, ms) => _port(GUARDIAN_PORT, path, body, ms).then(r => (r && r.error && /ECONN|ENOTFOUND|no answer/.test(r.error)) ? { ok: false, error: `agent steps need Guardian running (:${GUARDIAN_PORT} ${r.error})` } : r);

const IDEARIUM_PORT = parseInt(process.env.IDEARIUM_PORT || '4800', 10); // Idearium — the procedures' library (PC2)
const _idearium = (path, body, ms) => _port(IDEARIUM_PORT, path, body, ms).then(r => (r && r.error && /ECONN|ENOTFOUND|no answer/.test(r.error)) ? { ok: false, error: `procedure steps need Idearium running (${r.error})` } : r);

// RAID keeps the routing decision (§5.2); a down RAID is not an error here — the step's own agentKey stands in.
async function _raidDecide(intent) {
  try { const raid = require('../../lib/raid-port.js'); return await raid.decide(intent); } catch (_) { return null; }
}

/**
 * _dispatchAgent(task, deps) — an automation 'agent' step: RAID decides the provider, GUARDIAN runs it. Fail-soft.
 *   task = { agentKey, prompt, accountId? }
 *   deps = { guardianFn, raidDecideFn, awaitReply }  (injectable, so this is tested without a running Guardian/RAID)
 */
async function _dispatchAgent(task, { guardianFn = _guardian, raidDecideFn = _raidDecide, awaitReply = false } = {}) {
  if (!task || !task.agentKey) return { ok: false, error: 'an agent step needs an agentKey' };
  let provider = task.agentKey, command = 'chat';
  // PC8 slice a (2026-11-10, his "record each step in raids decision, dynamically building each step, as it goes"): RAID's decision is kept and
  // handed back with the answer, so the run shows it as a step; RAID down is said in the decision, never hidden.
  const decision = { by: 'raid', kind: 'agent.provider', asked: task.agentKey, chose: task.agentKey, command, why: null, at: Date.now() };
  try { const d = await raidDecideFn({ kind: 'agent', agentKey: task.agentKey, prompt: task.prompt, cluster: 'automation' });
        if (d && d.ok !== false) { if (d.provider) provider = d.provider; if (d.command) command = d.command; decision.why = d.why || d.reason || d.rationale || null; }
        else decision.why = (d && (d.error || d.why)) || 'RAID did not answer: the step kept the agent it asked for'; } catch (e) { decision.why = `RAID did not answer (${e.message}): the step kept the agent it asked for`; }
  decision.chose = provider; decision.command = command;
  const r = await guardianFn('/command', { provider, command, prompt: task.prompt || '', ...(task.accountId ? { accountId: task.accountId } : {}) }, awaitReply ? 120000 : 20000);
  return r && typeof r === 'object' ? { ...r, decision } : { result: r, decision };
}

// §AE3 — the host injects its own event stream (setBus): COS's manager streams them on /api/cos/events; until then events are dropped, never thrown.
let _busFn = null;
function setBus(fn) { _busFn = typeof fn === 'function' ? fn : null; return _busFn; }

/** buildHooks(deps) — the engine's hook set, from COS's side. deps injectable for tests. */
function buildHooks({ guardianFn = _guardian, raidDecideFn = _raidDecide, cgFn = _cg, idFn = _idearium, busFn = null } = {}) {
  const bus = busFn || ((type, data) => { try { if (_busFn) _busFn(type, data); } catch (_) {} });
  return {
    // agent step, fire-and-forget: dispatch in the background, return at once so the engine does not block
    enqueueFn: (task) => { Promise.resolve(_dispatchAgent(task, { guardianFn, raidDecideFn })).catch(() => {}); return { ok: true, queued: true, agentKey: task && task.agentKey }; },
    // agent step, awaited: RAID → Guardian, and hand back the reply text (empty + reason when Guardian has none yet / is down)
    askAgentFn: async (task) => { const r = await _dispatchAgent(task, { guardianFn, raidDecideFn, awaitReply: true });
      const text = (r && (r.reply || r.text || r.output || (r.result && r.result.text))) || '';
      const decision = r && r.decision;   // PC8 slice a: RAID's decision travels with the answer
      return r && r.error ? { text, error: r.error, decision } : { text, decision }; },
    busEmit:   (type, data) => bus(type, data),
    browserFn: (a) => cgFn('/automation/driver', a),
    runMacroFn:(a) => cgFn('/automation/macro-run', a),
    meshViewFn:() => [],          // a condition's live mesh view is Clear Glass's; down → sees nothing, not a crash
    statsFn:   () => ({}),
    notifyFn:  () => {},          // a desktop Notification is Clear Glass's, reached by the port (AE2)
    // PC2 — a procedure step runs in Idearium, by its route (POST /api/procedures/:id/run); Idearium down → the step says so
    procedureFn: ({ id, yes, chain }) => idFn(`/api/procedures/${encodeURIComponent(id)}/run`, { yes: !!yes, chain }, 120000),
  };
}

// the api step's nexus://<system>: COS's manager gives the address of each system it declares (setResolver at boot)
let _resolver = null;
function setResolver(fn) { _resolver = typeof fn === 'function' ? fn : null; return _resolver; }
// PC5 (2026-11-09) — a typed gate is decided by COS's gates (cos/pipeline/gates.js → Emerge's cos/pipeline/gate.eg), given at boot
let _gateHost = null;
function setGate(fn) { _gateHost = typeof fn === 'function' ? fn : null; return _gateHost; }
// 2026-11-09 — a framework step: COS's pipeline module compiles the framework (and those it runs) and names the pipeline
let _frameworkHost = null;
function setFramework(fn) { _frameworkHost = typeof fn === 'function' ? fn : null; return _frameworkHost; }

let _engine = null;
/** engine() — the one engine instance, built with COS's real hooks. Lazy, so a bare import does not start the tick. */
function engine() {
  if (_engine) return _engine;
  _engine = new AutomationEngine({ ...buildHooks(), resolveSystemFn: (name) => (_resolver ? _resolver(name) : null), gateFn: (q) => (_gateHost ? _gateHost(q) : { outcome: 'closed', open: false, why: 'COS gave the engine no gates', saw: [], actions: [] }), frameworkFn: (q) => (_frameworkHost ? _frameworkHost(q) : { ok: false, error: 'COS gave the engine no frameworks' }) });
  _engine.start();
  return _engine;
}

/** handle(req) — the /automation/* door, served by COS's manager at /api/cos/automation/*. Delegates to the engine's routes.js. */
async function handle({ method, url, body = {}, headers = {}, rawBody = '' } = {}) {
  return require('../automation/routes.js').handle(engine(), { method, url, body, headers, rawBody }, {});
}

module.exports = { engine, handle, buildHooks, setBus, setResolver, setGate, setFramework, _dispatchAgent, _cg, _guardian, _raidDecide, CG_PORT, GUARDIAN_PORT };
