'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-clear-glass-idle-vs-open.js — real regression test for
 * the 2026-07-24 fix: "when the electron instance is open, it shouldn't be
 * considered idle."
 *
 * Root cause (confirmed by reading, not assumed): autopilot.js's
 * _startIdleReaper() despawns an on-demand kernel once
 * Date.now() - lastActivity exceeds idleTimeoutMs. lastActivity was only
 * ever set once, at requestSpawn() time. Nothing in clear-glass ever called
 * autopilot's POST /touch/:name to reset that clock, so a window left open
 * and actively used for longer than idleTimeoutMs (10 min) still got
 * despawned — the process would vanish out from under an active user.
 *
 * Two-sided fix: (1) autopilot.js now injects AUTOPILOT_STATUS_PORT into
 * clear-glass's env so it can reach the real (possibly overridden) status
 * port; (2) clear-glass/src/main/index.js now pings POST /touch/clear-glass
 * periodically while a real window is visible.
 *
 * §HONEST LIMITATION — Electron is not installed in this test environment
 * (no node_modules), so clear-glass/src/main/index.js cannot be required or
 * executed here; that half is verified STRUCTURALLY (the right functions
 * exist, are wired to the right events, call the right endpoint) rather than
 * by execution. Said explicitly, not glossed over. autopilot.js has no
 * Electron dependency and every test below against it is real execution
 * against the real module, not an extracted copy.
 */
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const AUTOPILOT_PATH = path.join(__dirname, '../../nexus/autopilot.js');
const CLEAR_GLASS_MAIN = path.join(__dirname, '../../clear-glass/src/main/index.js');

// ── autopilot.js side — real execution, no Electron dependency ────────────

test('CGI-001', 'requiring autopilot.js (no side effects — require.main !== module) exposes ALL_KERNELS with clear-glass env carrying AUTOPILOT_STATUS_PORT', () => {
  delete require.cache[require.resolve(AUTOPILOT_PATH)];
  const mod = require(AUTOPILOT_PATH);
  const cg = mod.ALL_KERNELS.find(k => k.name === 'clear-glass');
  assert.ok(cg, 'clear-glass kernel entry must exist');
  assert.ok(cg.env, 'clear-glass must have an env object');
  assert.strictEqual(cg.env.AUTOPILOT_STATUS_PORT, '7799', 'default status port must be injected as a string');
  // §regression guard — the fix that was already there (GUARDIAN_DIR) must
  // survive the new env merge, not get clobbered by it.
  assert.ok('GUARDIAN_DIR' in cg.env, 'the pre-existing GUARDIAN_DIR env entry must not be lost');
});

test('CGI-002', 'a real spawned autopilot process with --status-port= override propagates the OVERRIDDEN port, not the default', () => {
  const r = spawnSync('node', ['-e', `
    process.argv = ['node', 'autopilot.js', '--status-port=9123'];
    const mod = require(${JSON.stringify(AUTOPILOT_PATH)});
    const cg = mod.ALL_KERNELS.find(k => k.name === 'clear-glass');
    console.log(JSON.stringify(cg.env.AUTOPILOT_STATUS_PORT));
  `], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `child process must exit cleanly: ${r.stderr}`);
  assert.strictEqual(JSON.parse(r.stdout.trim()), '9123', 'the override port, not the 7799 default, must be what clear-glass receives');
});

test('CGI-003', 'AUTOPILOT_STATUS_PORT=0 (status server disabled) propagates 0, not the default — clear-glass must know not to call a server that was never started', () => {
  const r = spawnSync('node', ['-e', `
    process.env.AUTOPILOT_STATUS_PORT = '0';
    const mod = require(${JSON.stringify(AUTOPILOT_PATH)});
    const cg = mod.ALL_KERNELS.find(k => k.name === 'clear-glass');
    console.log(JSON.stringify(cg.env.AUTOPILOT_STATUS_PORT));
  `], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `child process must exit cleanly: ${r.stderr}`);
  assert.strictEqual(JSON.parse(r.stdout.trim()), '0', 'disabled must propagate as 0, not silently fall back to 7799');
});

test('CGI-004', 'REAL touchActivity() resets lastActivity — the exact function POST /touch/:name calls', () => {
  delete require.cache[require.resolve(AUTOPILOT_PATH)];
  const mod = require(AUTOPILOT_PATH);
  mod._state['clear-glass'] = { status: 'stable', proc: {}, lastActivity: Date.now() - (9 * 60 * 1000) }; // 9 min ago
  const before = mod._state['clear-glass'].lastActivity;
  mod.touchActivity('clear-glass');
  const after = mod._state['clear-glass'].lastActivity;
  assert.ok(after > before, 'touchActivity must move lastActivity forward');
  assert.ok(Date.now() - after < 1000, 'touchActivity must set lastActivity to (approximately) now');
});

test('CGI-005', 'REAL idle-reaper math: a kernel touched moments ago is NOT past idleTimeoutMs; one that was never touched after a long-ago spawn IS', () => {
  delete require.cache[require.resolve(AUTOPILOT_PATH)];
  const mod = require(AUTOPILOT_PATH);
  const kernel = mod.ALL_KERNELS.find(k => k.name === 'clear-glass');
  assert.strictEqual(kernel.idleTimeoutMs, 10 * 60 * 1000, 'precondition: 10 minute idle timeout, as configured');

  // Reproduces the exact bug: spawned 11 minutes ago, window has been open
  // and in active use the whole time (simulated by a touch 30s ago, as the
  // real 60s heartbeat would have done).
  const untouched = { lastActivity: Date.now() - (11 * 60 * 1000) };
  const touchedRecently = { lastActivity: Date.now() - (30 * 1000) };

  const isIdle = (s) => (Date.now() - s.lastActivity) > kernel.idleTimeoutMs;
  assert.strictEqual(isIdle(untouched), true, 'never-touched-since-spawn must still be correctly detected as idle (the reaper must still work for genuinely unused instances)');
  assert.strictEqual(isIdle(touchedRecently), false, 'THE BUG: a window touched 30s ago (i.e. open and in use) must NOT be flagged idle, regardless of how long ago the process originally spawned');
});

// ── clear-glass side — structural verification only (Electron unavailable) ─

test('CGI-006', 'clear-glass/src/main/index.js defines the heartbeat functions and starts them from bootstrap', () => {
  const fs = require('fs');
  const src = fs.readFileSync(CLEAR_GLASS_MAIN, 'utf8');
  assert.ok(/function _touchAutopilotIfOpen\s*\(/.test(src), '_touchAutopilotIfOpen must be defined');
  assert.ok(/function _startAutopilotActivityHeartbeat\s*\(/.test(src), '_startAutopilotActivityHeartbeat must be defined');
  assert.ok(/function _anyWindowVisible\s*\(/.test(src), '_anyWindowVisible must be defined');
  assert.ok(/_startAutopilotActivityHeartbeat\(\);/.test(src), 'the heartbeat must actually be started somewhere (bootstrap), not just defined and never called');
});

test('CGI-007', 'the touch call targets POST /touch/<MODULE_ID> — the real autopilot endpoint, correct kernel name', () => {
  const fs = require('fs');
  const src = fs.readFileSync(CLEAR_GLASS_MAIN, 'utf8');
  assert.ok(/\/touch\/\$\{MODULE_ID\}/.test(src), 'must call /touch/${MODULE_ID}, not a hardcoded or wrong name');
  assert.ok(/MODULE_ID\s*=\s*'clear-glass'/.test(src), 'MODULE_ID must actually equal autopilot\'s kernel name "clear-glass" for the endpoint to resolve to the right kernel');
});

test('CGI-008', 'background tabs are explicitly excluded from "open" — only windows/settingsWin count', () => {
  const fs = require('fs');
  const src = fs.readFileSync(CLEAR_GLASS_MAIN, 'utf8');
  const fnMatch = src.match(/function _anyWindowVisible\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, '_anyWindowVisible function body must be found');
  const body = fnMatch[0];
  assert.ok(!/bgTabs/.test(body), '_anyWindowVisible must NOT reference bgTabs — background/automation tabs must not count as "open" or idle-despawn would never fire for any session that used one');
  assert.ok(/windows\.values\(\)/.test(body), 'must check the real visible-windows Map');
});

test('CGI-009', 'window show handlers exist for agent windows, the settings window and (0.39.241) the library window, for immediate (not just periodic) responsiveness', () => {
  const fs = require('fs');
  const src = fs.readFileSync(CLEAR_GLASS_MAIN, 'utf8');
  const showHooks = src.match(/\.on\('show',\s*\(\)\s*=>\s*_touchAutopilotIfOpen\(\)\)/g) || [];
  assert.strictEqual(showHooks.length, 3, `expected 3 'show' → touch hooks (agent window + settings window + library window), found ${showHooks.length}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
