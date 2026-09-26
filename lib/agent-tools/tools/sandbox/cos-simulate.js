'use strict';
/**
 * lib/agent-tools/tools/cos-simulate.js — copilot's access to COS's LLM
 * mental-simulation lab.
 * comp_id: nexus.lib.agent-tools.tools.cos-simulate
 * UUID: nexus-tool-cos-simulate-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P3 of docs/copilot-full-capability-phasemap.spec,
 * mental-simulation half). cos/playground/llm-lab.js's LabManager/LabSession
 * is real and complete — run a scenario (single/h2h head-to-head/loop
 * feedback/chain/stress) against a real provider, score/compare the result —
 * but needs a `dispatch: fn(provider, prompt) → {text, ms, jobId}` injected;
 * it has no opinion on how that dispatch happens (§8.6 composition). Reuses
 * the SAME real guardian job pattern lib/agent-tools/tools/browser-action.js
 * already uses (POST /command → poll /jobs) rather than inventing a second
 * dispatch path, adapted to LabSession's (provider, prompt) → {text,...}
 * shape instead of browser-action's (eventType, data) shape.
 *
 * §HONEST LIMIT — the compartment lifecycle half (cos-compartment.js) was
 * live-verified end to end this session because it's fully in-process, no
 * network needed. This tool's actual LLM dispatch CANNOT be live-verified
 * here — no guardian process running in this sandbox (confirmed
 * ECONNREFUSED on every other guardian-dependent tool tested this session).
 * The LabManager/LabSession wiring itself (config validation, session
 * creation/tracking) is verified; the live dispatch round-trip is not.
 */
const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

function _createGuardianJob(provider, prompt) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({ command: provider, provider, content: prompt }));
    const req = http.request({
      hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/command', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }, timeout: 20000,
    }, (res) => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve({ ok: false, error: `bad response from guardian: ${e.message}` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `could not reach guardian (:${GUARDIAN_PORT}): ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'guardian job submission timed out' }); });
    req.write(body); req.end();
  });
}

function _pollJob(jobId, deadlineMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.request({ hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/jobs?limit=200', method: 'GET', timeout: 5000 }, (res) => {
        let raw = ''; res.on('data', c => raw += c);
        res.on('end', () => {
          let parsed; try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
          const job = parsed?.jobs?.find(j => j.id === jobId);
          if (job?.status === 'complete') { resolve({ text: job.response?.text || job.response, ms: Date.now() - started, jobId }); return; }
          if (job?.status === 'error')    { resolve({ error: job.error || 'lab dispatch failed' }); return; }
          if (Date.now() - started > deadlineMs) { resolve({ error: `did not complete within ${deadlineMs}ms` }); return; }
          setTimeout(tick, 500);
        });
      });
      req.on('error', (e) => resolve({ error: `lost contact with guardian: ${e.message}` }));
      req.end();
    };
    tick();
  });
}

async function _dispatch(provider, prompt) {
  const created = await _createGuardianJob(provider, prompt);
  if (!created.ok && created.error) return { text: '', error: created.error };
  return _pollJob(created.jobId, 60000);
}

function _manager() {
  const { LabManager } = require('../../../../cos/playground/llm-lab.js');
  const { jaaDB } = require('../../../../cortex/memory/jaa-db.js');
  if (!_manager._instance) _manager._instance = new LabManager({ jaa: jaaDB, guardianDispatch: _dispatch });
  return _manager._instance;
}

const ACTIONS = {
  run: (a) => {
    if (!a.type) return { error: 'run needs type: single | h2h | loop | chain | stress' };
    if (!a.prompt) return { error: 'run needs prompt' };
    return _manager().run({ type: a.type, prompt: a.prompt, provider: a.provider, providerB: a.providerB, iterations: a.iterations, hypothesis: a.hypothesis });
  },
  stop: (a) => {
    if (!a.sessionId) return { error: 'stop needs sessionId' };
    _manager().stop(a.sessionId);
    return { ok: true };
  },
  get: (a) => {
    if (!a.sessionId) return { error: 'get needs sessionId' };
    const s = _manager().get(a.sessionId);
    return s ? { ok: true, id: s.id, status: s.status, results: s.results, iteration: s.iteration } : { ok: false, error: `no session ${a.sessionId}` };
  },
  list: () => ({ ok: true, sessions: _manager().listSessions() }),
  history: (a) => ({ ok: true, history: _manager().history(a.limit || 20) }),
};

module.exports = {
  name: 'cos_simulate',
  description:
    'Run a real LLM mental simulation before committing to a real action — a scenario against a real ' +
    'provider, scored and tracked. Actions: "run" (needs type: "single" one-shot, "h2h" compare two ' +
    'providers on the same prompt [providerB], "loop" feedback iterations [iterations], "chain" ' +
    'multi-step, "stress" repeated stress test; needs prompt; provider defaults to claude; optional ' +
    'hypothesis to record what you expect), "stop"/"get" (need sessionId), "list", "history". This ' +
    'dispatches a REAL job to a real provider through guardian — it costs real time/tokens, it is not free.',
  parameters: {
    type: 'object',
    properties: {
      action:     { type: 'string', enum: Object.keys(ACTIONS) },
      type:       { type: 'string', enum: ['single', 'h2h', 'loop', 'chain', 'stress'], description: 'for "run"' },
      prompt:     { type: 'string', description: 'for "run"' },
      provider:   { type: 'string', description: 'for "run" — default claude' },
      providerB:  { type: 'string', description: 'for "run" type h2h — the second provider to compare' },
      iterations: { type: 'number', description: 'for "run" type loop/stress' },
      hypothesis: { type: 'string', description: 'for "run" — what you expect, recorded for scoring' },
      sessionId:  { type: 'string', description: 'for stop/get' },
      limit:      { type: 'number', description: 'for "history" — default 20' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `cos_simulate ${args.action} failed: ${e.message}` }; }
  },
};
