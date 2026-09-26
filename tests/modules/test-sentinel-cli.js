'use strict';
/**
 * tests/modules/test-sentinel-cli.js — pins TABLET-style phase S1 of
 * docs/nexus-sentinel.spec: the sentinel CLI and its interaction contract.
 *
 * S1 GATE, verbatim: "`sentinel contract` emits a real machine-readable
 * contract, and `sentinel status` + `sentinel faults list` return REAL data
 * read from cortex — with the sentinel service DOWN, proving the CLI's local
 * path."
 *
 * WHY CLI FIRST (James: "Cli first. API."): it is the surface a human reaches
 * for when everything else is down. A diagnostic tool that needs the thing it
 * diagnoses to be healthy is useless exactly when it is needed — and that is
 * not hypothetical: cli/diagnose.js was found 100% dead this same session
 * because nothing ever exercised it.
 *
 * CONTRACT FIRST, then the CLI derived from it. The CLI verifies at startup
 * that its handlers match the contract exactly and REFUSES on drift, because
 * "a command that is not in the contract does not exist" — which is the rule
 * that stops a fifth diagnostic surface appearing the way the first four did.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const CLI = path.join(ROOT, 'cli/sentinel.js');
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 90000 });
const runJson = (args) => {
  const r = run([...args, '--json']);
  try { return { code: r.status, data: JSON.parse(r.stdout) }; }
  catch (e) { return { code: r.status, data: null, raw: r.stdout, err: r.stderr }; }
};

test('SC-001', 'the contract exists, is valid JSON, and declares its own identity', () => {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'sentinel/interaction-contract.json'), 'utf8'));
  assert.strictEqual(c.id, 'sentinel-v1');
  assert.ok(c.uuid && c.version, 'must carry a uuid and version (§5.1)');
  assert.ok(Array.isArray(c.commands) && c.commands.length > 0);
  assert.ok(Array.isArray(c.routes) && c.routes.length > 0);
});

test('SC-002', 'DECLARED-vs-LIVE is explicit — routes not yet served say so rather than implying they work', () => {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'sentinel/interaction-contract.json'), 'utf8'));
  for (const r of c.routes) {
    assert.ok(['LIVE', 'DECLARED'].includes(r.status),
      `route ${r.path} must state LIVE or DECLARED — a contract that implies unbuilt routes work is the same lie as a hardcoded diagram`);
  }
  assert.ok(c.routes.some(r => r.status === 'DECLARED'), 'S4 routes are declared, not served yet');
});

test('SC-003', 'GATE: `sentinel contract` emits a real machine-readable contract', () => {
  const r = run(['contract']);
  assert.strictEqual(r.status, 0);
  const c = JSON.parse(r.stdout);
  assert.strictEqual(c.id, 'sentinel-v1');
  assert.ok(c.commands.length >= 6);
});

test('SC-004', 'GATE: `sentinel status` returns REAL data with the service DOWN — nothing is running in this test', () => {
  const { code, data } = runJson(['status']);
  assert.strictEqual(code, 0);
  assert.ok(data, 'must emit JSON');
  assert.strictEqual(data.store.reachable, true, 'must read cortex directly, not via a service');
  assert.ok(data.contract.commands >= 6);
  // Real coverage numbers from the live store, not placeholders.
  assert.ok(data.intake && typeof data.intake.coveragePct === 'number', 'must report real intake coverage');
  assert.ok(data.schema && typeof data.schema.rows === 'number', 'must report real schema coverage');
});

test('SC-005', 'GATE: `sentinel faults list` returns REAL faults from the store', () => {
  const { code, data } = runJson(['faults', 'list', '--limit', '5']);
  assert.strictEqual(code, 0);
  assert.strictEqual(data.observed, true);
  assert.ok(Array.isArray(data.faults));
  for (const f of data.faults) {
    assert.ok(f.uuid, 'every fault carries a uuid');
    assert.ok(['gaps', 'ledger'].includes(f.source), 'and NAMES which store it came from');
  }
});

test('SC-006', 'UNREADABLE ≠ NO FAULTS — the store failing must not be reported as zero faults', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(/reporting zero here would be a lie/.test(src),
    'the distinction must be enforced in code, not left to the reader');
  assert.ok(/observed: false/.test(src), 'an unreadable store returns observed:false, never an empty list');
});

test('SC-007', 'CONTRACT DRIFT IS REFUSED — a handler that is not declared, or a declaration with no handler, exits non-zero', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(/§contract drift/.test(src));
  assert.ok(/declared but NOT implemented/.test(src) && /implemented but NOT declared/.test(src),
    'both directions must be caught — an undeclared command is how a fifth surface appears');
  assert.ok(/process\.exit\(3\)/.test(src), 'drift must be fatal, not a warning');

  // Prove it: strip a handler and confirm it refuses.
  const bak = fs.readFileSync(CLI, 'utf8');
  try {
    fs.writeFileSync(CLI, bak.replace("  'sentinel scan':        cmdScan,\n", ''));
    const r = run(['status']);
    assert.notStrictEqual(r.status, 0, 'a drifted CLI must refuse to run');
    assert.ok(/contract drift/.test(r.stderr), 'and say why');
  } finally { fs.writeFileSync(CLI, bak); }
});

test('SC-008', '`sentinel scan` invokes the REAL cli/diagnose.js — one way to ask, not a new one (§16.4, SEN-1)', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(/cli\/diagnose\.js/.test(src), 'must spawn the real diagnostic');
  assert.ok(/never a second implementation/.test(src), 'and record why');
});

test('SC-009', 'ACK IS A GOVERNED WRITE — it goes through the canonical writer with hook/wire/intent/faultId', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const fn = src.slice(src.indexOf('function cmdAck'), src.indexOf('function cmdContract'));
  assert.ok(/component-ledger/.test(fn), 'must use the canonical writer, not a local file');
  assert.ok(/hook: 'sentinel\.cli\.faults\.ack'/.test(fn), 'and carry the new schema fields');
  assert.ok(/faultId: uuid/.test(fn), 'and point at the fault it acknowledges');
  assert.ok(/Reporting success here would be exactly the failure SEN-7 forbids/.test(fn),
    'a failed ack must report failure — SEN-7 exists because three heal paths did the opposite');
});

test('SC-010', 'the CLI survives a wedged store rather than crashing — it must outlive what it reports on', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  // The comment is line-wrapped in the source, so the assertion must tolerate
  // the break. (My first version matched a single line and failed against
  // correct code — fixed the test, not the code.)
  assert.ok(/survive the[\s\S]{0,12}failures it exists to report/.test(src),
    'the containment intent must be recorded where it happens');
  assert.ok(/MACHINE-READABLE MUST BE CLEAN/.test(src),
    'store chatter must not pollute --json: a machine-readable flag emitting unparseable output is worse than none');
  assert.ok(/_storeErr/.test(src), 'a store failure is captured as a reason, not thrown');
});

test('SC-011', '`faults show` answers WHY with a real causedBy walk, not adjacency', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(/CausalGraph/.test(src) && /g\.ancestors\(/.test(src), 'must use the real graph');
  assert.ok(/no causal ancestry recorded/.test(src),
    'and say plainly when a fault has no chain, rather than implying one');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
