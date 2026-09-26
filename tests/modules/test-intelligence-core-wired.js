'use strict';
/**
 * tests/modules/test-intelligence-core-wired.js — pins two 2026-07-24
 * decisions from James: "Yes to the core; and retiring causal, I don't want
 * junk."
 *
 * 1. THE INTELLIGENCE CORE IS SWITCHED ON. intelligence/index.js is
 *    933 lines that had NEVER RUN — nothing outside its own directory
 *    required it, init() was never called, and neither bep_patterns.json nor
 *    failures.json had ever been created. Its three siblings (intuition,
 *    mastermind, adversarial) WERE live, which is precisely why the absence
 *    went unnoticed: the /api/intelligence/* routes answered, so the core
 *    behind them was assumed to be running. Now registered as a cortex organ.
 *
 * 2. meta/causal-nexus IS RETIRED. 37 files, 728K, zero code dependencies
 *    (verified by require-grep, not assumed), not in the test suite. Its
 *    useful modules were harvested into meta/rfr2 earlier the same day
 *    (causality, sigma, adapter, kernel, forge) and its one real external
 *    consumer, nexus-healer, was migrated. Git preserves the history, so
 *    "retired" is recoverable, not lost.
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
const BOOT = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');

test('ICW-001', 'the intelligence core runs in its OWN process now (2026-09-19), not as an organ inside cortex', () => {
  const organs = BOOT.slice(BOOT.indexOf('const organs = ['), BOOT.indexOf('for (const organ of organs)'));
  assert.ok(!/name: 'intelligence'/.test(organs), 'intelligence must no longer be a cortex organ (sovereignty: cortex down must not take it down)');
  assert.ok(!/require\('\.\.\/intelligence'\)\.init\(/.test(BOOT), 'and cortex must not init a second in-process runtime');
  const SERVER = fs.readFileSync(path.join(ROOT, 'intelligence/server.js'), 'utf8');
  assert.ok(/intelligence\.init\(/.test(SERVER), 'intelligence/server.js is the one runtime');
});

test('ICW-002', 'it initialises through the SAME contract every other organ uses — init({bus}), isolated failure', () => {
  const core = require('../../intelligence');
  assert.strictEqual(typeof core.init, 'function');
  assert.strictEqual(typeof core.stop, 'function');
  const { EventEmitter } = require('events');
  const em = new EventEmitter();
  const bus = { emit: (t, p, m) => em.emit(t, { payload: p, meta: m }), on: (t, h) => em.on(t, h) };
  assert.doesNotThrow(() => core.init({ bus }), 'init must not throw — the organ loop catches, but a throwing organ is still a dead organ');
  try {
    assert.strictEqual(typeof core.getPatterns, 'function');
    assert.strictEqual(typeof core.getFailures, 'function');
    assert.strictEqual(typeof core.getReuseIndex, 'function');
  } finally { core.stop(); }
});

test('ICW-003', 'the organ loop isolates failure, so a broken core cannot take cortex down', () => {
  const loop = BOOT.slice(BOOT.indexOf('for (const organ of organs)'), BOOT.indexOf('for (const organ of organs)') + 400);
  assert.ok(/try\s*\{/.test(loop) && /catch/.test(loop), 'each organ init must be contained');
  assert.ok(/console\.warn/.test(loop), 'and a failed organ must be reported (§1.2), not silent');
});

test('ICW-004', 'RETIRED: meta/causal-nexus is gone from disk', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'meta/causal-nexus')),
    'the tree must be removed — James: "I don\'t want junk"');
});

test('ICW-005', 'nothing requires it — the retirement is safe, verified rather than assumed', () => {
  const offenders = [];
  const skip = new Set(['node_modules', '.git', 'docs', 'data', 'idearium']);
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = fs.readFileSync(full, 'utf8');
      // Real requires/imports only — comments mentioning the name are fine.
      if (/require\(['"][^'"]*causal-nexus|from ['"][^'"]*causal-nexus/.test(src)) {
        offenders.push(path.relative(ROOT, full));
      }
    }
  })(ROOT);
  assert.deepStrictEqual(offenders, [], `live requires of the retired tree remain: ${offenders.join(', ')}`);
});

test('ICW-006', 'what was worth keeping was HARVESTED first, not deleted with it (§16.5 delete, but only after)', () => {
  for (const m of ['causality', 'sigma', 'adapter', 'kernel', 'forge']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'meta/rfr2', m, 'index.js')),
      `${m} must survive in meta/rfr2 — retiring the ancestor must not lose the capability`);
  }
});

test('ICW-007', 'the meta barrel still resolves with the tree gone', () => {
  assert.doesNotThrow(() => require('../../meta/index.js'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
