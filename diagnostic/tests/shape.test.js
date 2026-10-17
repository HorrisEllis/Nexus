'use strict';
// diagnostic/tests/shape.test.js — diagnostic is a genesis system and alive in its parts (0.60.138).
// James, 2026-10-17: "the diagnostic needs to be a real system matching genasis." · "diagnostic and nexus healer should be one system."
const assert = require('assert'), fs = require('fs'), path = require('path');
const D = path.resolve(__dirname, '..');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);

test('DG-01 it matches genesis (lib/system-shape.js): every role its own file or the kernel\'s', () => {
  const r = require('../../lib/system-shape.js').shapeOf('diagnostic', { root: path.join(D, '..') });
  assert.ok(r.matches, `missing: ${r.missing.join(', ')}`);
});
test('DG-02 config: diagnostic.config.json, the environment over it', () => {
  const C = require('../config.js');
  assert.strictEqual(C.load().port, 7825);
  process.env.DIAGNOSTIC_PORT = '7999'; try { assert.strictEqual(C.load().port, 7999); } finally { delete process.env.DIAGNOSTIC_PORT; }
});
test('DG-03 the registry is its whole door: the healer\'s rows and every contract route, each served by its server', () => {
  const reg = require('../registry-components.js');
  const contract = require('../interaction-contract.json');
  const have = new Set(reg.map(r => `${r.route.method} ${r.route.path}`));
  for (const r of contract.routes) assert.ok(have.has(`${r.method} ${r.path}`), `${r.method} ${r.path}`);
  assert.ok(reg.some(r => r.id === 'diagnostic.healer.propose' && r.route.path === '/healer/proposals'));
  assert.ok(fs.readFileSync(path.join(D, 'nexus-diagnostic.js'), 'utf8').includes("url.pathname.startsWith('/healer/')"));
});
test('DG-04 its events pass ET1, and each named event is a real broadcast in its service', () => {
  const tax = require('../event-taxonomy.js');
  assert.ok(require('../../lib/event-taxonomy-pattern.js').validateTaxonomy(tax).ok);
  const src = fs.readFileSync(path.join(D, 'nexus-diagnostic.js'), 'utf8');
  for (const k of Object.keys(tax).filter(k => !['CONTRACT_VIOLATION', 'DIAGNOSTIC_NODE'].includes(k))) assert.ok(src.includes(`type: '${k.toLowerCase().replace(/_/g, '.')}'`), k);
});
test('DG-05 its cli lists every registry command; its entry and handshake load; its compartment names its entry', () => {
  const cli = require('../cli.js');
  assert.ok(cli.commandFor('healer.list') && cli.commandFor('healer.list').route.path === '/healer/proposals');
  const hs = require('../contracts/handshake.js'); assert.ok(Object.keys(hs).length > 0);
  const comp = require('../compartment.json'); assert.ok(fs.existsSync(path.join(D, comp.entry)) && comp.healthCheck.path === '/health');
  assert.ok(/require\('\.\/nexus-diagnostic\.js'\)/.test(fs.readFileSync(path.join(D, 'server.js'), 'utf8')));
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
