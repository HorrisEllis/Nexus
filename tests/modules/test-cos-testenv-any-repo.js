'use strict';
// §SANDBOX — nothing here writes to the tree: every file lives in os.tmpdir().
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-testenv-any-repo.js — §0.39.264 the COS test VM, for any repo.
 *
 * James: "i need help setting the vm up. either a batch file or just in the
 * packages. or invent a js alternative. needs to be able to create a test env
 * for any repo."  And: "instead of download, it should create a idea or spec for
 * a new organism."
 *
 * REAL: tar.js (extracted by the system tar), detect.js over real repo layouts,
 * host.js lookups, provision.js's cloud-init + seed server over real HTTP,
 * setup-job.js with a real child process, lib/cos-run.js's menu, and — where
 * this host has QEMU, a kernel, busybox and qemu-ga — a REAL VM boot (TCG or
 * KVM) of a guest assembled from the host's own files, running a repo's tests
 * through the tar disk, the guest agent and the QMP network cut.
 * EMULATED: provision.js's first boot (a Debian cloud image cannot be downloaded
 * here) — a fake qemu fetches the real user-data from the real seed server and
 * reports back exactly as the guest script does.
 */
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const http = require('http');
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0, skipped = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
function skip(n, why) { skipped++; console.log(`  - ${n} — SKIPPED: ${why}`); }
const w = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const has = (bin) => { try { cp.execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }); return true; } catch (_) { return false; } };

async function main() {
  console.log('\ntest-cos-testenv-any-repo\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-anyrepo-'));
  const TAR = require(path.join(ROOT, 'cos', 'testenv', 'tar.js'));
  const D = require(path.join(ROOT, 'cos', 'testenv', 'detect.js'));
  const H = require(path.join(ROOT, 'cos', 'testenv', 'host.js'));
  const P = require(path.join(ROOT, 'cos', 'testenv', 'provision.js'));
  const TE = require(path.join(ROOT, 'cos', 'testenv', 'index.js'));

  // ── tar.js ──
  const src = path.join(tmp, 'src');
  w(src, 'a/b.txt', 'hello');
  w(src, 'run.sh', '#!/bin/sh\necho ran'); fs.chmodSync(path.join(src, 'run.sh'), 0o755);
  const deep = `${'d'.repeat(60)}/${'e'.repeat(70)}/${'f'.repeat(80)}/${'g'.repeat(120)}.js`;
  w(src, deep, 'deep');
  w(src, 'node_modules/x/index.js', 'no');
  w(src, '.git/HEAD', 'no');
  const big = Buffer.alloc(1500000); for (let i = 0; i < big.length; i++) big[i] = (i * 7) & 255; fs.writeFileSync(path.join(src, 'big.bin'), big);
  try { fs.symlinkSync('a/b.txt', path.join(src, 'link')); } catch (_) {}
  const tarFile = path.join(tmp, 'o.tar');
  const st = TAR.packDir(src, tarFile);
  check('tar: size is whole 512-byte blocks (a raw disk the guest can read)', fs.statSync(tarFile).size % 512 === 0 && st.bytes === fs.statSync(tarFile).size);
  if (has('tar')) {
    const out = path.join(tmp, 'untar'); fs.mkdirSync(out);
    cp.execFileSync('tar', ['-xf', tarFile, '-C', out]);
    check('tar: the system tar extracts it byte for byte', fs.readFileSync(path.join(out, 'a/b.txt'), 'utf8') === 'hello' && Buffer.compare(fs.readFileSync(path.join(out, 'big.bin')), big) === 0);
    check('tar: a path longer than ustar allows survives (PAX header)', fs.readFileSync(path.join(out, deep), 'utf8') === 'deep');
    check('tar: the exec bit survives (scripts still run in the guest)', (fs.statSync(path.join(out, 'run.sh')).mode & 0o111) !== 0);
    check('tar: node_modules and .git never go to the guest', !fs.existsSync(path.join(out, 'node_modules')) && !fs.existsSync(path.join(out, '.git')));
    if (fs.existsSync(path.join(src, 'link'))) check('tar: symlinks stay symlinks', fs.lstatSync(path.join(out, 'link')).isSymbolicLink());
  } else skip('tar: system tar extraction', 'no tar on this host');
  let big2 = null; try { TAR.packDir(src, path.join(tmp, 'x.tar'), { maxBytes: 1024 }); } catch (e) { big2 = e.message; }
  check('tar: a repo over the size limit is refused with the reason, and no partial file is left', /too big/.test(big2 || '') && !fs.existsSync(path.join(tmp, 'x.tar')));

  // ── detect.js: any repo ──
  const node = path.join(tmp, 'r-node');
  w(node, 'package.json', JSON.stringify({ name: 'x', scripts: { test: 'jest' }, devDependencies: { jest: '^29' } }));
  w(node, 'package-lock.json', '{}');
  w(node, 'src/a.js', ''); w(node, '__tests__/a.js', ''); w(node, 'test/helpers/h.js', '');
  let pl = D.plan(node);
  check('detect: node — npm ci with the lockfile, no install scripts', pl.install[0] && /^npm ci --ignore-scripts/.test(pl.install[0].command));
  check('detect: node — the repo\'s own "test" script is the suite', pl.suite[0] && pl.suite[0].command === 'npm test' && /jest/.test(pl.suite[0].why));
  check('detect: __tests__/ files count; helpers do not', pl.files.map(f => f.file).join() === '__tests__/a.js');
  const npmDefault = path.join(tmp, 'r-npmdefault');
  w(npmDefault, 'package.json', JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' }, devDependencies: { mocha: '1' } }));
  pl = D.plan(npmDefault);
  check('detect: npm\'s placeholder "no test specified" is not a suite; a test framework dependency is', pl.suite[0] && /mocha/.test(pl.suite[0].command));
  const py = path.join(tmp, 'r-py');
  w(py, 'requirements.txt', 'requests\npytest\n'); w(py, 'pkg/core.py', ''); w(py, 'tests/test_core.py', 'def test_x(): pass'); w(py, 'tests/conftest.py', '');
  pl = D.plan(py);
  check('detect: python — a virtualenv with requirements.txt, pytest as the suite', /python3 -m venv \.venv/.test(pl.install[0].command) && /-r requirements\.txt/.test(pl.install[0].command) && pl.suite[0].command === '.venv/bin/python -m pytest -q');
  check('detect: python — conftest.py is not a test file; test_*.py is', pl.files.length === 1 && pl.files[0].file === 'tests/test_core.py' && pl.runtimes.includes('python3'));
  const go = path.join(tmp, 'r-go'); w(go, 'go.mod', 'module x'); w(go, 'a_test.go', '');
  pl = D.plan(go);
  check('detect: go — go test ./... and the go runtime', pl.suite[0].command === 'go test ./...' && pl.runtimes.includes('go'));
  const mixed = path.join(tmp, 'r-mixed'); w(mixed, 'Cargo.toml', ''); w(mixed, 'Gemfile', "gem 'rspec'"); w(mixed, 'composer.json', '{}'); w(mixed, 'phpunit.xml', '');
  pl = D.plan(mixed);
  check('detect: rust, ruby, php in one repo — each stack gets its own install and suite', ['cargo test --offline', 'bundle exec rspec', 'vendor/bin/phpunit'].every(c => pl.suite.some(s => s.command === c)));
  const mk = path.join(tmp, 'r-make'); w(mk, 'Makefile', 'test:\n\t./check.sh\n');
  check('detect: a Makefile test target is used when nothing else is', D.plan(mk).suite[0].command === 'make test');
  const empty = path.join(tmp, 'r-empty'); w(empty, 'README.md', '# x');
  pl = D.plan(empty);
  check('detect: a repo with no tests says so, naming every convention it looked for', pl.suite.length === 0 && pl.files.length === 0 && /no test command/.test(pl.gaps[0]));
  const nexusStyle = D.testFiles(['tests/modules/test-foo.js', 'tests/modules/_purge.js', 'lib/a.js', 'x.spec.ts', 'tests/run.sh']);
  check('detect: Nexus\'s own naming (tests/**/test-*.js), *.spec.ts and tests/*.sh are found; _helpers are not', nexusStyle.map(f => f.file).join() === 'tests/modules/test-foo.js,tests/run.sh,x.spec.ts');

  // ── lib/cos-run.js: the screenshot's "no test files found" ──
  const CR = require(path.join(ROOT, 'lib', 'cos-run.js'));
  const shot = path.join(tmp, 'r-shot'); w(shot, 'package.json', JSON.stringify({ name: 's', main: 'index.js' })); w(shot, 'index.js', 'console.log(1)'); w(shot, 'tests/basic.js', 'require("assert").ok(true)');
  const menu = CR.options({ uuid: 'shot' }, shot);
  const all = menu.find(o => o.id === 'test.all');
  check('run menu: tests/basic.js is a test now (it said "no test files found")', all.available && /\(1\)/.test(all.label), all.reason || all.label);
  const vmOpt = menu.find(o => o.id === 'test.vm');
  if (!vmOpt.available) check('run menu: an unavailable VM names the fix and offers the setup', !!vmOpt.setup && /setup|QEMU|base image/i.test(vmOpt.reason), vmOpt.reason);
  else check('run menu: the VM option describes its plan', /VM/.test(vmOpt.description));
  const nvp = CR.vmPlanFor({ uuid: 'n' }, node, ['__tests__/a.js']);
  check('run menu: the VM plan for a node repo is install + npm test, summarised', nvp.install.length === 1 && nvp.suite[0].command === 'npm test' && /npm test/.test(nvp.summary));

  // ── host.js ──
  const hh = H.home({ COS_TESTENV_HOME: path.join(tmp, 'home') });
  check('host: COS_TESTENV_HOME wins; the default is outside the Nexus tree', hh === path.join(tmp, 'home') && !H.home({}).startsWith(ROOT));
  const probed = [];
  const q0 = H.qemu({ env: { COS_QEMU_DIR: path.join(tmp, 'nowhere') }, refresh: true, _probe: (b) => { probed.push(b); return false; } });
  check('host: QEMU is looked for on PATH and in the default install folders, not only PATH', !q0.found && probed.some(b => !path.isAbsolute(b)));
  const bdir = path.join(tmp, 'qemu-bin'); fs.mkdirSync(bdir);
  const exe = process.platform === 'win32' ? '.exe' : '';
  fs.writeFileSync(path.join(bdir, `qemu-system-x86_64${exe}`), ''); fs.writeFileSync(path.join(bdir, `qemu-img${exe}`), '');
  const q1 = H.qemu({ env: { COS_QEMU_DIR: bdir }, refresh: true, _probe: (b) => path.isAbsolute(b) && b.startsWith(bdir) });
  check('host: a QEMU outside PATH (e.g. C:\\Program Files\\qemu after winget) is found by absolute path', q1.found && q1.system === path.join(bdir, `qemu-system-x86_64${exe}`));
  const henv = { COS_TESTENV_HOME: path.join(tmp, 'home') };
  check('host: no manifest → no base, and the reason names the setup', !H.base({ env: henv }).image && /setup-vm\.bat/.test(H.base({ env: henv }).reason));
  H.writeManifest({ image: 'base.qcow2', runtimes: { node: 'v22.1.0' } }, henv);
  check('host: a manifest\'s relative image resolves against the testenv home', H.base({ env: henv }).image === path.join(tmp, 'home', 'base.qcow2'));

  // ── provision.js: cloud-init + seed server (real HTTP), first boot emulated ──
  const ud = P.userData({ node: '22', extras: ['go', 'bogus'], seedUrl: 'http://10.0.2.2:9/' });
  check('provision: user-data is #cloud-config with qemu-guest-agent, python3, git, build tools', /^#cloud-config\n/.test(ud) && ['qemu-guest-agent', 'python3-venv', 'git', 'build-essential'].every(p => ud.includes(`  - ${p}\n`)));
  check('provision: --with go adds golang; unknown extras are ignored', ud.includes('  - golang-go\n') && !/bogus/.test(ud));
  check('provision: the guest powers off when done and never runs cloud-init again', /power_state:\n  mode: poweroff/.test(ud) && /cloud-init\.disabled/.test(ud));
  const script = P.provisionScript({ node: 'lts' });
  if (has('sh')) {
    const sf = path.join(tmp, 'p.sh'); fs.writeFileSync(sf, script);
    check('provision: the guest script is valid sh', cp.spawnSync('sh', ['-n', sf]).status === 0);
  }
  check('provision: the guest reports versions for the manifest (node, python3, qga …)', ['node=', 'python3=', 'qga=', 'status=ok'].every(k => script.includes(k)));

  // emulated first boot: a fake qemu that reads the seed URL from -smbios, fetches
  // the REAL user-data from the REAL server, reports progress + done, powers off
  const home = path.join(tmp, 'prov-home');
  const fakeImg = path.join(tmp, 'cloud.qcow2'); fs.writeFileSync(fakeImg, 'qcow2');
  const imgCalls = [];
  const fakeBins = { found: true, system: 'fake-qemu', img: 'fake-qemu-img' };
  const _spawnSync = (bin, args) => { imgCalls.push(args); if (args[0] === 'convert') fs.writeFileSync(args[args.length - 1], 'disk'); return { status: 0, stdout: '', stderr: '' }; };
  const Q = require(path.join(ROOT, 'cos', 'compartment', 'qemu-runtime.js'));
  const bootArgs = [];
  const fakeSpawn = (bin, args) => {
    bootArgs.push(args);
    const p = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => setImmediate(() => p.emit('exit', 137));
    const smb = args[args.indexOf('-smbios') + 1] || '';
    const seed = (smb.match(/s=(http:\/\/[^,]+)/) || [])[1];
    if (seed) {
      (async () => {
        const get = (u) => new Promise((r, j) => http.get(u, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ code: res.statusCode, body: b })); }).on('error', j));
        const post = (u, body) => new Promise((r, j) => { const q = http.request(u, { method: 'POST' }, (res) => { res.resume(); res.on('end', r); }); q.on('error', j); q.end(body); });
        const md = await get(seed + 'meta-data'); const u = await get(seed + 'user-data');
        p.fetched = { md: md.body, ud: u.body };
        await post(seed + 'progress', 'node v22.9.0 installed');
        await post(seed + 'done', 'status=ok\nnode=v22.9.0\npython3=3.11.2\nqga=7.2\nos=Debian GNU/Linux 12 (bookworm)\nkernel=6.1.0');
        p.emit('exit', 0);
      })().catch(e => { p.fetchError = e.message; p.emit('exit', 1); });
      fakeSpawn.first = p;
    }
    return p;
  };
  const fakeGa = { connectWhenReady: async () => ({ run: async () => ({ exitCode: 0, stdout: 'v22.9.0\n2\n', stderr: '' }), execute: async () => ({}), close() {} }) };
  const _qemu = { ...Q, ensureEphemeralOverlay: (b, o) => { fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, 'ov'); }, discardOverlay: (o) => fs.rmSync(o, { force: true }) };
  const events = [];
  const pr = await P.provision({ home, imageFile: fakeImg, extras: ['ruby'], _qemu, _qemuBins: fakeBins, _spawn: fakeSpawn, _spawnSync, _ga: fakeGa, _fastExitMs: 10, _guestSeedHost: '127.0.0.1' }, (e) => events.push(e.msg));
  check('provision: completes and says where the image is', pr.ok && pr.image === path.join(home, 'base.qcow2') && fs.existsSync(pr.image), pr.error);
  check('provision: the guest fetched meta-data and the real user-data over HTTP from the seed', fakeSpawn.first && /instance-id: cos-testenv-/.test(fakeSpawn.first.fetched.md) && /#cloud-config/.test(fakeSpawn.first.fetched.ud) && /ruby-full/.test(fakeSpawn.first.fetched.ud));
  check('provision: the seed is announced to the guest by SMBIOS (ds=nocloud-net)', bootArgs[0].some(a => /^type=1,serial=ds=nocloud-net;s=http:\/\/127\.0\.0\.1:\d+\/$/.test(a)));
  check('provision: the first boot has NAT networking and a console log; the check boot has no network', bootArgs[0].includes('virtio-net-pci,netdev=net0,id=nic0') && bootArgs[0].some(a => /^file:.*console\.log$/.test(a)) && bootArgs[1].includes('none'));
  check('provision: the disk is converted from the cloud image and grown', imgCalls.some(a => a[0] === 'convert') && imgCalls.some(a => a[0] === 'resize' && a[2] === '16G'));
  check('provision: the guest\'s progress reaches the caller', events.some(m => /guest: node v22\.9\.0 installed/.test(m)) && events.some(m => /verified: v22\.9\.0/.test(m)));
  const man = H.readManifest({ COS_TESTENV_HOME: home });
  check('provision: base.json records what the image has', man && man.image === 'base.qcow2' && man.runtimes.node === 'v22.9.0' && man.runtimes.python3 === '3.11.2' && man.extras.join() === 'ruby' && /bookworm/.test(man.os));
  const caps = TE.capabilities({ env: { COS_TESTENV_HOME: home }, _probe: () => true });
  check('provision → capabilities: the VM is available from the manifest alone (no env var to set)', caps.vm.ok && caps.vm.baseImage === path.join(home, 'base.qcow2') && caps.vm.runtimes.node === 'v22.9.0', caps.vm.reason);
  fs.writeFileSync(pr.image, 'old');
  const again = await P.provision({ home, imageFile: fakeImg, _qemu, _qemuBins: fakeBins, _spawn: fakeSpawn, _spawnSync, _ga: { connectWhenReady: async () => { throw new Error('no agent'); } }, _fastExitMs: 10, _guestSeedHost: '127.0.0.1' }, () => {});
  check('provision: an image that fails verification is NOT promoted — the working base stays', !again.ok && /did not pass verification: no agent/.test(again.error) && fs.readFileSync(path.join(home, 'base.qcow2'), 'utf8') === 'old');
  const noQ = await P.provision({ home, _qemuBins: { found: false } }, () => {});
  check('provision: no QEMU → stops at once with the install command', !noQ.ok && /QEMU not found/.test(noQ.error));

  // ── setup-job.js: a real child process, progress parsed ──
  const SJ = require(path.join(ROOT, 'cos', 'testenv', 'setup-job.js'));
  const fakeProv = path.join(tmp, 'fake-provision.js');
  fs.writeFileSync(fakeProv, `const a=process.argv.slice(2);console.log(JSON.stringify({msg:'args '+a.join(' ')}));console.log(JSON.stringify({msg:'working'}));console.log(JSON.stringify({result:{ok:true,image:'/x/base.qcow2'}}));`);
  const s1 = SJ.start({ installQemu: true, extras: ['go', 'evil;rm'], node: '22', _script: fakeProv });
  check('setup job: starts in the background', s1.state === 'running');
  check('setup job: a second start while running returns the running job', SJ.start({ _script: fakeProv }).startedAt === s1.startedAt);
  for (let i = 0; i < 50 && SJ.status().state === 'running'; i++) await new Promise(r => setTimeout(r, 100));
  const s2 = SJ.status();
  check('setup job: finishes with the result, and the log carries each progress line', s2.state === 'done' && s2.result.ok && s2.log.some(e => e.msg === 'working'));
  check('setup job: only known options reach provision.js (no injected extras)', s2.log.some(e => /args --json --install-qemu --with go --node 22$/.test(e.msg)), JSON.stringify(s2.log[0]));

  // ── Idearium API wiring ──
  const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
  check('Idearium: GET /api/cos/testenv and POST /api/cos/testenv/setup are routed to the setup job', /\['api','cos','testenv'\]/.test(API) && /case 'cos\.testenv\.setup'[\s\S]{0,200}setup-job\.js/.test(API));
  const REG = fs.readFileSync(path.join(ROOT, 'idearium', 'registry-components.js'), 'utf8');
  check('Idearium registry: the new routes are registered components', /'cos\.testenv\.status'/.test(REG) && /'cos\.testenv\.setup'/.test(REG));
  const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
  check('Idearium UI: the run menu offers "Set up the test VM" when the VM is unavailable', /Set up the test VM/.test(APP) && /\/api\/cos\/testenv\/setup/.test(APP));
  // §0.39.265 — Run asks first, then a numbered walk-through ticked off from what the backend finds
  const host = SJ.status().host;
  check('setup-job status: tells the walk-through about this computer (platform, QEMU install plan, accelerator, image folder)',
    host && host.platform === process.platform && host.qemuPlan && typeof host.qemuPlan.command === 'string' && host.accel && /^(kvm|hvf|whpx|tcg)$/.test(host.accel.accel) && typeof host.home === 'string', JSON.stringify(host));
  check('Idearium UI: Run prompts "Set it up — step by step" / "Not now" and walks through QEMU → acceleration → contents → build → run',
    /Set it up — step by step/.test(APP) && /_vmSetNotNow\(true\)/.test(APP) && ['Install QEMU', 'Hardware acceleration', 'Choose what goes in the VM', 'Build the VM image', 'Run tests in the VM'].every(t => APP.includes(`'${t}`)) && /_VM_STAGES/.test(APP));
  check('Idearium UI: QEMU is offered once — the install prompt leaves it to the walk-through', /!\(vmWalk && n\.tool === 'qemu'\)/.test(APP));
  const BAT = fs.readFileSync(path.join(ROOT, 'cos', 'testenv', 'setup-vm.bat'), 'utf8');
  check('setup-vm.bat: CRLF, installs QEMU with winget, then runs provision.js', /\r\n/.test(BAT) && /winget install --id SoftwareFreedomConservancy\.QEMU/.test(BAT) && /provision\.js/.test(BAT));

  // ── Eravos: a new organism becomes an Idearium idea or spec (no download) ──
  for (const [file, noun] of [['ui/eravos/catalog/catalog-ui.js', 'organism'], ['eravos/ui/catalog/catalog-ui.js', 'mod']]) {
    const srcUi = fs.readFileSync(path.join(ROOT, file), 'utf8');
    check(`${file}: no download scaffold; CREATE IDEA and CREATE SPEC instead`, !/DOWNLOAD SCAFFOLD|_download\(/.test(srcUi) && /CREATE IDEA/.test(srcUi) && /CREATE SPEC/.test(srcUi));
    const posted = [];
    const parent = { postMessage: (m, o) => posted.push({ m, o }) };
    const ctx = { window: {}, document: {}, console, localStorage: { getItem: () => null }, URL, Blob: function () {} };
    ctx.window = ctx; ctx.window.parent = parent;
    vm.createContext(ctx); vm.runInContext(srcUi, ctx);
    const o = { id: 'wave-shaper', label: 'Wave Shaper', what: 'shapes waves', icon: '◆', category: 'Custom' };
    const r = await ctx.CatalogUI.createInIdearium('spec', o, { textContent: '' });
    check(`${file}: inside Idearium the request goes to the parent page (Idearium makes it)`, r.handedOff && posted[0].m.type === 'nexus:organism.create' && posted[0].m.mode === 'spec' && posted[0].m.tags.includes(`${noun}:wave-shaper`) && /shapes waves/.test(posted[0].m.text));
    // standalone: the page calls Idearium's API itself
    const calls = [];
    const ctx2 = { console, localStorage: { getItem: () => 'http://127.0.0.1:4999' }, URL, document: {} };
    ctx2.window = ctx2; ctx2.window.parent = ctx2; ctx2.window.open = (u) => calls.push(['open', u]);
    ctx2.fetch = async (u, opt) => { calls.push([u, JSON.parse(opt.body)]); return { ok: true, json: async () => (u.endsWith('/api/ideas') ? { ok: true, idea: { uuid: 'i-1' } } : { ok: true, uuid: 's-1' }) }; };
    vm.createContext(ctx2); vm.runInContext(srcUi, ctx2);
    await ctx2.CatalogUI.createInIdearium('spec', o, { textContent: '' });
    check(`${file}: standalone it creates the idea, then the spec linked to it, then opens Idearium`, calls[0][0] === 'http://127.0.0.1:4999/api/ideas' && calls[1][0] === 'http://127.0.0.1:4999/api/spec-engine/specs' && calls[1][1].ideaUuid === 'i-1' && calls[2][0] === 'open');
  }
  check('Idearium: takes organism.create only from its Eravos frame, then opens the idea or the New Spec dialog', /nexus:organism\.create/.test(APP) && /ev\.source !== frame\.contentWindow/.test(APP) && /openNewSpecModal\(\{ name: o\.label/.test(APP));

  // ── loom: every new component mapped WITH its real edges (docs/CLAUDE.md rule 3) ──
  const { mapCosTestenv, FILES } = require(path.join(ROOT, 'loom', 'maps', 'cos-testenv-map.js'));
  const { idFor } = require(path.join(ROOT, 'loom', 'scanners', 'source-map.js'));
  const decl = { component: [], hook: [], wire: [] };
  const mapped = mapCosTestenv({ declare: (k, o) => { decl[k].push(o); return { ok: true }; } });
  check('loom: each new file is one component, and nothing failed', mapped.failures.length === 0 && ['cos/testenv/tar.js', 'cos/testenv/detect.js', 'cos/testenv/host.js', 'cos/testenv/index.js', 'cos/testenv/provision.js', 'cos/testenv/setup-job.js'].every(f => decl.component.some(c => c.name === f)));
  let complete = true, why = '';
  for (const [file, , deps] of FILES.filter(f => f[0].startsWith('cos/testenv/'))) {
    const srcText = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of srcText.matchAll(/require\('(\.{1,2}\/[^']+)'\)/g)) {
      const rel = path.relative(ROOT, require.resolve(path.join(ROOT, path.dirname(file), m[1]))).split(path.sep).join('/');
      if (!deps.includes(idFor(rel))) { complete = false; why += `${file} requires ${rel} but has no wire; `; }
    }
  }
  check('loom: every require() in the new files is a wire (none missing)', complete, why);
  check('loom: the edges the scanner cannot see are wires too (spawn of provision.js, Eravos → Idearium)', decl.wire.some(x => /cos\.testenv\.provision--.*setup-job/.test(x.id)) && decl.wire.some(x => /idearium\.api--nexus\.ui\.eravos\.catalog/.test(x.id)));
  const BOOT = fs.readFileSync(path.join(ROOT, 'loom', 'bootstrap.js'), 'utf8');
  check('loom: bootstrap runs the map and excludes its files from the scan', /mapCosTestenv\(driver\)/.test(BOOT) && /maps\/cos-testenv-map'\)\.FILES/.test(BOOT));

  // ── a REAL VM: the host's kernel + busybox + qemu-ga + node, booted by QEMU ──
  const G = require(path.join(ROOT, 'tests', 'helpers', 'cos-mini-guest.js'));
  const qReal = H.qemu({ refresh: true });
  const guest = qReal.found ? G.build(path.join(tmp, 'mini')) : { ok: false, reason: `no QEMU on this host (${H.installHint()})` };
  if (!guest.ok) skip('real VM boot', guest.reason);
  else {
    const repo = path.join(tmp, 'vm-repo');
    w(repo, 'package.json', JSON.stringify({ name: 'vmrepo', scripts: { test: 'node test/a.test.js' } }));
    w(repo, 'test/a.test.js', 'console.log("guest kernel", require("os").release()); require("fs").writeFileSync("/mnt/cos/out.txt","x")');
    w(repo, 'test/b.test.js', 'process.exit(5)');
    const plan = D.plan(repo);
    const runs = await TE.runVm({ compartmentId: 'real-vm-test', root: repo, targets: plan.files.map(f => ({ file: f.file, runtimeId: f.runtime })),
      plan: { install: [{ command: 'echo deps', why: 'test' }], suite: plan.suite }, baseImage: guest.baseImage, boot: guest.manifest.boot, bootTimeoutMs: 240000 });
    const bySuite = runs.find(r => r.kind === 'suite'), a = runs.find(r => r.file === 'test/a.test.js'), b = runs.find(r => r.file === 'test/b.test.js');
    check(`real VM (${runs.meta.accel}): booted, the repo arrived through the tar disk, npm-test ran in the guest`, bySuite && bySuite.passed && /guest kernel/.test(bySuite.stdout), JSON.stringify(runs.map(r => [r.file, r.exitCode, r.stderr.slice(0, 120)])));
    check('real VM: each test file ran with its own exit code', a && a.passed && b && b.exitCode === 5 && !b.passed);
    check('real VM: the network was cut over QMP after install and the guest was offline', runs.meta.network === 'install' && runs.meta.offlineVerified === true);
    check('real VM: guest writes never reach the host repo (ephemeral)', !fs.existsSync(path.join(repo, 'out.txt')));
    check('real VM: overlay and tar disk are gone afterwards', !fs.existsSync(path.join(tmp, '.cos-testenv', 'overlay.qcow2')) && !fs.existsSync(path.join(tmp, '.cos-testenv', 'share.tar')));
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped (reasons above)` : ''}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}
main().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
