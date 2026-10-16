'use strict';
/**
 * tests/modules/test-tool-required-alias.test.js — 0.60.50: a required tool parameter named the model's own way still
 * arrives. lib/agent-tools/index.js executeTool / fillRequired.
 * From James's run (2026-10-15): agents' idearium.code_read.tool calls answered "path is required", over and over.
 *
 *   TA-01  file / file_path / filePath reach a tool as its declared "path"; repo_uuid reaches repoUuid (case and _)
 *   TA-02  a declared parameter is never overwritten by an alias; a truly missing one still reaches the tool (its own
 *          refusal stands) and the error says what to pass
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const AT = require(path.join(__dirname, '../../lib/agent-tools/index.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; }
}

(async () => {
  console.log('\ntest-tool-required-alias — a required parameter named the model\'s way still arrives (0.60.50)');
  let seen = null;
  AT.registerTool({ name: 'ta.read.tool', description: 'test', parameters: { type: 'object', properties: { path: { type: 'string' }, repoUuid: { type: 'string' }, file: { type: 'string' } }, required: ['path', 'repoUuid'] },
    execute: async (a) => { seen = a; return a.path ? { ok: true } : { error: 'path is required' }; } });

  await test('TA-01', 'file_path / filePath reach "path"; repo_uuid reaches repoUuid', async () => {
    for (const k of ['file_path', 'filePath', 'filename']) {
      const r = await AT.executeTool('ta.read.tool', { [k]: 'src/a.js', repo_uuid: 'r1' });
      assert.ok(r.ok, JSON.stringify(r)); assert.deepStrictEqual(seen, { path: 'src/a.js', repoUuid: 'r1' }, k);
    }
  });

  await test('TA-02', 'a declared parameter is not taken as an alias; missing still says what to pass', async () => {
    const r = await AT.executeTool('ta.read.tool', { file: 'x.js', repoUuid: 'r1' });   // "file" is this tool's own parameter
    assert.ok(/path is required — ta\.read\.tool needs "path"/.test(r.error), r.error);
    assert.ok(/its parameters: path, repoUuid, file/.test(r.error));
    const f = AT.fillRequired({ parameters: { properties: { path: {} }, required: ['path'] } }, { path: 'keep.js', file: 'other.js' });
    assert.strictEqual(f.args.path, 'keep.js'); assert.strictEqual(f.args.file, 'other.js');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
