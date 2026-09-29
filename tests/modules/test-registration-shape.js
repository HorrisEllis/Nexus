'use strict';
// Registration-path consistency (2026-07-25). registry-components.js files
// split two export shapes across systems — a bare array vs { components }. A
// system whose _register read the wrong shape sent [] silently. cortex was the
// live case: it exports a bare array but read `.components`, so it sent 0 of its
// 39 declared capabilities every boot — the registry did not know cortex's own
// capabilities. This pins that every system's declarations are reachable and
// that cortex now sends them.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
// THE canonical normalizer — the one reader every registration path now uses.
const { normalizeDeclarations: norm } = require(path.join(ROOT, 'lib/component-registry'));

// §0.39.282 — bridge is retired (no bridge/ in the tree); intelligence declares its own set since the organs moved out of cortex.
const SYSTEMS = ['architect', 'clear-glass', 'copilot', 'cortex', 'emerge', 'eravos', 'guardian', 'idearium', 'intelligence', 'loom', 'ollama'];

test('T-001', 'every system registry-components file normalizes to a non-empty component array', () => {
  for (const sys of SYSTEMS) {
    let rc;
    try { rc = require(path.join(ROOT, sys, 'registry-components.js')); }
    catch (e) { assert.fail(`${sys}: load failed — ${e.message}`); }
    const comps = norm(rc);
    assert.ok(comps.length > 0, `${sys} must declare at least one component (got ${comps.length})`);
  }
});

test('T-002', 'every declared component has the fields register() requires', () => {
  const REQUIRED = ['id', 'namespace', 'name', 'version', 'grammar', 'route', 'description'];
  for (const sys of SYSTEMS) {
    const comps = norm(require(path.join(ROOT, sys, 'registry-components.js')));
    for (const c of comps) {
      for (const f of REQUIRED) {
        assert.ok(c[f] !== undefined && c[f] !== null && c[f] !== '', `${sys}/${c.id || '?'} missing ${f}`);
      }
    }
  }
});

test('T-003', 'CORTEX: exports a bare array AND its 39 components are now readable (was sending 0)', () => {
  const rc = require(path.join(ROOT, 'cortex', 'registry-components.js'));
  assert.ok(Array.isArray(rc), 'cortex exports a bare array');
  const comps = norm(rc);
  // §0.39.282 — the 39 were split when the intelligence organs left cortex: cortex keeps its own, intelligence declares the
  // rest in intelligence/registry-components.js. Both must be readable; together they cover at least the old 39.
  const intel = norm(require(path.join(ROOT, 'intelligence', 'registry-components.js')));
  assert.ok(comps.length > 0 && intel.length > 0, `cortex (${comps.length}) and intelligence (${intel.length}) both declare components`);
  assert.ok(comps.length + intel.length >= 39, `cortex + intelligence must cover the full set (got ${comps.length + intel.length})`);
});

test('T-004', 'cortex/boot.js reads its components via the canonical normalizer (not ad-hoc shape logic)', () => {
  const boot = require('fs').readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
  assert.ok(/normalizeDeclarations\(require\('\.\/registry-components'\)\)/.test(boot),
    'cortex _register must use the one canonical normalizer, not re-implement shape handling');
});

test('T-005', 'LOOM: the registry authority now declares its own capabilities (was components:[])', () => {
  const rc = require(path.join(ROOT, 'loom', 'registry-components.js'));
  const comps = norm(rc);
  assert.ok(comps.length >= 15, `loom must declare its capabilities (got ${comps.length})`);
  assert.ok(comps.some(c => c.id === 'loom.hooks.wire'), 'loom must declare its wire route — the consumer-edge write path RAID needs');
  const server = require('fs').readFileSync(path.join(ROOT, 'loom/server.js'), 'utf8');
  assert.ok(!/meta:\s*\{[^}]*\},\s*components:\s*\[\]/.test(server), 'loom must not register a hardcoded empty component list');
});

test('T-006', 'IDEARIUM: 43 components exported as ESM {COMPONENTS} are now visible via the canonical normalizer', () => {
  const rc = require(path.join(ROOT, 'idearium', 'registry-components.js'));
  // it exports { COMPONENTS } — a third shape no ad-hoc reader caught
  assert.ok(Array.isArray(rc.COMPONENTS), 'idearium exports COMPONENTS');
  const comps = norm(rc);
  assert.ok(comps.length >= 43, `idearium's full surface must be readable (got ${comps.length})`);
});

test('T-007', 'the normalizer is defensive — garbage and null degrade to [], never throw (§1.2)', () => {
  assert.deepStrictEqual(norm(null), []);
  assert.deepStrictEqual(norm({ nonsense: true }), []);
  assert.deepStrictEqual(norm(undefined), []);
});

test('T-008', 'registration read sites use the ONE normalizer, not ad-hoc shape logic (§10.3)', () => {
  // cortex + loom must call normalizeDeclarations, not re-implement the read
  const cortex = require('fs').readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
  const loom = require('fs').readFileSync(path.join(ROOT, 'loom/server.js'), 'utf8');
  assert.ok(/normalizeDeclarations\(require\('\.\/registry-components'\)\)/.test(cortex), 'cortex must use the canonical normalizer');
  assert.ok(/normalizeDeclarations\(require\('\.\/registry-components'\)\)/.test(loom), 'loom must use the canonical normalizer');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
