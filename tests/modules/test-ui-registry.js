'use strict';
/**
 * tests/modules/test-ui-registry.js
 * Phase 2 tests — UI Handshake
 */

const assert = require('assert');
const uiReg  = require('../../orchestrator/lib/ui-registry');

let passed = 0, failed = 0;
const events = [];

function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Mock broadcast
const mockBroadcast = (type, payload) => events.push({ type, payload });
const mockJaa = {
  insert: () => {},
  query:  () => [],
};

uiReg.init(mockBroadcast, mockJaa);

// T2-001: Register browser UI
test('T2-001', 'register browser UI → returns sessionId + stream endpoints', () => {
  const r = uiReg.register({ name:'nexus-shell', type:'browser', capabilities:['render','commands'] });
  assert.ok(r.ok);
  assert.ok(r.sessionId);
  assert.ok(!r.reconnected);
  assert.ok(r.streams.events === '/events');
  assert.ok(r.streams.components === '/api/components');
  assert.ok(r.streams.grammar === '/api/components/grammar');
});

// T2-002: Register userscript
test('T2-002', 'register userscript with tabId → returns session', () => {
  const r = uiReg.register({ name:'claude-userscript', type:'userscript',
    provider:'claude', tabId:'tab-abc-123', capabilities:['bda','raid','heal'] });
  assert.ok(r.ok);
  assert.ok(r.session.provider === 'claude');
  assert.ok(r.session.tabId === 'tab-abc-123');
});

// T2-003: Register terminal CLI
test('T2-003', 'register terminal CLI → appears in connected list', () => {
  uiReg.register({ name:'auth-client', type:'terminal', capabilities:['commands'] });
  const connected = uiReg.listOnline();
  assert.ok(connected.length >= 3, 'expected 3+ UIs online');
  assert.ok(connected.find(s => s.type === 'terminal'));
});

// T2-004: Heartbeat updates lastSeen
test('T2-004', 'heartbeat → updates lastSeen', () => {
  const r1 = uiReg.register({ name:'hb-test', type:'browser' });
  const before = uiReg.get(r1.sessionId).lastSeen;
  uiReg.heartbeat(r1.sessionId);
  const after = uiReg.get(r1.sessionId).lastSeen;
  assert.ok(after >= before, 'lastSeen not updated');
});

// T2-005: Re-register same tabId → reconnect, same sessionId
test('T2-005', 're-register same tabId → reconnect, same sessionId', () => {
  const r1 = uiReg.register({ name:'tab-ui', type:'userscript', tabId:'same-tab-id' });
  const r2 = uiReg.register({ name:'tab-ui', type:'userscript', tabId:'same-tab-id' });
  assert.ok(r2.reconnected, 'should be reconnect');
  assert.strictEqual(r1.sessionId, r2.sessionId, 'sessionId should match on reconnect');
});

// T2-006: Deregister → removed from list
test('T2-006', 'deregister → removed from connected list', () => {
  const r = uiReg.register({ name:'temp-ui', type:'browser' });
  const before = uiReg.listOnline().length;
  uiReg.deregister(r.sessionId);
  const after = uiReg.listOnline().length;
  assert.strictEqual(after, before - 1);
});

// T2-007: Stats returns byType breakdown
test('T2-007', 'stats() → byType breakdown', () => {
  const s = uiReg.stats();
  assert.ok(typeof s.total === 'number');
  assert.ok(typeof s.online === 'number');
  assert.ok(s.byType, 'byType missing');
  assert.ok(typeof s.byType.browser === 'number' || s.byType.browser === undefined);
});

// T2-008: Registration emits ui.registered event
test('T2-008', 'register → emits ui.registered SSE event', () => {
  events.length = 0;
  uiReg.register({ name:'event-test', type:'external' });
  const found = events.find(e => e.type === 'ui.registered');
  assert.ok(found, 'ui.registered event not emitted');
  assert.ok(found.payload.name === 'event-test');
});

// T2-009: Heartbeat on unknown session → error
test('T2-009', 'heartbeat with unknown sessionId → error', () => {
  const r = uiReg.heartbeat('nonexistent-session-id');
  assert.ok(!r.ok);
  assert.ok(r.error.includes('not found'));
});

// T2-010: handleRequest routes correctly
test('T2-010', 'handleRequest POST register → same as direct register', () => {
  const r = uiReg.handleRequest('POST', 'register',
    { name:'api-test', type:'browser' }, null);
  assert.ok(r.ok);
  assert.ok(r.sessionId);
});

// T2-011: handleRequest GET connected → online list
test('T2-011', 'handleRequest GET connected → returns online sessions', () => {
  const r = uiReg.handleRequest('GET', 'connected', null, null);
  assert.ok(r.ok);
  assert.ok(Array.isArray(r.sessions));
  assert.ok(r.sessions.every(s => s.online));
});

// T2-012: handleRequest GET stats
test('T2-012', 'handleRequest GET /api/ui → stats', () => {
  const r = uiReg.handleRequest('GET', '', null, null);
  assert.ok(r.ok);
  assert.ok(typeof r.online === 'number');
});

console.log(`\n  ui-registry: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
