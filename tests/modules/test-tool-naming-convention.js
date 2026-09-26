'use strict';
/**
 * tests/modules/test-tool-naming-convention.js — James's new tool/command/
 * agent-tool naming taxonomy (lib/agent-tools/naming.js) plus the one
 * genuinely new tool built to it, cortex.restep.tool.
 */
const assert = require('assert');
const { toolName, commandName, agentToolName, parseName, VALID_SYSTEMS, VALID_PROVIDERS } = require('../../lib/agent-tools/naming.js');
const { _restep } = require('../../lib/agent-tools/tools/system-tools/cortex-restep.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('TN-001', 'toolName builds system.name.tool', () => {
  assert.strictEqual(toolName('guardian', 'build'), 'guardian.build.tool');
});

test('TN-002', 'commandName builds system.name.command', () => {
  assert.strictEqual(commandName('copilot', 'restart'), 'copilot.restart.command');
});

test('TN-003', 'agentToolName builds provider.agent.name.agent.tool', () => {
  assert.strictEqual(agentToolName('chatgpt', 'default', 'ask'), 'chatgpt.default.ask.agent.tool');
});

test('TN-004', 'toolName rejects an unregistered system rather than silently accepting it', () => {
  assert.throws(() => toolName('not_a_real_system', 'x'));
});

test('TN-005', 'agentToolName rejects an unregistered provider', () => {
  assert.throws(() => agentToolName('not_a_real_provider', 'x', 'y'));
});

test('TN-006', 'name parts reject dots/dashes (no nested namespacing sneaking in)', () => {
  assert.throws(() => toolName('guardian', 'bad-name'));
  assert.throws(() => toolName('guardian', 'bad.name'));
});

test('TN-007', 'parseName round-trips a real tool name', () => {
  assert.deepStrictEqual(parseName('guardian.build.tool'), { kind: 'tool', system: 'guardian', name: 'build' });
});

test('TN-008', 'parseName round-trips a real command name', () => {
  assert.deepStrictEqual(parseName('copilot.restart.command'), { kind: 'command', system: 'copilot', name: 'restart' });
});

test('TN-009', 'parseName round-trips a real agent-tool name', () => {
  assert.deepStrictEqual(parseName('chatgpt.default.ask.agent.tool'), { kind: 'agent_tool', provider: 'chatgpt', agent: 'default', name: 'ask' });
});

test('TN-010', 'parseName returns null (never throws) on garbage input', () => {
  assert.strictEqual(parseName('not a real name at all'), null);
  assert.strictEqual(parseName(42), null);
});

test('TN-011', 'VALID_SYSTEMS/VALID_PROVIDERS are non-empty and exported', () => {
  assert.ok(VALID_SYSTEMS.length > 5);
  assert.ok(VALID_PROVIDERS.includes('claude') && VALID_PROVIDERS.includes('chatgpt'));
});

// cortex.restep.tool's real recount logic
test('TR-001', 'restep recomputes step ordinals from real ts order, not input order', () => {
  const rows = [
    { uuid: 'c', ts: 300, type: 'x' },
    { uuid: 'a', ts: 100, type: 'x' },
    { uuid: 'b', ts: 200, type: 'x' },
  ];
  const result = _restep(rows);
  assert.deepStrictEqual(result.sequence.map(s => s.uuid), ['a', 'b', 'c']);
  assert.deepStrictEqual(result.sequence.map(s => s.step), [1, 2, 3]);
  assert.strictEqual(result.realCount, 3);
});

test('TR-002', 'restep flags drift against a believed count', () => {
  const rows = [{ uuid: 'a', ts: 1 }, { uuid: 'b', ts: 2 }, { uuid: 'c', ts: 3 }];
  const result = _restep(rows, 2); // caller believes only 2 events happened
  assert.strictEqual(result.believedCount, 2);
  assert.strictEqual(result.drift, 1);
  assert.strictEqual(result.diverged, true);
});

test('TR-003', 'restep reports no divergence when the believed count matches reality', () => {
  const rows = [{ uuid: 'a', ts: 1 }, { uuid: 'b', ts: 2 }];
  const result = _restep(rows, 2);
  assert.strictEqual(result.diverged, false);
  assert.strictEqual(result.drift, 0);
});

test('TR-004', 'restep with no believedCount omits drift fields entirely (no false 0)', () => {
  const result = _restep([{ uuid: 'a', ts: 1 }]);
  assert.strictEqual('drift' in result, false);
  assert.strictEqual('diverged' in result, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
