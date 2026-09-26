'use strict';
/**
 * tests/modules/test-gap-tools.js — the 4 real, confirmed gaps built
 * against James's dotted taxonomy on 2026-09-12: cortex.node_tag.tool,
 * guardian.build.tool, versionium.history.tool + versionium.snapshot.tool,
 * nexus.syntax_debug.tool.
 *
 * Same honest boundary as test-tool-naming-convention.js's restep tests:
 * these exercise pure logic (validation, naming, real-file syntax
 * checking) that needs no live cortex/guardian/versionium — the HTTP
 * plumbing in each tool is a thin, already-proven pattern (identical to
 * cortex-restep.js's own _request/_get helper), not re-tested here.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { toolName, parseName } = require('../../lib/agent-tools/naming.js');
const nodeTag = require('../../lib/agent-tools/tools/cortex/node-tag.js');
const build = require('../../lib/agent-tools/tools/guardian/build.js');
const history = require('../../lib/agent-tools/tools/versionium/history.js');
const snapshot = require('../../lib/agent-tools/tools/versionium/snapshot.js');
const syntaxDebug = require('../../lib/agent-tools/tools/system-tools/syntax-debug.js');

let passed = 0, failed = 0;
// async-capable, matching tests/modules/agent-mesh-drainer.test.js's own
// convention (this file's only async case is GT-032; the sync test-
// tool-naming-convention.js pattern doesn't await, which would silently
// mark a rejected/pending async test as passed — checked before copying it).
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

(async () => {

// ── Names resolve correctly under the real convention ──────────────────────

await test('GT-001', 'all 4 tool names are well-formed under the real taxonomy', () => {
  assert.strictEqual(nodeTag.name, 'cortex.node_tag.tool');
  assert.strictEqual(build.name, 'guardian.build.tool');
  assert.strictEqual(history.name, 'versionium.history.tool');
  assert.strictEqual(snapshot.name, 'versionium.snapshot.tool');
  assert.strictEqual(syntaxDebug.name, 'nexus.syntax_debug.tool');
});

await test('GT-002', 'every new tool name round-trips through parseName', () => {
  for (const n of [nodeTag.name, build.name, history.name, snapshot.name, syntaxDebug.name]) {
    const parsed = parseName(n);
    assert.ok(parsed, `parseName should not reject ${n}`);
    assert.strictEqual(parsed.kind, 'tool');
  }
});

// ── cortex.node_tag.tool ────────────────────────────────────────────────────

await test('GT-010', 'node_tag rejects add with no entityId', () => {
  assert.strictEqual(nodeTag._validateAdd({ tags: ['x'] }), 'entityId is required');
});

await test('GT-011', 'node_tag rejects add with empty tags', () => {
  assert.strictEqual(nodeTag._validateAdd({ entityId: 'a', tags: [] }), 'tags[] is required and must be non-empty');
});

await test('GT-012', 'node_tag accepts a valid add payload', () => {
  assert.strictEqual(nodeTag._validateAdd({ entityId: 'a', tags: ['real'] }), null);
});

// ── guardian.build.tool ─────────────────────────────────────────────────────

await test('GT-020', 'build rejects with neither specPath nor specText', () => {
  assert.strictEqual(build._validate({}), 'specPath or specText required');
});

await test('GT-021', 'build accepts specPath alone', () => {
  assert.strictEqual(build._validate({ specPath: 'x.spec' }), null);
});

await test('GT-022', 'build accepts specText alone', () => {
  assert.strictEqual(build._validate({ specText: 'spec { }' }), null);
});

// ── nexus.syntax_debug.tool — real files, not mocks ─────────────────────────

await test('GT-030', 'syntax_debug passes a real, known-good file', () => {
  const err = syntaxDebug._checkFile(path.resolve(__dirname, '../../lib/agent-tools/naming.js'));
  assert.strictEqual(err, null);
});

await test('GT-031', 'syntax_debug catches a real, deliberately broken file', () => {
  const tmp = path.join(os.tmpdir(), `gap-tools-syntax-test-${Date.now()}.js`);
  fs.writeFileSync(tmp, 'function broken( {\n  return 1\n');
  try {
    const err = syntaxDebug._checkFile(tmp);
    assert.ok(err, 'expected a real syntax error to be reported');
    assert.ok(err.length > 0);
  } finally {
    fs.unlinkSync(tmp);
  }
});

await test('GT-032', 'syntax_debug.execute refuses a scope that escapes the repo root', async () => {
  const result = await syntaxDebug.execute({ scope: '../../../etc' });
  assert.ok(result.error, 'expected an error for an out-of-root scope');
});

})().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
});
