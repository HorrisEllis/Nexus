'use strict';
// CLI consolidation (James: "the only cli should have co-pilot available to talk
// to, and also every system and cli command that updates dynamically"). The one
// canonical CLI is copilot/cli.js: co-pilot talk + live registry grammar +
// system passthrough + tv-ui. The old cli/nexus-cli.js is a slim shim (§16.5
// duplicate removed, §10.3 one entry).
const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const CLI = fs.readFileSync(path.join(ROOT, 'copilot/cli.js'), 'utf8');

test('T-001', 'the one CLI can talk to co-pilot (_talkToCopilot)', () => {
  assert.ok(/_talkToCopilot/.test(CLI));
});

test('T-002', 'the one CLI has DYNAMIC grammar from the live registry (SSE rebuild)', () => {
  assert.ok(/component\.registered|api\/components\/grammar/.test(CLI), 'commands update dynamically from the registry');
});

test('T-003', 'the one CLI reaches EVERY system (/guardian /cockpit /cortex /idearium /nexus)', () => {
  for (const sys of ['/guardian', '/cockpit', '/cortex', '/idearium', '/nexus']) {
    assert.ok(CLI.includes(`'${sys}'`), `must route ${sys}`);
  }
});

test('T-004', 'the one CLI can drive the tv-ui (/tv spotlight/nerve)', () => {
  assert.ok(/sysTok === '\/tv'/.test(CLI), 'tv-ui command must exist');
  assert.ok(/\/api\/ui\/spotlight|\/api\/ui\/nerve/.test(CLI), 'tv-ui commands hit the /api/ui surface');
});

test('T-005', 'cli/nexus-cli.js is now a SLIM shim (duplicate runtime removed, §16.5)', () => {
  const shim = fs.readFileSync(path.join(ROOT, 'cli/nexus-cli.js'), 'utf8');
  const lines = shim.split('\n').length;
  assert.ok(lines < 100, `shim must be slim (was 478), got ${lines}`);
  assert.ok(/require\('\.\.\/copilot\/cli'\)/.test(shim), 'shim must re-export the canonical CLI');
});

test('T-006', 'the shim preserves _copilotAsk (the one thing a test still imports — nothing broken)', () => {
  const shim = require(path.join(ROOT, 'cli/nexus-cli.js'));
  assert.strictEqual(typeof shim._copilotAsk, 'function');
});

test('T-007', 'the shim re-exports the canonical CLI surface (run/exec/start)', () => {
  const shim = require(path.join(ROOT, 'cli/nexus-cli.js'));
  for (const fn of ['run', 'exec', 'start']) assert.strictEqual(typeof shim[fn], 'function', `must re-export ${fn}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
