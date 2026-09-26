'use strict';
// Real, structural test. James: "using copilot as the bridge for ollama
// and guardian... like a railroad switch to switch tracks. default is
// ollama, then routing to chatgpt would switch to guardian like a
// toggle switch." Real, confirmed gap: _talkToCopilot never sent a
// provider field at all — always the auto-cascade, no way to switch.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../copilot/cli.js'), 'utf8');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('NCS-001', 'a real _cliProvider state variable exists, defaulting to ollama', () => {
  assert.ok(/let _cliProvider = 'ollama'/.test(SRC), 'the real default (ollama) is missing or changed');
});

test('NCS-002', 'a real "switch" command exists, handling ollama/guardian/specific agents/auto', () => {
  assert.ok(SRC.includes("trimmed === 'switch'"), 'the real switch command is missing');
  assert.ok(SRC.includes("GUARDIAN_AGENTS.includes(target)"), 'switch does not accept a specific real agent name');
  assert.ok(/target === 'guardian'\)\s*\{\s*\n\s*_cliProvider = 'auto'/.test(SRC), 'switching to guardian does not resolve to the real auto value');
});

test('NCS-003', '_talkToCopilot\'s real request body now includes the real, current provider', () => {
  const idx = SRC.indexOf('async function _talkToCopilot');
  const block = SRC.slice(idx, idx + 700);
  assert.ok(/provider:\s*_cliProvider/.test(block), 'the real request body does not include _cliProvider');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
