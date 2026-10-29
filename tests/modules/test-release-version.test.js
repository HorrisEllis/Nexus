'use strict';
/**
 * tests/modules/test-release-version.test.js — VR1 (0.60.34): one version everywhere. lib/release-version.js ·
 * lib/checks/ck-253-versions.js · scripts/release-zip.js · .github/workflows/release.yml · Idearium (api, ui, command).
 * James: "i also want versions in idearium, github, and each zip, needs to match."
 *
 *   RV-01  Nexus's versions agree; a planted mismatch (package.json, no changelog, a git tag at HEAD saying another
 *          version) is named place by place, and CK-253 goes red
 *   RV-02  a zip says its version: a GitHub "Download ZIP" of an older Nexus (Nexus-main/lib/version.js) is recognised,
 *          and how far behind it is is said in releases (counted over every version line, not only changelogs)
 *   RV-03  the release zip: nexus-<version>.zip, every path under nexus-<version>/, a VERSION file inside that says the
 *          version, tracked files only; read back through Idearium's own zip importer it gives the same version
 *   RV-04  GitHub: the workflow runs on a release change, checks agreement first, publishes tag v<version>, release
 *          "Nexus <version>" with the changelog as notes and nexus-<version>.zip, and leaves a tagged version alone
 *   RV-05  Idearium: GET /api/version, the version beside the logo and in Settings, `version`, the import records the
 *          zip's version on the repo, the export names its zip with the version and puts VERSION inside
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '../..');
const R = require(path.join(ROOT, 'lib/release-version.js'));
const CC = require(path.join(ROOT, 'lib/check-catalogue.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-vr1-'));
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });

(async () => {
  console.log('\ntest-release-version — one version everywhere (VR1)');
  const V = require(path.join(ROOT, 'lib/version.js')).system;

  await test('RV-01', 'Nexus agrees; a planted mismatch is named place by place; CK-253 goes red', () => {
    const a = R.agreement();
    assert.ok(a.ok, JSON.stringify(a)); assert.strictEqual(a.version, V);
    assert.ok(CC.run('CK-253').ok);
    const d = path.join(tmp, 'drift');
    fs.mkdirSync(path.join(d, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(d, 'lib/version.js'), "module.exports = {\n  system: '1.2.3',   // [1.2.3: x]\n};\n");
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'nexus', version: '1.2.2' }));
    git(d, 'init', '-q'); git(d, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'); git(d, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'); git(d, 'tag', 'v1.2.1');
    const b = R.agreement({ root: d });
    assert.ok(!b.ok);
    const bad = Object.fromEntries(b.places.filter(p => !p.ok).map(p => [p.place, p.why]));
    assert.match(bad['package.json version'], /says 1\.2\.2, the release is 1\.2\.3/);
    // 0.60.277 VS1 — whether the release has its changelog is Versionium's to say (his (a), §5.15): lib's agreement no longer reads it
    assert.ok(!Object.keys(bad).some(k => /CHANGELOG/.test(k)), 'lib does not read the changelogs');
    const vb = require(path.join(ROOT, 'versionium/lib/nexus-releases.js')).agreement({ root: d });
    assert.match(Object.fromEntries(vb.places.filter(p => !p.ok).map(p => [p.place, p.why]))['versionium/changelogs/CHANGELOG-1.2.3.md'], /no changelog/);
    assert.match(bad['git tag v1.2.1 (at HEAD)'], /HEAD is tagged v1\.2\.1, the release is 1\.2\.3/);
    const ck = CC.run('CK-253', { path: d });
    assert.ok(!ck.ok && ck.verifiable && ck.items.length === 2, JSON.stringify(ck));   // 0.60.277 — lib's places: package.json and the tag
  });

  await test('RV-02', 'an older Nexus zip is recognised, and how far behind it is is said', () => {
    const z = R.fromFiles([{ path: 'Nexus-main/lib/version.js', content: "const VERSION = {\n  system: '0.60.23',   // [0.60.23: x]\n" }, { path: 'Nexus-main/package.json', content: '{"name":"nexus","version":"0.60.23"}' }]);
    assert.deepStrictEqual([z.version, z.nexus], ['0.60.23', true]);
    const want = R.released().filter(v => R.cmp(v, '0.60.23') > 0 && R.cmp(v, V) <= 0).length;
    assert.strictEqual(R.describe('0.60.23'), `Nexus 0.60.23 — ${want} versions behind the running ${V}`);
    assert.ok(R.released().includes('0.60.24'), 'a release with no changelog still counts (its version line)');
    assert.strictEqual(R.describe(V), `Nexus ${V} — the same as the running Nexus`);
    assert.strictEqual(R.fromFiles([{ path: 'x/VERSION', content: '9.9.9\n' }, { path: 'x/lib/version.js', content: "system: '1.0.0'," }]).version, '9.9.9', 'VERSION first');
    assert.strictEqual(R.fromFiles([{ path: 'app/package.json', content: '{"name":"app","version":"2.0.0"}' }]), null, 'another project\'s package.json is not Nexus');
    assert.strictEqual(R.fromFiles([{ path: 'app/package.json', content: '{"name":"app","version":"2.0.0"}' }], { anyPackage: true }).version, '2.0.0');
    assert.strictEqual(R.fromFiles([{ path: 'a.txt', content: 'x' }]), null);
  });

  await test('RV-03', 'the release zip: named, stamped inside, read back the same by Idearium\'s importer', () => {
    const { build } = require(path.join(ROOT, 'scripts/release-zip.js'));
    const out = build({ out: path.join(tmp, 'dist'), check: true });
    assert.strictEqual(path.basename(out.zip), `nexus-${V}.zip`); assert.strictEqual(out.tag, `v${V}`); assert.strictEqual(out.notes, `versionium/changelogs/CHANGELOG-${V}.md`);
    const { extractZipToFiles } = require(path.join(ROOT, 'lib/zip-ingest.js'));
    const ex = extractZipToFiles({ buf: fs.readFileSync(out.zip), maxFiles: 20000, maxBytesPerFile: 4 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 * 1024 });
    assert.ok(ex.ok, ex.error);
    const files = ex.included;
    const vf = files.find(f => f.path.replace(/\\/g, '/').endsWith('VERSION') && f.path.split(/[\\/]/).length <= 2);
    assert.ok(vf && vf.content.trim() === V, 'VERSION inside says the version');
    const back = R.fromFiles(files);
    assert.deepStrictEqual([back.version, back.nexus], [V, true], 'Idearium reads the same version back');
    const list = execFileSync('unzip', ['-Z1', out.zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
    // 2026-10-17 — James: "the zips need to match the release, and no nest folders": the files sit at the zip's root
    assert.ok(list.includes('VERSION') && list.includes('package.json') && list.includes('lib/version.js'), 'VERSION and the project at the root');
    assert.ok(!list.some(p => p.startsWith(`nexus-${V}/`)), 'no folder around the files');
    const CS = require(path.join(ROOT, 'cos/app/store.js'));
    if (typeof CS.inspect === 'function') { const ins = CS.inspect(out.zip); assert.ok(ins.ok && ins.version === V && ins.top === '', JSON.stringify({ ok: ins.ok, error: ins.error, version: ins.version, top: ins.top })); }
    assert.ok(!list.some(p => /\/node_modules\//.test(p)), 'tracked files only');
  });

  await test('RV-04', 'GitHub: tag v<version>, release "Nexus <version>", nexus-<version>.zip; a tagged version is left alone', () => {
    const y = require('js-yaml').load(fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8'));
    assert.deepStrictEqual(y.on.push.branches, ['main']); assert.ok(y.on.push.paths.includes('lib/version.js')); assert.ok('workflow_dispatch' in y.on);
    assert.strictEqual(y.permissions.contents, 'write');
    const steps = y.jobs.release.steps.map(s => `${s.name || ''} ${s.run || ''} ${s.if || ''}`).join('\n');
    assert.match(steps, /release-zip\.js --out dist --check/);
    // 0.60.111: the release also ships SHA256SUMS since 0.60.93 (Clear Glass and COS verify the zip); this line predated it and was red on main
    assert.match(steps, /gh release create "v\$V" "dist\/nexus-\$V\.zip" "dist\/SHA256SUMS" --title "Nexus \$V"/);
    assert.match(steps, /CHANGELOG-\$V\.md/);
    assert.match(steps, /refs\/tags\/v\$V/); assert.match(steps, /tagged == 'no'/);
  });

  await test('RV-05', 'Idearium says it: /api/version, beside the logo, Settings, `version`, import and export', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(api.includes("['GET',    ['api','version'],") && api.includes("case 'system.version'"));
    assert.ok(/version: zipVersion/.test(api) && (api.match(/_zipVersion\(/g) || []).length >= 3, 'both zip imports record the version');
    assert.ok(api.includes('filename="${zipName}.zip"') && api.includes('`${safeName}/VERSION`'), 'the export names and stamps its zip');
    assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/repo/index.js'), 'utf8').includes("'sourceVersion'"), 'the repo keeps it');
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8');
    assert.ok(ui.includes('id="nexus-version"') && ui.includes("fetch('/api/version')"));
    assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8').includes('Nexus ${esc(NEXUS_VER)}'));
    assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8').includes("key: 'system.version'"));
    assert.strictEqual(CC.get('CK-253').runnable, 'runner');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
