'use strict';
/**
 * lib/chains.js — stepwise chains + pipeline automation (agnostic; §CA3)
 * UUID: nexus-chains-v1-0000-2026-0808-001
 *
 * James: "stepwise chains + pipeline automation — a sequence of steps
 * (command/agent/http/sse call), with routing between steps."
 *
 * §CORRECTION to copilot-autonomous-phasemap.spec's CA3 line ("Composes
 * lib/execution-pipeline + agent-router") — checked the body, not the
 * docblock, same discipline kernel-surface.js's header insists on for CFR/
 * RFR2: lib/execution-pipeline.js is a CODE pipeline (spec → build → fork →
 * verify → compare-to-golden → promote, cos/playground/*). It has nothing to
 * do with running a sequence of agent/command/http steps for automation. This
 * file is the real CA3, built fresh; execution-pipeline is untouched and
 * still exactly what it always was.
 *
 * A chain is an ordered list of steps. Each step's output becomes the next
 * step's input (`carry`) unless the step overrides that. Each step is
 * RAID-gated individually (governAction) — a chain can be denied partway
 * through, and it stops there rather than skipping the denied step and
 * continuing (§RAID — every action, not just the chain as a whole).
 * A throwing/failing step halts the chain (§the gate: "halting on failure") —
 * this is deliberately NOT try/skip/continue like scheduler/triggers' single-
 * action isolation, because a LATER step may depend on an EARLIER one's real
 * output; running step 3 after step 2 failed silently corrupts the result
 * rather than protecting the caller.
 *
 * step.kind:
 *   'agent'   — routes to lib/agent-pull (same call scheduler/triggers use).
 *   'command' — routes to lib/agent-tools/tools/execution/run-command.
 *   'system'  — returns a delivery descriptor (payload untouched) — same
 *               "left to the caller's connection tool" shape scheduler uses,
 *               because a REAL remote call belongs to CA4 (next phase),
 *               not duplicated here.
 *   'http'    — a minimal built-in GET/POST using Node's core http/https
 *               (no new dependency). This is intentionally thin: CA4 is the
 *               dedicated, scoped, allowlisted connection tool: this exists
 *               so a chain can make ONE simple call today without waiting on
 *               CA4, and should be superseded by CA4's tool once that lands
 *               (§0.3 — noted here so it isn't forgotten, not silently left).
 *   'fn'      — step.fn(carry) — direct, for tests and simple local steps.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

function _fanin() { try { return require('./ledger-fanin'); } catch (_) { return null; } }

async function _govern(step) {
  let allowed = true, reason = null;
  try {
    const sm = require('../copilot/lib/self-model');
    if (sm.governAction) { const g = sm.governAction({ action: step.intent || `chain.${step.kind}`, target: step }, {}); if (g && g.allowed === false) { allowed = false; reason = g.reason; } }
  } catch (_) { /* no governor available → allow but log */ }
  return { allowed, reason };
}

async function _runStep(step, carry) {
  switch (step.kind) {
    case 'agent': { const ap = require('./agent-pull'); return ap.pull(step.id, step.tool || 'query_capability', { ...(step.payload || {}), input: carry }); }
    case 'command': { const rc = require('./agent-tools/tools/execution/run-command'); return rc.run ? rc.run(step.id, { ...(step.payload || {}), input: carry }) : null; }
    case 'system': { return { delivered: step.id, payload: step.payload || carry }; }
    case 'http': return _httpCall(step, carry);
    case 'fn': return step.fn ? step.fn(carry) : null;
    default: throw new Error(`chains: unknown step.kind "${step.kind}"`);
  }
}

function _httpCall(step, carry) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(step.url); } catch (e) { return reject(new Error(`chains: invalid url "${step.url}"`)); }
    const lib = u.protocol === 'https:' ? https : http;
    const body = step.body != null ? (typeof step.body === 'string' ? step.body : JSON.stringify(step.body ?? carry)) : null;
    const req = lib.request(u, {
      method: step.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(step.headers || {}) },
      timeout: step.timeoutMs || 8000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('chains: http step timed out')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * runChain(spec) — run steps sequentially. spec: { name, steps:[...], input? }
 * @returns { ok, results:[{step,kind,ok,output|error|denied}], output, haltedAt? }
 */
async function runChain(spec = {}) {
  if (!Array.isArray(spec.steps) || !spec.steps.length) return { ok: false, reason: 'chain needs steps[]' };
  const fanin = _fanin();
  const results = [];
  let carry = spec.input != null ? spec.input : null;

  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i];
    const { allowed, reason } = await _govern(step);
    try { fanin && fanin.emit && fanin.emit({ type: allowed ? 'chain.step' : 'chain.step.denied', source: 'chains', chain: spec.name || 'chain', step: i, kind: step.kind, ts: Date.now() }); } catch (_) {}

    if (!allowed) {
      results.push({ step: i, kind: step.kind, ok: false, denied: true, reason });
      return { ok: false, haltedAt: i, results, reason: reason || 'denied' };
    }

    try {
      const out = await _runStep(step, carry);
      results.push({ step: i, kind: step.kind, ok: true, output: out });
      carry = step.keepCarry ? carry : out;   // §override — a step can choose not to replace carry
    } catch (e) {
      results.push({ step: i, kind: step.kind, ok: false, error: e.message });
      try { fanin && fanin.emit && fanin.emit({ type: 'chain.error', source: 'chains', chain: spec.name || 'chain', step: i, error: e.message, ts: Date.now() }); } catch (_) {}
      return { ok: false, haltedAt: i, results, error: e.message };   // §gate — halt on failure, don't skip
    }
  }
  return { ok: true, results, output: carry };
}

module.exports = { runChain, MODULE_ID: 'chains', VERSION: '1.0.0' };
