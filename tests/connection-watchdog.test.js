'use strict';
// Tests the §23.16 watchdog added to connect() in both userscripts.
//
// Can't load the real userscript (GM_xmlhttpRequest doesn't exist outside
// a browser tab). What's tested here, honestly: the exact watchdog logic,
// extracted verbatim, run against the specific failure mode it exists for
// — a connection attempt where NONE of onerror/onabort/onprogress/ontimeout
// ever fire. Before this fix, that left connState stuck on 'connecting'
// forever. This proves the watchdog recovers from exactly that.
//
// Run: node tests/connection-watchdog.test.js

function main() {
  let connState = 'disconnected';
  let _connGen = 0;
  let _reconnectScheduled = false;
  const stateLog = [];
  const warnings = [];

  function setConnState(s) { connState = s; stateLog.push(s); }
  function _log(level, msg) { if (level === 'warn') warnings.push(msg); }

  // ── Exact watchdog logic, copied from connect() ────────────────────────
  function armWatchdog(myGen, getOpened, getConnGen) {
    let fired = false;
    const timer = {
      // Simulates the setTimeout callback firing — called manually by the
      // test instead of waiting 10 real seconds.
      trigger() {
        fired = true;
        if (myGen !== getConnGen()) return;
        if (getOpened()) return;
        _log('warn', 'NCP watchdog — no response in 10s, forcing reconnect');
        connState = 'disconnected'; setConnState('disconnected');
        _reconnectScheduled = true;
      },
    };
    return timer;
  }

  // ── Scenario 1: connection that never fires ANY callback ──────────────
  // (the exact silent-failure mode this fix exists for)
  let opened1 = false;
  const myGen1 = ++_connGen;
  connState = 'connecting'; setConnState('connecting');
  const wd1 = armWatchdog(myGen1, () => opened1, () => _connGen);

  if (connState !== 'connecting') throw new Error('FAIL: setup — should be connecting');

  // 10 seconds pass, nothing ever called any GM_xmlhttpRequest callback.
  wd1.trigger();

  if (connState !== 'disconnected') {
    throw new Error(`FAIL: watchdog should force disconnected state, got '${connState}'`);
  }
  if (!_reconnectScheduled) throw new Error('FAIL: watchdog should schedule a reconnect');
  if (warnings.length !== 1) throw new Error('FAIL: watchdog should log exactly one warning');
  console.log('PASS: a connection that never fires any callback is recovered by the watchdog after 10s');

  // ── Scenario 2: connection that DID succeed before the watchdog fires ──
  _reconnectScheduled = false;
  let opened2 = true; // succeeded via onprogress before the timer ran
  const myGen2 = ++_connGen;
  connState = 'ready'; setConnState('ready');
  const wd2 = armWatchdog(myGen2, () => opened2, () => _connGen);
  wd2.trigger();

  if (connState !== 'ready') throw new Error(`FAIL: watchdog should not touch a successfully-opened connection, got '${connState}'`);
  if (_reconnectScheduled) throw new Error('FAIL: watchdog should not schedule a reconnect for a connection that already succeeded');
  console.log('PASS: a connection that already succeeded is left alone by its own watchdog');

  // ── Scenario 3: a SUPERSEDED watchdog (from an old attempt) must not ───
  // fire after a newer connect() has already taken over — same generation
  // guard as the rest of §23.12/§23.16.
  _reconnectScheduled = false;
  let openedStale = false;
  const myGenStale = ++_connGen; // attempt 3
  const wdStale = armWatchdog(myGenStale, () => openedStale, () => _connGen);
  ++_connGen; // attempt 4 supersedes attempt 3 before its watchdog fires
  connState = 'connecting'; setConnState('connecting'); // attempt 4 in progress
  wdStale.trigger(); // attempt 3's stale watchdog fires late

  if (connState !== 'connecting') {
    throw new Error(`FAIL: a superseded attempt's watchdog overwrote the current attempt's state, got '${connState}'`);
  }
  if (_reconnectScheduled) throw new Error('FAIL: a superseded watchdog should not schedule its own reconnect');
  console.log('PASS: a superseded attempt\'s watchdog correctly no-ops instead of stomping on a newer attempt');

  console.log('\nAll assertions passed. State transition log:', stateLog.join(' -> '));
}

main();
