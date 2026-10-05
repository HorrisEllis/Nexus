'use strict';
/**
 * tests/modules/test-route-contracts.test.js — EV0 (2)(3), 0.39.320: the route half of the contract check
 * (lib/route-contract-check.js; docs/2026-10-02-emerge-field-memory-build-phasemap.spec, invariant E14).
 * James: "next."
 *
 *   RC-01  the reader: vaultd's method-and-parts dispatch, emerge-ide's url dispatch (inside the POST block → POST)
 *   RC-02  compare: a served route not declared fails, a declared route not served fails; a parameter's name is not compared
 *   RC-03  cos, emerge and warp, read from disk: their contracts match their code (warp: a library, no routes)
 *   RC-04  wired: `nexus contracts check` runs it; loom has it as a component wired to the CLI
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'lib/route-contract-check.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

test('RC-01', 'the reader: method-and-parts, and url inside or outside the POST block', () => {
  const v = R.projectRoutes("if (req.method === 'GET' && parts[0] === 'status') {}\nif (req.method === 'DELETE' && parts[0] === 'secrets' && parts.length === 3) {}");
  assert.deepStrictEqual(v.map(r => `${r.method} ${r.path}`), ['GET /status', 'DELETE /secrets/:2/:3']);
  const e = R.projectRoutes("if (url==='/events') {}\nif (req.method==='POST') {\n  req.on('end', () => {\n    if (url==='/compile') {}\n  });\n  return;\n}\nif (url==='/x' && method==='PUT') {}\nif (url==='/status') {}");
  assert.deepStrictEqual(e.map(r => `${r.method} ${r.path}`), ['GET /events', 'POST /compile', 'PUT /x', 'GET /status']);
});

test('RC-02', 'compare: undeclared and unserved both fail; parameter names are not compared', () => {
  const served = [{ method: 'GET', path: '/a/:2' }, { method: 'POST', path: '/b' }];
  assert.ok(R.compare(served, [{ method: 'GET', path: '/a/:id' }, { method: 'POST', path: '/b' }]).ok);
  const r = R.compare(served, [{ method: 'GET', path: '/a/:id' }, { method: 'GET', path: '/c' }]);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.undeclared.map(x => x.path), ['/b']);
  assert.deepStrictEqual(r.unserved.map(x => x.path), ['/c']);
});

test('RC-03', 'cos, emerge and warp: each contract matches its code', () => {
  for (const s of Object.keys(R.SERVERS)) {
    const r = R.checkSystem(ROOT, s);
    assert.ok(r.ok, `${s}: ${r.error || JSON.stringify({ undeclared: r.undeclared, unserved: r.unserved })}`);
  }
  assert.strictEqual(R.checkSystem(ROOT, 'cos').served.length, 7);
  assert.strictEqual(R.checkSystem(ROOT, 'warp').served.length, 0, 'warp is a library');
  const codegen = JSON.parse(fs.readFileSync(path.join(ROOT, 'emerge/interaction-contract.json'), 'utf8')).routes.find(r => r.path === '/api/codegen');
  assert.strictEqual(codegen.reachable, false, 'declared, and said to be unreachable');
});

test('RC-04', 'wired: the CLI verb and loom', () => {
  const cli = fs.readFileSync(path.join(ROOT, 'cli/nexus.js'), 'utf8');
  assert.ok(cli.includes("require('../lib/route-contract-check.js')"), 'nexus contracts check runs it');
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'loom/data/registry.json'), 'utf8'));
  assert.ok(reg.component['nexus.lib.route-contract-check'], 'a loom component');
  assert.ok(Object.values(reg.wire).some(w => w.from_hook_id === 'nexus.lib.route-contract-check.export' && w.to_hook_id === 'nexus.cli.nexus.import'), 'wired to the CLI');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
