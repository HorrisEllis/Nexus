'use strict';
/**
 * tests/modules/test-contract-queue-hardening.js — pins the 2026-07-24
 * hardening of lib/contract-queue.js.
 *
 * James's rationale for the file queue: "a good redundant queue system,
 * tagging and tracking as it moves from system to system, and would make it
 * easier to diagnose at least at first." The queue already existed; three
 * things were missing, and his rationale is exactly what made them matter.
 *
 *   Gap 1 NO ATOMIC CLAIM — accept() was read-modify-write with no lock, so
 *     two consumers could both claim one contract and run it twice. Same race
 *     as the JaaStore MP-001 bug fixed the same day; same O_EXCL fix.
 *   Gap 2 NO JOURNEY — the contract recorded where it IS (status) but not
 *     where it has BEEN. hops[] now accumulates every transition.
 *   Gap 3 NOTHING LEDGERED — file-queue movement was the least observable
 *     path in the system, which inverts "movement needs to be tangible".
 *
 * hops[] and the ledger are TWO INDEPENDENT WITNESSES to one movement. When
 * they disagree, the disagreement is the diagnosis.
 *
 * Why a file queue is worth hardening rather than replacing: it makes
 * STILLNESS PHYSICAL. The three dead heal dispatches found earlier the same
 * day emitted into nothing and left nothing. A contract that is never claimed
 * is an object sitting in a folder — visible to ls, caught by findStuck().
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const q = require('../../lib/contract-queue.js');

// Collision-proof system names so nothing touches a real system's folders.
const TAG = `cqtest-${Date.now()}`;
const A = `${TAG}-a`, B = `${TAG}-b`;
const made = [];
function newContract(opts = {}) {
  const c = q.create({ fromSystem: A, toSystem: B, intent: 'test.move',
                       fromComponent: 'alpha', toComponent: 'beta', ...opts });
  made.push(c.uuid);
  return c;
}

try {
  test('CQH-001', 'create() seeds the journey — hop 0 names the system, hook and wire, not just a timestamp', () => {
    const c = newContract();
    assert.ok(Array.isArray(c.addenda) && c.addenda.length === 1);
    const h = c.addenda[0];
    assert.strictEqual(h.system, A);
    assert.strictEqual(h.action, 'created');
    assert.strictEqual(h.hook, c.fromHook, 'the hook that fired it must be recorded');
    assert.strictEqual(h.wire, `${A}.output`, 'the wire it sits on must be recorded');
    assert.ok(Number.isFinite(h.ts));
  });

  test('CQH-002', 'dispatch() records the crossing as a real wire, from-output to to-input', () => {
    const d = q.dispatch(newContract());
    assert.strictEqual(d.addenda.length, 2);
    assert.strictEqual(d.addenda[1].action, 'dispatched');
    assert.strictEqual(d.addenda[1].wire, `${A}.output→${B}.input`,
      'the wire must name BOTH endpoints — that is what makes the crossing locatable');
  });

  test('CQH-003', 'THE RACE: two consumers cannot both accept one contract — the second is refused, not silently duplicated', () => {
    const c = q.dispatch(newContract());
    const first  = q.accept(B, c.uuid);
    const second = q.accept(B, c.uuid);
    assert.ok(first, 'the first consumer must win the claim');
    assert.strictEqual(second, null, 'the second MUST be refused — running a contract twice is the bug this fixes');
    assert.strictEqual(first.status, q.STATUS.RUNNING);
    assert.strictEqual(first.claimedByPid, process.pid, 'the claim records who holds it');
  });

  test('CQH-004', 'a refused accept returns null rather than throwing — the caller must treat it as "someone else has it", a real outcome', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    assert.doesNotThrow(() => q.accept(B, c.uuid));
    assert.strictEqual(q.accept(B, c.uuid), null);
  });

  test('CQH-005', 'the claim is a real O_EXCL lock file on disk, released on completion', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    const claim = path.join(ROOT, B, 'input', `${c.uuid}.json.claim`);
    assert.ok(fs.existsSync(claim), 'an accepted contract must hold a claim file');
    const held = JSON.parse(fs.readFileSync(claim, 'utf8'));
    assert.strictEqual(held.pid, process.pid, 'the claim names its holder, so a stale one is attributable');
    q.complete(B, c.uuid, { ok: true });
    assert.ok(!fs.existsSync(claim), 'completion must release the claim');
  });

  test('CQH-006', 'a STALE claim (crashed consumer) is broken loudly and the contract becomes claimable again', () => {
    const c = q.dispatch(newContract());
    const claim = path.join(ROOT, B, 'input', `${c.uuid}.json.claim`);
    // Simulate a consumer that claimed and died: a claim file older than the threshold.
    fs.writeFileSync(claim, JSON.stringify({ pid: 999999, ts: Date.now() - (q.CLAIM_STALE_MS + 60000) }));
    const past = new Date(Date.now() - (q.CLAIM_STALE_MS + 60000));
    fs.utimesSync(claim, past, past);

    let loud = false;
    const origErr = console.error;
    console.error = (...a) => { if (String(a[0] ?? '').includes('BREAKING STALE CLAIM')) loud = true; };
    let got;
    try { got = q.accept(B, c.uuid); } finally { console.error = origErr; }

    assert.ok(loud, 'breaking a stale claim must be LOUD (§1.2) — a silently stolen claim is unattributable');
    assert.ok(got, 'the contract must be claimable again after the stale claim is broken');
  });

  test('CQH-007', 'a completed contract cannot be re-accepted — status is re-checked UNDER the claim, closing the poller/consumer window', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    q.complete(B, c.uuid, { ok: true });
    assert.strictEqual(q.accept(B, c.uuid), null,
      'a contract that completed between listing and claiming must not be run again');
  });

  test('CQH-008', 'the FULL JOURNEY survives on the artifact itself — created → dispatched → accepted → completed', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    const done = q.complete(B, c.uuid, { ok: true });
    assert.deepStrictEqual(done.addenda.map(h => h.action),
      ['created', 'dispatched', 'accepted', 'completed']);
    assert.deepStrictEqual(done.addenda.map(h => h.system), [A, A, B, B],
      'the journey must show the system-to-system movement, which is the whole point');
    assert.ok(done.addenda.every(h => Number.isFinite(h.ts)), 'every hop carries its own timestamp');
  });

  test('CQH-009', 'failure records a hop with the reason and RELEASES the claim so a retry is claimable', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    const f = q.fail(B, c.uuid, new Error('boom'));
    assert.strictEqual(f.status, q.STATUS.QUEUED, 'first failure re-queues rather than terminating');
    assert.strictEqual(f.retryCount, 1);
    const last = f.addenda[f.addenda.length - 1];
    assert.strictEqual(last.action, 'retry-queued');
    assert.ok(/boom/.test(last.note), 'the failure reason rides on the artifact');
    assert.ok(q.accept(B, c.uuid), 'a re-queued contract must be claimable again, or a retry can never run');
  });

  test('CQH-010', 'MOVEMENT IS LEDGERED — every transition reaches the canonical tree, the second independent witness', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    q.complete(B, c.uuid, { ok: true });
    const day = new Date().toISOString().slice(0, 10);
    const bDir = path.join(ROOT, 'data/ledger', B, `${B}.queue`, `${day}.jsonl`);
    assert.ok(fs.existsSync(bDir), `queue movement must reach the canonical ledger: ${bDir}`);
    const rows = fs.readFileSync(bDir, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const mine = rows.filter(r => r.detail && r.detail.uuid === c.uuid);
    const actions = mine.map(r => r.action);
    assert.ok(actions.includes('contract.accepted') && actions.includes('contract.completed'),
      `expected accepted+completed in the ledger, got ${actions.join(',')}`);
    assert.ok(mine.every(r => r.causedBy === c.uuid), 'every row must be traceable back to the contract');
  });

  test('CQH-011', 'writes are ATOMIC (tmp+rename) — the 15s poller reads these files while consumers write them', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/contract-queue.js'), 'utf8');
    assert.ok(/function _wAtomic/.test(src));
    assert.ok(/fs\.renameSync\(tmp,fp\)/.test(src), 'must rename into place, never write in place');
    assert.ok(!/function _w\(fp,c\)\{fs\.writeFileSync/.test(src), 'the bare writeFileSync path must be gone');
  });

  test('CQH-012', 'ledger failure can never block a contract from moving — telemetry is not in the critical path', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/contract-queue.js'), 'utf8');
    const fn = src.slice(src.indexOf('function _ledger'), src.indexOf('// O_EXCL claim'));
    assert.ok(/try\s*\{/.test(fn) && /catch/.test(fn), 'ledger writes must be contained');
    assert.ok(/console\.error/.test(fn), 'and loud when they fail (§1.2)');
  });
  test('CQH-013', 'ADDENDA ARE A LIVING RECORD: a system CONTRIBUTES what it observed, decided and produced — not merely that it was here', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    const ann = q.appendAddendum(B, c.uuid, {
      action: 'analysed', observed: '3 missing deps',
      decided: 'install then retry', produced: 'artifact://deps-report-1',
    });
    assert.ok(ann, 'a claim holder must be able to annotate');
    const e = ann.addenda[ann.addenda.length - 1];
    assert.strictEqual(e.action, 'analysed');
    assert.strictEqual(e.observed, '3 missing deps', 'what it SAW');
    assert.strictEqual(e.decided, 'install then retry', 'what it CHOSE — the part a route trail cannot express');
    assert.strictEqual(e.produced, 'artifact://deps-report-1', 'refs to artifacts, never the artifacts');
    assert.ok(/pid/.test(e.by), 'authorship recorded, so an entry is attributable');
  });

  test('CQH-014', 'APPEND-ONLY IS ENFORCED, not merely intended: editing an earlier entry breaks the hash chain and is DETECTED', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    const done = q.complete(B, c.uuid, { ok: true });
    assert.strictEqual(q.verifyAddenda(done).ok, true, 'an untouched record must verify');

    const tampered = JSON.parse(JSON.stringify(done));
    tampered.addenda[1].decided = 'something else entirely';
    const v = q.verifyAddenda(tampered);
    assert.strictEqual(v.ok, false, 'an edited entry MUST be detected — a living record you cannot trust is worse than none, because it is believed');
    assert.strictEqual(v.brokenAt, 1, 'and it must name WHICH entry, because "something changed" is not actionable');
    assert.ok(/edited after it was written/.test(v.reason));
  });

  test('CQH-015', 'DELETING an entry is detected too — the seq ordinal closes the gap a hash chain alone would miss', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    const done = q.complete(B, c.uuid, { ok: true });
    const cut = JSON.parse(JSON.stringify(done));
    cut.addenda.splice(1, 1);
    const v = q.verifyAddenda(cut);
    assert.strictEqual(v.ok, false);
    assert.ok(/removed or reordered/.test(v.reason));
  });

  test('CQH-016', 'a system CANNOT annotate a contract it does not hold — testimony cannot be forged (§4.3)', () => {
    const c = q.dispatch(newContract());   // dispatched but NOT accepted: no claim held
    assert.strictEqual(q.appendAddendum(B, c.uuid, { note: 'forged' }), null,
      'without the claim the append must be refused, or any process could write another system\'s testimony');
  });

  test('CQH-017', 'addenda are BOUNDED — a contract cannot become an unmovable blob by accumulating payloads', () => {
    const c = q.dispatch(newContract());
    q.accept(B, c.uuid);
    const huge = 'x'.repeat(q.ADDENDUM_TEXT_MAX * 3);
    const u = q.appendAddendum(B, c.uuid, { observed: huge });
    const e = u.addenda[u.addenda.length - 1];
    assert.ok(e.observed.length < huge.length, 'oversized content must be clipped');
    assert.ok(/clipped/.test(e.observed), 'and the clipping must be VISIBLE, not silent — truncation nobody knows about is data loss');
  });

} finally {
  for (const d of [A, B]) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
  for (const d of [A, B]) fs.rmSync(path.join(ROOT, 'data/ledger', d), { recursive: true, force: true });
  // §2026-07-24 — the JAA mirror leaked even though the day files were removed.
  try { require('./_purge-test-rows').purgeTestRows(TAG); } catch (_) {}
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
