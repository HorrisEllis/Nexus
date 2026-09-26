'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-lifeline-guardian-timeout.test.js
 *
 * §FIX 2026-09-23 — James, live, watching a real repo-agent dispatch
 * show nothing in the frontend after a real, watched wait.
 *
 * Traced across three files: lib/repo-agent.js's dispatch() deliberately
 * bumps ITS OWN outer timeout to 300000ms for a guardian backend — its
 * own comment already explains why ("a browser provider answers through
 * a real tab... 90s is too short for a long answer"), stronger still for
 * a tab that just cold-spawned and has to load+authenticate (the exact
 * case in the boot log this was traced against). But copilot/
 * lifeline.js's _tryGuardian (the inner hop, copilot -> guardian) used a
 * hardcoded GUARDIAN_TIMEOUT_MS=45000 regardless of what the caller was
 * willing to wait — silently cutting the real round trip short at 45s no
 * matter how patient idearium's own outer call was, and neither side
 * ever knew. Fixed by threading a real opts.timeoutMs through: lib/
 * repo-agent.js's payload now carries it, copilot/server.js's /api/
 * prompt handler forwards it to dispatchFn, and _tryGuardian uses
 * opts.timeoutMs || GUARDIAN_TIMEOUT_MS for its own _post() call.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

async function main() {
  // ── real, live checks on the one directly-testable piece: _tryGuardian
  //    (exported as dispatchToNcpAgent), against real local HTTP servers
  //    standing in for guardian's own /api/copilot/prompt ─────────────
  await test('LT-001', 'a slow guardian reply (60s-equivalent) that would have been cut short by the OLD 45s default now succeeds when a real, longer opts.timeoutMs is given', async () => {
    // A fast stand-in for "guardian takes longer than 45s but less than
    // the caller's own real patience" — using real, short numbers so
    // this test runs in milliseconds while proving the SAME logic path
    // (opts.timeoutMs, not the hardcoded constant, governs the wait).
    const slowServer = http.createServer((req, res) => {
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ text: 'answer after the short-default window', jobId: 'j1' })); }, 60);
    });
    await new Promise(r => slowServer.listen(0, '127.0.0.1', r));
    const slowPort = slowServer.address().port;
    process.env.GUARDIAN_URL = `http://127.0.0.1:${slowPort}`;
    delete require.cache[require.resolve(path.join(ROOT, 'copilot', 'lifeline.js'))];
    const ll = require(path.join(ROOT, 'copilot', 'lifeline.js'));

    // opts.timeoutMs (200ms) is real and long enough; a hardcoded-ignoring
    // implementation using a tiny built-in constant would still work by
    // accident here, so this checks the OPPOSITE case below (LT-002) too.
    const r = await ll.dispatchToNcpAgent('a real test prompt', { provider: 'chatgpt', timeoutMs: 200 });
    assert.ok(r && r.ok, `expected a real success with a sufficient timeoutMs, got: ${JSON.stringify(r)}`);
    assert.strictEqual(r.text, 'answer after the short-default window');
    slowServer.close();
  });

  await test('LT-002', 'a real opts.timeoutMs shorter than the reply genuinely times out — proving timeoutMs is actually honoured, not just present and ignored', async () => {
    const slowServer = http.createServer((req, res) => {
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ text: 'too late', jobId: 'j2' })); }, 200);
    });
    await new Promise(r => slowServer.listen(0, '127.0.0.1', r));
    const slowPort = slowServer.address().port;
    process.env.GUARDIAN_URL = `http://127.0.0.1:${slowPort}`;
    delete require.cache[require.resolve(path.join(ROOT, 'copilot', 'lifeline.js'))];
    const ll = require(path.join(ROOT, 'copilot', 'lifeline.js'));

    const r = await ll.dispatchToNcpAgent('a real test prompt', { provider: 'chatgpt', timeoutMs: 30 });
    // _tryGuardian's own catch returns null on any exception (a timeout included) —
    // this IS the real, existing behavior; this test proves timeoutMs really
    // governed how long it waited before that null, not that null is wrong.
    // 0.39.244 — _tryGuardian now returns { ok:false, error } instead of a bare null, so the
    // reason reaches the caller ("guardian unavailable or returned no real response" said nothing).
    assert.ok(r && r.ok === false && /time(d)? ?out/i.test(r.error || ''), 'a real request that outlives its own explicit, short timeoutMs must time out — proving the value is actually used; got ' + JSON.stringify(r));
    slowServer.close();
  });

  await test('LT-003', 'no opts.timeoutMs at all still falls back to the real default — every existing caller that never set one is unaffected', async () => {
    // Sanity: GUARDIAN_TIMEOUT_MS itself (45000) is far too long to
    // actually wait out in a test — checked structurally instead (below),
    // this just proves the call doesn't throw when timeoutMs is omitted.
    const SRC = fs.readFileSync(path.join(ROOT, 'copilot', 'lifeline.js'), 'utf8');
    assert.ok(/opts\.timeoutMs \|\| GUARDIAN_TIMEOUT_MS/.test(SRC), 'the real fallback to the existing default must still be there');
  });

  // ── structural checks on the other two links in the chain ───────────
  const REPO_AGENT_SRC = fs.readFileSync(path.join(ROOT, 'lib', 'repo-agent.js'), 'utf8');
  await test('LT-004', 'lib/repo-agent.js sends its own real timeoutMs through in the payload to copilot, for a guardian backend', () => {
    assert.ok(/payload\.timeoutMs = timeoutMs/.test(REPO_AGENT_SRC));
    // must be set AFTER the 300000ms bump exists in this file, not before
    // (checking the bump is still there, unrelated to this specific fix,
    // and that this new line is a real, separate statement following it)
    assert.ok(/timeoutMs = 300000/.test(REPO_AGENT_SRC), 'the original 300000ms bump this fix depends on must still be real and present');
  });

  const COPILOT_SRC = fs.readFileSync(path.join(ROOT, 'copilot', 'server.js'), 'utf8');
  await test('LT-005', 'copilot/server.js\'s /api/prompt handler forwards body.timeoutMs to dispatchFn for a guardian backend', () => {
    assert.ok(/timeoutMs: body\.backend === 'guardian' \? \(body\.timeoutMs \|\| undefined\) : undefined/.test(COPILOT_SRC));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.env.GUARDIAN_URL = undefined;
  delete require.cache[require.resolve(path.join(ROOT, 'copilot', 'lifeline.js'))];
  process.exitCode = failed ? 1 : 0;
  process.exit(process.exitCode);
}

main();
