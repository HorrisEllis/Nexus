'use strict';
/**
 * tests/modules/test-shadow-space.test.js — SH1, 0.39.322 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec).
 * James: "shadow space?" · "next"
 *
 *   SS-01  a change that passes its test and its shadow is merged into the real tree; the space is gone
 *   SS-02  a generated change that fails its tests never reaches the real tree
 *   SS-03  the absent file of a step is a gap with the step as cause; the real tree is untouched
 *   SS-04  a write outside the space is refused
 *   SS-05  self_repair's promote refuses a testResult handed in without its own test() having passed
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const SS = require('../../lib/shadow-space.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-space-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q'); fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
  g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
  return dir;
}
const node = (code) => [process.execPath, '-e', code];

(async () => {
  await test('SS-01', 'passes test and shadow → merged; the space is removed', () => {
    const dir = repo();
    const o = SS.open({ originDir: dir, step: 'add-b', expects: { files: ['b.js'] } });
    assert.ok(o.ok, o.error);
    SS.write(o.space, 'b.js', 'module.exports = 2;\n');
    assert.ok(!fs.existsSync(path.join(dir, 'b.js')), 'nothing in the real tree before commit');
    const r = quiet(() => SS.commit(o.space, { test: node("process.exit(require('./b.js') === 2 ? 0 : 1)") }));
    assert.ok(r.ok && r.merged, JSON.stringify(r));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'b.js'), 'utf8'), 'module.exports = 2;\n');
    assert.ok(!fs.existsSync(o.space.dir), 'the space is gone');
  });

  await test('SS-02', 'a change that fails its test never reaches the real tree', () => {
    const dir = repo();
    const o = SS.open({ originDir: dir, step: 'break-a', expects: { files: ['a.js'] } });
    SS.write(o.space, 'a.js', 'module.exports = 99;\n');
    const r = quiet(() => SS.commit(o.space, { test: node("process.exit(require('./a.js') === 1 ? 0 : 1)") }));
    assert.strictEqual(r.ok, false); assert.strictEqual(r.stage, 'test'); assert.strictEqual(r.merged, false);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'a.js'), 'utf8'), 'module.exports = 1;\n');
    assert.ok(!fs.existsSync(o.space.dir));
  });

  await test('SS-03', 'the absent file of a step is a gap with the step as cause', () => {
    const dir = repo();
    const o = SS.open({ originDir: dir, step: 'make-c', expects: { files: ['c.js'] } });
    SS.write(o.space, 'other.js', '1;\n');
    const r = quiet(() => SS.commit(o.space, {}));
    assert.strictEqual(r.ok, false); assert.strictEqual(r.stage, 'shadow');
    assert.deepStrictEqual(r.shadow.absent.files, ['c.js']);
    assert.strictEqual(o.space.shadow.causedBy, 'make-c', 'the step is the cause');
    assert.ok(!fs.existsSync(path.join(dir, 'other.js')), 'the real tree is untouched');
  });

  await test('SS-04', 'a write outside the space is refused', () => {
    const o = SS.open({ originDir: repo(), step: 'escape' });
    assert.throws(() => SS.write(o.space, '../../etc/x', 'no'), /outside the space/);
    SS.discard(o.space);
  });

  await test('SS-05', 'self_repair promote refuses a handed-in testResult', async () => {
    const tool = require('../../lib/agent-tools/tools/sandbox/self-repair.js');
    const exec = tool.execute || (tool.default && tool.default.execute);
    const impl = typeof exec === 'function' ? (a) => exec.call(tool, a) : (a) => tool.promote(a);
    const r = await impl({ action: 'promote', name: `never-tested-${Date.now()}`, targetFile: 'lib/shadow.js', testResult: { passed: true, exitCode: 0 } });
    assert.ok(r.error && /no passing test/.test(r.error), JSON.stringify(r));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
