'use strict';
// SH-01..12 (0.60.91): the COS command line. Real zips in the real store, real child processes, no PowerShell, no npm, no shell.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), { PassThrough } = require('stream');
const Zip = require('../../lib/zip.js'), Store = require('../../cos/app/store.js'), SH = require('../../cos/app/shell.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ok ' + name); passed++; } catch (e) { console.log('  FAIL ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 5).join('\n    ')); failed++; } }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cos-sh-'));
const alive = (pid) => { try { process.kill(pid, 0); } catch (_) { return false; } try { return !/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch (_) { return true; } };
const SCRIPTS = { hello: 'node tools/hello.js', 'start:all': 'node nexus/autopilot.js', chain: 'node a.js && node b.js', other: 'concurrently "a" "b"', quit3: 'node tools/exit3.js', tree: 'node tools/tree.js', piped: 'node tools/hello.js | more' };
const FILES = {
  'tools/hello.js': "console.log(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), data: process.env.NEXUS_DATA_ROOT, np: process.env.NODE_PATH || '' }))",
  'tools/exit3.js': "console.error('bad'); process.exit(3)",
  'tools/tree.js': "const c = require('child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); console.log('GRANDCHILD ' + c.pid); setInterval(() => {}, 1000)",
  'lib/nexus/autopilot.js': "setInterval(() => {}, 1000)",
  'cli/nexus.js': "console.log('nexus cli ' + process.argv.slice(2).join(' '))",
};
function install(root, v = '0.60.70') {
  const t = `nexus-${v}`; const z = path.join(tmp(), t + '.zip');
  fs.writeFileSync(z, Zip.create([{ path: `${t}/VERSION`, data: Buffer.from(v + '\n') }, { path: `${t}/package.json`, data: Buffer.from(JSON.stringify({ scripts: SCRIPTS })) }, ...Object.entries(FILES).map(([f, c]) => ({ path: `${t}/${f}`, data: Buffer.from(c) }))]));
  const r = Store.importZip(root, z, {}); assert.ok(r.ok, r.error); const f = path.join(root, 'projects', 'nexus', 'state.json'); const s = JSON.parse(fs.readFileSync(f, 'utf8')); s.current = v; fs.writeFileSync(f, JSON.stringify(s)); return v;
}
function mk(opts = {}) { const root = tmp(); install(root); let buf = ''; const sh = new SH.Shell({ root, project: 'nexus', out: (s) => { buf += s; }, stdio: 'pipe', opts: { modulesDir: null, ...opts } }); return { root, sh, out: () => buf, clear: () => { buf = ''; } }; }
(async () => {
  await test('SH-01 tokenize: spaces split, quotes group, a Windows backslash is just a backslash, an unclosed quote is named', () => {
    assert.deepStrictEqual(SH.tokenize('npm run hello -- a "b c" \'d e\''), ['npm', 'run', 'hello', '--', 'a', 'b c', 'd e']); assert.deepStrictEqual(SH.tokenize('import C:\\dl\\nexus-0.60.70.zip'), ['import', 'C:\\dl\\nexus-0.60.70.zip']); assert.match(SH.tokenize('x "y').error, /unclosed/);
  });
  await test('SH-02 npm run <script> -- args: runs "node <file>" in the current version folder, data root set, args passed exactly', async () => {
    const t = mk(); const c = await t.sh.run('npm run hello -- a "b c"'); assert.strictEqual(c, 0); const j = JSON.parse(t.out().split('\n').find(l => l.startsWith('{')));
    assert.deepStrictEqual(j.argv, ['a', 'b c']); assert.ok(j.cwd.endsWith(path.join('versions', '0.60.70'))); assert.ok(j.data.endsWith(path.join('projects', 'nexus', 'data'))); assert.match(t.out(), /▶ npm run hello.*node tools\/hello\.js.*nexus 0\.60\.70/); assert.match(t.out(), /✓ finished \(exit 0\)/);
  });
  await test('SH-03 what cannot run is refused, named, and nothing is started: a chain, another program, a pipe, npm install, an unknown script', async () => {
    const t = mk(); for (const [line, re] of [['npm run chain', /chains commands or uses a shell feature/], ['npm run other', /start with "node <file>"/], ['npm run piped', /chains commands/], ['npm install', /no npm/], ['npm run nope', /no script "nope"/], ['dir', /not a COS command/], ['npm run', /npm run needs a script name.*hello/]]) {
      t.clear(); const c = await t.sh.run(line); assert.strictEqual(c, 2, line); assert.match(t.out(), re, line); assert.ok(!/▶/.test(t.out()), 'nothing was started: ' + line);
    }
  });
  await test('SH-04 no shell: metacharacters in an argument are data, never a command', async () => { const t = mk(); await t.sh.run('npm run hello -- "x && echo PWNED"'); const j = JSON.parse(t.out().split('\n').find(l => l.startsWith('{'))); assert.deepStrictEqual(j.argv, ['x && echo PWNED']); assert.ok(!/^PWNED/m.test(t.out())); });
  await test('SH-05 nexus <args> runs cli/nexus.js; node <file> runs a file in the version and refuses one outside it', async () => {
    const t = mk(); assert.strictEqual(await t.sh.run('nexus status --json'), 0); assert.match(t.out(), /nexus cli status --json/); t.clear();
    assert.strictEqual(await t.sh.run('node ../../../../x.js'), 2); assert.match(t.out(), /outside the current version/); t.clear(); assert.strictEqual(await t.sh.run('node tools/missing.js'), 2); assert.match(t.out(), /does not exist/);
  });
  await test('SH-06 a non-zero exit is reported with its code and the stderr is shown', async () => { const t = mk(); const c = await t.sh.run('npm run quit3'); assert.strictEqual(c, 3); assert.match(t.out(), /bad/); assert.match(t.out(), /✗ exited with code 3/); });
  await test('SH-07 Ctrl+C (cancel) ends the whole process tree, grandchild included, and the console is still usable', async () => {
    const t = mk(); const p = t.sh.run('npm run tree'); let gc = null; for (let i = 0; i < 50 && !gc; i++) { await new Promise(r => setTimeout(r, 100)); const m = t.out().match(/GRANDCHILD (\d+)/); if (m) gc = +m[1]; }
    assert.ok(gc, 'the grandchild started'); assert.ok(alive(gc)); assert.ok(t.sh.running); assert.ok(t.sh.cancel()); const c = await p; assert.notStrictEqual(c, 0);
    for (let i = 0; i < 40 && alive(gc); i++) await new Promise(r => setTimeout(r, 100)); assert.ok(!alive(gc), 'the grandchild is gone'); assert.ok(!t.sh.running); t.clear(); assert.strictEqual(await t.sh.run('npm run hello'), 0);
  });
  await test('SH-08 start:all while COS already runs the project is refused; so is a taken port; neither starts a second copy', async () => {
    const t = mk(); const f = path.join(t.root, 'projects', 'nexus', 'run.json'); fs.writeFileSync(f, JSON.stringify({ pid: process.pid, project: 'nexus', version: '0.60.70', statusPort: 1, startedAt: new Date().toISOString() }));
    const c = await t.sh.run('npm run start:all'); assert.strictEqual(c, 2); assert.match(t.out(), /already running under COS/); fs.unlinkSync(f); t.clear();
    const srv = net.createServer().listen(0, '127.0.0.1'); await new Promise(r => srv.on('listening', r)); const port = srv.address().port; const t2 = mk({ ports: [port] });
    assert.strictEqual(await t2.sh.run('npm run start:all'), 2); assert.match(t2.out(), new RegExp(`port ${port} already in use`)); srv.close();
  });
  await test('SH-09 start:all runs the autopilot in the foreground and Ctrl+C stops it', async () => {
    const t = mk({ ports: [] }); const p = t.sh.run('npm run start:all'); await new Promise(r => setTimeout(r, 600)); assert.ok(t.sh.running); t.sh.cancel(); const c = await p; assert.ok(!t.sh.running); assert.match(t.out(), /▶ npm run start:all.*nexus\/autopilot\.js/); assert.notStrictEqual(c, 0);
  });
  await test('SH-10 COS verbs run in the same console: list, settings; help; exit', async () => {
    const t = mk(); assert.strictEqual(await t.sh.run('list'), 0); assert.match(t.out(), /nexus\s+\(current 0\.60\.70\)/); t.clear();
    assert.strictEqual(await t.sh.run('settings update.policy auto'), 0); assert.match(t.out(), /update\.policy = auto/); assert.strictEqual(require('../../cos/app/settings.js').load(t.root).settings.update.policy, 'auto'); t.clear();
    assert.strictEqual(await t.sh.run('help'), 0); assert.match(t.out(), /npm run <script>/); assert.strictEqual(await t.sh.run('exit'), -1); assert.strictEqual(await t.sh.run(''), 0);
  });
  await test('SH-11 no current version: says to switch first, starts nothing', async () => { const root = tmp(); const sh = new SH.Shell({ root, out: () => {}, stdio: 'pipe' }); let o = ''; sh.out = (s) => { o += s; }; assert.strictEqual(await sh.run('npm run start:all'), 2); assert.match(o, /no current version.*switch/); });
  await test('SH-12 the interactive loop: a prompt with the version, commands run in order, exit ends it', async () => {
    const root = tmp(); install(root); const input = new PassThrough(), output = new PassThrough(); let buf = ''; output.on('data', d => { buf += d; });
    const done = SH.repl({ root, input, output, opts: { modulesDir: null } }); input.write('npm run hello -- one\n'); await new Promise(r => setTimeout(r, 1200)); input.write('help\nexit\n'); const code = await done;
    assert.strictEqual(code, 0); assert.match(buf, /cos nexus@0\.60\.70> /); assert.match(buf, /"argv":\["one"\]/); assert.match(buf, /COS command line\. No PowerShell/);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
