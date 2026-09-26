'use strict';
// CA2 + CA3 (docs/copilot-awareness-routing-phasemap.spec, CHUNK A). CA2: every
// tool has an operational usage note (edge cases, how/when to use) injected into
// co-pilot's system prompt. CA3: the prompt instructs looking for a tool BEFORE
// escalating. §8.6 built on the existing registry; §12.5 notes are versioned so
// tool-behavior drift is detectable.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { toolGuide, noteFor, NOTES, GUIDE_VERSION } = require(path.join(ROOT, 'lib/agent-tools/tool-guide'));
const at = require(path.join(ROOT, 'lib/agent-tools'));

test('T-001', 'CA2: EVERY registered tool has a usage note (full coverage)', () => {
  const names = at.getToolSchemas().map(s => s.function.name);
  // §2026-08-09 — coverage is judged against noteFor(), not NOTES directly.
  // A tool copilot FORGED at runtime cannot have a hand-written note; it
  // self-documents from its definition. Judging against NOTES alone would fail
  // the moment a forged tool exists, which is a false negative, not a gap.
  const missing = names.filter(n => !noteFor(n));
  assert.strictEqual(missing.length, 0, `tools without a note: ${missing.join(', ')}`);
});

test('T-002', 'CA2: notes carry edge cases (the operational knowledge descriptions lack)', () => {
  const withEdge = Object.values(NOTES).filter(n => n.edge).length;
  assert.ok(withEdge >= 10, `most tools should have an edge-case note, got ${withEdge}`);
});

test('T-003', 'CA2: toolGuide() renders a legible guide with use + edge + prefer', () => {
  const g = toolGuide();
  assert.ok(/edge:/.test(g), 'guide includes edge cases');
  assert.ok(/prefer:/.test(g), 'guide includes prefer hints');
  assert.ok(g.split('\n').length >= 15, 'guide covers the tool set');
});

test('T-004', 'CA2: toolGuide(names) filters to the requested tools', () => {
  const g = toolGuide(['read_file']);
  assert.ok(/read_file/.test(g));
  assert.ok(!/module_builder/.test(g), 'filtered guide only includes requested tools');
});

test('T-005', 'CA2: the guide is injected into the co-pilot system prompt', () => {
  const rt = fs.readFileSync(path.join(ROOT, 'copilot/tool-runtime.js'), 'utf8');
  assert.ok(/tool-guide/.test(rt) && /YOUR TOOLS/.test(rt), 'the system prompt must inject the tool guide');
});

test('T-006', 'CA3: the system prompt instructs TOOL-FIRST (look for a tool before escalating)', () => {
  const rt = fs.readFileSync(path.join(ROOT, 'copilot/tool-runtime.js'), 'utf8');
  assert.ok(/look for a tool.*before/i.test(rt), 'the prompt must instruct tool-first');
});

test('T-007', 'CA2: the guide is versioned (drift detectable, §12.5)', () => {
  assert.ok(GUIDE_VERSION, 'the guide must carry a version so tool-behavior drift from its note is detectable');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
