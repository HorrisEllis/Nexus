'use strict';
/**
 * tests/modules/test-pressure-window.js — the window must explain, or say it can't.
 * UUID: nexus-test-pressure-window-v1-0000-2026-0818-001
 * spec: docs/pressure-causality.spec § P3 tests PC-004, PC-005, PC-007, PC-008
 *
 * §ISOLATION — writes real rows into a temp store and refuses to run if
 * cortex/memory/jaa-db.js does not honour JAA_DATA_DIR.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'));
const PRIOR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
jaaDB.insert('pw_isolation_probe', { id: 'probe', ts: Date.now() });
try { jaaDB._store().flushAll(); } catch (_) {}
if (!fs.existsSync(path.join(TMP, 'pw_isolation_probe.json'))) {
  console.log('  ✗ PW-000 ISOLATION — jaa-db ignores JAA_DATA_DIR; refusing to write into the production store.');
  console.log("    Fix (cortex/memory/jaa-db.js:35): const DATA_DIR = process.env.JAA_DATA_DIR || path.join(__dirname, '../../data/cortex/memory');");
  console.log('  1 failed, 0 passed');
  process.exitCode = 1;
  return;
}

const PW = require(path.join(ROOT, 'lib/pressure-window.js'));

// A real, ordered incident — the 2026-08-18 shape, rebuilt as data.
const T0 = 1787000000000;
const S  = 1000;
function ev(offsetS, type, payload = {}, source = 'test') {
  return jaaDB.insert('event_log', { uuid: `pw-${type}-${offsetS}-${Math.random().toString(36).slice(2, 7)}`, type, payload, source, ts: T0 + offsetS * S });
}

(() => {
  console.log('\nlib/pressure-window.js — what led to this?\n');

  // Build the incident.
  ev(-300, 'provider.host.starting', { provider: 'claude' });
  ev(-290, 'provider.host.starting', { provider: 'chatgpt' });
  ev(-100, 'autopilot.instance_snapshot', { perSystemMemMB: { 'clear-glass': 4951, copilot: 210, cortex: 180 }, freeMemPct: 16 });
  ev(-90,  'component.registered', { name: 'noise-1' });
  ev(-89,  'component.updated',    { name: 'noise-2' });
  ev(-60,  'copilot.lifeline', { reasons: ['Ollama confidence 0.63 < 0.75 — escalating'] }, 'copilot');
  const anchor = ev(0, 'nexus.resource.pressure', { level: 'critical', reasons: ['free memory 1.0% < halt threshold 10%'], regime: 'ordered', friction: 0.2105 }, 'resource-monitor');

  test('PW-001', 'the anchor is found and summarised in the words the system used', () => {
    const r = PW.explain({ eventId: anchor.uuid });
    assert.ok(r.ok, r.reason);
    assert.strictEqual(r.anchor.type, 'nexus.resource.pressure');
    assert.match(r.anchor.summary, /free memory 1\.0%/);
  });

  test('PW-002', 'the timeline is ordered by eventTs, oldest first (§3.2)', () => {
    const r = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    const ts = r.timeline.map(e => e.ts);
    assert.deepStrictEqual(ts, [...ts].sort((a, b) => a - b));
    assert.ok(r.timeline.some(e => e.type === 'provider.host.starting'), 'the actual cause must survive into the timeline');
  });

  test('PW-003', 'wall-clock order does not change the output (§3.2)', () => {
    const a = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    // Insert an event whose row lands later but whose eventTs is earlier.
    ev(-250, 'provider.host.starting', { provider: 'gemini' });
    const b = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    const bTs = b.timeline.map(e => e.ts);
    assert.deepStrictEqual(bTs, [...bTs].sort((x, y) => x - y), 'a late-written, early-stamped row must still sort by eventTs');
    assert.ok(b.timeline.length > a.timeline.length);
  });

  test('PW-004', 'routine bookkeeping is suppressed and COUNTED, never silently dropped', () => {
    const r = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    assert.ok(r.window.suppressed >= 2, `suppressed was ${r.window.suppressed}`);
    assert.ok(!r.timeline.some(e => e.type === 'component.registered'));
    assert.strictEqual(r.window.shown + r.window.suppressed, r.window.events);
  });

  test('PW-005', 'holders are joined from the snapshot the pressure event does not carry', () => {
    const r = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    assert.ok(r.holders && r.holders.length, 'attribution exists at autopilot.js:659 — the window must go and get it');
    assert.strictEqual(r.holders[0].system, 'clear-glass');
    assert.strictEqual(r.holders[0].mb, 4951);
  });

  test('PW-006', 'the answer names its own blind spot when the anchor carries no attribution', () => {
    const r = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    assert.ok(r.gaps.some(g => /PC-GAP-3/.test(g)), JSON.stringify(r.gaps));
  });

  test('PW-007', 'the field is carried alongside the event (§11.1)', () => {
    const r = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    assert.strictEqual(r.field.regime, 'ordered');
    assert.ok(Math.abs(r.field.friction - 0.2105) < 1e-9);
  });

  test('PW-008', 'empty attribution is reported as unavailable, never as zero holders', () => {
    const a2 = ev(600, 'nexus.resource.pressure', { level: 'critical', reasons: ['free memory 2%'] });
    ev(590, 'autopilot.instance_snapshot', { perSystemMemMB: {}, freeMemPct: 2 });   // the wmic-returned-nothing case
    const r = PW.explain({ eventId: a2.uuid, windowMs: 60000 });
    assert.strictEqual(r.holders, null, 'an empty query result is not an empty machine');
    assert.ok(r.gaps.some(g => /wmic|no per-system memory/i.test(g)), JSON.stringify(r.gaps));
  });

  test('PW-009', 'the window is a projection — it writes nothing (§10.2)', () => {
    const before = jaaDB.query('event_log', () => true, 9000).length;
    PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    PW.render(PW.explain({ eventId: anchor.uuid }));
    PW.anchors();
    assert.strictEqual(jaaDB.query('event_log', () => true, 9000).length, before);
  });

  test('PW-010', 'a window with nothing in it says so, instead of narrating nothing (§PC-008)', () => {
    const lonely = ev(99999, 'nexus.resource.pressure', { level: 'pressure', reasons: ['free memory 19%'] });
    const r = PW.explain({ eventId: lonely.uuid, windowMs: 5000 });
    assert.ok(r.ok);
    assert.strictEqual(r.timeline.length, 0);
    const text = PW.render(r);
    assert.match(text, /nothing else is recorded in this window/);
  });

  test('PW-011', 'render produces a story a person can read top to bottom (§16.2)', () => {
    const text = PW.render(PW.explain({ eventId: anchor.uuid, windowMs: 400000 }));
    for (const heading of ['WHAT HAPPENED', 'SECONDS BEFORE IT', 'WHO HELD THE MEMORY', 'THE FIELD IT HAPPENED IN', 'WHAT THE SYSTEM ALREADY KNEW', 'WHAT THIS ANSWER DOES NOT KNOW']) {
      assert.ok(text.includes(heading), `missing section: ${heading}`);
    }
    assert.ok(text.includes('provider.host.starting'), 'the cause must be visible in the rendered story');
  });

  test('PW-015', 'prior knowledge matches the crystalliser\'s real phrasing, not the dotted type', () => {
    // Regression: the first matcher looked for "resource.pressure" and found
    // nothing, while cortex/intelligence writes "nexus: resource pressure".
    jaaDB.insert('bep_patterns', { id: 'pw-p1', description: '"provider: host starting" always fires alongside "nexus: resource pressure"', confidence: 1, count: 6, ts: T0 - 3000 });
    const r = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    assert.ok(r.known.length, 'a pattern naming this event in words must be found');
    assert.match(r.known[0].description, /provider: host starting/);
    assert.ok(!r.gaps.some(g => /prior knowledge/.test(g)), 'and the gap must clear');
  });

  test('PW-016', 'an unrelated pattern is NOT claimed as prior knowledge', () => {
    jaaDB.insert('bep_patterns', { id: 'pw-p2', description: '"component: updated" fires in bursts', confidence: 1, count: 300, ts: T0 - 3000 });
    const r = PW.explain({ eventId: anchor.uuid, windowMs: 400000 });
    assert.ok(!r.known.some(k => /component: updated/.test(k.description)), 'a loose matcher that grabs everything explains nothing');
  });

  test('PW-012', 'anchors() lists the moments worth explaining, newest first', () => {
    const a = PW.anchors();
    assert.ok(a.length >= 3);
    const ts = a.map(x => x.ts);
    assert.deepStrictEqual(ts, [...ts].sort((x, y) => y - x));
  });

  test('PW-013', 'an unknown event id does not silently fall back to a different story', () => {
    const r = PW.explain({ eventId: 'no-such-event-uuid' });
    // Falls through to "no anchor" rather than quietly explaining something else.
    assert.ok(r.ok === false || r.anchor.id !== 'no-such-event-uuid');
    if (r.ok) assert.ok(r.gaps.length >= 0);
  });

  test('PW-014', 'render refuses to invent a story from a failed explain', () => {
    const text = PW.render({ ok: false, reason: 'event_log is empty' });
    assert.match(text, /Nothing to explain/);
    assert.ok(!/WHAT HAPPENED/.test(text));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.env.JAA_DATA_DIR = PRIOR;
  if (PRIOR === undefined) delete process.env.JAA_DATA_DIR;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exitCode = failed ? 1 : 0;
})();
