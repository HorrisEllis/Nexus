'use strict';
// SANDBOX 2026-09-28 — this test starts a real orchestrator process; it inherits a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-c0-cfr-collapse-anchor.test.js — C0 (docs/2026-09-28-staging-self-heal-phasemap.spec)
 * UUID: test-c0-cfr-collapse-anchor-v1-0000-2026-0928-001
 *
 * "Gaps born from a CFR ledger entry carry that entry's anchor
 * (ledgerSystem, entryUuid)." Spawns the REAL orchestrator process (its own
 * CFR ledger for system 'orchestrator' is the only one reachable off its own
 * HTTP surface — the /cfr/* routes there are bound to _getEventLedger
 * ('orchestrator'), not an arbitrary system), drives real ledger entries
 * through the documented POST /cfr/emit test hook (intelligence/cfr/ledger.js
 * §handleCFRRoute), and reads the real gaps.jsonl the sandboxed run writes —
 * not a mock, the actual file orchestrator.js's new onGap branch and
 * lib/gap-field.js's report() produce.
 *
 * This is the same test style as tests/modules/orchestrator-cli.test.js
 * (spawns the real `node orchestrator.js` child) but leaves the CLI arg off
 * so the process stays up in server mode instead of running one command and
 * exiting.
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawn } = require('child_process');

let passed = 0, failed = 0;
const _registry = [];
function test(id, desc, fn) { _registry.push({ id, desc, fn }); }

async function runAll() {
  for (const { id, desc, fn } of _registry) {
    try { await fn(); console.log(`   ${id} ${desc}`); passed++; }
    catch (e) { console.error(`   ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  process.stdout.write(`\n  test-c0-cfr-collapse-anchor.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

const ORCH_PATH = path.join(__dirname, '../../orchestrator/orchestrator.js');
const REPO_ROOT  = path.join(__dirname, '../..');
const PORT       = 19533; // arbitrary, unused elsewhere in this suite
const BASE       = `http://127.0.0.1:${PORT}`;

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

function gapsFile() {
  // lib/test-sandbox.js points JAA_DATA_DIR at the sandbox root for the
  // whole process tree; the child inherits it, so both write and read here
  // agree on the same file. The `jaaDB` singleton lib/gap-field.js writes
  // through wraps guardian/jaa-store.js's JaaStore (confirmed by requiring
  // cortex/memory/jaa-db.js and reading its own `_getStore()` — NOT the
  // JaaDB class earlier in that same file, which is dead code for this
  // path): one <table>.json full-snapshot array, flushed on a 1500ms
  // debounce timer or synchronously on close() (§guardian/jaa-store.js
  // _flush/_schedule). §0.41.0 PF3 — the store now appends per process (<table>.<pid>.jsonl) and folds; the base
  // file alone is not every row, so rows are read the way any reader reads them: through a store (_readGaps).
  return path.join(process.env.JAA_DATA_DIR, 'gaps.json');
}
function _readGaps() {
  const { JaaStore } = require(path.join(REPO_ROOT, 'guardian/jaa-store.js'));
  const l = console.log; console.log = () => {};
  try { return new JaaStore(process.env.JAA_DATA_DIR, { settings: false, tables: ['gaps'] }).all('gaps'); } finally { console.log = l; }
}

async function waitForGapRow(pred, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    {
      let rows = [];
      try { rows = _readGaps(); } catch (_) { /* mid-write; retry */ }
      if (Array.isArray(rows)) {
        const found = rows.filter(pred);
        if (found.length) return { rows, found };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  // Timed out — return whatever the last read had (possibly none) so
  // callers can report exact counts instead of a bare "not found".
  let rows = [];
  try { rows = _readGaps(); } catch (_) {}
  return { rows, found: rows.filter(pred) };
}

let child;

async function boot() {
  child = spawn('node', [ORCH_PATH], {
    cwd: REPO_ROOT,
    env: { ...process.env, ORCHESTRATOR_PORT: String(PORT), NEXUS_BIND_HOST: '127.0.0.1' },
  });
  child.stderr.on('data', () => {}); // boot warns about unreachable peer systems — expected, not asserted on
  await waitForHealth();
}

function shutdown() {
  if (child && !child.killed) child.kill('SIGTERM');
}

test('C0-1', 'a cfr.collapse ledger entry becomes a real gap anchored to (ledgerSystem, entryUuid)', async () => {
  // §field.js: coherence starts at 0.6, 'contract.structural.fail' nudges it
  // -0.15/event; three real emits cross CFR_COLLAPSE_THRESHOLD (0.25).
  let lastUuid = null;
  for (let i = 0; i < 3; i++) {
    const r = await httpJSON('POST', `${BASE}/cfr/emit`, { type: 'contract.structural.fail', payload: { test: 'C0-1', i } });
    assert.strictEqual(r.status, 200, `emit ${i} failed: ${JSON.stringify(r.body)}`);
    assert.ok(r.body.entry && r.body.entry.uuid, 'emit did not return a ledger entry uuid');
    lastUuid = r.body.entry.uuid;
  }
  const { found } = await waitForGapRow((row) => row.type === 'cfr.collapse' && row.source === 'cfr.ledger.orchestrator');
  assert.strictEqual(found.length, 1, `expected exactly one cfr.collapse gap row, got ${found.length}`);
  const gap = found[0];
  assert.strictEqual(gap.meta && gap.meta.ledgerSystem, 'orchestrator', 'meta.ledgerSystem must be the ledger the entry lives in, not an inferred value');
  // causedBy is gap-field's derived field (meta.causedBy → causedBy, §lib/gap-field.js report()).
  // Coherence starts at 0.6 and drops ~0.15/emit, so the FIRST two emits stay
  // above CFR_COLLAPSE_THRESHOLD (0.25) — the gap is created on the THIRD
  // entry, the one that actually crossed it. causedBy must be exactly that
  // entry's uuid, not any of the three (I9 — the anchor is the real
  // triggering entry, never an approximate "one of these").
  assert.strictEqual(gap.causedBy, lastUuid, 'causedBy must be the exact ledger entry that crossed the threshold');
});

test('C0-2', 'a repeat collapse bumps the existing gap rather than anchoring a second one', async () => {
  const before = await waitForGapRow((row) => row.type === 'cfr.collapse' && row.source === 'cfr.ledger.orchestrator', 500);
  const beforeCount = before.found.length;
  const r = await httpJSON('POST', `${BASE}/cfr/emit`, { type: 'contract.structural.fail', payload: { test: 'C0-2' } });
  assert.strictEqual(r.status, 200);
  // gap-field's dedup is on (type, source, domain); occurrence bumps are a
  // jaaDB.update mutation line, not a fresh gaps row (§lib/gap-field.js
  // report()), so the row COUNT for this dedup key must not grow.
  await new Promise((res) => setTimeout(res, 500));
  const after = await waitForGapRow((row) => row.type === 'cfr.collapse' && row.source === 'cfr.ledger.orchestrator', 500);
  assert.strictEqual(after.found.length, beforeCount, 'a repeat collapse must not create a second gaps.jsonl row for the same dedup key');
});

test('C0-3', 'sigma.spike and delta.tension never reach gap-field (only cfr.collapse does, by D1)', async () => {
  const { rows } = await waitForGapRow(() => true, 500);
  const leaked = rows.filter((row) => row.type === 'sigma.spike' || row.type === 'delta.tension');
  assert.strictEqual(leaked.length, 0, `D1 decided cfr.collapse only; found leaked rows: ${JSON.stringify(leaked)}`);
});

(async () => {
  try {
    await boot();
    await runAll();
  } catch (e) {
    console.error('  test-c0-cfr-collapse-anchor.test.js  boot failed:', e.message);
    process.exitCode = 1;
  } finally {
    shutdown();
  }
})();
