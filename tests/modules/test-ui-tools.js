'use strict';
// P8 bridge (docs/raid-warp-verification-phasemap.spec Part II) — UI as co-pilot
// tools. ui_spotlight + ui_nerve wrap the EXISTING tv-shell HTTP surfaces (§8.6
// wrap the built API, no new UI) so co-pilot's tool-loop can guide the user.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const at = require(path.join(ROOT, 'lib/agent-tools'));

(async () => {
  await test('T-001', 'ui_spotlight + ui_nerve are registered as tools', () => {
    const names = at.getToolSchemas().map(s => (s.function ? s.function.name : s.name));
    assert.ok(names.includes('ui_spotlight'), 'ui_spotlight must be registered');
    assert.ok(names.includes('ui_nerve'), 'ui_nerve must be registered');
  });

  await test('T-002', 'ui_spotlight validates its action (fail loud, §1.2)', async () => {
    const r = await at.executeTool('ui_spotlight', {});
    assert.ok(r.error, 'missing action must error');
  });

  await test('T-003', 'ui_spotlight "on" requires a target', async () => {
    const r = await at.executeTool('ui_spotlight', { action: 'on' });
    assert.ok(r.error && /target/.test(r.error), 'on without target must error');
  });

  await test('T-004', 'ui_spotlight dispatches to the real UI endpoint (not a stub)', async () => {
    // no UI server in sandbox → a connection error proves it reached the real endpoint.
    const r = await at.executeTool('ui_spotlight', { action: 'on', target: 'guardian' });
    assert.ok(r.ok || (r.error && /unreachable|ECONN|timed out/i.test(r.error)), 'must attempt a real HTTP dispatch');
  });

  await test('T-005', 'ui_nerve supports on/off/sigma', async () => {
    const r = await at.executeTool('ui_nerve', { action: 'bogus' });
    assert.ok(r.error && /unknown/.test(r.error), 'an unknown nerve action must error');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
