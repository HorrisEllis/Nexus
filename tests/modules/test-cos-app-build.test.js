'use strict';
// COSA6 build staging (0.60.89): the staged folder is self-contained and its main loads. The exe itself is built on Windows CI, not here.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const B = require('../../scripts/build-cos-app.js'); const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0; const t = (n, f) => { try { f(); passed++; console.log('  ok', n); } catch (e) { failed++; console.log('  FAIL', n, '-', e.message); } };
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-stage-'));
const s = B.stage({ out: path.join(out, 'st') });
t('BD-01 every staged file exists and nothing outside the list leaks in', () => { for (const f of B.FILES) assert.ok(fs.existsSync(path.join(s.stage, f)), f); assert.deepStrictEqual(fs.readdirSync(s.stage).sort(), ['cos', 'lib', 'package.json']); });
t('BD-02 package.json: main exists, one runtime dependency, versions follow the root, asar off', () => {
  const p = s.pkg, r = require('../../package.json'); assert.ok(fs.existsSync(path.join(s.stage, p.main))); assert.deepStrictEqual(Object.keys(p.dependencies), ['js-yaml']);
  assert.strictEqual(p.dependencies['js-yaml'], r.dependencies['js-yaml']); assert.strictEqual(p.devDependencies.electron, r.devDependencies.electron); assert.strictEqual(p.build.asar, false); assert.strictEqual(p.version, require('../../cos/app/version.js').version);
});
t('BD-03 the staged controller loads on its own (no repo around it)', () => {
  const r = spawnSync(process.execPath, ['-e', "const {Controller}=require('./cos/app/controller.js');if(typeof Controller!=='function')process.exit(3)"], { cwd: s.stage }); assert.strictEqual(r.status, 0, String(r.stderr));
});
t('BD-04 every require in staged files resolves inside the stage', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
  for (const f of walk(s.stage)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/require\('(\.[^']+)'\)/g)) { const p = path.resolve(path.dirname(f), m[1]); assert.ok(fs.existsSync(p) || fs.existsSync(p + '.js'), `${path.relative(s.stage, f)} -> ${m[1]}`); }
});
t('BD-05 the CLI refuses to build an exe off Windows without the override, and says so', () => {
  if (process.platform === 'win32') return; const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-cos-app.js'), '--stage', path.join(out, 'x')], { encoding: 'utf8', env: { ...process.env, COS_BUILD_ANYWHERE: '' } });
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /build on Windows/);
});
t('BD-06 the workflow builds on windows, only publishes an untagged version, ships SHA256SUMS', () => {
  const w = fs.readFileSync(path.join(ROOT, '.github/workflows/cos-app.yml'), 'utf8'); assert.match(w, /runs-on: windows-latest/); assert.match(w, /tagged == 'no'/); assert.match(w, /SHA256SUMS/); assert.match(w, /cos-v/);
});
fs.rmSync(out, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
