'use strict';
/**
 * tests/modules/test-repo-git.test.js — §0.39.265
 *
 * James: "what about push pull, cd ci, ssh, and git support?"
 * lib/repo-git.js against REAL git: a repo folder, a bare remote, a second
 * clone making changes — commit, push, pull (fast-forward, with the exact files
 * that changed), refusals (bad URLs, dirty pulls), credentials only ever in the
 * git process's environment; zip-ingest reading a cloned folder; the API routes
 * and the Git & CI tab.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const G = require(path.join(ROOT, 'lib', 'repo-git.js'));

let passed = 0, failed = 0, skipped = 0;
async function test(desc, fn) {
  try { const r = await fn(); if (r === 'skip') { skipped++; console.log(`  - ${desc} (skipped)`); } else { console.log(`  ✓ ${desc}`); passed++; } }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-git-'));
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const git = (args, cwd) => G.run(args, { cwd, env: { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

(async () => {
  console.log('\n  repo git');
  if (!(await G.gitAvailable())) { console.log('  git not installed — skipping'); process.exit(0); }

  await test('remote URLs: https, ssh:// and git@host:path accepted; local paths, file://, ext:: and option-like strings refused', () => {
    for (const u of ['https://github.com/a/b.git', 'ssh://git@host.com/a/b.git', 'git@github.com:a/b.git']) assert.ok(G.validateRemoteUrl(u).ok, u);
    assert.strictEqual(G.validateRemoteUrl('git@github.com:a/b.git').kind, 'ssh');
    for (const u of ['', '/tmp/x', 'file:///etc', 'ext::sh -c touch', '--upload-pack=x', 'C:\\repo', 'https://github.com']) assert.ok(!G.validateRemoteUrl(u).ok, u);
  });

  await test('credentials live only in the git process environment: key → GIT_SSH_COMMAND, https token → an Authorization header', () => {
    const e = G.authEnv({ keyPath: '/home/me/.ssh/nexus_gh', token: 'tok123', url: 'https://github.com/a/b.git' });
    assert.ok(/-i "\/home\/me\/\.ssh\/nexus_gh"/.test(e.GIT_SSH_COMMAND) && /BatchMode=yes/.test(e.GIT_SSH_COMMAND) && /IdentitiesOnly=yes/.test(e.GIT_SSH_COMMAND));
    assert.strictEqual(e.GIT_CONFIG_KEY_0, 'http.extraHeader');
    assert.strictEqual(e.GIT_CONFIG_VALUE_0, `Authorization: Basic ${Buffer.from('x-access-token:tok123').toString('base64')}`);
    assert.ok(!G.authEnv({ token: 'tok', url: 'git@github.com:a/b.git' }).GIT_CONFIG_COUNT, 'a token is never sent to an ssh remote');
  });

  const repo = path.join(tmp, 'repo'), bare = path.join(tmp, 'remote.git'), other = path.join(tmp, 'other');
  fs.mkdirSync(repo);
  write(repo, 'src/app.js', 'console.log(1);\n');
  write(repo, 'chunks/0.json', '{}');            // Idearium's own artifacts
  write(repo, 'atlas.json', '{}');

  await test('status before git; ensureRepo starts on main and excludes Idearium\'s own files', async () => {
    assert.strictEqual((await G.status(repo)).initialized, false);
    const e = await G.ensureRepo(repo);
    assert.ok(e.ok && e.created);
    const st = await G.status(repo);
    assert.ok(st.initialized && st.branch === 'main', JSON.stringify(st));
    assert.deepStrictEqual(st.changes.map(c => c.path), ['src/'], 'chunks/ and atlas.json are not the project');
  });

  await test('commit: nothing staged is a result, not an error; a real commit names its files', async () => {
    const r = await G.commit(repo, { message: 'first' });
    assert.ok(r.ok && r.commit && r.files === 1, JSON.stringify(r));
    assert.deepStrictEqual(await G.commit(repo, { message: 'again' }), { ok: true, nothingToCommit: true });
    assert.ok(!(await G.commit(repo, { message: '  ' })).ok, 'a message is required');
    assert.strictEqual((await G.status(repo)).lastCommit.subject, 'first');
  });

  await test('push to a remote, then pull a change made elsewhere — fast-forward, with exactly the files that changed', async () => {
    assert.ok((await git(['init', '--bare', '-b', 'main', bare], tmp)).ok);
    assert.ok((await git(['remote', 'add', 'origin', bare], repo)).ok);   // a local remote for the test; the API only accepts real URLs
    const p = await G.push(repo, {});
    assert.ok(p.ok && p.branch === 'main', p.error);
    assert.strictEqual((await G.status(repo)).upstream, 'origin/main');
    assert.ok((await git(['clone', bare, other], tmp)).ok);
    write(other, 'src/app.js', 'console.log(2);\n');
    write(other, 'src/new.js', 'module.exports = 3;\n');
    fs.rmSync(path.join(other, 'src', 'app.js'));
    write(other, 'src/app.js', 'console.log(2);\n');
    assert.ok((await git(['add', '-A'], other)).ok && (await git(['commit', '-m', 'from elsewhere'], other)).ok && (await git(['push'], other)).ok);
    const r = await G.pull(repo, {});
    assert.ok(r.ok && !r.upToDate, r.error);
    assert.deepStrictEqual(r.changed.sort((a, b) => a.path.localeCompare(b.path)), [{ status: 'M', path: 'src/app.js' }, { status: 'A', path: 'src/new.js' }]);
    assert.strictEqual(fs.readFileSync(path.join(repo, 'src', 'app.js'), 'utf8'), 'console.log(2);\n');
    assert.ok((await G.pull(repo, {})).upToDate);
  });

  await test('pull refuses a folder with uncommitted changes, and a diverged history, with a clear reason', async () => {
    write(repo, 'src/app.js', 'local edit\n');
    assert.match((await G.pull(repo, {})).error, /uncommitted changes/);
    assert.ok((await G.commit(repo, { message: 'local' })).ok);
    write(other, 'src/new.js', 'remote edit\n');
    await git(['commit', '-am', 'remote'], other); await git(['pull', '--rebase'], other); await git(['push'], other);
    assert.match((await G.pull(repo, {})).error, /both changed|fast-forward/);
  });

  await test('Idearium\'s own files are recognised; a project\'s real manifest.json / project.json are not mistaken for them', () => {
    const d = fs.mkdtempSync(path.join(tmp, 'own-'));
    fs.writeFileSync(path.join(d, 'manifest.json'), '{"manifest_version":3,"name":"my extension"}');
    fs.writeFileSync(path.join(d, 'project.json'), '{"uuid":"nexus-id-repo-1234","name":"x"}');
    assert.strictEqual(G.isInternal(d, 'manifest.json'), false, 'a browser extension manifest is the project');
    assert.strictEqual(G.isInternal(d, 'project.json'), true, 'project-container\'s project.json is Idearium\'s');
    assert.ok(G.isInternal(d, 'chunks') && G.isInternal(d, 'chunks/0.json') && G.isInternal(d, 'atlas.json'));
    assert.ok(!G.isInternal(d, 'src/atlas.json') && !G.isInternal(d, 'src/chunks/x.js'), 'only the top-level ones');
  });

  await test('push/pull with no remote say so', async () => {
    const lone = path.join(tmp, 'lone'); fs.mkdirSync(lone); write(lone, 'a.txt', 'a');
    await G.commit(lone, { message: 'a' });
    assert.match((await G.push(lone, {})).error, /no remote named "origin"/);
    assert.match((await G.pull(lone, {})).error, /no remote named "origin"/);
  });

  await test('a cloned folder reads as import entries (no .git), and zip-ingest applies the same rules to it as to a zip', () => {
    const entries = G.readTree(other);
    assert.ok(entries.length && entries.every(e => !e.entryName.startsWith('.git/')));
    const { extractZipToFiles } = require(path.join(ROOT, 'lib', 'zip-ingest.js'));
    const x = extractZipToFiles({ entries, maxFiles: 100, maxBytesPerFile: 100000, maxTotalBytes: 1e7 });
    assert.ok(x.ok && x.included.some(f => f.path === 'src/new.js') && x.realFiles.some(f => f.path === 'src/app.js' && f.sha256), JSON.stringify(x.stats));
  });

  await test('keygen: the alias follows the vault rule; creates an ed25519 key and returns only the public key', async () => {
    assert.match((await G.keygen({ alias: 'Bad Alias' })).error, /snake_case/);
    const kg = await G.run(['-?'], { bin: 'ssh-keygen', timeoutMs: 5000 });
    if (/ENOENT/.test(kg.stderr) || kg.code === null) return 'skip';   // no ssh-keygen on this machine
    const r = await G.keygen({ alias: 'test_key', sshDir: path.join(tmp, 'ssh') });
    assert.ok(r.ok && /^ssh-ed25519 /.test(r.publicKey) && fs.existsSync(r.keyPath), JSON.stringify(r));
    assert.ok(!/PRIVATE/.test(r.publicKey));
    assert.ok((await G.keygen({ alias: 'test_key', sshDir: path.join(tmp, 'ssh') })).existed, 'never overwrites a key');
  });

  await test('the API: routes, credentials resolved from the compartment, token never in a response, pulled files brought into the repo', () => {
    const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
    for (const [m, seg, a] of [['GET', "':uuid','git'],", 'repo.git.status'], ['POST', "'git','push'],", 'repo.git.push'], ['POST', "'git','pull'],", 'repo.git.pull'], ['POST', "'git','keygen'],", 'repo.git.keygen'], ['POST', "['api','git','clone'],", 'git.clone']]) {
      assert.ok(API.includes(seg) && API.includes(`'${a}'`), a); void m;
    }
    const i = API.indexOf("case 'repo.git.status':"), block = API.slice(i, API.indexOf("case 'git.clone':", i));
    assert.ok(/keys\.resolveSshKey\(\{ compartmentName, alias: body\.keyAlias \}\)/.test(block) && /keys\.gitTokenFor\(\{ compartmentName \}\)/.test(block));
    assert.ok(!/ok\(res, \{[^}]*token/.test(block), 'no response carries the token');
    assert.ok(/_applyChangedFilesToRepo\(repo\.uuid, dir, r\.changed\)/.test(block), 'pulled files go through the shared helper');
    const h = API.slice(API.indexOf('function _applyChangedFilesToRepo('), API.indexOf('function _applyChangedFilesToRepo(') + 2000);
    assert.ok(/getRepoLayer\(\)\.writeFile\(repoUuid, c\.path/.test(h) && /getRepoLayer\(\)\.deleteFile\(repoUuid, c\.path/.test(h) && /getRepoLayer\(\)\.refresh\(repoUuid\)/.test(h));
    assert.ok(/repo\.immutable\) return err\(res, 400, 'this repo is immutable/.test(block));
    const c = API.slice(API.indexOf("case 'git.clone':"), API.indexOf("case 'git.clone':") + 4000);
    assert.ok(/_importFolderAsRepo\(\{ dir: dest/.test(c) && /fs\.rmSync\(tmpRoot/.test(c));
    const imp = API.slice(API.indexOf('async function _importFolderAsRepo('), API.indexOf('async function _importFolderAsRepo(') + 2600);
    assert.ok(/entries: G\.readTree\(dir\)/.test(imp) && /fs\.cpSync\(path\.join\(dir, '\.git'\)/.test(imp), 'the clone\'s .git is carried into the repo');
    const keys = require(path.join(ROOT, 'cos', 'ci', 'keys.js'));
    assert.strictEqual(typeof keys.gitTokenFor, 'function');
    assert.strictEqual(keys.gitTokenFor({}), null);
  });

  await test('the Git & CI tab and "Clone from git"', () => {
    const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
    const HTML = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'index.html'), 'utf8');
    assert.ok(/data-subtab="git"/.test(HTML) && /id="repo-subtab-git"/.test(HTML) && /openGitCloneModal\(\)/.test(HTML));
    assert.ok(/CURRENT_REPO_SUBTAB === 'git'\) renderRepoGit/.test(APP));
    for (const f of ['gitSetRemote', 'gitCommit', 'gitPush', 'gitPull', 'gitKeygen', 'gitSetToken', 'ciStarter', 'ciSave', 'ciRun', 'ciShowRun', 'gitClone']) assert.ok(APP.includes(`function ${f}(`), f);
    assert.ok(/name: 'git_token'/.test(APP), 'the token is stored as the compartment secret git_token');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`);
  process.exit(failed ? 1 : 0);
})();
