'use strict';
/**
 * tests/modules/test-idearium-cjs-under-esm.js — real regression test for
 * the 2026-07-24 fix: two genuinely-CJS files inside idearium/lib/ (which
 * sits under idearium/package.json's "type":"module" for the WHOLE tree)
 * were being force-interpreted as ES modules by Node — `require('fs')`
 * inside them threw "ReferenceError: require is not defined in ES module
 * scope" on every single call. Both were wrapped in try/catch at their call
 * sites (orchestrator/lib/sigma-writer.js, idearium/repo/watcher.js), so the
 * failure was LOUD at the require() boundary but silently swallowed one
 * level up — every event-ledger write and every .spec archive verification
 * through those paths had been a permanent no-op.
 *
 * Fixed by renaming both to .cjs (Node honors that extension as CommonJS
 * regardless of an enclosing type:module) and updating the 3 real call
 * sites (grepped, not assumed) to the new extension.
 */
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('ICU-001', 'event-ledger.cjs loads via plain require() with real exports, not an empty/error stub', () => {
  delete require.cache[require.resolve('../../idearium/lib/event-ledger.cjs')];
  const m = require('../../idearium/lib/event-ledger.cjs');
  assert.deepStrictEqual(Object.keys(m), ['createEventLedger']);
});

test('ICU-002', 'event-ledger.cjs is FUNCTIONAL, not just loadable — createEventLedger returns a real API', () => {
  const { createEventLedger } = require('../../idearium/lib/event-ledger.cjs');
  const fs = require('fs'), os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-ledger-test-'));
  const ledger = createEventLedger({ ledgerDir: dir, systemId: 'test-system' });
  assert.strictEqual(typeof ledger.record, 'function');
  assert.strictEqual(typeof ledger.checkAnomaly, 'function');
  assert.strictEqual(typeof ledger.getStats, 'function');
});

test('ICU-003', 'spec-container.cjs loads via plain require() with real exports', () => {
  delete require.cache[require.resolve('../../idearium/lib/spec-container.cjs')];
  const m = require('../../idearium/lib/spec-container.cjs');
  assert.ok('verifyAndDecode' in m && typeof m.verifyAndDecode === 'function');
  assert.ok('readHeader' in m && typeof m.readHeader === 'function');
});

test('ICU-004', "orchestrator/lib/sigma-writer.js's require path points at .cjs, not the old broken extensionless path", () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '../../orchestrator/lib/sigma-writer.js'), 'utf8');
  assert.ok(/require\(['"]\.\.\/\.\.\/idearium\/lib\/event-ledger\.cjs['"]\)/.test(src),
    'sigma-writer.js must require event-ledger.cjs explicitly — a bare require() does not auto-resolve .cjs, only .js/.json/.node');
});

test('ICU-005', "idearium/repo/watcher.js's require path points at .cjs, not the old broken .js path", () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '../../idearium/repo/watcher.js'), 'utf8');
  assert.ok(/require\(['"]\.\.\/\.\.\/idearium\/lib\/spec-container\.cjs['"]\)/.test(src),
    'watcher.js must require spec-container.cjs explicitly');
});

test('ICU-006', 'the old .js paths no longer exist — renamed, not duplicated (§16.5 delete before add)', () => {
  const fs = require('fs');
  assert.ok(!fs.existsSync(path.join(__dirname, '../../idearium/lib/event-ledger.js')), 'event-ledger.js must not exist alongside event-ledger.cjs');
  assert.ok(!fs.existsSync(path.join(__dirname, '../../idearium/lib/spec-container.js')), 'spec-container.js must not exist alongside spec-container.cjs');
});

test('ICU-007', 'REGRESSION GUARD: no other file under idearium/ has the same bug pattern (real CJS syntax, zero import/export, still a bare .js) — scanned, not assumed clean', () => {
  const fs = require('fs');
  const root = path.join(__dirname, '../../idearium');
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      // §0.39.282 — idearium/repo/repos/ holds the REPOS idearium manages (gitignored runtime content, e.g. an imported
      // eravos organism's src/osc.js), not idearium's own code; their module style is theirs.
      if (entry.name === 'repos' && path.basename(dir) === 'repo') continue;
      const full = path.join(dir, entry.name);
      // §0.39.265 — idearium/data holds materialized copies of OTHER code (repos
      // made from imports and the nexus-self sync of the whole tree, gitignored),
      // not idearium's own modules.
      if (entry.isDirectory() && path.relative(root, full) === 'data') continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const src = fs.readFileSync(full, 'utf8');
      const hasEsm = /^export |^import /m.test(src);
      // §0.39.359 — a browser script that exports only when a `module` exists (`typeof module === 'object' && …`) is
      // loaded by the page, not by Node's ESM loader; its guarded export is for tests that read it into a vm.
      // ui/js/arch-canvas.js (0.39.299) is one; it tripped this scan from the day it landed.
      const browserGuarded = /typeof module === 'object'/.test(src) && !/require\(/.test(src);
      const hasCjs = !browserGuarded && /module\.exports|require\(/.test(src);
      if (!hasEsm && hasCjs) offenders.push(full);
    }
  }
  walk(root);
  assert.deepStrictEqual(offenders, [], `found ${offenders.length} more file(s) with the same mistyped-as-ESM pattern: ${offenders.join(', ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
