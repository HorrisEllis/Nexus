'use strict';
/**
 * tests/modules/test-ledger-schema.js — pins the 2026-07-24 universal ledger
 * schema extension of lib/component-ledger.js.
 *
 * James: "They all need event ledgers, with consistent schema… hook, wire,
 * intent, contract uuid, beginning end point, component, fault… and push back
 * on anything that isn't important."
 *
 * 9 of the 13 fields already existed, so this is EXTEND AND ENFORCE. Added:
 * hook, wire, sourceRef, faultId, intent.
 *
 * PUSHBACK THAT WAS ACCEPTED, and why each stays out:
 *   next event  — an append-only ledger cannot know the future at write time;
 *                 implementing it means mutating written rows, which destroys
 *                 the immutability that makes a ledger worth trusting. It is
 *                 derivable as a causedBy reverse index.
 *   file/dir    — the row's location already IS its path; storing it inside
 *                 the row is self-referential and drifts on rotation. The
 *                 useful form (WHERE IT WAS EMITTED FROM) is sourceRef, which
 *                 is DERIVED from a stack frame rather than asked for.
 *   context     — rows are ~300 bytes and the tree is 9.6MB; an embedded blob
 *                 would roughly triple it and duplicate cortex. References.
 *   relation    — DROPPED from v1 outright, not "blocked on". causedBy already
 *                 carries causal relation and no caller has needed a
 *                 non-causal one. Gating the whole schema on it was backwards.
 *
 * WHY hook/wire ARE NOT YET REFUSED: 14 live call sites. Requiring them today
 * would make write() return null across the system — silently disabling the
 * ledger in the name of observability. The gap is instead made measurable via
 * schemaCoverage(), and enforcement flips when that number says it is safe.
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
const cl = require('../../lib/component-ledger');
const { purgeTestRows } = require('./_purge-test-rows');
const SYS = `schematest-${Date.now()}`;

try {
  test('LS-001', 'the new fields are recorded when supplied', () => {
    const r = cl.write({
      system: SYS, component: `${SYS}.mod`, action: 'contract.dispatched',
      hook: 'queue.dispatch', wire: `${SYS}.output→other.input`,
      intent: 'move artifact', faultId: 'fault-123',
    });
    assert.ok(r, 'write must succeed');
    assert.strictEqual(r.hook, 'queue.dispatch');
    assert.strictEqual(r.wire, `${SYS}.output→other.input`);
    assert.strictEqual(r.intent, 'move artifact');
    assert.strictEqual(r.faultId, 'fault-123');
  });

  test('LS-002', 'UNKNOWN STAYS NULL — an unsupplied hook is never defaulted to a plausible value', () => {
    const r = cl.write({ system: SYS, component: `${SYS}.legacy`, action: 'updated' });
    assert.ok(r, 'a legacy caller must still write — 14 of them exist');
    assert.strictEqual(r.hook, null, 'a fabricated hook would be worse than an absent one: it would look like evidence');
    assert.strictEqual(r.wire, null);
    assert.strictEqual(r.faultId, null);
  });

  test('LS-003', 'sourceRef is DERIVED from a real stack frame — the useful form of "which file emitted this"', () => {
    const r = cl.write({ system: SYS, component: `${SYS}.src`, action: 'test' });
    assert.ok(r.sourceRef, 'sourceRef must be derived without the caller supplying it');
    assert.ok(/test-ledger-schema\.js:\d+$/.test(r.sourceRef),
      `must point at the REAL calling file and line, got "${r.sourceRef}"`);
    assert.ok(!/component-ledger\.js/.test(r.sourceRef), 'must skip the ledger\'s own frames');
  });

  test('LS-004', 'REJECTED FIELDS STAY OUT — no next/nextEvent, no ledger path, no embedded context, no relation', () => {
    const r = cl.write({ system: SYS, component: `${SYS}.rej`, action: 'test' });
    for (const k of ['next', 'nextEvent', 'relation', 'context', 'file', 'directory', 'path']) {
      assert.ok(!(k in r), `'${k}' must not be a schema field — see the header for why`);
    }
  });

  test('LS-005', 'the §1.1 refusal still holds for the fields that were ALWAYS required', () => {
    assert.strictEqual(cl.write({ component: 'x', action: 'y' }), null, 'no system → refused');
    assert.strictEqual(cl.write({ system: 'x', action: 'y' }), null, 'no component → refused');
    assert.strictEqual(cl.write({ system: 'x', component: 'y' }), null, 'no action → refused');
  });

  test('LS-006', 'the missing-hook gap is WARNED, once per component — measurable, not silent, not flooding', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/component-ledger.js'), 'utf8');
    assert.ok(/_hookWarned/.test(src), 'must warn once per component rather than per row');
    assert.ok(/not locatable in the architecture/.test(src), 'the warning must say what is actually lost');
  });

  test('LS-007', 'schemaCoverage() reports the real migration state per component — a list to act on, not a percentage', () => {
    const cov = cl.schemaCoverage(500);
    for (const k of ['rows', 'hookPct', 'wirePct', 'sourcePct', 'components']) {
      assert.ok(k in cov, `coverage must report ${k}`);
    }
    assert.ok(Array.isArray(cov.components));
    if (cov.components.length) {
      for (const k of ['component', 'total', 'withHook', 'withWire']) {
        assert.ok(k in cov.components[0], `per-component entry must carry ${k}`);
      }
    }
  });

  test('LS-008', 'the call sites that ALREADY KNEW their hook now supply it — contract-queue and config-governance', () => {
    const cq = fs.readFileSync(path.join(ROOT, 'lib/contract-queue.js'), 'utf8');
    assert.ok(/hook:extra\.hook\|\|c\.toHook/.test(cq), 'contract-queue computed hook/wire for addenda but never gave them to the ledger');
    assert.ok(/wire:extra\.wire/.test(cq));
    const cg = fs.readFileSync(path.join(ROOT, 'lib/config-governance.js'), 'utf8');
    assert.ok(/hook:\s+o\.hook \|\|/.test(cg), 'a governed config change must be locatable');
    assert.ok(/faultId:\s+anomalous \? uuid : null/.test(cg), 'an anomalous change points at its own fault record');
  });

  test('LS-009', 'THE FINDING BEHIND intent STAYING UNCONSTRAINED: `action` carries almost no vocabulary today', () => {
    // Across the live ledger there were exactly two distinct action verbs
    // ('updated', 'registered') in 3,400 rows — all the specificity lives in
    // `component`. So there is no real vocabulary to constrain intent TO yet,
    // and inventing one before the evidence exists is authoring, not
    // observing. This test records the reasoning so the decision is not
    // mistaken later for an oversight.
    const src = fs.readFileSync(path.join(ROOT, 'lib/component-ledger.js'), 'utf8');
    assert.ok(/UNCONSTRAINED on purpose/.test(src), 'the choice must be documented where the field is defined');
    assert.ok(/two distinct verbs across 3,400 rows/.test(src), 'and carry the evidence that drove it');
  });
  test('LS-010', 'THE INTELLIGENCE INTAKE IS NOT SILENT — a failed event_log breadcrumb is loud and recorded', () => {
    // This is the one wire that makes "always connected with the pattern
    // engine" true: _scanPatterns() reads event_log and nothing else. It was
    // `catch (_) {}` — so it could fail invisibly and starve the intelligence
    // core while every other signal said the ledger was healthy. The mirror
    // write directly above it already logged and called _recordFailure(); the
    // more important failure was the quieter one.
    const src = fs.readFileSync(path.join(ROOT, 'lib/component-ledger.js'), 'utf8');
    const bc = src.slice(src.indexOf("jaa.insert('event_log'"), src.indexOf("jaa.insert('event_log'") + 1400);
    assert.ok(!/\}\s*catch \(_\) \{\}/.test(bc), 'the breadcrumb catch must not be silent');
    assert.ok(/breadcrumb FAILED/.test(bc), 'a failure must name what was lost');
    assert.ok(/_recordFailure/.test(bc), 'and be recorded, like the mirror write above it');
    assert.ok(/pattern engine will not see this entry/.test(bc), 'and state the real consequence');
  });

  test('LS-011', 'intakeCoverage() proves the pattern engine is actually being fed — starvation is measurable, not merely loud', () => {
    const cov = cl.intakeCoverage();
    assert.strictEqual(cov.observed, true);
    for (const k of ['canonicalWrites', 'breadcrumbs', 'coveragePct', 'starving']) {
      assert.ok(k in cov, `must report ${k}`);
    }
    assert.strictEqual(cov.starving, false, `breadcrumbs are behind canonical writes — intelligence is starving: ${JSON.stringify(cov)}`);
    // Rows before the wire existed are legitimately absent. Counting them as
    // loss would manufacture a permanent false alarm.
    assert.ok(cov.note.includes('predate the breadcrumb wire'), 'the historical gap must be excluded explicitly, not silently');
  });

} finally {
  purgeTestRows(SYS);
  fs.rmSync(path.join(ROOT, 'data/ledger', SYS), { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
