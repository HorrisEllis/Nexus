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
  // 0.60.111: whole-line comments are skipped (lib/version.js, staged for lib/release-version.js, quotes a require in a version line's comment)
  for (const f of walk(s.stage)) for (const m of fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').matchAll(/require\('(\.[^']+)'\)/g)) { const p = path.resolve(path.dirname(f), m[1]); assert.ok(fs.existsSync(p) || fs.existsSync(p + '.js'), `${path.relative(s.stage, f)} -> ${m[1]}`); }
});
t('BD-05 the CLI refuses to build an exe off Windows without the override, and says so', () => {
  if (process.platform === 'win32') return; const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-cos-app.js'), '--stage', path.join(out, 'x')], { encoding: 'utf8', env: { ...process.env, COS_BUILD_ANYWHERE: '' } });
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /build on Windows/);
});
t('BD-06 the workflow builds on windows, only publishes an untagged version, ships SHA256SUMS', () => {
  const w = fs.readFileSync(path.join(ROOT, '.github/workflows/cos-app.yml'), 'utf8'); assert.match(w, /runs-on: windows-latest/); assert.match(w, /tagged == 'no'/); assert.match(w, /SHA256SUMS/); assert.match(w, /cos-v/);
  // 0.60.111: the exe rebuilds when anything it is built from changes, and a change with no version bump fails out loud
  for (const p of ["'cos/app/**'", "'lib/zip.js'", "'lib/release-version.js'"]) assert.ok(w.includes(p), `the workflow runs on ${p}`);
  assert.match(w, /git diff --name-only "cos-v\$V" HEAD/); assert.match(w, /bump cos\/app\/version\.js/);
  for (const f of B.FILES.filter(f => f.startsWith('lib/') && f !== 'lib/version.js')) assert.ok(w.includes(`'${f}'`), `${f} is built into the exe, so a change to it must rebuild it`);
});
// 0.60.96 — the first real Windows build (run 38887590255) failed: cos/app/version.js was 0 bytes (emptied at 0.60.90 by a bad write), so the staged
// package.json had no version and electron-builder refused it. These fail on that before CI does.
t('BD-07 cos/app/version.js exports a version, and the staged package.json carries it', () => {
  const v = require('../../cos/app/version.js').version; assert.match(String(v), /^\d+\.\d+\.\d+/); assert.strictEqual(s.pkg.version, v); assert.strictEqual(s.version, v);
});
t('BD-08 staging refuses an empty version and says which file', () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-nov-')); fs.mkdirSync(path.join(fake, 'cos/app'), { recursive: true });
  fs.writeFileSync(path.join(fake, 'package.json'), fs.readFileSync(path.join(ROOT, 'package.json'))); fs.writeFileSync(path.join(fake, 'cos/app/version.js'), '');
  assert.throws(() => B.stage({ out: path.join(fake, 'st'), root: fake }), /cos\/app\/version\.js gives no version/); fs.rmSync(fake, { recursive: true, force: true });
});
fs.rmSync(out, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
