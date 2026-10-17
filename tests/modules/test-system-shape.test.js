'use strict';
// SH-01..04 (0.60.138): does a system match genesis? Each role: its own file, the kernel, or missing.
// James, 2026-10-17: "and the diagnostic needs to be a real system matching genasis."
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
require('../../lib/test-sandbox.js').ensure();
const REPO = path.resolve(__dirname, '..', '..');
const S = require('../../lib/system-shape.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const quiet = async (fn) => { const k = { log: console.log, warn: console.warn, info: console.info, error: console.error }; console.log = console.warn = console.info = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, k); } };
function walk(d, base = d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/')); } return out; }

test('SH-01 every file of the genesis skeleton is a role or a named skeleton internal — the check cannot drift from genesis', () => {
  const sk = path.join(REPO, 'cos/archetype/nexus-system');
  const files = walk(sk).filter(f => !/^data\/nodes\//.test(f) && !/^schemas\/schema\./.test(f) && !/\.gitkeep$/.test(f) && !/^(input|output|processing|done|failed)\//.test(f));
  const roleFiles = new Set(S.ROLES.flatMap(r => r.own.map(o => o.replace('<system>', '{{slug}}'))));
  const unaccounted = files.filter(f => !roleFiles.has(f) && !S.SKELETON_INTERNAL[f]);
  assert.deepStrictEqual(unaccounted, [], 'a genesis file no role names');
});
test('SH-02 diagnostic matches genesis: every role its own or the kernel\'s, none missing', () => {
  const d = S.shapeOf('diagnostic', { root: REPO });
  assert.ok(d.matches, `missing: ${d.missing.join(', ')}`);
  for (const r of d.roles.filter(x => x.status === 'kernel')) assert.ok(fs.existsSync(path.join(REPO, r.file)), r.file);
});
test('SH-03 a system short of genesis names each missing role and the file it wants', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
  fs.mkdirSync(path.join(root, 'alpha'), { recursive: true }); fs.writeFileSync(path.join(root, 'alpha/registry-components.js'), 'module.exports = [];\n');
  const r = S.shapeOf('alpha', { root });
  assert.ok(!r.matches && r.missing.includes('entry') && r.missing.includes('store'), JSON.stringify(r.missing));
  assert.ok(r.roles.find(x => x.role === 'spec').want === 'alpha/spec/alpha.spec');
  fs.rmSync(root, { recursive: true, force: true });
});
test('SH-04 the route and the command', async () => {
  const g = await quiet(async () => { const api = await import(path.join(REPO, 'idearium/api/index.js')); return [await api._route('GET', '/api/system/shape'), await api._route('GET', '/api/system/shape?system=diagnostic')]; });
  const all = g[0].json.data || g[0].json, one = g[1].json.data || g[1].json;
  assert.strictEqual(g[0].status, 200); assert.ok(all.matches.includes('diagnostic'));
  assert.strictEqual(g[1].status, 200); assert.strictEqual(one.matches, true);
  const { SPEC } = require('../../idearium/cli/route-commands.js');
  assert.strictEqual(SPEC.find(x => x.key === 'system.shape').req({ args: ['cortex'], flags: {} }).path, '/api/system/shape?system=cortex');
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
