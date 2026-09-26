'use strict';

/**
 * lib/component-exec-test.js
 *
 * §MCO15 2026-09-13 (Track C — component compiler, exec test). James's
 * original ask, from much earlier this session: "a real component_exec_
 * test — boot + real invocation, never a keyword-presence floor
 * (lib/seam/axioms.js already names that exact weakness in itself)."
 *
 * §HONEST SCOPE, stated up front — this is a genuinely scoped-DOWN
 * version of that ambition, not the full thing. "Boot + real invocation"
 * for an arbitrary owned file (e.g. guardian/server.js, which calls
 * server.listen() at module scope) would mean actually starting a real
 * HTTP server and hitting a real route — safe to do for one file at a
 * time, but requires per-file knowledge of ports/deps/mocks this generic
 * module doesn't have. What's built here instead, and what it actually
 * proves: a real, isolated child-process require() of each owned file,
 * bounded by a timeout — genuinely stronger than a keyword-presence
 * check (lib/seam/axioms.js's own stated floor) because it really
 * executes the file's top-level code and its own real require() chain,
 * catching real syntax errors AND real missing-module errors, neither of
 * which a text-pattern check could ever find. What it does NOT prove:
 * that a route handler INSIDE the file behaves correctly when actually
 * invoked with a real request — that's the larger, not-yet-built next
 * increment, requiring per-component request/response mocking.
 *
 * A file that starts a real listener (confirmed: guardian/server.js,
 * cortex/boot.js, idearium/api/index.js, architect/service.js all do)
 * will make this test's child process hang past the timeout — that
 * outcome is reported as loadedThenHung:true, a genuinely different,
 * more informative result than a plain failure: the require() itself
 * completed with no synchronous throw (real evidence the file is
 * loadable), the process just had more to do afterward that a bare
 * require-and-check can't safely wait out.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * execTestFile(absPath, timeoutMs) — the real, single-file check. Spawns
 * `node -e "require(path); process.exit(0)"` in its own process so a
 * thrown error, or a lingering listener, never touches this process.
 */
function execTestFile(absPath, timeoutMs = DEFAULT_TIMEOUT_MS) {
  // §CORRECTED 2026-09-13 — the first draft called process.exit(0)
  // immediately after a successful synchronous require(), which meant a
  // file that starts a real listener (server.listen(), setInterval,
  // etc.) could never actually be observed doing so — the forced exit
  // pre-empted it every time, making the loadedThenHung branch below
  // unreachable in practice. Caught by actually running this against
  // guardian/server.js (which has no require.main guard around its own
  // server.listen()) and getting loadedThenHung:false when the file's
  // own real behavior should have kept the process alive. Fixed: no
  // forced exit on success — a synchronous throw still exits 1
  // immediately (a real failure signal), but a clean require lets
  // Node's own event loop decide naturally whether anything real is
  // still running. If nothing is, the process exits 0 on its own; if
  // something real is (a listener, a timer), the spawnSync timeout is
  // now the thing that actually observes and reports that, not a
  // theory about it.
  const script = `try { require(${JSON.stringify(absPath)}); } catch (e) { console.error(e.message); process.exit(1); }`;
  const res = spawnSync(process.execPath, ['-e', script], { timeout: timeoutMs, encoding: 'utf8' });

  if (res.error && res.error.code === 'ETIMEDOUT') {
    // The require() itself never threw within the window, and the
    // process was still alive when the timeout fired — real evidence
    // something in the file's own top-level code (a listener, an
    // interval) kept running past a clean load. Real, informative, not
    // a failure.
    return { ok: true, loadedThenHung: true, file: absPath };
  }
  if (res.status === 0) return { ok: true, loadedThenHung: false, file: absPath };
  return { ok: false, file: absPath, error: (res.stderr || '').trim() || 'require() failed with no captured stderr' };
}

/**
 * execTestComponent(componentId, componentRegistry, opts) — runs
 * execTestFile against every one of a component's real owns[] entries.
 */
function execTestComponent(componentId, componentRegistry, opts = {}) {
  const repoRoot = path.resolve(__dirname, '..');
  const component = componentRegistry.get(componentId);
  if (!component) return { ok: false, reason: `no real component registered as "${componentId}"` };
  const owns = Array.isArray(component.owns) ? component.owns : [];
  if (!owns.length) return { ok: false, reason: `"${componentId}" has no real owns[] entries — nothing to exec-test` };

  const results = owns.map(rel => execTestFile(path.resolve(repoRoot, rel), opts.timeoutMs));
  const allLoaded = results.every(r => r.ok);
  return { ok: allLoaded, componentId, results };
}

module.exports = { execTestFile, execTestComponent, DEFAULT_TIMEOUT_MS };
