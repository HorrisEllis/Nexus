'use strict';
// SANDBOX 2026-09-28 — spawns a real orchestrator process; inherits a throwaway data root from lib/test-sandbox.js.
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-c1-compound-failure-mode.test.js — C1 (docs/2026-09-28-staging-self-heal-phasemap.spec)
 * UUID: test-c1-compound-failure-mode-v1-0000-2026-0928-001
 *
 * "Compound hooks into failure-mode enrichment." D2=a: cortex (a different process
 * from the per-system ledgers) asks the orchestrator over
 * GET /cfr/compound/:uuid?system=<s>.
 *
 * Two kinds of case, kept honest about which is which:
 *   REAL   — C1-8..C1-12 spawn the real orchestrator, drive real ledger entries through
 *            POST /cfr/emit, and call the DEFAULT fetcher (real HTTP) — nothing mocked.
 *   INJECT — C1-1..C1-7 pin the mapping/storage rules (I8/I9/I10) with an injected
 *            fetcher, the same way enrichFailureMode receives gatherContext.
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawn } = require('child_process');

const PORT = 19534;
const BASE = `http://127.0.0.1:${PORT}`;
// cortex/config.js reads ORCH_URL at require time; set it before anything requires it.
process.env.ORCH_URL = BASE;

let passed = 0, failed = 0;
const _registry = [];
function test(id, desc, fn) { _registry.push({ id, desc, fn }); }

async function runAll() {
  for (const { id, desc, fn } of _registry) {
    try { await fn(); console.log(`   ${id} ${desc}`); passed++; }
    catch (e) { console.error(`   ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  process.stdout.write(`\n  test-c1-compound-failure-mode.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

const ORCH_PATH = path.join(__dirname, '../../orchestrator/orchestrator.js');
const REPO_ROOT = path.join(__dirname, '../..');

function httpJSON(method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(url, { method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try { const r = await httpJSON('GET', `${BASE}/cfr/health`); if (r.status === 200) return; }
    catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`orchestrator /cfr/health never came up: ${lastErr && lastErr.message}`);
}

let child;
async function boot() {
  child = spawn('node', [ORCH_PATH], {
    cwd: REPO_ROOT,
    env: { ...process.env, ORCHESTRATOR_PORT: String(PORT), NEXUS_BIND_HOST: '127.0.0.1' },
  });
  child.stderr.on('data', () => {});
  await waitForHealth();
}
function shutdown() { if (child && !child.killed) child.kill('SIGTERM'); }

const forensics = require('../../cortex/self-heal/failure-mode-forensics.js');
const { computeCompound, enrichFailureMode, generateDebugMacro } = forensics;

const ANCHOR = { ledgerSystem: 'orchestrator', entryUuid: 'entry-under-test' };

// ── INJECT: mapping + storage rules ─────────────────────────────────────────

test('C1-1', 'no anchor → status unavailable with a reason, the fetcher is never called (I9)', async () => {
  let called = 0;
  const fetcher = async () => { called++; return { ok: true, class: 'ripple', record: null }; };
  for (const anchor of [null, undefined, {}, { ledgerSystem: 'orchestrator' }, { entryUuid: 'x' }]) {
    const c = await computeCompound(anchor, fetcher);
    assert.strictEqual(c.status, 'unavailable', `anchor ${JSON.stringify(anchor)} must be unavailable`);
    assert.ok(/no anchor/.test(c.reason), `reason must say why: ${c.reason}`);
    assert.strictEqual(c.class, null, 'unavailable must never carry a class (never a ripple, I8)');
  }
  assert.strictEqual(called, 0, 'without a full (ledgerSystem, entryUuid) pair nothing may be looked up');
});

test('C1-2', 'lookup { ok:false, error } → unavailable carrying the error, class null', async () => {
  const c = await computeCompound(ANCHOR, async () => ({ ok: false, error: 'entry not found' }));
  assert.strictEqual(c.status, 'unavailable');
  assert.strictEqual(c.reason, 'entry not found');
  assert.strictEqual(c.class, null);
  assert.deepStrictEqual(c.anchor, ANCHOR, 'the anchor that was tried stays on the record');
});

test('C1-3', 'a fetcher that throws → unavailable, computeCompound never throws (I8)', async () => {
  const c = await computeCompound(ANCHOR, async () => { throw new Error('boom'); });
  assert.strictEqual(c.status, 'unavailable');
  assert.ok(/boom/.test(c.reason));
});

test('C1-4', 'ripple → analyzed, class ripple, factors/progressions null (a ripple has no CausalRecord)', async () => {
  const c = await computeCompound(ANCHOR, async () => ({ ok: true, class: 'ripple', record: null }));
  assert.strictEqual(c.status, 'analyzed');
  assert.strictEqual(c.class, 'ripple');
  assert.strictEqual(c.factors, null);
  assert.strictEqual(c.sigmaProgression, null);
  assert.strictEqual(c.rootUuid, null);
});

test('C1-5', 'wave record → analyzed with factors, progressions, peakSigma and the chain TRUE ROOT uuid', async () => {
  const record = {
    class: 'wave', peakSigma: 0.52,
    sigmaProgression: [0.1, 0.4, 0.52], deltaProgression: [0, 0.2, 0.3],
    compoundingFactors: [{ name: 'sigma-acceleration' }],
    rootCause: { uuid: 'true-root-uuid', type: 't' },
  };
  const c = await computeCompound(ANCHOR, async () => ({ ok: true, class: 'wave', record }));
  assert.strictEqual(c.status, 'analyzed');
  assert.strictEqual(c.class, 'wave');
  assert.deepStrictEqual(c.factors, [{ name: 'sigma-acceleration' }]);
  assert.deepStrictEqual(c.sigmaProgression, [0.1, 0.4, 0.52]);
  assert.deepStrictEqual(c.deltaProgression, [0, 0.2, 0.3]);
  assert.strictEqual(c.peakSigma, 0.52);
  assert.strictEqual(c.rootUuid, 'true-root-uuid', 'analyzeChain walks to the true root; the record must say which');
  assert.notStrictEqual(c.rootUuid, ANCHOR.entryUuid);
});

test('C1-6', 'debug_macro carries compoundClass ONLY when analyzed', async () => {
  const cleanup = trackNodeFiles();
  try {
    const ctx = { conditions: [{ type: 'a', ts: 1 }], root: { uuid: 'r' } };
    const analyzed = generateDebugMacro('cfr.collapse', 'gap-1', ctx, 'fm-1', { status: 'analyzed', class: 'wave' });
    const unavailable = generateDebugMacro('cfr.collapse', 'gap-1', ctx, 'fm-2', { status: 'unavailable', class: null });
    const none = generateDebugMacro('cfr.collapse', 'gap-1', ctx, 'fm-3');
    assert.strictEqual(analyzed.payload.compoundClass, 'wave');
    assert.ok(!('compoundClass' in unavailable.payload), 'unavailable must add nothing to the macro');
    assert.ok(!('compoundClass' in none.payload), 'omitting compound must leave the macro exactly as before');
  } finally { cleanup(); }
});

test('C1-7', 'enrichFailureMode stores compound under its OWN key; system-wide sigma keys stay flat and separate (I10)', async () => {
  const cleanup = trackNodeFiles();
  const { jaaDB } = require('../../cortex/memory/jaa-db');
  const entryUuid = `c1-fm-${Date.now()}`;
  try {
    jaaDB.insert('failure_modes', { uuid: entryUuid, faultClass: 'cfr.collapse', gapUuid: 'gap-c1', friction: 1, enteredAt: Date.now(), source: 'test' });
    const gather = async () => ({ root: null, conditions: [{ type: 'x', ts: 1 }], siblingDanglingHooks: [], anchor: ANCHOR });
    const fetcher = async () => ({ ok: true, class: 'ripple', record: null });
    const r = await enrichFailureMode('cfr.collapse', 'gap-c1', entryUuid, gather, fetcher);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.compound.status, 'analyzed');
    const row = jaaDB.get('failure_modes', { uuid: entryUuid });
    assert.ok(row.compound && row.compound.class === 'ripple', 'compound must be on the failure_modes row');
    for (const k of ['sigmaBefore', 'sigmaAtEntry', 'sigmaDelta']) assert.ok(k in row, `system-wide key ${k} must still be stored as before`);
    assert.ok(!('class' in row) && !('factors' in row), 'compound fields must not leak onto the row top level');
    // and with NO anchor the row is still enriched — honestly unavailable, never a guessed ripple
    const entry2 = `${entryUuid}-b`;
    jaaDB.insert('failure_modes', { uuid: entry2, faultClass: 'x', gapUuid: 'gap-c1b', enteredAt: Date.now(), source: 'test' });
    await enrichFailureMode('x', 'gap-c1b', entry2, async () => ({ conditions: [], anchor: null }), fetcher);
    const row2 = jaaDB.get('failure_modes', { uuid: entry2 });
    assert.strictEqual(row2.compound.status, 'unavailable');
    assert.strictEqual(row2.compound.class, null);
  } finally { cleanup(); }
});

test('C1-1b', '_gatherFailureContext takes the anchor ONLY from the explicit pair on the gap (I9), never from source', async () => {
  const gapField = require('../../lib/gap-field');
  const selfHeal = require('../../cortex/self-heal/index.js');
  const tag = `c1-${Date.now()}`;
  const withPair = gapField.report({ type: `c1.anchored.${tag}`, body: 'x', source: 'cfr.ledger.orchestrator', meta: { ledgerSystem: 'orchestrator', causedBy: 'ledger-entry-uuid-1' } });
  const noPair = gapField.report({ type: `c1.unanchored.${tag}`, body: 'x', source: 'cfr.ledger.orchestrator', meta: {} });
  const a = await selfHeal._gatherFailureContext(withPair.gap.type, withPair.gap.uuid);
  const b = await selfHeal._gatherFailureContext(noPair.gap.type, noPair.gap.uuid);
  assert.deepStrictEqual(a.anchor, { ledgerSystem: 'orchestrator', entryUuid: 'ledger-entry-uuid-1' });
  assert.strictEqual(b.anchor, null, 'a gap whose source merely LOOKS like a ledger must not be anchored');
});

// ── REAL: default fetcher over real HTTP against the real orchestrator ──────

async function emitEntry(n) {
  let last = null;
  for (let i = 0; i < n; i++) {
    const r = await httpJSON('POST', `${BASE}/cfr/emit`, { type: 'contract.structural.fail', payload: { test: 'C1', i } });
    assert.strictEqual(r.status, 200, `emit failed: ${JSON.stringify(r.body)}`);
    last = r.body.entry.uuid;
  }
  return last;
}

test('C1-8', 'REAL: a real ledger entry resolves to status analyzed with a real class', async () => {
  const uuid = await emitEntry(3);
  const c = await computeCompound({ ledgerSystem: 'orchestrator', entryUuid: uuid });
  assert.strictEqual(c.status, 'analyzed', `expected analyzed, got ${JSON.stringify(c)}`);
  assert.ok(['ripple', 'wave', 'tidal'].includes(c.class), `class must be a real regime, got ${c.class}`);
});

test('C1-9', 'REAL: naming a system with no ledger is unavailable — it must NOT fall back to the orchestrator graph', async () => {
  const uuid = await emitEntry(1); // a uuid that DOES exist in the orchestrator's graph
  const c = await computeCompound({ ledgerSystem: `no-such-system-${Date.now()}`, entryUuid: uuid });
  assert.strictEqual(c.status, 'unavailable', 'a real uuid under the WRONG system is an invented chain (I9)');
  assert.ok(/no ledger for system/.test(c.reason), `reason: ${c.reason}`);
  assert.strictEqual(c.class, null);
});

test('C1-10', 'REAL: a uuid that is not in that system\'s graph is unavailable (entry not found), never a ripple', async () => {
  const c = await computeCompound({ ledgerSystem: 'orchestrator', entryUuid: 'not-a-real-entry-uuid' });
  assert.strictEqual(c.status, 'unavailable');
  assert.ok(/entry not found/.test(c.reason), `reason: ${c.reason}`);
  assert.strictEqual(c.class, null);
});

test('C1-11', 'REAL: an unreachable orchestrator is unavailable, fast, and never throws (I8)', async () => {
  const t0 = Date.now();
  // same default fetcher code path, pointed at a port nothing listens on
  const dead = (a) => forensics.fetchCompoundViaOrchestrator(a, 1500, 'http://127.0.0.1:1');
  const c = await computeCompound(ANCHOR, dead);
  assert.strictEqual(c.status, 'unavailable');
  assert.ok(/unreachable|did not answer/.test(c.reason), `reason must name the transport failure: ${c.reason}`);
  assert.strictEqual(c.class, null, 'an unreachable orchestrator is unknown, never a ripple');
  assert.ok(Date.now() - t0 < 5000, 'must never hang past its own timeout');
});

(async () => {
  try {
    await boot();
    await runAll();
  } catch (e) {
    console.error('  test-c1-compound-failure-mode.test.js  boot failed:', e.message);
    process.exitCode = 1;
  } finally {
    shutdown();
  }
})();

// ── helpers ─────────────────────────────────────────────────────────────────
// enrichFailureMode/generateDebugMacro export real node files under cortex/data/nodes/
// (a hardcoded path outside the sandbox). Track and remove ONLY what a case created.
function trackNodeFiles() {
  const roots = ['debug_macro', 'failure_mode'].map((t) => path.join(REPO_ROOT, 'cortex', 'data', 'nodes', t));
  const before = roots.map((r) => (fs.existsSync(r) ? new Set(fs.readdirSync(r)) : null));
  return () => {
    roots.forEach((r, i) => {
      if (!fs.existsSync(r)) return;
      for (const f of fs.readdirSync(r)) if (!before[i] || !before[i].has(f)) { try { fs.unlinkSync(path.join(r, f)); } catch (_) {} }
      if (!before[i]) { try { fs.rmdirSync(r); } catch (_) {} }
    });
  };
}
