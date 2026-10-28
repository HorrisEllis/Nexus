'use strict';
/**
 * tests/modules/test-run-log-fixes.test.js — three faults from James's run log (0.60.270)
 * James, 2026-10-28: "okay. don't lose any of this."
 *
 *   RL-01  a 300k-line event_log segment loads (push(...arr) overflowed the stack: "Maximum call stack size exceeded")
 *   RL-02  the DOM bridge script ends with a cloneable value ("An object could not be cloned.")
 *   RL-03  guardian's ollama dispatch names no model unless MISTRAL_MODEL is set, and marks a failed bridge job failed at once
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }

test('RL-01', 'a 300k-line segment loads', () => {
  const { JaaStore } = require(path.join(ROOT, 'lib/jaa-store.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-jaa-'));
  let out = ''; for (let i = 0; i < 300000; i++) out += JSON.stringify({ id: 'e' + i, t: i + 1, r: { id: 'e' + i, n: i } }) + '\n';
  fs.writeFileSync(path.join(dir, 'event_log.1.jsonl'), out);
  const errs = []; const orig = console.error; console.error = (m) => errs.push(String(m));
  let n; try { n = new JaaStore(dir).count('event_log'); } finally { console.error = orig; }
  assert.deepStrictEqual(errs.filter(e => /Load error/.test(e)), []);
  assert.strictEqual(n, 300000);
});

test('RL-02', 'the DOM bridge script ends with true', () => {
  const s = fs.readFileSync(path.join(ROOT, 'clear-glass/src/dom/archaeology.js'), 'utf8');
  assert.ok(/__cgSendPick[\s\S]{0,200}?\n\s*true;/.test(s));
});

test('RL-03', 'no hard-coded mistral; a failed bridge job updates the guardian job', () => {
  const s = fs.readFileSync(path.join(ROOT, 'guardian/lib/provider-routing.js'), 'utf8');
  assert.ok(!/MISTRAL_MODEL \|\| 'mistral:7b/.test(s));
  assert.ok(/pd\.progress === 'failed'\) \{\s*updateJob\(job\.id, \{ status: 'error'/.test(s));
});
console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
