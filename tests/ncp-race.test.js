'use strict';
// Test for the §23.12 NCP race fix in lib/ncp.js.
// Simulates the EXACT failure sequence: a tab reconnects (new req/res, same
// key) — handleChannel runs and registers the new client — then the OLD
// connection's close event fires afterward (this is realistic: TCP/network
// teardown is async, it does not happen at the instant a new request opens).
// Before the fix, the old connection's close handler deleted by key with no
// identity check, so it deleted the NEW client's registration — the server
// would think a live, healthy connection had just disconnected. That
// mismatch is what was visible as "flickering."
//
// Run: node tests/ncp-race.test.js
// Pass: exits 0, prints "PASS" for both assertions.
// Fail: throws, non-zero exit — this is a real test, not a console.log demo.

const { createNCPServer } = require('../guardian/lib/ncp');

function mockReqRes() {
  const closeHandlers = [];
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
    end() {},
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

  const PROVIDER = 'claude', TAB = 'tab-abc123';

  // ── Connection A: the original connection ──────────────────────────────
  const a = mockReqRes();
  ncp.handleChannel(a.req, a.res, mockUrl(PROVIDER, TAB));

  if (ncp.clientCount() !== 1) throw new Error(`expected 1 client after A connects, got ${ncp.clientCount()}`);

  // ── Connection B: a reconnect with the SAME key ────────────────────────
  // (handleChannel's own "close stale connection" logic fires here too —
  // that part already worked before this fix, it ends A's res directly.)
  const b = mockReqRes();
  ncp.handleChannel(b.req, b.res, mockUrl(PROVIDER, TAB));

  if (ncp.clientCount() !== 1) throw new Error(`expected 1 client after B reconnects (same key), got ${ncp.clientCount()}`);

  // ── THE RACE: A's close event fires AFTER B has already taken over ────
  // This is the exact ordering that broke things — async network teardown
  // for A completing some time after B has already registered.
  a.req._fireClose();

  // ── Assertion 1: B (the live, current connection) must still be registered.
  const providers = ncp.getProviders();
  if (!providers[PROVIDER]) {
    throw new Error('FAIL: B was incorrectly removed by A\'s delayed close event — the race is NOT fixed');
  }
  console.log('PASS: live connection B survives A\'s delayed close event');

  // ── Assertion 2: B's close event still correctly removes it. ──────────
  b.req._fireClose();
  const providersAfter = ncp.getProviders();
  if (providersAfter[PROVIDER]) {
    throw new Error('FAIL: B\'s own close event did not remove its registration — over-corrected the fix');
  }
  console.log('PASS: B\'s own close event still correctly cleans up its registration');

  console.log('\nAll assertions passed — race condition fixed and verified, not just reasoned about.');
}

main().catch(e => { console.error('\nTEST FAILED:', e.message); process.exit(1); });
