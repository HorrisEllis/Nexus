'use strict';
/**
 * tests/modules/test-ico-ledger-writethrough.js — pins the 2026-07-24
 * dual-ledger-root consolidation (James: data "stored in cortex").
 *
 * The second root: lib/ico.js's ledger wrote ONLY to
 * data/<system>/ledger/<stream>/events.ndjson — physically outside the
 * canonical data/ledger/<system>/<component>/<day>.jsonl tree, and (the
 * real cost) invisible to cortex's intelligence layer: component-ledger's
 * whole design is physical file + JAA mirror + event_log breadcrumb so
 * _scanPatterns() can see every write. Service lifecycle events (boot,
 * stop, errors, heartbeats) reached none of that.
 *
 * The fix: ico.ledger.append() writes through to lib/component-ledger.js.
 * Canonical tree = the shared truth; local ndjson = ico's private working
 * cache (tail/fork/summarize keep byte-identical behavior, §5.14) — a
 * mirror relationship, same as component-ledger's own JAA mirror.
 *
 * Contract note pinned here because it was nearly gotten wrong: write()'s
 * signature has NO payload field — an unknown key is silently dropped by
 * destructuring. `detail` carries the event verbatim.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const SYS = `icowt-${Date.now()}`; // collision-proof canonical dir for this run
const CANON_SYS_DIR = path.join(ROOT, 'data/ledger', SYS);

let ico, tmpRoot;

try {
  const { createICO } = require('../../lib/ico.js');
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ico-wt-test-'));
  ico = createICO({ name: SYS, root: tmpRoot });

  test('IWT-001', 'append lands in the LOCAL ndjson exactly as before — tail() behavior unchanged (§5.14)', () => {
    ico.ledger.append('boot', { type: 'service.start', note: 'proof' });
    const tail = ico.ledger.tail('boot', 5);
    assert.strictEqual(tail.length, 1);
    assert.strictEqual(tail[0].type, 'service.start');
    assert.ok(Number.isFinite(tail[0]._ts), 'local shape unchanged: _ts stamp present');
  });

  test('IWT-002', 'the SAME append landed in the canonical data/ledger tree as a real day file', () => {
    const day = new Date().toISOString().slice(0, 10);
    const canon = path.join(CANON_SYS_DIR, `${SYS}.service.boot`, `${day}.jsonl`);
    assert.ok(fs.existsSync(canon), `canonical day file missing: ${canon}`);
    const row = JSON.parse(fs.readFileSync(canon, 'utf8').trim().split('\n').pop());
    assert.strictEqual(row.system, SYS);
    assert.strictEqual(row.component, `${SYS}.service.boot`);
    assert.strictEqual(row.action, 'service.start');
    assert.strictEqual(row.detail.note, 'proof', 'the full event must ride in detail — write() has no payload field');
    assert.ok(row.uuid && Number.isFinite(row.ts), 'canonical row carries uuid + ts (§5.1)');
  });

  test('IWT-003', 'stream id becomes the action when the event has no type — component-ledger §1.1 never refused', () => {
    ico.ledger.append('heartbeat', { uptime: 123 }); // no .type
    const day = new Date().toISOString().slice(0, 10);
    const canon = path.join(CANON_SYS_DIR, `${SYS}.service.heartbeat`, `${day}.jsonl`);
    assert.ok(fs.existsSync(canon), 'heartbeat stream must reach the canonical tree too');
    const row = JSON.parse(fs.readFileSync(canon, 'utf8').trim().split('\n').pop());
    assert.strictEqual(row.action, 'heartbeat', 'action falls back to the stream id, never missing');
  });

  test('IWT-004', 'fork() still works untouched — its internal append also write-throughs without error', () => {
    let forked = false;
    ico.on('ico:ledger:fork', () => { forked = true; });
    ico.ledger.fork('boot', 'boot-fork', 'test fork');
    assert.ok(forked, 'fork event fired');
    const tail = ico.ledger.tail('boot-fork', 5);
    assert.ok(tail.some(e => e._fork === true), 'fork marker present in local cache');
  });

  test('IWT-005', 'provenance tags mark every written row as ico/service-lifecycle', () => {
    const day = new Date().toISOString().slice(0, 10);
    const canon = path.join(CANON_SYS_DIR, `${SYS}.service.boot`, `${day}.jsonl`);
    const rows = fs.readFileSync(canon, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.ok(rows.every(r => r.tags.includes('ico') && r.tags.includes('service-lifecycle')));
  });
} finally {
  // Clean the canonical tree of this run's collision-proof system dir.
  try { fs.rmSync(CANON_SYS_DIR, { recursive: true, force: true }); } catch (_) {}
  try { require('./_purge-test-rows').purgeTestRows(SYS); } catch (_) {}   // §2026-07-24 — also purge the JAA mirror, not just the day file
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
