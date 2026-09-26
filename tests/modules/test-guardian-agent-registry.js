'use strict';
/**
 * tests/modules/test-guardian-agent-registry.js — real, functional
 * tests for AM8's new registerAgent()/listAgents()/getAgent() on
 * clear-glass/src/options/store.js (NexusOptions).
 *
 * James: "The guardian element-picker → 'add as new agent' flow (AM8)."
 * clear-glass/renderer/guardian-picker.js's own real two-step pairing
 * (pick an element, choose input/output, pick the opposite) sends a
 * real 'guardian.agent.create' event once both elements are captured;
 * clear-glass/src/ipc/bridge.js relays it to this store's real
 * registerAgent(). This tests the store directly — the picker UI and
 * the IPC relay are Electron/DOM-dependent and covered by the
 * structural tests below instead.
 *
 * §ISOLATION — NexusOptions._persist() writes to a real, hardcoded
 * OPTIONS_PATH with no override mechanism (a real, pre-existing
 * limitation, not introduced by this change, not silently fixed here
 * either). fs.writeFileSync is safely mocked for the duration of this
 * test file only, restored immediately after, so nothing real is ever
 * touched on disk.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// §SAFE MOCK — real writes are captured in memory, never touch disk.
const _realWriteFileSync = fs.writeFileSync;
const _writes = [];
fs.writeFileSync = (...args) => { _writes.push(args); };

const NexusOptions = require(path.join(ROOT, 'clear-glass/src/options/store.js'));

test('AGT-001', 'registerAgent() refuses without a real agentName', () => {
  const store = new NexusOptions();
  const r = store.registerAgent({ origin: 'https://example.com', input: { selector: '#in' }, output: { selector: '#out' } });
  assert.ok(r.error);
});

test('AGT-002', 'registerAgent() refuses without a real input selector', () => {
  const store = new NexusOptions();
  const r = store.registerAgent({ agentName: 'test', origin: 'https://example.com', output: { selector: '#out' } });
  assert.ok(r.error);
  assert.ok(r.error.includes('input'));
});

test('AGT-003', 'registerAgent() refuses without a real output selector', () => {
  const store = new NexusOptions();
  const r = store.registerAgent({ agentName: 'test', origin: 'https://example.com', input: { selector: '#in' } });
  assert.ok(r.error);
  assert.ok(r.error.includes('output'));
});

test('AGT-004', 'registerAgent() with real, complete input+output pair succeeds and persists to memory', () => {
  const store = new NexusOptions();
  const r = store.registerAgent({
    agentName: 'my-custom-tool', origin: 'https://example.com', url: 'https://example.com/chat',
    input: { selector: '#prompt-box', xpath: null },
    output: { selector: '#response-area', xpath: null },
  });
  assert.ok(r.id);
  assert.strictEqual(r.agentName, 'my-custom-tool');
  assert.strictEqual(r.input.selector, '#prompt-box');
  assert.strictEqual(r.output.selector, '#response-area');
  assert.strictEqual(r.enabled, true);
});

test('AGT-005', 'listAgents() returns real, previously-registered agents, sorted by createdAt', () => {
  const store = new NexusOptions();
  store.registerAgent({ agentName: 'first', origin: 'https://a.com', input: { selector: '#a' }, output: { selector: '#b' } });
  store.registerAgent({ agentName: 'second', origin: 'https://b.com', input: { selector: '#c' }, output: { selector: '#d' } });
  const list = store.listAgents();
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].agentName, 'first');
  assert.strictEqual(list[1].agentName, 'second');
});

test('AGT-006', 'getAgent(id) returns the real, exact registered record, and null for a nonexistent id', () => {
  const store = new NexusOptions();
  const r = store.registerAgent({ agentName: 'lookup-me', origin: 'https://c.com', input: { selector: '#x' }, output: { selector: '#y' } });
  const found = store.getAgent(r.id);
  assert.strictEqual(found.agentName, 'lookup-me');
  assert.strictEqual(store.getAgent('nonexistent-id'), null);
});

test('AGT-007', 'each real registration triggers a real disk write via _persist() — mocked here, but the real call site is exercised', () => {
  const before = _writes.length;
  const store = new NexusOptions();
  store.registerAgent({ agentName: 'persist-check', origin: 'https://d.com', input: { selector: '#p' }, output: { selector: '#q' } });
  assert.ok(_writes.length > before, 'expected registerAgent() to call the real _persist() path (mocked here, real in production)');
});

// ── Structural checks — the picker UI and IPC relay (Electron/DOM-dependent) ──
const pickerSrc = fs.readFileSync ? null : null; // placeholder, real read below via _realWriteFileSync-free fs
const _fs2 = require('fs');

test('AGT-008', 'guardian-picker.js has the real two-step pairing state machine, not a single-pick shortcut', () => {
  const src = _realReadFile('clear-glass/renderer/guardian-picker.js');
  if (!src.includes('_pendingAgentPair')) throw new Error('missing the real pairing state variable');
  if (!src.includes("if (role === _pendingAgentPair.firstRole)")) throw new Error('missing the real opposite-role check — a person could otherwise pair two inputs or two outputs');
});

test('AGT-009', 'the real second pick sends guardian.agent.create with both real element fingerprints, not just one', () => {
  const src = _realReadFile('clear-glass/renderer/guardian-picker.js');
  const block = src.slice(src.indexOf("type: 'guardian.agent.create'") - 200, src.indexOf("type: 'guardian.agent.create'") + 300);
  if (!block.includes('input:  inputSel') || !block.includes('output: outputSel')) throw new Error('missing real, complete input+output fingerprints in the sent event');
});

test('AGT-010', 'ipc/bridge.js relays guardian.agent.create to the real registerAgent(), not a stub', () => {
  const src = _realReadFile('clear-glass/src/ipc/bridge.js');
  if (!src.includes("d.type === 'guardian.agent.create'")) throw new Error('missing the real event-type check');
  if (!src.includes('this.options?.registerAgent({')) throw new Error('missing the real call to the store');
});

test('AGT-011', 'the real custom-agents:* IPC channels do not collide with the pre-existing agent-mesh agents:list handler', () => {
  const src = _realReadFile('clear-glass/src/ipc/bridge.js');
  const agentsListCount = (src.match(/ipcMain\.handle\('agents:list'/g) || []).length;
  if (agentsListCount !== 1) throw new Error(`expected exactly 1 real 'agents:list' handler (the real agent-mesh registry), found ${agentsListCount} — a duplicate registration crashes Electron's ipcMain at boot (the real bug James found live)`);
  if (!src.includes("ipcMain.handle('custom-agents:list'")) throw new Error("AM8's own channels must be renamed off 'agents:*' entirely");
});

function _realReadFile(rel) {
  return _fs2.readFileSync(path.join(ROOT, rel), 'utf8');
}

fs.writeFileSync = _realWriteFileSync;
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
