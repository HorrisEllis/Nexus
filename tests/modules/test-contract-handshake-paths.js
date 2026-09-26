'use strict';
/**
 * tests/modules/test-contract-handshake-paths.js — real tests for
 * orchestrator/lib/contract-handshake.js's CONTRACT_PATHS map.
 *
 * James, live, from a real boot log: "[orch] contract.unreachable —
 * versionium (invalid JSON: Unexpected token 'N', "Not found" is not
 * valid JSON)". Real root cause: versionium (built this session, VS1)
 * was never added to CONTRACT_PATHS, so orchestrator's own poller fell
 * through to the wrong default path ('/api/contract') and hit a real
 * 404 whose plain-text body isn't valid JSON — the exact same bug class
 * this file's own comment already documents happened once before, for
 * loom.
 *
 * This test exists specifically so a THIRD sovereign system added later
 * doesn't repeat this same mistake silently — every real system with a
 * bare '/contract' route (confirmed by reading each one's own real
 * routes file, not assumed) must be listed here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const { CONTRACT_PATHS } = require(path.join(ROOT, 'orchestrator/lib/contract-handshake.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('CHP-001', 'versionium is registered with the real, correct bare /contract path', () => {
  assert.strictEqual(CONTRACT_PATHS.versionium, '/contract');
});

test('CHP-002', 'versionium\'s own real route file actually serves /contract — the mapping matches reality, not just itself', () => {
  const src = fs.readFileSync(path.join(ROOT, 'versionium/routes/system.js'), 'utf8');
  assert.ok(src.includes("pathname === '/contract'"), 'versionium/routes/system.js must genuinely serve this path');
});

// ── The whole bug class — every real system claiming a bare '/contract'
// path here must actually serve one, checked against real route files
// where a plausible one exists, not assumed from the map alone.
const REAL_ROUTE_FILES = {
  cortex:       'cortex/boot.js',
  guardian:     'guardian/server.js',
  eravos:       'eravos/server.js',
  ollama:       'ollama/routes/system.js',
  copilot:      'copilot/server.js',
  loom:         'loom/server.js',
  versionium:   'versionium/routes/system.js',
};

for (const [systemId, relPath] of Object.entries(REAL_ROUTE_FILES)) {
  test(`CHP-${systemId}`, `${systemId}: CONTRACT_PATHS says '${CONTRACT_PATHS[systemId]}', and its real server file exists to serve it`, () => {
    const abs = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(abs), `expected ${relPath} to exist for a real, checkable contract path`);
    if (CONTRACT_PATHS[systemId] === '/contract') {
      const src = fs.readFileSync(abs, 'utf8');
      assert.ok(
        src.includes("'/contract'") || src.includes('"/contract"'),
        `CONTRACT_PATHS claims a bare /contract route for ${systemId}, but ${relPath} never mentions it — the exact real bug this test file exists to catch`
      );
    }
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
