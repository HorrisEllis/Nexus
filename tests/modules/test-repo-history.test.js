'use strict';
/**
 * tests/modules/test-repo-history.test.js — 0.60.7
 *
 * James (2026-10-13): "can you add history import tool to the repos. like maybe with versionium. i want real versions
 * with the versionium tab. like a full index of versions, versions, revisions from the work surface, diffs,
 * backups/snapshots, etc." · "like maybe have integrity checks when importing?"
 *
 * Runs lib/repo-history.js against versionium's real engine and file layer (in-process, sandboxed store), and a real git
 * repository zipped with its .git:
 *   RH-0x  history import (git commits, version zips, secrets gate, idempotent), the index, diff, restore one file
 *   IC-0x  lib/import-checks.js: each check finds what it should, and its notes open, update and close
 *   WR-0x  routes, commands, the Versionium tab
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// versionium's own routes, as functions: the transport idearium/api/index.js _vcall would be
function transport() {
  const engine = require(path.join(ROOT, 'versionium/lib/engine.js'));
  const files = require(path.join(ROOT, 'versionium/lib/files.js'));
  const { jaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));
  return async (method, p, body) => {
    const u = new URL(`http://x${p}`); const q = (k) => u.searchParams.get(k);
    switch (u.pathname) {
      case '/api/versionium/branches': return { ok: true, branches: engine.branches() };
      case '/api/versionium/history': {
        const rows = jaaDB.query('versionium_commits', r => (!q('branch') || r.branch === q('branch')), 1e6).sort((a, b) => (b.wall || 0) - (a.wall || 0) || (b.seq || 0) - (a.seq || 0));
        return { ok: true, commits: rows.slice(0, parseInt(q('n') || '200', 10)) };
      }
      case '/api/versionium/commit': return { ok: true, commit: engine.commit(body) };
      case '/api/versionium/files/limits': return { ok: true, ...files.limits() };
      case '/api/versionium/files/stage': return files.stage(body);
      case '/api/versionium/files/record': return files.record(body);
      case '/api/versionium/files/tree': return { ok: true, ...files.tree(q('repository'), q('commitId')) };
      case '/api/versionium/files/content': { const c = files.content(q('repository'), q('commitId'), q('path')); return { ok: true, path: c.path, sha256: c.sha256, content_b64: c.bytes.toString('base64') }; }
      default: throw new Error(`no route ${method} ${u.pathname}`);
    }
  };
}

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r)); else out.push(r);
  }
  return out;
}

(async () => {
  console.log('\ntest-repo-history\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-rh-'));
  try {
    const RH = require(path.join(ROOT, 'lib/repo-history.js'));
    const IC = require(path.join(ROOT, 'lib/import-checks.js'));
    const { createZip } = require(path.join(ROOT, 'lib/zip-writer.js'));
    const v = transport();
    const repo = `nexus-id-repo-rh${Date.now().toString(36)}`;

    // a real project with three commits: add, change + add, delete — the second also adds a key by mistake
    const proj = path.join(tmp, 'shop');
    fs.mkdirSync(proj);
    const git = (...a) => execFileSync('git', ['-C', proj, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'James', GIT_AUTHOR_EMAIL: 'j@example.invalid', GIT_COMMITTER_NAME: 'James', GIT_COMMITTER_EMAIL: 'j@example.invalid' } });
    git('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(proj, 'package.json'), '{"name":"shop","version":"1.0.0"}\n');
    fs.writeFileSync(path.join(proj, 'app.js'), "module.exports = () => 'v1';\n");
    git('add', '-A'); git('commit', '-qm', 'first: the shop');
    fs.writeFileSync(path.join(proj, 'app.js'), "module.exports = () => 'v2';\n");
    fs.writeFileSync(path.join(proj, 'keys.js'), `module.exports = '${'AKIA'}ABCDEFGHIJKLMNOP';\n`);
    git('add', '-A'); git('commit', '-qm', 'second: v2 and keys');
    fs.unlinkSync(path.join(proj, 'keys.js'));
    git('add', '-A'); git('commit', '-qm', 'third: the key removed');
    const zipped = createZip(walk(proj).map(p => ({ path: `shop/${p}`, content: fs.readFileSync(path.join(proj, p)) })));

    const dry = await RH.importHistory(v, repo, { zips: [{ name: 'shop.zip', buffer: zipped }], dryRun: true });
    check('RH-01 a zip with its .git: every commit is a version, oldest first, with its date, author and message; the zipped files are not a fourth version when they equal the last commit',
      dry.ok && dry.versions.length === 4 && dry.versions[0].message === 'first: the shop' && dry.versions[0].author === 'James' && dry.versions[2].message === 'third: the key removed' && dry.versions[3].skipped && dry.wouldImport === 3,
      JSON.stringify(dry.versions.map(x => [x.message, x.skipped])));
    check('RH-02 a key in the history is found before anything is stored (CK-060), masked', dry.secrets.length === 1 && dry.secrets[0].path === 'keys.js' && dry.secrets[0].kind === 'AWS access key' && !JSON.stringify(dry.secrets).includes('ABCDEFGHIJKLMNOP'), JSON.stringify(dry.secrets));
    const blocked = await RH.importHistory(v, repo, { zips: [{ name: 'shop.zip', buffer: zipped }] });
    const none = await v('GET', `/api/versionium/history?branch=${encodeURIComponent(RH.historyBranch(repo))}&n=10`);
    check('RH-03 a found credential stops the import: nothing stored until he says to keep it', blocked.ok === false && blocked.code === 'SECRETS' && none.commits.length === 0);
    const r = await RH.importHistory(v, repo, { zips: [{ name: 'shop.zip', buffer: zipped }], allowSecrets: true });
    check('RH-04 imported: three commits on repo-<uuid>@history, the live branch untouched', r.ok && r.imported === 3 && r.branch === `repo-${repo}@history`
      && (await v('GET', `/api/versionium/history?branch=repo-${repo}&n=10`)).commits.length === 0, JSON.stringify({ imported: r.imported, err: r.error }));
    const ids = r.versions.filter(x => x.commitId).map(x => x.commitId);
    const t2 = await v('GET', `/api/versionium/files/tree?repository=${repo}&commitId=${ids[1]}`);
    const t3 = await v('GET', `/api/versionium/files/tree?repository=${repo}&commitId=${ids[2]}`);
    check('RH-05 each version holds exactly its files (the second has keys.js, the third does not)', t2.files.map(f => f.path).join() === 'app.js,keys.js,package.json' && t3.files.map(f => f.path).join() === 'app.js,package.json');
    const again = await RH.importHistory(v, repo, { zips: [{ name: 'shop.zip', buffer: zipped }], allowSecrets: true });
    check('RH-06 importing the same history again stores nothing new', again.ok && again.imported === 0 && again.skipped === 4);

    // several zips of one project, no .git: one version each, ordered by their version, not the order dropped
    const z = (ver, body) => createZip([{ path: 'gig/package.json', content: `{"name":"gig","version":"${ver}"}` }, { path: 'gig/index.js', content: body }]);
    const repo2 = `${repo}-2`;
    const r2 = await RH.importHistory(v, repo2, { zips: [{ name: 'gig-1.1.0.zip', buffer: z('1.1.0', 'b\n') }, { name: 'gig-1.0.0.zip', buffer: z('1.0.0', 'a\n') }] });
    check('RH-07 versions as zips: one version each, ordered by their version (dropped newest first)', r2.ok && r2.imported === 2 && r2.versions[0].version === '1.0.0' && r2.versions[1].version === '1.1.0' && r2.versions.every(x => x.source === 'zip' && x.files === 2), JSON.stringify(r2.versions));

    const idx = await RH.index(v, repo, { injects: [{ uuid: 'inj-1', repoUuid: repo, path: 'app.js', op: 'write', status: 'applied', createdAt: Date.now(), appliedAt: Date.now(), hatName: 'builder', before: 'x' }] });
    check('RH-08 the index: imported history at its own dates, and the work surface\'s revisions, newest first, counted by kind',
      idx.counts.history === 3 && idx.counts.revision === 1 && idx.entries[0].kind === 'revision' && idx.entries.filter(e => e.kind === 'history').every(e => e.imported && e.imported.source === 'git' && e.who === 'James'), JSON.stringify(idx.counts));
    check('RH-09 kinds: a restore\'s pre-restore snapshot is a backup; staging and history are told apart by branch',
      RH.kindOf({ branch: `repo-${repo}`, message: 'pre-restore snapshot (before restoring vtm-1)' }, repo) === 'backup' && RH.kindOf({ branch: `repo-${repo}`, message: 'x' }, repo) === 'snapshot'
      && RH.kindOf({ branch: `repo-${repo}@staging` }, repo) === 'staging' && RH.kindOf({ branch: `repo-${repo}@history` }, repo) === 'history');

    const d = await RH.diff(v, repo, ids[0], ids[2]);
    check('RH-10 a diff between any two versions: what changed, with the patch', d.counts.changed === 1 && d.counts.added === 0 && d.files[0].path === 'app.js' && /-module\.exports = \(\) => 'v1';/.test(d.files[0].patch) && /\+module\.exports = \(\) => 'v2';/.test(d.files[0].patch), JSON.stringify(d.files));
    const work = { tree: async () => [{ path: 'app.js', sha256: require('crypto').createHash('sha256').update("module.exports = () => 'v3';\n").digest('hex'), bytes: 29 }], read: async () => Buffer.from("module.exports = () => 'v3';\n") };
    const dw = await RH.diff(v, repo, ids[2], 'working', { working: work });
    check('RH-11 a version against the files on disk now ("working")', dw.counts.changed === 1 && dw.counts.removed === 1 && dw.files.find(f => f.path === 'package.json').status === 'removed');
    const written = {};
    const rf = await RH.restoreFile(v, repo, ids[1], 'keys.js', async (p, b) => { written[p] = b.toString('utf8'); });
    check('RH-12 one file brought back as it was at a version, its hash checked', rf.path === 'keys.js' && /AKIA/.test(written['keys.js']) && rf.bytes === written['keys.js'].length);

    // the import checks, over a folder with one of each problem
    const dir = path.join(tmp, 'checked');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'ok.js'), "module.exports = require('./lib');\n");
    fs.writeFileSync(path.join(dir, 'lib.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(dir, 'broken.js'), 'function (\n');
    fs.writeFileSync(path.join(dir, 'lost.js'), "require('./nowhere');\nrequire('left-pad');\n");
    const big = '// the same file twice\n'.repeat(20);
    fs.writeFileSync(path.join(dir, 'a.js'), big); fs.writeFileSync(path.join(dir, 'b.js'), big);
    fs.writeFileSync(path.join(dir, 'cfg.js'), "const k = 'ghp_" + 'a'.repeat(36) + "';\n");
    const res = await IC.run({ repo: { uuid: repo, sourceFileCount: 7 }, dir });
    const byId = Object.fromEntries(res.checks.map(c => [c.id, c]));
    check('IC-01 parses (CK-001): the file that does not parse is named', !byId['CK-001'].ok && byId['CK-001'].items.some(i => i.path === 'broken.js'), JSON.stringify(byId['CK-001']));
    check('IC-02 requires resolve (CK-002) and npm declared (CK-006)', byId['CK-002'].items.some(i => i.spec === './nowhere') && byId['CK-006'].items.some(i => i.name === 'left-pad'), JSON.stringify([byId['CK-002'], byId['CK-006']]));
    check('IC-03 duplicate files (CK-008), secrets (CK-060, masked), files arrived (IMP-01)', byId['CK-008'].items[0].paths.join() === 'a.js,b.js' && byId['CK-060'].items[0].kind === 'GitHub token' && !JSON.stringify(byId['CK-060']).includes('a'.repeat(36)) && byId['IMP-01'].ok);
    const n1 = IC.toNotes(repo, res);
    const N = require(path.join(ROOT, 'lib/repo-notes.js'));
    const mine = () => N.list({ repoUuid: repo, tag: 'integrity' });
    check('IC-04 each check that found something is one note on the repo (source import), errors as todos', n1.added === 5 && mine().every(n => n.source === 'import') && mine().find(n => n.tags.includes('ck-001')).kind === 'todo', JSON.stringify(n1));
    fs.writeFileSync(path.join(dir, 'broken.js'), 'module.exports = 2;\n');
    const n2 = IC.toNotes(repo, await IC.run({ repo: { uuid: repo, sourceFileCount: 7 }, dir }));
    check('IC-05 run again: a fixed check closes its note (done, kept), the rest are updated, none duplicated', n2.done === 1 && n2.added === 0 && mine().find(n => n.tags.includes('ck-001')).status === 'done' && mine().length === 5, JSON.stringify(n2));

    const API = src('idearium/api/index.js'), CMD = src('idearium/cli/route-commands.js'), APP = src('idearium/ui/js/app.js');
    check('WR-01 routes: versions, diff, tree, restore-file, history import, integrity (read, and write as notes); checks run on every import',
      ['repo.versions.index', 'repo.versions.diff', 'repo.versions.tree', 'repo.versions.restoreFile', 'repo.history.import', 'repo.integrity', 'repo.integrity.notes'].every(k => API.includes(`'${k}'],`)) && /IC\.toNotes\(repoUuid, r\)/.test(API));
    check('WR-02 every agent has them: repo versions (now the whole index), repo diff, repo restore-file, repo history-import, repo integrity',
      ['repo.versions', 'repo.diff', 'repo.restore-file', 'repo.history-import', 'repo.integrity'].every(k => CMD.includes(`key: '${k}'`)) && /\/api\/repos\/\$\{a\.repo\.uuid\}\/versions`/.test(CMD));
    const RV = src('idearium/ui/js/repo-versions.js'), HTML = src('idearium/ui/index.html');
    check('WR-03 the Versionium tab: the index with kind filters, compare any two, import history; mounted in the tab, its script loaded, the Debug tab runs the checks',
      /function renderVersionIndex/.test(RV) && /function compareVersions/.test(RV) && /function importRepoHistory/.test(RV) && /id="ver-index"/.test(APP) && /renderVersionIndex\(forUuid\)/.test(APP)
      && /js\/repo-versions\.js/.test(HTML) && /runIntegrity\(CURRENT_API_REPO\.uuid\)/.test(APP));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
