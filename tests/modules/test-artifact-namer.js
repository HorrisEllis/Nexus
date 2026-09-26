'use strict';
// tests/modules/test-artifact-namer.js
// Regression coverage for the guardian/agents/index.js artifact-namer crash
// (buildArtifactRecord() was called on a stub that never had that method —
// see guardian/lib/artifact-namer.js header for the full bug writeup).

const assert = require('assert');
const { buildArtifactRecord } = require('../../guardian/lib/artifact-namer.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL: ${name} — ${e.message}`);
  }
}

test('returns full record shape', () => {
  const r = buildArtifactRecord({ content: 'const x = 1;', lang: 'javascript', provider: 'chatgpt' });
  for (const field of ['name', 'ext', 'file_path', 'lang', 'confidence', 'content',
                        'hash', 'provider', 'chatUrl', 'context', 'source', 'causedBy', 'ts']) {
    assert.ok(field in r, `missing field ${field}`);
  }
});

test('real @file annotation honored over hash-name', () => {
  const r = buildArtifactRecord({ content: '// @file: utils.js\nconst a = 1;', lang: 'javascript' });
  assert.strictEqual(r.name, 'utils.js');
  assert.strictEqual(r.confidence, 'annotated');
});

test('hash-fallback used when no annotation', () => {
  const r = buildArtifactRecord({ content: 'print("hi")', lang: 'python', provider: 'gemini' });
  assert.ok(/^gemini-[0-9a-f]{8}\.py$/.test(r.name), `unexpected name: ${r.name}`);
  assert.strictEqual(r.confidence, 'fallback');
});

test('unknown lang falls back to raw extension', () => {
  const r = buildArtifactRecord({ content: 'x', lang: 'zig', provider: 'deepseek' });
  assert.strictEqual(r.ext, '.zig');
});

test('missing content does not throw', () => {
  assert.doesNotThrow(() => buildArtifactRecord({}));
});

test('guardian/agents/index.js loads cleanly with real require path', () => {
  delete require.cache[require.resolve('../../guardian/agents/index.js')];
  assert.doesNotThrow(() => require('../../guardian/agents/index.js'));
});

console.log(`\ntest-artifact-namer.js: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
