'use strict';
// Real, structural test — Electron-only file. James: "loading questions
// into the sse into where ever picked. then i have copilot read and
// answer them." Real, confirmed gap: the copilot-cli link target
// already sent the real question successfully, but _postToApiChannel's
// own real, original design ("we don't need the response body")
// discarded every real answer, for every caller, by design — the
// question worked, the answer never came back anywhere.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../clear-glass/src/ipc/bridge.js'), 'utf8');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('GPA-001', '_postToApiChannel has a real, opt-in captureBody param, defaulting to false (preserves every existing caller\'s real behavior)', () => {
  assert.ok(/_postToApiChannel\(url, payload, captureBody = false\)/.test(SRC), 'the real, opt-in param is missing or its default changed');
});

test('GPA-002', 'the copilot-cli route now captures the real body and emits a real, distinct answer event', () => {
  const idx = SRC.indexOf("target.type === 'copilot-cli'");
  const block = SRC.slice(idx, idx + 1100);
  assert.ok(/true \/\/ §FOUND & FIXED/.test(block), 'copilot-cli no longer passes captureBody:true');
  assert.ok(block.includes("this.sse.emit('guardian.listener.copilot-answer'"), 'the real answer is no longer emitted back via SSE');
});

test('GPA-003', 'the ollama-stream route gets the exact same real fix, not left with the old, silent-discard behavior', () => {
  const idx = SRC.indexOf("target.type === 'ollama-stream'");
  const block = SRC.slice(idx, idx + 800);
  assert.ok(block.includes("this.sse.emit('guardian.listener.ollama-answer'"), 'ollama-stream still discards its real answer');
});

test('GPA-004', 'the one other real caller of _postToApiChannel (line ~1030) is untouched — still 2 args, still the original, correct discard-body behavior', () => {
  const idx = SRC.indexOf('this._postToApiChannel(d.apiUrl, d)');
  assert.ok(idx > -1, 'the original, unrelated caller is missing entirely — may have been accidentally changed');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
