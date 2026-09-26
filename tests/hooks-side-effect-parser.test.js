'use strict';
const assert = require('assert');
const { parseSideEffect, structuredSideEffects } = require('../hooks/side-effect-parser.js');
const realStrings = require('/tmp/real_strings.json');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`  FAIL ${name}\n    ${e.message}`); failed++; }
}

// ── Real inventory — every one of the 57 actual strings in the tree,
// not synthetic. Every single one must parse to SOME category (never
// throw, never return null for a non-empty string) — that's the honest
// bar, not "guess the right category for every string."
for (const s of realStrings) {
  test(`real string parses without throwing: ${s.slice(0,50)}`, () => {
    const r = parseSideEffect(s);
    assert.ok(r, `expected a result for: ${s}`);
    assert.ok(['writes','emits','calls'].includes(r.kind));
  });
}

// ── Precision checks — specific real strings that MUST land in a specific
// category, not just "some category." These are the ones a real impact-
// propagation consumer would actually query.
test('jaa.insert("ideas") -> writes jaa:ideas', () => {
  assert.deepStrictEqual(parseSideEffect('jaa.insert("ideas")'), { kind: 'writes', target: 'jaa:ideas', raw: 'jaa.insert("ideas")' });
});
test('jaa.update("jobs", {...}) -> writes jaa:jobs', () => {
  const r = parseSideEffect('jaa.update("jobs", {status:"complete", responseText})');
  assert.strictEqual(r.kind, 'writes');
  assert.strictEqual(r.target, 'jaa:jobs');
});
test('jaa.insert(event_log) bare identifier -> writes jaa:event_log', () => {
  const r = parseSideEffect('jaa.insert(event_log)');
  assert.strictEqual(r.kind, 'writes');
  assert.strictEqual(r.target, 'jaa:event_log');
});
test('emit idearium.idea.created -> emits idearium.idea.created', () => {
  assert.deepStrictEqual(parseSideEffect('emit idearium.idea.created'), { kind: 'emits', target: 'idearium.idea.created', raw: 'emit idearium.idea.created' });
});
test('bus.emit("guardian.dom_map.received") -> emits', () => {
  const r = parseSideEffect('bus.emit("guardian.dom_map.received")');
  assert.strictEqual(r.kind, 'emits');
  assert.strictEqual(r.target, 'guardian.dom_map.received');
});
test('_toCortex("cortex.gap.found") -> emits cortex.gap.found', () => {
  const r = parseSideEffect('_toCortex("cortex.gap.found")');
  assert.strictEqual(r.kind, 'emits');
  assert.strictEqual(r.target, 'cortex.gap.found');
});
test('_toCortex(event) — a variable, not a literal — correctly falls to calls, not guessed', () => {
  const r = parseSideEffect('_toCortex(event)');
  assert.strictEqual(r.kind, 'calls');
  assert.strictEqual(r.target, null);
});
test('wires_to: cortex.raid.feedback -> emits', () => {
  const r = parseSideEffect('wires_to: cortex.raid.feedback');
  assert.strictEqual(r.kind, 'emits');
  assert.strictEqual(r.target, 'cortex.raid.feedback');
});
test('copilot broadcast copilot.stream.event -> emits', () => {
  const r = parseSideEffect('copilot broadcast copilot.stream.event');
  assert.strictEqual(r.kind, 'emits');
  assert.strictEqual(r.target, 'copilot.stream.event');
});
test('sigma.record() -> calls, honest catch-all, not mis-sorted', () => {
  const r = parseSideEffect('sigma.record()');
  assert.strictEqual(r.kind, 'calls');
  assert.strictEqual(r.raw, 'sigma.record()');
});
test('free-text "spawns child processes" -> calls, not fabricated into writes/emits', () => {
  const r = parseSideEffect('spawns child processes');
  assert.strictEqual(r.kind, 'calls');
});

// ── structuredSideEffects — the real per-hook entry point
test('a hook with no contract.sideEffects returns all-empty arrays, not null', () => {
  const r = structuredSideEffects({ id: 'x' });
  assert.deepStrictEqual(r, { writes: [], emits: [], calls: [] });
});
test('a real multi-effect hook categorizes correctly and dedupes', () => {
  const hook = { contract: { sideEffects: ['jaa.insert("ideas")', 'emit idearium.idea.created', 'jaa.insert("ideas")', 'sigma.record()'] } };
  const r = structuredSideEffects(hook);
  assert.deepStrictEqual(r.writes, ['jaa:ideas']); // deduped
  assert.deepStrictEqual(r.emits, ['idearium.idea.created']);
  assert.deepStrictEqual(r.calls, ['sigma.record()']);
});

console.log(`\nhooks-side-effect-parser: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
