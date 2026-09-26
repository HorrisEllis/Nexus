'use strict';
// Real tests for lib/seam/cos-seam-parser.js. James: "the listener for
// ncp needs to find the seams." Format validated live against an actual
// ChatGPT response (screenshot), not invented.

const assert = require('assert');
const { parseCosSeams } = require('../../lib/seam/cos-seam-parser.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('CSP-001', 'the exact real, ChatGPT-validated format parses correctly end to end', () => {
  const text = `Got it. For code, I'll use your COS seam boundaries exactly like this:

chunk contract #1

=========cos seam start=========
\`\`\`js
const pending = this.pending.get(correlationId);
if (!pending) { return; }
\`\`\`
=========cos seam end=========
compartment uuid: abc-123-def
file name: ipc-router.js

I'll keep the seams outside the code fences, so they can be parsed cleanly.`;
  const seams = parseCosSeams(text);
  assert.strictEqual(seams.length, 1);
  assert.strictEqual(seams[0].contractNumber, 1);
  assert.strictEqual(seams[0].language, 'js');
  assert.strictEqual(seams[0].compartmentUuid, 'abc-123-def');
  assert.strictEqual(seams[0].fileName, 'ipc-router.js');
  assert.ok(seams[0].code.includes('this.pending.get(correlationId)'));
  assert.ok(!seams[0].code.includes('cos seam'), 'the extracted code must never contain the seam markers themselves');
});

test('CSP-002', 'an unterminated seam (start marker, no end yet — the real, expected mid-stream state) returns nothing', () => {
  const text = `chunk contract #1\n\n=========cos seam start=========\n\`\`\`js\nconst x = 1;`;
  const seams = parseCosSeams(text);
  assert.strictEqual(seams.length, 0, 'a seam still streaming in must never be reported as complete');
});

test('CSP-003', 'two seams in one response are both found, and contract numbers never bleed across them', () => {
  const text = `chunk contract #1

=========cos seam start=========
\`\`\`js
// file one
\`\`\`
=========cos seam end=========
compartment uuid: uuid-1
file name: one.js

chunk contract #2

=========cos seam start=========
\`\`\`js
// file two
\`\`\`
=========cos seam end=========
compartment uuid: uuid-2
file name: two.js`;
  const seams = parseCosSeams(text);
  assert.strictEqual(seams.length, 2);
  assert.strictEqual(seams[0].contractNumber, 1);
  assert.strictEqual(seams[0].fileName, 'one.js');
  assert.strictEqual(seams[1].contractNumber, 2);
  assert.strictEqual(seams[1].fileName, 'two.js');
});

test('CSP-004', 'a contract number is never misattributed backward from a LATER seam', () => {
  // deliberately no contract number before the first seam, but one exists
  // between the two — must not leak backward onto seam #1
  const text = `=========cos seam start=========
\`\`\`js
// no contract number precedes this one
\`\`\`
=========cos seam end=========

chunk contract #2

=========cos seam start=========
\`\`\`js
// this one has a real contract number
\`\`\`
=========cos seam end=========`;
  const seams = parseCosSeams(text);
  assert.strictEqual(seams.length, 2);
  assert.strictEqual(seams[0].contractNumber, null, 'seam 1 has no real contract number preceding it and must not borrow seam 2\'s');
  assert.strictEqual(seams[1].contractNumber, 2);
});

test('CSP-005', 'missing metadata (no compartment uuid, no file name) is handled honestly as null, not fabricated', () => {
  const text = `=========cos seam start=========
\`\`\`js
const x = 1;
\`\`\`
=========cos seam end=========`;
  const seams = parseCosSeams(text);
  assert.strictEqual(seams.length, 1);
  assert.strictEqual(seams[0].compartmentUuid, null);
  assert.strictEqual(seams[0].fileName, null);
  assert.strictEqual(seams[0].contractNumber, null);
});

test('CSP-006', 'no code fence at all falls back to the raw seam body, not an empty result', () => {
  const text = `=========cos seam start=========
just plain text, no fence
=========cos seam end=========`;
  const seams = parseCosSeams(text);
  assert.strictEqual(seams.length, 1);
  assert.strictEqual(seams[0].language, null);
  assert.ok(seams[0].code.includes('just plain text'));
});

test('CSP-007', 'no seam markers at all returns an empty array, not an error', () => {
  assert.deepStrictEqual(parseCosSeams('just a normal response with no seams at all'), []);
});

test('CSP-008', 'empty/non-string input is handled honestly, not thrown', () => {
  assert.deepStrictEqual(parseCosSeams(''), []);
  assert.deepStrictEqual(parseCosSeams(null), []);
  assert.deepStrictEqual(parseCosSeams(undefined), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
