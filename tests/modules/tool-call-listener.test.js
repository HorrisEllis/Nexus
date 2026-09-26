'use strict';
// Real, isolated test for lib/agent-tools/tool-call-listener.js. James:
// "the listener for the tools... persistent storage using cortex memory
// architectures... reusing outputs." Then: "including hey nexus?" —
// confirmed the earlier, guardian-only wiring did NOT cover copilot's
// separate tool-runtime.js (wake-word included); moved the real
// result-capture to executeTool() itself, the one universal dispatch
// point every real tool call passes through.
//
// §ISOLATED — real, isolated JAA_DATA_DIR, same convention this session
// already established, so this never touches the real, shared store.
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.JAA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-call-listener-'));
process.on('exit', () => { try { fs.rmSync(process.env.JAA_DATA_DIR, { recursive: true, force: true }); } catch (_) {} });

const assert = require('assert');
const { EventEmitter } = require('events');
const listener = require('../../lib/agent-tools/tool-call-listener.js');
const { jaaDB } = require('../../cortex/memory/jaa-db.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

async function main() {
  await test('TCL-001', 'install() requires a real bus with .on()', () => {
    assert.throws(() => listener.install({}, jaaDB), /bus/);
  });

  await test('TCL-002', 'install() requires a real jaa with .insert()', () => {
    assert.throws(() => listener.install(new EventEmitter(), {}), /jaa/);
  });

  await test('TCL-003', 'a real guardian.tool.called event is persisted to JAA', () => {
    const bus = new EventEmitter();
    listener.install(bus, jaaDB);
    bus.emit('guardian.tool.called', { jobId: 'j-real-1', provider: 'claude', calls: [{ name: 'read_file', arguments: { path: 'x.js' } }], ts: Date.now() });
    const rows = jaaDB.query(listener.TABLE, r => r.jobId === 'j-real-1');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].toolName, 'read_file');
  });

  await test('TCL-004', 'recordResult() + findRecentResult() round-trip a real result correctly', () => {
    listener.recordResult(jaaDB, 'j-real-1', 'read_file', { path: 'x.js' }, { content: 'real content' });
    const found = listener.findRecentResult(jaaDB, 'read_file', { path: 'x.js' });
    assert.ok(found, 'expected a real cached result');
    assert.deepStrictEqual(found.result, { content: 'real content' });
  });

  await test('TCL-005', 'different arguments correctly produce a cache miss — no false reuse', () => {
    const found = listener.findRecentResult(jaaDB, 'read_file', { path: 'genuinely-different.js' });
    assert.strictEqual(found, null);
  });

  await test('TCL-006', 'a call with no recorded result yet is honestly absent from findRecentResult, not returned as null-content', () => {
    const bus = new EventEmitter();
    listener.install(bus, jaaDB);
    bus.emit('guardian.tool.called', { jobId: 'j-real-2', provider: 'claude', calls: [{ name: 'never_completed', arguments: {} }], ts: Date.now() });
    const found = listener.findRecentResult(jaaDB, 'never_completed', {});
    assert.strictEqual(found, null, 'a call with no real result yet must not be returned as if it were a cached hit');
  });

  await test('TCL-007', 'recordCall() does a real, direct, complete insert — no prior "called" row required, unlike recordResult()', () => {
    listener.recordCall(jaaDB, 'j-universal-1', 'read_file', { path: 'universal-test.js' }, { content: 'real universal content' });
    const found = listener.findRecentResult(jaaDB, 'read_file', { path: 'universal-test.js' });
    assert.ok(found, 'expected a real, direct insert with no prior row needed');
    assert.deepStrictEqual(found.result, { content: 'real universal content' });
  });

  await test('TCL-008', 'executeTool() itself (the real, universal dispatch point) now records a successful real result, reachable via findRecentResult', async () => {
    const { executeTool } = require('../../lib/agent-tools/index.js');
    await executeTool('read_file', { path: 'package.json' }, { jobId: 'j-universal-2' });
    const found = listener.findRecentResult(jaaDB, 'read_file', { path: 'package.json' });
    assert.ok(found, 'expected executeTool() to have recorded a real, successful result');
  });

  await test('TCL-009', 'executeTool() does NOT record a genuinely failed call — nothing reusable exists for an error', async () => {
    const { executeTool } = require('../../lib/agent-tools/index.js');
    const r = await executeTool('read_file', { path: 'genuinely-nonexistent-file-xyz.js' }, { jobId: 'j-universal-3' });
    assert.ok(r.error, 'sanity check: this real call must actually fail');
    const found = listener.findRecentResult(jaaDB, 'read_file', { path: 'genuinely-nonexistent-file-xyz.js' });
    assert.strictEqual(found, null, 'a genuinely failed call must never be cached as if it were a reusable result');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
