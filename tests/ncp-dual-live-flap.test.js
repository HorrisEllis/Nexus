'use strict';
// Regression test for the 2026-09-15 REVISED fix in lib/ncp.js + dispatcher.js.
// Reproduces the exact scenario from the flapping log: two genuinely-alive
// clients for the SAME provider but DIFFERENT tabIds (clear-glass pre-warm
// overlapping the real tab). The first version of the fix force-closed
// whichever wasn't newest on connect, which made two live tabs evict each
// other in a loop ("3 disconnects within 60s" on both). This test asserts
// the revised fix: neither socket is ever force-closed by the other's
// connection, only the _activeByProvider pointer moves — and pushActive()
// (what dispatcher.js now calls) always reaches exactly one client, never
// zero, never both.
//
// Run: node tests/ncp-dual-live-flap.test.js

const assert = require('assert');
const { createNCPServer } = require('../guardian/lib/ncp');

function mockReqRes() {
  const closeHandlers = [];
  let ended = false;
  const req = {
    on(event, cb) { if (event === 'close') closeHandlers.push(cb); },
    _fireClose() { closeHandlers.forEach(cb => cb()); },
  };
  const writes = [];
  const res = {
    headersSent: false,
    writeHead() { this.headersSent = true; },
    flushHeaders() {},
    write(chunk) { writes.push(chunk); },
    end() { ended = true; },
    get ended() { return ended; },
    _writes: writes,
  };
  return { req, res };
}
function mockUrl(provider, tabId) {
  return { searchParams: { get: k => ({ provider, tabId }[k]) } };
}

async function main() {
  const events = [];
  const ncp = createNCPServer({
    onConnect:    e => events.push(['connect', e.key]),
    onDisconnect: e => events.push(['disconnect', e.key]),
  });

  const PROVIDER = 'chatgpt', TAB_A = 'mu2ltgv3ed0r3uyaus', TAB_B = 'mu2xe0lwm706zjlutg';

  // A connects first (e.g. clear-glass's pre-warm tab)
  const a = mockReqRes();
  ncp.handleChannel(a.req, a.res, mockUrl(PROVIDER, TAB_A));
  assert.strictEqual(ncp.clientCount(), 1, 'expected 1 client after A connects');

  // B connects shortly after (the real tab) — DIFFERENT tabId, SAME provider
  const b = mockReqRes();
  ncp.handleChannel(b.req, b.res, mockUrl(PROVIDER, TAB_B));

  // ── The core regression assertion ──────────────────────────────────────
  // Both are genuinely alive: neither socket should have been force-closed
  // just because the other one connected.
  assert.strictEqual(a.res.ended, false, 'FAIL: A was force-closed on B\'s connect — this IS the flapping regression');
  assert.strictEqual(b.res.ended, false, 'B should obviously not be closed by its own connect');
  assert.strictEqual(ncp.clientCount(), 2, 'both genuinely-alive tabs should remain registered simultaneously');
  console.log('PASS: two live tabs for one provider coexist — neither force-closed the other');

  // dispatch (pushActive) must reach exactly one of them — never zero, never both
  const sent = ncp.pushActive(PROVIDER, { type: 'NCP_JOB', jobId: 'job-1' });
  assert.strictEqual(sent, 1, `pushActive should report exactly 1 sent, got ${sent}`);
  const aGotIt = a.res._writes.some(w => w.includes('job-1'));
  const bGotIt = b.res._writes.some(w => w.includes('job-1'));
  assert.ok(aGotIt !== bGotIt, 'exactly one client should have received the dispatched job, not zero or both');
  assert.ok(bGotIt, 'the most-recently-connected client (B) should be the one dispatch targets');
  console.log('PASS: pushActive() reached exactly one client (the current one), no duplicate dispatch');

  // Simulate B (the active one) actually dying — its close event fires for real.
  b.req._fireClose();
  assert.strictEqual(ncp.clientCount(), 1, 'A should remain after B genuinely disconnects');

  // Dispatch again — failover must retarget to A without anyone force-closing anything.
  // (In real life this needs a heartbeat from A to trigger the failover in
  // handleHeartbeat; simulate that here.)
  const fakeHeartbeatReq = {};
  const fakeHeartbeatRes = { headersSent: false, writeHead(){this.headersSent=true;}, end(){} };
  const readBody = () => Promise.resolve({ provider: PROVIDER, tabId: TAB_A, ts: Date.now() });
  ncp.handleHeartbeat(fakeHeartbeatReq, fakeHeartbeatRes, readBody);
  await new Promise(r => setImmediate(r)); // let the readBody promise resolve

  const sent2 = ncp.pushActive(PROVIDER, { type: 'NCP_JOB', jobId: 'job-2' });
  assert.strictEqual(sent2, 1, `pushActive should still reach exactly 1 client after failover, got ${sent2}`);
  assert.ok(a.res._writes.some(w => w.includes('job-2')), 'after B disconnects and A heartbeats, dispatch should fail over to A');
  console.log('PASS: dispatch fails over to the surviving client after a real disconnect, via heartbeat — no forced close needed');

  console.log('\nAll assertions passed — dual-live-tab flapping regression is fixed and verified.');
  process.exit(0);
}

main().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
