'use strict';
// Real test for the 2026-09-03 staleSweep fix in lib/ncp.js.
// Before: _staleSweep deleted a stale client from _clients but never
// called client.res.end() — guardian forgot the client server-side while
// the real SSE socket stayed open, so the browser-side EventSource never
// saw an error and never reconnected. After: res.end() is called before
// the delete, same pattern handleChannel already uses for same-key
// reconnects.
//
// Intercepts setInterval to capture the real sweep callback and invoke it
// directly, instead of waiting the real 15s — same client/module under
// test either way, just controlled timing.

const realSetInterval = global.setInterval;
let capturedSweepCb = null;
global.setInterval = function (cb, ms) {
  if (ms === 15_000) { capturedSweepCb = cb; return { unref(){} }; }
  return realSetInterval(cb, ms);
};

const { createNCPServer } = require('../guardian/lib/ncp');

function mockReqRes() {
  const closeHandlers = [];
  let ended = false;
  const req = { on(event, cb) { if (event === 'close') closeHandlers.push(cb); }, _fireClose() { closeHandlers.forEach(cb => cb()); } };
  const res = {
    headersSent: false,
    writeHead() { this.headersSent = true; },
    flushHeaders() {},
    write() {},
    end() { ended = true; },
    get ended() { return ended; },
  };
  return { req, res };
}
function mockUrl(provider, tabId) { return { searchParams: { get: k => ({ provider, tabId }[k]) } }; }

async function main() {
  const events = [];
  const ncp = createNCPServer({ onDisconnect: e => events.push(e) });
  global.setInterval = realSetInterval; // restore now that createNCPServer's own setInterval call has run

  if (!capturedSweepCb) throw new Error('did not capture the real staleSweep interval callback — setInterval interception failed, test cannot proceed');

  const { req, res } = mockReqRes();
  ncp.handleChannel(req, res, mockUrl('claude', 'tab-stale-test'));
  if (ncp.clientCount() !== 1) throw new Error(`expected 1 client after connect, got ${ncp.clientCount()}`);

  // Age the client past STALE_MS (30_000) without waiting real time —
  // real approach here is to fast-forward Date.now() itself, since
  // _isStale() computes (Date.now() - client.lastHeartbeat) > STALE_MS.
  const realNow = Date.now;
  Date.now = () => realNow() + 31_000;

  capturedSweepCb(); // run the REAL sweep body — this ncp.js instance's actual code, not a copy

  Date.now = realNow;

  if (ncp.clientCount() !== 0) throw new Error(`expected 0 clients after stale sweep, got ${ncp.clientCount()}`);
  console.log('PASS: stale client removed from _clients');

  if (!res.ended) throw new Error('res.end() was never called on the stale client — the exact bug this fix targets');
  console.log('PASS: res.end() called on the stale client — browser-side EventSource will now actually see an error and reconnect');

  if (events.length !== 1 || events[0].reason !== 'stale') throw new Error(`expected one onDisconnect(reason:'stale') event, got ${JSON.stringify(events)}`);
  console.log('PASS: onDisconnect fired with reason:stale, same as before the fix');
}

main().then(() => { console.log('ALL PASS'); process.exit(0); }).catch(e => { console.error('FAIL:', e.message); process.exit(1); });
