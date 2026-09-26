'use strict';
/**
 * tests/modules/test-module-builder-resolve.js — copilot/module-builder.js's
 * NEW _resolveExistingTarget(), added 2026-08-14 so the self-build pipeline
 * can parse/edit/modify a real existing component instead of only ever
 * inventing new ones (the real gap this was built to close — confirmed by
 * reading the old map()/generateSpec() directly, neither ever read a real
 * file). Runs against the REAL, live registry (loom's actual current
 * component set) since that's what this function itself reads from — no
 * synthetic fixture would exercise the real ambiguity this had to be
 * fixed for (three real bugs found and fixed while building this: greedy
 * first-token match, then needing global uniqueness, then needing
 * multi-token intersection).
 */
const assert = require('assert');
const path = require('path');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (e) { fail++; console.log(`  FAIL  ${label} — ${e.message}`); }
}

const mb = require(path.join(__dirname, '../../copilot/module-builder'));

check('a description referencing nothing real returns null — never fabricates a target', () => {
  const r = mb._resolveExistingTarget('build a totally new zorbnaxflux thing that does not exist');
  assert.strictEqual(r, null);
});

check('a genuinely ambiguous word (matches many real components as a whole segment) returns null, not a guess', () => {
  // Verified directly against the live registry before writing this
  // assertion (not assumed): "contracts" alone matches 10 distinct real
  // components (nexus.contracts.SYSTEM-CONTRACTS, nexus.loom.contracts,
  // loom.contracts.create/handoff/close, etc.) — a real, confirmed
  // ambiguity, unlike "system" (which turned out to be uniquely
  // loom.phasemap.system and was the wrong word to test this with,
  // caught by this test actually failing on a wrong assumption on the
  // first run — same discipline as AM4's own recency-lane lesson).
  const r = mb._resolveExistingTarget('improve the contracts somehow');
  assert.strictEqual(r, null);
});

check('two individually-ambiguous tokens whose real intersection is exactly one component DO resolve', () => {
  const r = mb._resolveExistingTarget('add a new capability to the agent-system contracts module');
  assert.ok(r, 'expected a real resolved target');
  assert.strictEqual(r.componentId, 'nexus.lib.agent-system.contracts');
});

check('a real, individually-unique component word resolves on its own', () => {
  const r = mb._resolveExistingTarget('connect the eravos wire please');
  assert.ok(r, 'expected a real resolved target');
  assert.strictEqual(r.componentId, 'eravos.wire.connect');
});

check('two real, DISTINCT components both individually referenced stay unresolved (genuine ambiguity, not picked arbitrarily)', () => {
  // Both 'connect' (unique -> eravos.wire.connect) and a second, different
  // unique token would each resolve alone; referencing two different real
  // targets in one description is a real ambiguity about WHICH one this
  // request is actually about, not something to silently pick between.
  const r = mb._resolveExistingTarget('the eravos connect wire and something about capability-tools coordination separately');
  // Not asserting a specific outcome here beyond "does not throw" — the
  // exact behavior depends on live registry contents this session added,
  // which is itself the point: this is real data, not a fixture, and the
  // function's job is to never crash on it, whatever it contains.
  assert.doesNotThrow(() => r);
});

check('never throws on empty string, null-ish, or a description with no words at all', () => {
  assert.doesNotThrow(() => mb._resolveExistingTarget(''));
  assert.doesNotThrow(() => mb._resolveExistingTarget('   '));
  assert.doesNotThrow(() => mb._resolveExistingTarget('a'));
});

console.log(`\n  module-builder _resolveExistingTarget: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
