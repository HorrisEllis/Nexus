'use strict';
// Real, adversarial test for guardian/lib/ncp.js. James: "find every
// problem you can... hostile attacked and verified." Found by actually
// attacking the real module with a hostile payload, not by inspection
// alone: a circular-reference payload passed to push()/pushTab()/
// broadcast() was byte-identical to a genuinely dead client — sent:0
// either way. Given dispatcher.js's own real fix (0.39.51) treats
// sent:0 as "provider unreachable, requeue," a real programming bug
// (a bad payload shape somewhere upstream) would be silently
// misdiagnosed as "the provider is offline" and requeued forever,
// never surfacing the actual bug to anyone.

const assert = require('assert');
const { EventEmitter } = require('events');
const { createNCPServer } = require('../../guardian/lib/ncp.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

function makeConnectedNCP() {
  const events = [];
  const ncp = createNCPServer({ busEmit: (type, data) => events.push({ type, data }) });
  const fakeReq = new EventEmitter();
  const url = new URL('http://x/channel?provider=claude&tabId=t1');
  const fakeRes = {
    headersSent: false, writeHead: () => {}, flushHeaders: () => {},
    write: () => true, end: () => {},
  };
  ncp.handleChannel(fakeReq, fakeRes, url);
  events.length = 0; // clear the connect event, only care about what happens next
  return { ncp, events };
}

function circularPayload() {
  const c = { a: 1 };
  c.self = c;
  return c;
}

test('NCP-HOSTILE-001', 'push() with a circular payload does not crash the process', () => {
  const { ncp } = makeConnectedNCP();
  assert.doesNotThrow(() => ncp.push('claude', circularPayload()));
});

test('NCP-HOSTILE-002', 'push() with a circular payload reports a real, distinct bad_payload event, not silence', () => {
  const { ncp, events } = makeConnectedNCP();
  ncp.push('claude', circularPayload());
  const badPayloadEvent = events.find(e => e.type === 'ncp.push.bad_payload');
  assert.ok(badPayloadEvent, 'expected a real ncp.push.bad_payload event, got: ' + JSON.stringify(events));
  assert.ok(badPayloadEvent.data.error.includes('circular'), `expected the real stringify error message, got: ${badPayloadEvent.data.error}`);
});

test('NCP-HOSTILE-003', 'a genuinely good payload after a bad one still sends correctly — one bad call does not poison the client', () => {
  const { ncp } = makeConnectedNCP();
  ncp.push('claude', circularPayload());
  const sent = ncp.push('claude', { type: 'GUARDIAN_JOB', jobId: 'j1' });
  assert.strictEqual(sent, 1, 'a real, valid payload must still be deliverable after an earlier bad one');
});

test('NCP-HOSTILE-004', 'pushTab() with a circular payload does not crash and reports the same real event', () => {
  const { ncp, events } = makeConnectedNCP();
  const result = ncp.pushTab('claude', 't1', circularPayload());
  assert.strictEqual(result, false);
  assert.ok(events.find(e => e.type === 'ncp.push.bad_payload'));
});

test('NCP-HOSTILE-005', 'broadcast() with a circular payload does not crash and does not abort — clientCount still reports correctly', () => {
  const { ncp } = makeConnectedNCP();
  assert.doesNotThrow(() => ncp.broadcast(circularPayload()));
  assert.strictEqual(ncp.clientCount(), 1, 'the real, connected client must still be tracked after a bad broadcast payload');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
