'use strict';
/**
 * test/watchdog.test.js — Watchdog gates tests
 * UUID: cg-test-watchdog-v1-0000-0000-000000000010
 *
 * Run: node test/watchdog.test.js
 */

// Fresh module cache before running
Object.keys(require.cache).forEach(k => {
  if (k.includes('clear-glass-v3')) delete require.cache[k];
});

const { Stream, Event } = require('../siso/index');
const {
  rateLimitWatchdog,
  cookieHealthWatchdog,
  diagWatchdog,
  driverErrorWatchdog,
  tokenRelayWatchdog,
  meshErrorWatchdog,
  nexusOfflineWatchdog,
} = require('../seam/watchdog-gates');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
}

function assert(c, msg = 'assertion failed') { if (!c) throw new Error(msg); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg || `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

// ── Rate limit watchdog ────────────────────────────────────────────────────
console.log('\n[1] Rate limit watchdog');
{
  test('emits watchdog.rate-limit.handled on rate limit event', () => {
    const stream = new Stream();
    const emitted = [];
    stream.on('watchdog.rate-limit.handled', e => emitted.push(e));
    stream.register(rateLimitWatchdog(null));
    stream.emit(new Event('context.rate-limited', { agentId: 'test-agent' }));
    assertEqual(emitted.length, 1);
    assertEqual(emitted[0].data.agentId, 'test-agent');
    assertEqual(emitted[0].data.action, 'mesh.route.triggered');
  });

  test('rate limit watchdog handles missing mesh gracefully', () => {
    const stream = new Stream();
    stream.register(rateLimitWatchdog(null)); // no mesh
    // Should not throw
    stream.emit(new Event('context.rate-limited', { agentId: 'agent-x' }));
    assert(true, 'should not throw');
  });
}

// ── Cookie health watchdog ─────────────────────────────────────────────────
console.log('\n[2] Cookie health watchdog');
{
  test('emits gap.open when cookies unhealthy', () => {
    const stream = new Stream();
    const gaps = [];
    stream.on('watchdog.gap.open', e => gaps.push(e));
    stream.register(cookieHealthWatchdog(null));
    stream.emit(new Event('cookie.health.result', { agentId: 'agent-a', healthy: false, expired: 3, total: 10 }));
    assertEqual(gaps.length, 1);
    assertEqual(gaps[0].data.source, 'clear-glass.cookie.health');
    assert(gaps[0].data.severity, 'should have severity');
  });

  test('does nothing when cookies are healthy', () => {
    const stream = new Stream();
    const gaps = [];
    stream.on('watchdog.gap.open', e => gaps.push(e));
    stream.register(cookieHealthWatchdog(null));
    stream.emit(new Event('cookie.health.result', { agentId: 'agent-b', healthy: true, expired: 0, total: 10 }));
    assertEqual(gaps.length, 0, 'should emit no gaps when healthy');
  });

  test('sets high severity when many cookies expired', () => {
    const stream = new Stream();
    const gaps = [];
    stream.on('watchdog.gap.open', e => gaps.push(e));
    stream.register(cookieHealthWatchdog(null));
    stream.emit(new Event('cookie.health.result', { agentId: 'agent-c', healthy: false, expired: 8, total: 10 }));
    assertEqual(gaps[0].data.severity, 'high');
  });
}

// ── Diagnostic watchdog ────────────────────────────────────────────────────
console.log('\n[3] Diagnostic watchdog');
{
  test('emits gap.open on failed diagnostic run', () => {
    const stream = new Stream();
    const gaps = [];
    stream.on('watchdog.gap.open', e => gaps.push(e));
    stream.register(diagWatchdog(null));
    stream.emit(new Event('diag.complete', {
      runId: 'r1', label: 'NEXUS Audit', passed: 3, failed: 2, total: 5,
      success: false,
      results: [{ label: 'Step 1', passed: false }, { label: 'Step 2', passed: false }],
    }));
    assertEqual(gaps.length, 1);
    assert(gaps[0].data.failedSteps.includes('Step 1'));
  });

  test('does nothing on passing diagnostic run', () => {
    const stream = new Stream();
    const gaps = [];
    stream.on('watchdog.gap.open', e => gaps.push(e));
    stream.register(diagWatchdog(null));
    stream.emit(new Event('diag.complete', {
      runId: 'r2', label: 'Test', passed: 5, failed: 0, total: 5, success: true, results: [],
    }));
    assertEqual(gaps.length, 0);
  });
}

// ── Driver error watchdog ──────────────────────────────────────────────────
console.log('\n[4] Driver error watchdog');
{
  test('emits watchdog.driver.error on driver failure', () => {
    const stream = new Stream();
    const errors = [];
    stream.on('watchdog.driver.error', e => errors.push(e));
    stream.register(driverErrorWatchdog(null));
    stream.emit(new Event('driver.error', { action: 'click', agentId: 'a1', error: 'Element not found', requestId: 'r1' }));
    assertEqual(errors.length, 1);
    assertEqual(errors[0].data.action, 'click');
  });

  test('marks non-retryable when error is timeout', () => {
    const stream = new Stream();
    const errors = [];
    stream.on('watchdog.driver.error', e => errors.push(e));
    stream.register(driverErrorWatchdog(null));
    stream.emit(new Event('driver.error', { action: 'navigate', agentId: 'a2', error: 'Navigate timeout', requestId: 'r2' }));
    assertEqual(errors[0].data.retryable, false);
  });

  test('emits driver.retry for retryable errors', () => {
    const stream = new Stream();
    const retries = [];
    stream.on('driver.retry', e => retries.push(e));
    stream.register(driverErrorWatchdog(null));
    stream.emit(new Event('driver.error', { action: 'click', agentId: 'a3', error: 'Stale element', requestId: 'r3' }));
    assertEqual(retries.length, 1);
  });
}

// ── Token relay watchdog ───────────────────────────────────────────────────
console.log('\n[5] Token relay watchdog');
{
  test('emits watchdog.tokens.found when API calls detected', () => {
    const stream = new Stream();
    const found = [];
    stream.on('watchdog.tokens.found', e => found.push(e));
    stream.register(tokenRelayWatchdog(null));
    stream.emit(new Event('dom.tokens.result', {
      agentId: 'a1',
      result: { apiCalls: [{ url: 'https://api.anthropic.com/v1/messages' }], modelRefs: [], tokenCounts: [], prompts: [], responses: [] },
    }));
    assertEqual(found.length, 1);
    assertEqual(found[0].data.apiCallCount, 1);
  });

  test('does nothing when no interesting tokens found', () => {
    const stream = new Stream();
    const found = [];
    stream.on('watchdog.tokens.found', e => found.push(e));
    stream.register(tokenRelayWatchdog(null));
    stream.emit(new Event('dom.tokens.result', {
      agentId: 'a2',
      result: { apiCalls: [], modelRefs: [], tokenCounts: [], prompts: [], responses: [] },
    }));
    assertEqual(found.length, 0);
  });
}

// ── Mesh error watchdog ────────────────────────────────────────────────────
console.log('\n[6] Mesh error watchdog');
{
  test('emits watchdog.mesh.demote on mesh error', () => {
    const stream = new Stream();
    const demotes = [];
    stream.on('watchdog.mesh.demote', e => demotes.push(e));
    stream.register(meshErrorWatchdog());
    stream.emit(new Event('mesh.error', { op: 'send', agentKey: 'claude', error: 'Timeout', prompt: 'test' }));
    assertEqual(demotes.length, 1);
    assertEqual(demotes[0].data.agentKey, 'claude');
  });

  test('triggers mesh.route fallback on send/route failure', () => {
    const stream = new Stream();
    const routes = [];
    stream.on('mesh.route', e => routes.push(e));
    stream.register(meshErrorWatchdog());
    stream.emit(new Event('mesh.error', { op: 'route', agentKey: 'chatgpt', error: 'Unavailable', prompt: 'hello' }));
    assertEqual(routes.length, 1);
    assertEqual(routes[0].data._meta.reason, 'mesh-error-fallback');
  });
}

// ── NEXUS offline watchdog ─────────────────────────────────────────────────
console.log('\n[7] NEXUS offline watchdog');
{
  test('emits offline event when NEXUS disconnects', () => {
    const stream = new Stream();
    const offline = [];
    stream.on('watchdog.nexus.offline', e => offline.push(e));
    stream.register(nexusOfflineWatchdog());
    stream.emit(new Event('nexus.status', { connected: false }));
    assertEqual(offline.length, 1);
    assert(offline[0].data.since > 0);
  });

  test('emits reconnected event when NEXUS comes back', () => {
    const stream = new Stream();
    const events = [];
    stream.on('watchdog.nexus.offline',      e => events.push({ type: 'offline', ...e.data }));
    stream.on('watchdog.nexus.reconnected',  e => events.push({ type: 'reconnected', ...e.data }));
    stream.register(nexusOfflineWatchdog());
    stream.emit(new Event('nexus.status', { connected: false }));
    stream.emit(new Event('nexus.status', { connected: true }));
    assertEqual(events[0].type, 'offline');
    assertEqual(events[1].type, 'reconnected');
  });

  test('does not double-fire offline event', () => {
    const stream = new Stream();
    const offline = [];
    stream.on('watchdog.nexus.offline', e => offline.push(e));
    stream.register(nexusOfflineWatchdog());
    stream.emit(new Event('nexus.status', { connected: false }));
    stream.emit(new Event('nexus.status', { connected: false }));
    stream.emit(new Event('nexus.status', { connected: false }));
    assertEqual(offline.length, 1, 'should only fire once');
  });
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Watchdog Gates — Tests`);
console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
if (failed > 0) { process.exit(1); }
else { console.log('All watchdog tests pass ✓'); process.exit(0); }
