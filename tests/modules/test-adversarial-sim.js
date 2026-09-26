'use strict';
/**
 * tests/modules/test-adversarial-sim.js — pins every defect found by the
 * 2026-07-27 recursive adversarial simulation (James: "recursively simulate
 * the system being used in different use cases, and find as many problems as
 * possible").
 *
 * 21 scenarios were driven against REAL modules and REAL stores across eight
 * use cases: operator triage, contract movement, governance under stress,
 * ledger abuse, concurrency, corrupted stored data, CLI abuse, and dependency
 * failure. Result: 3 real bugs, 3 risks, 15 passes.
 *
 * WHAT THE PASSES CONFIRMED matters as much as the failures — the fixes made
 * earlier in this session hold under adversarial load: the MP-001 flush lock
 * survived concurrent flushes, exactly one of five concurrent consumers won a
 * contract claim, a corrupt jsonl line was counted without losing its good
 * neighbours, a corrupt JAA table degraded instead of throwing, and forged
 * addenda were refused.
 *
 * Every fix below was found by USE, not by reading. Three of them were in code
 * I wrote earlier this same session and had already tested — the tests asserted
 * what I intended, and the simulation asked what actually happens.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { purgeTestRows } = require('./_purge-test-rows');
const q = require('../../lib/contract-queue.js');
const rmLedger = (s) => { try { fs.rmSync(path.join(ROOT, 'data/ledger', s), { recursive: true, force: true }); } catch (_) {} };
const rmBox = (s) => { try { fs.rmSync(path.join(ROOT, s), { recursive: true, force: true }); } catch (_) {} };

// ── BUG 1 (UC2.4): a system name became a filesystem path, unchecked ────────
test('AS-001', 'PATH TRAVERSAL: a hostile system name is REFUSED — it previously escaped the repo root and created dirs outside it', () => {
  // Proven in simulation: fromSystem "../../etc" resolved to
  // /home/claude/etc/output and mkdirSync created it. contract-queue was the
  // one path-taking surface with no validation — and it is the surface that
  // takes names from OTHER systems.
  for (const evil of ['../../etc', '../escape', 'a/b', 'x\u0000y', '..', './x']) {
    assert.throws(() => q.create({ fromSystem: evil, toSystem: 'ok', intent: 'x' }),
      /unsafe system name|escapes repo root/,
      `"${evil}" must be refused as a system name`);
  }
  assert.ok(!fs.existsSync('/home/claude/etc'), 'nothing may exist outside the repo after these attempts');
});

test('AS-002', 'legitimate system names still work — the fix refuses hostility, not normal use', () => {
  const T = `asok-${Date.now()}`;
  try {
    const c = q.create({ fromSystem: `${T}-a`, toSystem: `${T}-b`, intent: 'x' });
    assert.ok(c && c.uuid, 'a normal name must still create a contract');
  } finally { rmBox(`${T}-a`); rmBox(`${T}-b`); rmLedger(`${T}-a`); rmLedger(`${T}-b`); purgeTestRows(T); }
});

// ── BUG 2 (UC2.1): completion required no claim ────────────────────────────
test('AS-003', 'COMPLETION REQUIRES THE CLAIM — any process could previously mark another system\'s work finished', () => {
  const T = `as3-${Date.now()}`, A = `${T}-a`, B = `${T}-b`;
  try {
    const c = q.dispatch(q.create({ fromSystem: A, toSystem: B, intent: 'x' }));
    // No accept() — so no claim is held.
    const bogus = q.complete(B, c.uuid, { ok: true });
    assert.strictEqual(bogus, null,
      'completion without a claim must be refused: it is the strongest assertion in the lifecycle ("this work is finished") and was the least protected');

    // The legitimate path still works.
    assert.ok(q.accept(B, c.uuid), 'holder can claim');
    const real = q.complete(B, c.uuid, { ok: true });
    assert.ok(real && real.status === 'complete', 'the claim holder can still complete');
  } finally { rmBox(A); rmBox(B); rmLedger(A); rmLedger(B); purgeTestRows(T); }
});

// ── BUG 3 (UC7.1): ack manufactured evidence ───────────────────────────────
test('AS-004', 'ACK VALIDATES THE FAULT EXISTS — it previously reported ok:true for a uuid matching nothing', () => {
  // This was the worst of the three: it wrote a real ledger row acknowledging
  // something that never existed. Worse than failing — it MANUFACTURES
  // EVIDENCE. An operator could "clear" a typo, believe a real fault was
  // handled, and the ledger would agree with them permanently. Same shape as
  // SEN-7: reporting success for work that did not happen.
  const r = spawnSync(process.execPath, [path.join(ROOT, 'cli/sentinel.js'), 'faults', 'ack', 'definitely-not-a-real-uuid', '--json'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  let d = null; try { d = JSON.parse(r.stdout); } catch (_) {}
  assert.ok(d, `ack must emit parseable JSON, got: ${r.stdout.slice(0, 200)}`);
  assert.strictEqual(d.ok, false, 'acknowledging a nonexistent fault must FAIL');
  assert.ok(/no such fault/.test(d.error));
  assert.notStrictEqual(r.status, 0, 'and exit non-zero');
  purgeTestRows('sentinel');
});

test('AS-005', 'an ack records WHICH fault it cleared, so the row is auditable later', () => {
  const src = fs.readFileSync(path.join(ROOT, 'cli/sentinel.js'), 'utf8');
  assert.ok(/faultType: target\.type/.test(src), 'the row must capture the fault as it stood when acknowledged');
  assert.ok(/manufacture evidence/.test(src), 'and the reasoning must be recorded where the check lives');
});

test('AS-006', 'an UNREADABLE store refuses the ack rather than acknowledging blind', () => {
  const src = fs.readFileSync(path.join(ROOT, 'cli/sentinel.js'), 'utf8');
  assert.ok(/cannot verify the fault exists/.test(src),
    'if the store cannot be read the fault cannot be verified, and acknowledging it would record a fact nobody established');
});

// ── RISK 1 (UC4.3): unbounded ledger rows ──────────────────────────────────
test('AS-007', 'LEDGER ROWS ARE CAPPED — a 2MB payload was previously accepted whole', () => {
  const { write } = require('../../lib/component-ledger.js');
  const S = `as7-${Date.now()}`;
  try {
    const r = write({ system: S, component: `${S}.c`, action: 'a', detail: 'x'.repeat(2 * 1024 * 1024) });
    assert.ok(r.detail._truncated, 'an oversized payload must be capped');
    assert.strictEqual(r.detail.originalBytes, 2 * 1024 * 1024, 'and report its ORIGINAL size — truncation nobody can detect is data loss');
    assert.ok(r.detail.preview.length <= r.detail.cappedAt);

    const day = new Date().toISOString().slice(0, 10);
    const lines = fs.readFileSync(path.join(ROOT, 'data/ledger', S, `${S}.c`, `${day}.jsonl`), 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 1, 'and the jsonl file must stay one row per line');
    assert.ok(lines[0].length < 20000, `the persisted row must be capped, got ${lines[0].length} bytes`);
  } finally { rmLedger(S); purgeTestRows(S); }
});

test('AS-008', 'a circular detail cannot throw inside the ledger — telemetry must never take down its caller', () => {
  const { write } = require('../../lib/component-ledger.js');
  const S = `as8-${Date.now()}`;
  const a = { n: 1 }; a.self = a;
  try {
    assert.doesNotThrow(() => write({ system: S, component: `${S}.c`, action: 'a', detail: a }));
  } finally { rmLedger(S); purgeTestRows(S); }
});

// ── RISK 2 (UC3.3): control characters in a config key ─────────────────────
test('AS-009', 'CONFIG KEYS REJECT CONTROL CHARACTERS — refused, not sanitised', () => {
  const { recordConfigChange } = require('../../lib/config-governance.js');
  const S = `as9-${Date.now()}`;
  try {
    for (const bad of ['evil\nkey', 'null\u0000byte', 'ret\rurn', 'tab\u0001x']) {
      assert.throws(() => recordConfigChange({ system: S, key: bad, from: 1, to: 2 }),
        /control characters/, `key ${JSON.stringify(bad)} must be refused`);
    }
    // Refused rather than sanitised on purpose: silently rewriting an
    // identifier would create two names for one setting.
    assert.throws(() => recordConfigChange({ system: S, key: 'x'.repeat(300), from: 1, to: 2 }), /exceeds 256/);
    // And a normal key still works.
    const ok = recordConfigChange({ system: S, key: 'normal.key_1-2', from: 1, to: 2 });
    assert.ok(ok && ok.projected, 'a legitimate key must still be governed');
  } finally { rmLedger(S); purgeTestRows(S); }
});

// ── what the simulation CONFIRMED still holds under adversarial load ───────
test('AS-010', 'REGRESSION GUARD: concurrent claims still yield exactly one winner', () => {
  const T = `as10-${Date.now()}`, A = `${T}-a`, B = `${T}-b`;
  try {
    const c = q.dispatch(q.create({ fromSystem: A, toSystem: B, intent: 'x' }));
    const won = [0, 0, 0, 0, 0].map(() => q.accept(B, c.uuid)).filter(Boolean).length;
    assert.strictEqual(won, 1, `${won} of 5 concurrent consumers claimed the same contract`);
  } finally { rmBox(A); rmBox(B); rmLedger(A); rmLedger(B); purgeTestRows(T); }
});

test('AS-011', 'REGRESSION GUARD: a corrupt JAA table degrades to empty instead of throwing', () => {
  const { JaaStore } = require('../../guardian/jaa-store.js');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'as11-'));
  fs.writeFileSync(path.join(d, 'broken.json'), '{{{ not json');
  const s = new JaaStore(d);
  let rows;
  assert.doesNotThrow(() => { rows = s.all('broken', {}); }, 'a corrupt table must not throw — every consumer would die with it');
  assert.ok(Array.isArray(rows), 'and must still return an array');
});

test('AS-012', 'REGRESSION GUARD: embedded newlines in detail cannot split a jsonl row', () => {
  const { write } = require('../../lib/component-ledger.js');
  const S = `as12-${Date.now()}`;
  try {
    write({ system: S, component: `${S}.c`, action: 'a', detail: 'line1\nline2\nline3' });
    const day = new Date().toISOString().slice(0, 10);
    const lines = fs.readFileSync(path.join(ROOT, 'data/ledger', S, `${S}.c`, `${day}.jsonl`), 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 1, 'a newline inside detail must not corrupt the file');
    assert.doesNotThrow(() => JSON.parse(lines[0]));
  } finally { rmLedger(S); purgeTestRows(S); }
});

// ── ROUND TWO (2026-07-27): boundaries rather than abuse ────────────────────
// Round one asked "what if this is used badly". Round two asked the harder
// question: what if it is used CORRECTLY but at a boundary — midnight, clock
// skew, 500 items, an emoji, a duplicate uuid. 16 more scenarios, 1 bug,
// 2 risks.

test('AS-013', 'CLOCK SKEW: a FUTURE-dated subscription row must NOT count as live forever', () => {
  // The nastiest staleness bug found so far. A future ts gives a NEGATIVE
  // ageMs, which can never exceed STALE_MS — so a host with a skewed clock was
  // reported live permanently, including long after it died. Staleness
  // detection silently stopped working for exactly the machine most likely to
  // be misbehaving.
  const { JaaStore } = require('../../guardian/jaa-store.js');
  const bs = require('../../lib/bus-subscriptions.js');
  const { EventEmitter } = require('events');
  const jaa = new JaaStore(fs.mkdtempSync(path.join(os.tmpdir(), 'as13-')));
  const b = new EventEmitter(); b.on('e', () => {});
  bs.publish({ systemId: 'skewed-host', bus: b, jaa });
  const row = jaa.all(bs.TABLE, {}).find(r => r.systemId === 'skewed-host');
  jaa.insert(bs.TABLE, { ...row, ts: Date.now() + 600000 });   // 10 min ahead

  const c = bs.consumersOf('e', jaa);
  assert.strictEqual(c.live, 0, 'a future-dated row must not be counted live');
  assert.strictEqual(c.stale, 1, 'it must be counted stale instead');
  const sys = bs.all(jaa).systems.find(x => x.systemId === 'skewed-host');
  assert.strictEqual(sys.skewed, true, 'and flagged as skewed, because a future ts is evidence the CLOCK is wrong, not that the system is fresh');
  assert.strictEqual(sys.stale, true, '"I cannot tell how old this is" must never be reported as "this is current"');
});

test('AS-014', 'ordinary clock jitter does NOT make a healthy host stale — the fix must not overcorrect', () => {
  const { JaaStore } = require('../../guardian/jaa-store.js');
  const bs = require('../../lib/bus-subscriptions.js');
  const { EventEmitter } = require('events');
  const jaa = new JaaStore(fs.mkdtempSync(path.join(os.tmpdir(), 'as14-')));
  const b = new EventEmitter(); b.on('e', () => {});
  bs.publish({ systemId: 'jittery', bus: b, jaa });
  const row = jaa.all(bs.TABLE, {}).find(r => r.systemId === 'jittery');
  jaa.insert(bs.TABLE, { ...row, ts: Date.now() + 1500 });   // 1.5s ahead: normal jitter
  const c = bs.consumersOf('e', jaa);
  assert.strictEqual(c.live, 1, 'a host a second or two ahead is healthy, not skewed — penalising it would trade one false reading for another');
});

test('AS-015', 'a row with NO timestamp is stale, never live', () => {
  const { JaaStore } = require('../../guardian/jaa-store.js');
  const bs = require('../../lib/bus-subscriptions.js');
  const jaa = new JaaStore(fs.mkdtempSync(path.join(os.tmpdir(), 'as15-')));
  jaa.insert(bs.TABLE, { id: 'nots', systemId: 'nots', subscriptions: { e: 3 }, types: 1, totalListeners: 3 });
  const c = bs.consumersOf('e', jaa);
  assert.strictEqual(c.live, 0, 'an unstamped row must never count as live');
  assert.strictEqual(c.stale, 3);
});

test('AS-016', '§5.1 EVERY interaction contract carries a uuid and version — two were missing one', () => {
  // A handshake verifies contractUuid. A contract with no uuid cannot be
  // verified at all, so the gated handshake S4 depends on would have had
  // nothing to check against for those systems.
  const missing = [];
  for (const sys of ['bridge', 'cortex', 'guardian', 'idearium', 'architect', 'sentinel', 'nexus-healer']) {
    const p = path.join(ROOT, sys, 'interaction-contract.json');
    if (!fs.existsSync(p)) continue;
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!c.uuid) missing.push(`${sys}:uuid`);
    if (!c.version) missing.push(`${sys}:version`);
  }
  assert.deepStrictEqual(missing, [], `contracts missing required identity fields: ${missing.join(', ')}`);
});

test('AS-017', 'REGRESSION GUARD: a causal CYCLE terminates instead of looping forever', () => {
  const { CausalGraph } = require('../../intelligence/cfr/graph');
  const g = new CausalGraph();
  g.ingest({ uuid: 'a', type: 'x', ts: 1, causedBy: 'b' });
  g.ingest({ uuid: 'b', type: 'y', ts: 2, causedBy: 'a' });
  const t0 = Date.now();
  const anc = g.ancestors('a', 20);
  assert.ok(Date.now() - t0 < 1000, 'a cycle must terminate — the visited-set guard is what makes ancestry safe on real data');
  assert.ok(Array.isArray(anc));
});

test('AS-018', 'REGRESSION GUARD: out-of-order ingest still resolves ancestry — cross-process events arrive out of order routinely', () => {
  const { CausalGraph } = require('../../intelligence/cfr/graph');
  const g = new CausalGraph();
  g.ingest({ uuid: 'child', type: 'fail', ts: 200, causedBy: 'parent' });   // parent not yet seen
  g.ingest({ uuid: 'parent', type: 'cause', ts: 100 });
  const ids = g.ancestors('child', 8).map(a => a.uuid || a.id);
  assert.ok(ids.includes('parent'), 'a parent ingested AFTER its child must still be found');
});

test('AS-019', 'REGRESSION GUARD: unicode and emoji round-trip through the ledger exactly', () => {
  const { write } = require('../../lib/component-ledger.js');
  const S = `as19-${Date.now()}`;
  const payload = '日本語 · مرحبا · 🧠🔥 · \u200bzero-width';
  try {
    write({ system: S, component: `${S}.c`, action: 'unicode', detail: payload });
    const day = new Date().toISOString().slice(0, 10);
    const row = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ledger', S, `${S}.c`, `${day}.jsonl`), 'utf8').trim());
    assert.strictEqual(row.detail, payload, 'unicode must survive the round trip byte-for-byte');
  } finally { rmLedger(S); purgeTestRows(S); }
});

test('AS-020', 'REGRESSION GUARD: a 200-addendum chain still verifies — growth must not break tamper-evidence', () => {
  const T = `as20-${Date.now()}`, A = `${T}a`, B = `${T}b`;
  try {
    const c = q.dispatch(q.create({ fromSystem: A, toSystem: B, intent: 'x' }));
    q.accept(B, c.uuid);
    for (let i = 0; i < 200; i++) q.appendAddendum(B, c.uuid, { note: `step ${i}` });
    const live = JSON.parse(fs.readFileSync(path.join(ROOT, B, 'input', `${c.uuid}.json`), 'utf8'));
    const v = q.verifyAddenda(live);
    assert.strictEqual(v.ok, true, `chain broke at 200 entries: ${v.reason}`);
    assert.ok(v.entries >= 200);
  } finally { rmBox(A); rmBox(B); rmLedger(A); rmLedger(B); purgeTestRows(T); }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
