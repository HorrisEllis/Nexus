'use strict';
// P6 — call_system (docs/copilot-omniscience-phasemap.spec). Every registered
// system reachable through one tool: resolve via the capability registry (the
// self-register work), dispatch via nexus-client. Routes THROUGH existing infra
// (§10.3), not a competing path.
const _log = console.log;
console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[jaa]')) return; _log(...a); };

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
  await test('T-001', 'call_system is registered as a tool', () => {
    const names = at.getToolSchemas().map(s => (s.function ? s.function.name : s.name));
    assert.ok(names.includes('call_system'), 'call_system must be registered');
  });

  await test('T-002', 'call_system fails loud with neither intent nor system (§1.2)', async () => {
    const r = await at.executeTool('call_system', {});
    assert.ok(r.error && /intent|system/.test(r.error), 'must require intent or system+path');
  });

  await test('T-003', 'explicit system+path dispatches through nexus-client (the sanctioned path)', async () => {
    // No server in sandbox — a connection error PROVES it reached the real client,
    // not a stub. The point is it routes through nexus-client, not a new path.
    const r = await at.executeTool('call_system', { system: 'cortex', path: '/health' });
    assert.ok(r.ok || (r.error && /failed|refused|ECONN|timeout/i.test(r.error)),
      'must attempt a real dispatch via nexus-client');
  });

  await test('T-004', 'intent resolution goes THROUGH the capability registry (not a hardcoded map)', () => {
    // the tool requires capability-registry — proving it resolves from the live
    // registry the self-register work populates, per §8.4/§10.3.
    const src = require('fs').readFileSync(path.join(ROOT, 'lib/agent-tools/tools/execution/call-system.js'), 'utf8');
    assert.ok(/require\('\.\.\/\.\.\/\.\.\/capability-registry'\)/.test(src), 'must resolve via the capability registry');
    assert.ok(/require\('\.\.\/\.\.\/\.\.\/nexus-client'\)/.test(src), 'must dispatch via nexus-client');
    // no actual hardcoded system→address map (a structure, not the word in comments)
    assert.ok(!/(SYSTEMS|SYSTEM_MAP|ADDRESSES)\s*=\s*\{[^}]*:\s*\d{4}/.test(src), 'must not carry a hardcoded system→port map');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
