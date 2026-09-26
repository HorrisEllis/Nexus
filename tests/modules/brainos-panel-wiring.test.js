'use strict';
// Real, structural test — token-conscious. James: "BrainOS html file
// for all of this." Real, confirmed dead code found: fetchPipeline()/
// fetchAutomation() existed, fully real, with zero matching HTML tabs
// and a real ID mismatch (pipeline-body/automation-body vs this file's
// own rt-* convention) — setRTab() never called either. All fixed
// together. New: a real Tool Calls panel reading this session's own
// tool-call-listener.js persistence via cortex's real, generic
// /api/jaa/:table endpoint.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const JS = fs.readFileSync(path.join(__dirname, '../../ui/brainos/brainos-app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '../../ui/brainos/index.html'), 'utf8');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('BOH-001', 'the real HTML now has tabs+bodies for pipeline, automation, and toolcalls — not just chatlog/node', () => {
  for (const tab of ['pipeline', 'automation', 'toolcalls']) {
    assert.ok(HTML.includes(`data-rtab="${tab}"`), `missing tab: ${tab}`);
    assert.ok(HTML.includes(`id="rt-${tab}"`), `missing body: rt-${tab}`);
  }
});

test('BOH-002', 'fetchPipeline/fetchAutomation use the real, consistent rt-* element IDs, not the old mismatched ones', () => {
  assert.ok(JS.includes("getElementById('rt-pipeline')"), 'fetchPipeline still uses the wrong element id');
  assert.ok(JS.includes("getElementById('rt-automation')"), 'fetchAutomation still uses the wrong element id');
  assert.ok(!JS.includes("getElementById('pipeline-body')"), 'the old, dead pipeline-body id reference is still present');
  assert.ok(!JS.includes("getElementById('automation-body')"), 'the old, dead automation-body id reference is still present');
});

test('BOH-003', 'setRTab() now actually dispatches to all 4 real fetch functions on tab switch, not just chatlog', () => {
  const idx = JS.indexOf('function setRTab(tab)');
  const block = JS.slice(idx, idx + 1100);
  for (const fn of ['fetchChatLog()', 'fetchPipeline()', 'fetchAutomation()', 'fetchToolCalls()']) {
    assert.ok(block.includes(fn), `setRTab() no longer calls ${fn}`);
  }
});

test('BOH-004', 'fetchToolCalls() is real, reads the actual guardian_tool_calls table via the real, generic JAA endpoint, and escapes its output', () => {
  assert.ok(JS.includes('/api/jaa/guardian_tool_calls'), 'fetchToolCalls does not hit the real endpoint/table');
  const idx = JS.indexOf('function fetchToolCalls()');
  const block = JS.slice(idx, idx + 900);
  assert.ok(/_escapeHtml\(r\.toolName\)/.test(block), 'fetchToolCalls does not escape real tool-call data before innerHTML — same real class of bug already fixed elsewhere in this file');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
