'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
let passed = 0, failed = 0;
const _t = [];
function test(id, desc, fn) { _t.push({ id, desc, fn }); }

const ap = require('../../nexus/autopilot.js');

// requestSpawn reads _state[name].status and, for alive/spawning states, must
// return alreadyRunning WITHOUT calling _spawnKernel. We can't launch a real
// Electron in-sandbox, so we drive the guard directly through the exported
// _state and assert the short-circuit — the exact logic that failed live.

// §0.39.282 — clear-glass was promoted to always-on (nexus/autopilot.js §onDemand, "onDemand/idleTimeoutMs removed"), so
// no configured kernel is on-demand today. The guard is still the real code path for any kernel that is, so the cases
// drive it through a fixture kernel added to the real KERNELS list (only the short-circuit paths run; nothing spawns).
const FIXTURE = { name: 'spawn-guard-fixture', onDemand: true, idleTimeoutMs: 600000 };
function findOnDemand() {
  let k = ap.KERNELS.find(x => x.onDemand);
  if (!k) { ap.KERNELS.push(FIXTURE); ap._state[FIXTURE.name] = ap._state[FIXTURE.name] || { status: 'dormant', lastActivity: 0 }; k = FIXTURE; }
  return k;
}

test('T-001', 'the on-demand guard is still reachable (a configured on-demand kernel, or the fixture), and clear-glass is always-on', () => {
  const k = findOnDemand();
  assert.ok(k && typeof ap.requestSpawn === 'function');
  const cg = ap.KERNELS.find(x => x.name === 'clear-glass');
  if (cg) assert.ok(!cg.onDemand, 'clear-glass is always-on since its promotion');
});

for (const state of ['starting', 'online', 'running', 'stable']) {
  test(`T-${state}`, `requestSpawn short-circuits when status='${state}' — no second spawn`, async () => {
    const k = findOnDemand();
    ap._state[k.name] = { ...(ap._state[k.name] || {}), status: state, lastActivity: 0 };
    const r = await ap.requestSpawn(k.name);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.alreadyRunning, true, `status='${state}' must be treated as already running`);
    assert.strictEqual(r.state, state);
  });
}

test('T-002', 'a non-onDemand kernel is rejected (not spawnable on request)', async () => {
  const always = ap.KERNELS.find(k => !k.onDemand);
  const r = await ap.requestSpawn(always.name);
  assert.strictEqual(r.ok, false);
  assert.ok(/not an on-demand/.test(r.error));
});

test('T-003', 'unknown kernel is rejected cleanly', async () => {
  const r = await ap.requestSpawn('no-such-kernel-xyz');
  assert.strictEqual(r.ok, false);
});


test('T-004', 'an idle despawn (dormant) is NOT counted as a crash — the restart-storm root cause', () => {
  // Live log 2026-07-24: "idle for 630s — despawning (on-demand)" was followed
  // one line later by "crashes in window: 1/6", then a restart that raced the
  // dying Electron's lock -> 6 crashes -> CIRCUIT BREAKER TRIPPED.
  const src = require('fs').readFileSync(require('path').join(__dirname,'../../nexus/autopilot.js'),'utf8');
  assert.ok(/s\.status === 'stopping' \|\| s\.status === 'dormant'/.test(src),
    'exit handler must treat dormant (idle despawn) as an intentional stop, not a crash');
  // and the status must be set BEFORE the kill, or the exit can race it
  const reaper = src.slice(src.indexOf('_startIdleReaper'));
  const setIdx = reaper.indexOf("s.status = 'dormant'");
  const killIdx = reaper.indexOf("s.proc.kill('SIGTERM')");
  assert.ok(setIdx > -1 && killIdx > -1 && setIdx < killIdx,
    'dormant status must be assigned before kill() to avoid the exit-callback race');
});

(async () => {
  for (const { id, desc, fn } of _t) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
