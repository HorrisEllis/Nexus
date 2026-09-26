'use strict';
// Tests the §23.12 client-side generation-guard pattern used in both
// userscript-claude.js and userscript-chatgpt.js's connect().
//
// This can't load the actual userscript (it depends on GM_xmlhttpRequest,
// the page DOM, Tampermonkey globals — none of which exist outside a real
// browser tab). What CAN be verified here, for real, is the actual logic
// pattern: does a stale connection's callback get correctly ignored once a
// newer connection has superseded it? That's the exact mechanism the fix
// depends on, extracted and run in isolation rather than just asserted.
//
// Run: node tests/connection-generation-guard.test.js

let _connGen = 0;
let connState = 'disconnected';
const stateLog = [];

function setConnState(s) { connState = s; stateLog.push(s); }

// Mirrors the real connect()'s shape: each "attempt" captures myGen at
// creation time and every callback checks it before touching shared state.
function fakeConnect(behavior) {
  const myGen = ++_connGen;
  connState = 'connecting'; setConnState('connecting');
  const callbacks = {};
  callbacks.onSuccess = () => {
    if (myGen !== _connGen) return;
    connState = 'ready'; setConnState('ready');
  };
  callbacks.onError = () => {
    if (myGen !== _connGen) return;
    connState = 'disconnected'; setConnState('disconnected');
  };
  behavior(callbacks, myGen);
  return callbacks;
}

function main() {
  // ── Scenario: connection A is mid-flight, connect() is called again
  // (e.g. a real reconnect timer firing) starting B, and THEN A's error
  // callback fires late — this is the exact race that caused flickering.
  const aCallbacks = fakeConnect(() => {}); // A starts, does nothing yet (mid-flight)
  const bCallbacks = fakeConnect(() => {}); // B supersedes A (gen now 2)

  bCallbacks.onSuccess(); // B connects successfully first
  if (connState !== 'ready') throw new Error(`expected 'ready' after B succeeds, got '${connState}'`);

  aCallbacks.onError(); // A's stale error callback fires late
  if (connState !== 'ready') {
    throw new Error(`FAIL: A's stale callback overwrote state to '${connState}' — the race is NOT fixed`);
  }
  console.log("PASS: B's 'ready' state survives A's late-firing stale error callback");

  // ── Sanity: B's OWN error callback must still work correctly. ─────────
  bCallbacks.onError();
  if (connState !== 'disconnected') {
    throw new Error(`FAIL: B's own error callback did not update state, got '${connState}'`);
  }
  console.log("PASS: B's own callback still correctly updates state — guard isn't over-suppressing");

  console.log('\nAll assertions passed. State transition log:', stateLog.join(' -> '));
}

main();
