'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-tunnel.test.js — the cloudflared tunnel in COS's Network settings, with a QR popup (2026-11-03).
 * Spec: cos/spec/network.spec MOD-NET-TUNNEL · MOD-NET-CFD-BIN · MOD-NET-QR.
 * James, 2026-11-03: "can you get cloudflared working in cos. the settings in the network settings. i want to have it connect to a
 * cloudflared url and popup on the screen with a qr code and the link under it" · "cos ui"
 *
 *   CF-01 the QR encoder: finder/timing/format structure, golden matrices (each checked against a reference encoder AND decoded by a
 *         real QR decoder when they were made), UTF-8 counted in bytes, an over-long address refused not cut
 *   CF-02 find(): where it looks, what it says when it is missing
 *   CF-03 readUrl(): the address out of cloudflared's boxed output, wherever the chunks split
 *   CF-04 start is refused, said: gate closed, an agent, ngrok, no cloudflared, no systems, a system COS does not know
 *   CF-05 a quick tunnel through a fake cloudflared (a real child process): the right --url, the address read from split chunks, no token in its
 *         environment, stop kills it
 *   CF-06 a tunnel that dies is restarted and shows its new address; after the hour's allowance it says it gave up
 *   CF-07 cloudflared that gives no address: its own last words are shown (exit) / the timeout says so
 *   CF-08 a named tunnel: the token is in the child's environment and not on its command line; the address is the hostname he set
 *   CF-09 the installer, with a fake GitHub: installs and runs --version; a wrong checksum / a missing one refused and nothing kept; the API
 *         rate limit falls back to the release page; macOS says why not
 *   CF-10 the manager's routes: status, start by an agent 403, start by a person, stop; the ledger says it without the address
 *   CF-11 the Network page in the real cockpit: Start → the QR popup with the link under it, the code is the address's code, Escape closes
 *   CF-12 the Compartments section: every declared system listed; a switch and a limit saved from the page, shown again after a reload
 *   CF-13 the CLI rows: `network` shows the gates; `network set` by a person; an agent, a token and a fixed value refused; `tunnel` status and its acts
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-tun-')); process.env.COS_MANAGER_DATA = dir;
const fake = path.join(dir, 'fake-cloudflared.js'), FD = path.join(dir, 'fake'); fs.mkdirSync(FD);
process.env.FAKE_DIR = FD; process.env.COS_CLOUDFLARED = fake;
const N = require(path.join(ROOT, 'cos/manager/network-settings.js'));
const CFD = require(path.join(ROOT, 'cos/manager/cloudflared.js'));
const TUN = require(path.join(ROOT, 'cos/manager/tunnel.js'));
const QR = require(path.join(ROOT, 'cos/ui/core/qr.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 50) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } }
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };

// a fake cloudflared: prints what the real one prints (a boxed trycloudflare address on stderr, "Registered tunnel connection" for a named one).
// FAKE_MODE (read at start): ok | split | fail | silent | die ; every run is recorded in FAKE_DIR.
fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs'), path = require('path'); const D = process.env.FAKE_DIR; const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('cloudflared version 2026.1.1 (built fake)'); process.exit(0); }
const n = fs.readdirSync(D).filter(f => f.startsWith('run-')).length;
fs.writeFileSync(path.join(D, 'run-' + process.pid + '.json'), JSON.stringify({ argv: a, token: process.env.TUNNEL_TOKEN || null, n }));
const mode = (fs.existsSync(path.join(D, 'mode')) ? fs.readFileSync(path.join(D, 'mode'), 'utf8') : 'ok').trim();
const url = 'https://quiet-river-demo-' + (n + 1) + '.trycloudflare.com';
const err = (s) => process.stderr.write(s);
err('2026-11-03T20:56:36Z INF Thank you for trying Cloudflare Tunnel.\\n2026-11-03T20:56:36Z INF Requesting new quick Tunnel on trycloudflare.com...\\n');
if (mode === 'fail') { err('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp: lookup api.trycloudflare.com: no such host\\n'); process.exit(1); }
if (mode === 'silent') { setInterval(() => {}, 1000); return; }
if (a.includes('run')) { err('2026-11-03T20:56:40Z INF Registered tunnel connection connIndex=0 connection=abc event=0 ip=1.2.3.4 location=sea01\\n'); setInterval(() => {}, 1000); return; }
if (mode === 'split') { err('2026-11-03T20:56:40Z INF |  https://quiet-riv'); setTimeout(() => { err('er-demo-' + (n + 1) + '.trycloudflare.com  |\\n'); }, 120); }
else err('2026-11-03T20:56:40Z INF +--------------------------------------------------------------------------------------------+\\n2026-11-03T20:56:40Z INF |  ' + url + '  |\\n2026-11-03T20:56:40Z INF +-----------------------------------------------------------------------------------------+\\n');
if (mode === 'die') setTimeout(() => process.exit(1), 400); else setInterval(() => {}, 1000);
`, { mode: 0o755 });
const setMode = (m) => fs.writeFileSync(path.join(FD, 'mode'), m);
const runs = () => fs.readdirSync(FD).filter(f => f.startsWith('run-')).map(f => ({ pid: Number(/run-(\d+)/.exec(f)[1]), ...JSON.parse(fs.readFileSync(path.join(FD, f), 'utf8')) })).sort((x, y) => x.n - y.n);
const resetRuns = () => { for (const f of fs.readdirSync(FD)) if (f.startsWith('run-')) fs.unlinkSync(path.join(FD, f)); };
const sup0 = { list: () => [{ name: 'orchestrator', port: 9000 }, { name: 'idearium', port: 9100 }, { name: 'noport', port: null }] };
const open = (extra = {}) => { const r = N.patch({ outbound: { enabled: true, tunnel: { enabled: true, provider: 'cloudflare', token: '', hostname: '', systems: ['orchestrator'], ...extra } } }, { by: 'person' }); assert.ok(r.ok, r.error); };
const mk = (o = {}) => TUN.createTunnel({ sup: sup0, settings: N, cfd: CFD, ...o });

(async () => {
  console.log('\n⇄  COS cloudflared tunnel, with a QR popup\n');

  await test('CF-01', 'QR: structure, golden matrices (reference-encoder and decoder checked), bytes not characters, over-long refused', () => {
    const m = QR.matrix('https://quiet-river-demo-four.trycloudflare.com'), g = m.modules, n = m.size;
    assert.strictEqual(n, 17 + 4 * m.version);
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) { for (let i = 0; i < 7; i++) assert.ok(g[r0][c0 + i] && g[r0 + 6][c0 + i] && g[r0 + i][c0] && g[r0 + i][c0 + 6], 'finder ring'); assert.ok(g[r0 + 3][c0 + 3], 'finder centre'); }
    for (let i = 8; i < n - 8; i++) assert.strictEqual(g[6][i], i % 2 === 0, 'timing row'), assert.strictEqual(g[i][6], i % 2 === 0, 'timing column');
    assert.ok(g[n - 8][8], 'the dark module');
    // both copies of the format word are the same valid BCH word, and name the mask the encoder says it used
    const copyA = []; for (let i = 0; i <= 5; i++) copyA.push(g[i][8]); copyA.push(g[7][8], g[8][8], g[8][7]); for (let i = 9; i < 15; i++) copyA.push(g[8][14 - i]);
    const copyB = []; for (let i = 0; i < 8; i++) copyB.push(g[8][n - 1 - i]); for (let i = 8; i < 15; i++) copyB.push(g[n - 15 + i][8]);
    assert.deepStrictEqual(copyA, copyB, 'two copies agree');
    const word = copyA.reduce((a, b, i) => a | ((b ? 1 : 0) << i), 0) ^ 0x5412; let rem = word >> 10; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); assert.strictEqual(((word >> 10) << 10 | rem) & 0x7fff, word & 0x7fff, 'the BCH check');
    assert.strictEqual(((word >> 10) >> 3) & 3, 0, 'error correction M'); assert.strictEqual((word >> 10) & 7, m.mask, 'the mask the format word names');   // the 5 data bits are ec (2 bits, high) | mask (3 bits, low)
    // golden: made by this encoder, then each shown equal to a reference encoder's modules at the same version and mask AND decoded back to its text by OpenCV
    const GOLD = { 'https://quiet-river-demo-four.trycloudflare.com': '811edf373d977843b3a71bf1045ee757dd2a490e01f1a419e49b9e728697afb3',
      'https://a-b-c-d-e-f-g.trycloudflare.com/?x=1': 'c6e37a744f62dc50d7361169acb6ad7158b61573cdddb4b9c78fde2099ed84b9', 'https://nexus.example.com': '33dc0ed658dc96a9c2fccf41f6e678f9d1a8f64070b9a02d6b8e3f6bc93abf3b' };
    for (const [t, h] of Object.entries(GOLD)) assert.strictEqual(crypto.createHash('sha256').update(QR.matrix(t).modules.map(r => r.map(x => (x ? '1' : '0')).join('')).join('\n')).digest('hex'), h, t);
    assert.strictEqual(QR.matrix('é'.repeat(100)).version >= 9, true, 'é is two bytes: 200 bytes needs a big version');
    assert.throws(() => QR.matrix('x'.repeat(214)), /more than this encoder holds/); assert.doesNotThrow(() => QR.matrix('x'.repeat(213)));
    const svg = QR.svg('https://nexus.example.com'); assert.match(svg, /^<svg [^>]*viewBox="0 0 33 33"/); assert.ok(svg.includes('fill="#fff"') && svg.includes('fill="#000"'), 'black on white, whatever the theme');
  });

  await test('CF-02', 'find(): the override first, then COS\'s folder, then PATH; a miss lists where it looked', () => {
    const f = CFD.find({ env: { COS_CLOUDFLARED: fake, COS_MANAGER_DATA: dir } }); assert.strictEqual(f.found, true); assert.strictEqual(f.path, fake); assert.strictEqual(f.from, 'COS_CLOUDFLARED');
    const own = path.join(dir, 'ownfolder'); fs.mkdirSync(path.join(own, 'bin'), { recursive: true }); fs.writeFileSync(path.join(own, 'bin', 'cloudflared'), '#!/bin/sh\n', { mode: 0o755 });
    const f2 = CFD.find({ env: { COS_MANAGER_DATA: own, PATH: '/nonexistent' }, platform: 'linux' }); assert.strictEqual(f2.found, true); assert.match(f2.from, /own folder/);
    const f3 = CFD.find({ env: { COS_MANAGER_DATA: path.join(dir, 'nothing'), PATH: `/nonexistent:${path.join(dir, 'nowhere')}` }, platform: 'linux' }); assert.strictEqual(f3.found, false); assert.ok(f3.searched.length >= 3 && f3.searched.some(p => p.includes('nowhere')), JSON.stringify(f3));
    const w = CFD.candidates({ env: { PATH: 'C:\\tools;C:\\bin', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', COS_MANAGER_DATA: 'C:\\cos' }, platform: 'win32' }).map(c => c.path);
    assert.ok(w.some(p => /Program Files \(x86\).cloudflared.cloudflared\.exe$/.test(p)) && w.some(p => /tools.cloudflared\.exe$/.test(p)) && w.some(p => /cos.bin.cloudflared\.exe$/.test(p)), JSON.stringify(w));
  });

  await test('CF-03', 'readUrl(): the address out of the box, from whatever has arrived', () => {
    const box = '2026-11-03T20:56:40Z INF +----+\n2026-11-03T20:56:40Z INF |  https://Quiet-River-Demo-1.trycloudflare.com  |\n2026-11-03T20:56:40Z INF +----+\n';
    assert.strictEqual(TUN.readUrl(box), 'https://quiet-river-demo-1.trycloudflare.com');
    assert.strictEqual(TUN.readUrl('INF Requesting new quick Tunnel on trycloudflare.com...'), null, 'the bare domain is not an address');
    assert.strictEqual(TUN.readUrl('https://quiet-riv'), null); assert.strictEqual(TUN.readUrl('https://quiet-riv' + 'er-demo-1.trycloudflare.com'), 'https://quiet-river-demo-1.trycloudflare.com');
    assert.strictEqual(TUN.readUrl('see https://www.cloudflare.com/website-terms/ for terms'), null, 'other cloudflare links are not the tunnel');
    assert.strictEqual(TUN.readUrl('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp: lookup api.trycloudflare.com: no such host'), null, 'Cloudflare\'s own API endpoint, named in its error, is not a tunnel address');
  });

  await test('CF-04', 'start refused, said: gate closed, an agent, ngrok, no cloudflared, no systems, an unknown system', () => {
    const t = mk(); const closed = t.start({ by: 'person' }); assert.strictEqual(closed.code, 409); assert.match(closed.error, /switch on .*outbound\.enabled.* in Network settings/);
    assert.strictEqual(t.start({}).code, 400); assert.strictEqual(t.start({ by: 'agent:copilot' }).code, 403); assert.strictEqual(t.stop({ by: 'agent:copilot' }).code, 403);
    open({ provider: 'ngrok' }); const ng = t.start({ by: 'person' }); assert.strictEqual(ng.code, 400); assert.match(ng.error, /ngrok/);
    open({ provider: 'cloudflare' });
    const noBin = TUN.createTunnel({ sup: sup0, settings: N, cfd: { find: () => ({ found: false, searched: ['/a', '/b'] }) } }).start({ by: 'person' });
    assert.strictEqual(noBin.code, 409); assert.strictEqual(noBin.needs, 'cloudflared'); assert.match(noBin.error, /Download cloudflared|button on this page/);
    open({ systems: [] }); assert.match(t.start({ by: 'person' }).error, /no systems are listed/);
    open({ systems: ['orchestrator'] }); assert.strictEqual(t.status().state, 'off');
  });

  await test('CF-05', 'quick tunnel via a fake cloudflared: the port COS knows, the address from split chunks, no token, stop kills it', async () => {
    resetRuns(); setMode('split'); open({ systems: ['orchestrator', 'idearium'] }); const t = mk();
    const r = t.start({ by: 'person' }); assert.ok(r.ok, r.error);
    const st = await until(() => { const s = t.status(); return s.state === 'up' ? s : null; }); assert.ok(st, `never up: ${JSON.stringify(t.status().tunnels)}`);
    assert.deepStrictEqual(st.tunnels.map(x => x.system).sort(), ['idearium', 'orchestrator']); assert.ok(st.tunnels.every(x => /^https:\/\/quiet-river-demo-\d\.trycloudflare\.com$/.test(x.url)), JSON.stringify(st.tunnels));
    assert.strictEqual(new Set(st.tunnels.map(x => x.url)).size, 2, 'one address per system');
    const rs = runs(); assert.strictEqual(rs.length, 2);
    const byOrigin = Object.fromEntries(rs.map(x => [x.argv[x.argv.indexOf('--url') + 1], x])); assert.deepStrictEqual(Object.keys(byOrigin).sort(), ['http://127.0.0.1:9000', 'http://127.0.0.1:9100']);
    assert.ok(rs.every(x => x.argv.includes('--no-autoupdate') && x.token === null), 'no token for a quick tunnel');
    assert.strictEqual(st.mode, 'quick'); assert.strictEqual(st.tunnels.find(x => x.system === 'orchestrator').origin, 'http://127.0.0.1:9000');
    const pids = rs.map(x => x.pid); assert.ok(pids.every(alive));
    const s2 = t.stop({ by: 'person' }); assert.strictEqual(s2.status.state, 'off'); await until(() => pids.every(p => !alive(p)));
    assert.ok(pids.every(p => !alive(p)), 'stop killed the processes'); assert.ok(s2.status.tunnels.every(x => x.url === null));
    t.dispose();
  });

  await test('CF-06', 'a tunnel that dies is restarted with its new address; past the hour\'s allowance it says it gave up', async () => {
    resetRuns(); setMode('die'); open({ systems: ['orchestrator'] });
    const t = mk({ policy: { maxRestartsPerHour: 2 } }); assert.ok(t.start({ by: 'person' }).ok);
    const seen = new Set(); const end = Date.now() + 12000; let gaveUp = null;
    while (Date.now() < end && !gaveUp) { const e = t.status().tunnels[0]; if (e.url) seen.add(e.url); if (e.state === 'failed') gaveUp = e; await sleep(40); }
    assert.ok(seen.size >= 2, `each run had its own address: ${[...seen]}`); assert.ok(gaveUp, 'it gave up'); assert.match(gaveUp.error, /stopped 2 times in an hour; COS gave up/);
    assert.strictEqual(runs().length, 3, 'the first run and two restarts, no more'); t.dispose();
  });

  await test('CF-07', 'no address: cloudflared\'s own last words when it exits; the timeout says so when it only stays silent', async () => {
    resetRuns(); setMode('fail'); open({ systems: ['orchestrator'] }); const t = mk(); assert.ok(t.start({ by: 'person' }).ok);
    const e = await until(() => { const x = t.status().tunnels[0]; return x.state === 'failed' ? x : null; }); assert.ok(e, 'failed');
    assert.match(e.error, /exited \(1\) before giving an address/); assert.match(e.error, /no such host/); t.dispose();
    resetRuns(); setMode('silent'); const t2 = mk({ policy: { startTimeoutMs: 500 } }); assert.ok(t2.start({ by: 'person' }).ok);
    const pid = (await until(() => runs()[0]) || {}).pid; const e2 = await until(() => { const x = t2.status().tunnels[0]; return x.state === 'failed' ? x : null; }); assert.ok(e2, 'timed out');
    assert.match(e2.error, /no address after 0\.5s/); await until(() => !alive(pid)); assert.ok(!alive(pid), 'the silent process was killed'); t2.dispose();
  });

  await test('CF-08', 'named tunnel: the token is in the environment and never on the command line; the address is his hostname', async () => {
    resetRuns(); setMode('ok'); open({ token: 'TOKEN-ABC-123', hostname: 'nexus.example.com' }); const t = mk(); assert.ok(t.start({ by: 'person' }).ok);
    const st = await until(() => { const s = t.status(); return s.state === 'up' ? s : null; }); assert.ok(st, JSON.stringify(t.status().tunnels));
    assert.strictEqual(st.mode, 'named'); assert.strictEqual(st.tunnels.length, 1); assert.strictEqual(st.tunnels[0].url, 'https://nexus.example.com');
    const r = runs()[0]; assert.strictEqual(r.token, 'TOKEN-ABC-123'); assert.ok(!r.argv.join(' ').includes('TOKEN-ABC-123'), 'not in argv'); assert.deepStrictEqual(r.argv.slice(0, 3), ['tunnel', '--no-autoupdate', 'run']);
    assert.ok(!JSON.stringify(st).includes('TOKEN-ABC-123'), 'the status never carries the token'); t.stop({ by: 'person' });
    resetRuns(); open({ token: 'TOKEN-ABC-123', hostname: '' }); const t2 = mk(); t2.start({ by: 'person' });
    const s2 = await until(() => { const s = t2.status(); return s.state === 'up' ? s : null; }); assert.ok(s2 && s2.tunnels[0].url === null && /no hostname is set/.test(s2.tunnels[0].error), JSON.stringify(s2 && s2.tunnels));
    t2.dispose(); open({ token: '', hostname: '' });
  });

  // ── the installer, against a fake GitHub ──────────────────────────────────────────────────────────────────────────────────────
  const BIN = Buffer.from("#!/bin/sh\necho 'cloudflared version 2026.1.1 (built fake)'\n"); const SHA = crypto.createHash('sha256').update(BIN).digest('hex');
  const resp = (body, { status = 200, url = '', headers = {} } = {}) => { const r = new Response(body, { status, headers }); Object.defineProperty(r, 'url', { value: url }); return r; };
  const gh = ({ api = 'ok', sum = SHA, asset = BIN, list = true } = {}) => async (u) => {
    if (u.includes('api.github.com')) return api === 'ok' ? resp(JSON.stringify({ tag_name: '2026.1.1', body: list ? `cloudflared-linux-amd64: ${sum}\ncloudflared-windows-amd64.exe: ${'0'.repeat(64)}\n` : 'no sums here' })) : resp('{"message":"rate limit"}', { status: 403 });
    if (u === 'https://github.com/cloudflare/cloudflared/releases/latest') return resp(`<html><li><code>cloudflared-linux-amd64</code> ${list ? sum : ''}</li></html>`, { url: 'https://github.com/cloudflare/cloudflared/releases/tag/2026.1.1' });
    if (u.includes('/releases/download/2026.1.1/cloudflared-linux-amd64')) return resp(asset, { headers: { 'content-length': String(asset.length) } });
    return resp('', { status: 404 });
  };
  const instDir = () => { const d = fs.mkdtempSync(path.join(dir, 'inst-')); return { d, env: { COS_MANAGER_DATA: d, PATH: '/nonexistent' } }; };
  // 2026-11-24: CF-09 installs the Linux build and runs it (a /bin/sh stand-in, its executable bit): a Windows machine cannot run either, so
  // there it is skipped and said, never passed by bending the installer to the test
  if (process.platform === 'win32') console.log('  · CF-09 skipped on Windows: it installs and runs the Linux build (a sh script stand-in); run it on Linux or macOS');
  else await test('CF-09', 'installer: installs and runs it; wrong or missing checksum refused with nothing kept; API limit falls back to the page; macOS says why not', async () => {
    let { d, env } = instDir(); let i = CFD.createInstaller({ fetch: gh(), env, platform: 'linux', arch: 'x64' }); const ok = await i.install();
    assert.ok(ok.ok, ok.error); assert.strictEqual(ok.action, 'installed'); assert.strictEqual(ok.version, '2026.1.1'); assert.strictEqual(ok.verified, true); assert.strictEqual(ok.path, path.join(d, 'bin', 'cloudflared'));
    assert.ok(fs.statSync(ok.path).mode & 0o111, 'executable'); assert.strictEqual(i.status().phase, 'done');
    const again = await i.install(); assert.strictEqual(again.action, 'kept', 'no second download without force');
    assert.strictEqual((await i.install({ force: true })).action, 'installed', 'force reinstalls');
    ({ d, env } = instDir()); i = CFD.createInstaller({ fetch: gh({ asset: Buffer.from('not the program') }), env, platform: 'linux', arch: 'x64' }); const bad = await i.install();
    assert.strictEqual(bad.ok, false); assert.match(bad.error, /checksum mismatch/); assert.deepStrictEqual(fs.existsSync(path.join(d, 'bin')) ? fs.readdirSync(path.join(d, 'bin')) : [], [], 'nothing kept, no .part'); assert.strictEqual(i.status().phase, 'failed');
    ({ d, env } = instDir()); i = CFD.createInstaller({ fetch: gh({ list: false }), env, platform: 'linux', arch: 'x64' }); const none = await i.install(); assert.strictEqual(none.ok, false); assert.match(none.error, /do not list a SHA-256/);
    assert.deepStrictEqual(fs.existsSync(path.join(d, 'bin')) ? fs.readdirSync(path.join(d, 'bin')) : [], []);
    ({ d, env } = instDir()); i = CFD.createInstaller({ fetch: gh({ api: 'limited' }), env, platform: 'linux', arch: 'x64' }); const fb = await i.install(); assert.ok(fb.ok, `the release page is the fallback: ${fb.error}`);
    ({ d, env } = instDir()); const mac = await CFD.createInstaller({ fetch: gh(), env, platform: 'darwin', arch: 'arm64' }).install(); assert.strictEqual(mac.ok, false); assert.match(mac.error, /brew install cloudflared/);
    assert.strictEqual(CFD.assetFor('win32', 'x64'), 'cloudflared-windows-amd64.exe'); assert.strictEqual(CFD.assetFor('win32', 'arm64'), 'cloudflared-windows-amd64.exe'); assert.strictEqual(CFD.assetFor('linux', 'arm64'), 'cloudflared-linux-arm64');
    const sums = CFD.parseChecksums(`<li>cloudflared-linux-amd64: ${SHA}</li> cloudflared-linux-amd64.deb ${'a'.repeat(64)}`); assert.strictEqual(sums['cloudflared-linux-amd64'], SHA); assert.strictEqual(sums['cloudflared-linux-amd64.deb'], 'a'.repeat(64));
  });

  // ── the manager's routes, and the page in the real cockpit ────────────────────────────────────────────────────────────────────
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const decl = [{ name: 'orchestrator', system: 'orchestrator', cmd: 'node', args: ['-e', '0'], healthUrl: 'http://127.0.0.1:9000/health', onDemand: true }];
  const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'l.jsonl'), log: () => {}, declarations: decl });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: dir }); const mp = mgr.address().port;
  const req = (port, method, p, body) => new Promise((res) => { const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json' } }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(t || '{}') })); }); q.end(body ? JSON.stringify(body) : undefined); });
  await test('CF-10', 'routes: status; an agent 403; a person starts; the ledger says so without the address; stop', async () => {
    resetRuns(); setMode('ok'); N.patch({ outbound: { enabled: false } }, { by: 'person' });
    const s0 = await req(mp, 'GET', '/api/cos/network/tunnel'); assert.strictEqual(s0.status, 200); assert.strictEqual(s0.body.state, 'off'); assert.strictEqual(s0.body.binary.found, true); assert.strictEqual(s0.body.gate.ok, false);
    const g = await req(mp, 'POST', '/api/cos/network/tunnel', { action: 'start', by: 'person' }); assert.strictEqual(g.status, 409); assert.match(g.body.error, /Network settings/);
    open({ systems: ['orchestrator'] });
    assert.strictEqual((await req(mp, 'POST', '/api/cos/network/tunnel', { action: 'start', by: 'agent:x' })).status, 403);
    assert.strictEqual((await req(mp, 'POST', '/api/cos/network/tunnel', { action: 'fly', by: 'person' })).status, 400);
    assert.strictEqual((await req(mp, 'POST', '/api/cos/network/tunnel/install', { by: 'agent:x' })).status, 403);
    const st = await req(mp, 'POST', '/api/cos/network/tunnel', { action: 'start', by: 'person' }); assert.strictEqual(st.status, 200, JSON.stringify(st.body));
    const up = await until(async () => { const r = await req(mp, 'GET', '/api/cos/network/tunnel'); return r.body.state === 'up' ? r.body : null; }); assert.ok(up, 'up'); assert.match(up.tunnels[0].url, /^https:\/\/quiet-river-demo-1\.trycloudflare\.com$/);
    const led = sup.ledger({}).filter(e => e.kind === 'network'); assert.ok(led.some(e => /tunnel starting/.test(e.why)) && led.some(e => /tunnel up for orchestrator/.test(e.why)), JSON.stringify(led.map(e => e.why)));
    assert.ok(!JSON.stringify(led).includes('trycloudflare.com'), 'the address is not in the ledger');
    const down = await req(mp, 'POST', '/api/cos/network/tunnel', { action: 'stop', by: 'person' }); assert.strictEqual(down.body.status.state, 'off');
  });

  await test('CF-13', 'CLI: network shows the gates; set by a person; an agent, a token and a fixed value refused; tunnel status; an agent cannot start it', async () => {
    const run = async (line, by = 'person') => (await req(mp, 'POST', '/api/cos/cli', { line, by })).body;
    const n = await run('network'); assert.ok(n.ok, JSON.stringify(n)); assert.ok(n.lines.some(l => /^ssh\s+closed/.test(l)), JSON.stringify(n.lines)); assert.ok(n.lines.some(l => /^tunnel\s+cloudflare, quick/.test(l)), JSON.stringify(n.lines));
    const set = await run('network set outbound.tunnel.hostname nexus.example.com'); assert.ok(set.ok, JSON.stringify(set)); assert.strictEqual(N.load().outbound.tunnel.hostname, 'nexus.example.com');
    assert.ok((await run('network set outbound.tunnel.systems orchestrator, idearium')).ok); assert.deepStrictEqual(N.load().outbound.tunnel.systems, ['orchestrator', 'idearium']);
    const tok = await run('network set outbound.tunnel.token SECRET-XYZ'); assert.strictEqual(tok.ok, false); assert.match(tok.lines.join(' '), /Network page/); assert.strictEqual(N.view().outbound.tunnel.token.set, false, 'a token is not set from a command line');
    assert.match((await run('network set outbound.tunnel.hostname x.example.com', 'agent:a')).lines.join(' '), /agent proposes/); assert.strictEqual(N.load().outbound.tunnel.hostname, 'nexus.example.com');
    assert.match((await run('network set inbound.ssh.keysOnly false')).lines.join(' '), /fixed at true/);
    assert.match((await run('network set outbound.tunnel.provider carrier-pigeon')).lines.join(' '), /one of cloudflare, ngrok/);
    const st = await run('tunnel status'); assert.ok(st.ok, JSON.stringify(st)); assert.match(st.lines[0], /^off · quick · cloudflare · cloudflared at /);
    assert.match((await run('tunnel start', 'agent:a')).lines.join(' '), /agent proposes/); assert.match((await run('tunnel fly')).lines.join(' '), /usage: tunnel/);
    assert.ok((await run('help tunnel')).lines.some(l => /tunnel \[status\|start\|stop\|install\]/.test(l)));
    assert.ok((await run('network set outbound.tunnel.hostname none')).ok); assert.strictEqual(N.load().outbound.tunnel.hostname, ''); assert.ok(sup.ledger({}).some(e => e.kind === 'network' && /network settings changed: outbound\.tunnel\.hostname/.test(e.why)));
    N.patch({ outbound: { tunnel: { systems: ['orchestrator'] } } }, { by: 'person' });
  });

  const cp0 = await new Promise(r => { const t = require('net').createServer(); t.listen(0, '127.0.0.1', () => { const x = t.address().port; t.close(() => r(x)); }); });
  const cockpit = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: cp0, manager: `http://127.0.0.1:${mp}` }); await new Promise(r => cockpit.listen(cp0, '127.0.0.1', r));
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - CF-11 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('CF-11', 'the page: Start → the QR popup, the link under the code, the code is that address\'s code, Escape closes', async () => {
      resetRuns(); setMode('ok'); N.patch({ outbound: { enabled: false, tunnel: { enabled: false } } }, { by: 'person' });
      const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } }); await page.addInitScript(() => { window.confirm = () => true; });
      await page.goto(`http://127.0.0.1:${cp0}/network/index.html`);
      await until(() => page.evaluate(() => !!document.querySelector('[data-tunnel-state]')), 8000);
      assert.strictEqual(await page.evaluate(() => document.querySelector('[data-tunnel-state]').textContent), 'Off');
      assert.ok(await page.evaluate(() => document.getElementById('nw-tunnel-start').disabled), 'Start waits for the gate'); assert.ok(await page.evaluate(() => /Network settings/.test((document.querySelector('[data-tunnel-gate]') || {}).textContent || '')), 'the closed gate is said');
      await page.evaluate(() => { for (const p of ['outbound.enabled', 'outbound.tunnel.enabled']) { const i = document.querySelector(`[data-path="${p}"]`); i.checked = true; i.dispatchEvent(new Event('change')); } document.getElementById('nw-save').click(); });
      assert.ok(await until(() => page.evaluate(() => !document.getElementById('nw-tunnel-start').disabled), 8000), `Start opens once the gate does — ${await page.evaluate(() => document.getElementById('nw-tunnel-body').innerText)}`);
      assert.strictEqual(await page.evaluate(() => !!document.getElementById('nw-qr')), false, 'no popup before Start');
      await page.evaluate(() => document.getElementById('nw-tunnel-start').click());
      assert.ok(await until(() => page.evaluate(() => !!document.querySelector('#nw-qr svg')), 10000), `the popup — the page says: ${await page.evaluate(() => document.getElementById('nw-tunnel-body').innerText)}`);
      const pop = await page.evaluate(() => { const box = document.querySelector('#nw-qr .nw-qr-card'); const kids = [...box.children].map(c => c.className); const svg = box.querySelector('svg'), a = box.querySelector('a');
        return { kids, link: a.textContent, href: a.href, svgBefore: !!(svg.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING), path: svg.querySelector('path').getAttribute('d'), box: [svg.getBoundingClientRect().height, a.getBoundingClientRect().top - svg.getBoundingClientRect().bottom] }; });
      assert.strictEqual(pop.link, 'https://quiet-river-demo-1.trycloudflare.com'); assert.ok(pop.svgBefore, 'the link is under the code'); assert.ok(pop.box[0] > 150 && pop.box[1] >= 0, `the code is drawn and the link sits below it: ${pop.box}`);
      assert.strictEqual(pop.path, QR.svg(pop.link).match(/<path d="([^"]+)"/)[1], 'the popup\'s code is the code of that address');
      if (process.env.NW_SHOTS) await page.screenshot({ path: path.join(process.env.NW_SHOTS, 'cos-tunnel-qr.png') });
      await page.keyboard.press('Escape'); assert.strictEqual(await page.evaluate(() => !!document.getElementById('nw-qr')), false, 'Escape closes it');
      assert.ok(await page.evaluate(() => /quiet-river-demo-1/.test(document.querySelector('[data-tunnel]').textContent)), 'the address stays in the panel'); assert.ok(await page.evaluate(() => !!document.querySelector('[data-qr]')), 'Show QR brings it back');
      await page.evaluate(() => document.getElementById('nw-tunnel-stop').click()); assert.ok(await until(() => page.evaluate(() => document.querySelector('[data-tunnel-state]').textContent === 'Off'), 6000), 'Stop');
      await page.close();
    });
    await test('CF-12', 'compartments: each declared system listed; a switch and a limit saved from the page and shown again after a reload', async () => {
      N.patch({ compartments: { orchestrator: { network: 'on', bytesPerSec: null } } }, { by: 'person' });
      const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } }); await page.addInitScript(() => { window.confirm = () => true; });
      await page.goto(`http://127.0.0.1:${cp0}/network/index.html`);
      assert.ok(await until(() => page.evaluate(() => !!document.querySelector('[data-path=\"compartments.orchestrator.network\"]')), 8000), 'the system is listed');
      assert.strictEqual(await page.evaluate(() => document.querySelector('[data-path=\"compartments.orchestrator.network\"]').value), 'on', 'the default is shown');
      await page.evaluate(() => { const s = document.querySelector('[data-path=\"compartments.orchestrator.network\"]'), n = document.querySelector('[data-path=\"compartments.orchestrator.bytesPerSec\"]'); s.value = 'throttled'; s.dispatchEvent(new Event('change')); n.value = '500'; n.dispatchEvent(new Event('change')); document.getElementById('nw-save').click(); });
      assert.ok(await until(() => { const c = (N.load().compartments || {}).orchestrator; return c && c.network === 'throttled' && c.bytesPerSec === 512000; }, 6000), JSON.stringify(N.load().compartments));
      await page.goto(`http://127.0.0.1:${cp0}/network/index.html`); await until(() => page.evaluate(() => { const s = document.querySelector('[data-path=\"compartments.orchestrator.network\"]'); return s && s.value === 'throttled'; }), 8000);
      assert.deepStrictEqual(await page.evaluate(() => [document.querySelector('[data-path=\"compartments.orchestrator.network\"]').value, document.querySelector('[data-path=\"compartments.orchestrator.bytesPerSec\"]').value]), ['throttled', '500']);
      await page.evaluate(() => { const n = document.querySelector('[data-path=\"compartments.orchestrator.bytesPerSec\"]'); n.value = ''; n.dispatchEvent(new Event('change')); document.getElementById('nw-save').click(); });
      assert.ok(await until(() => (N.load().compartments.orchestrator || {}).bytesPerSec === null, 6000), 'an empty limit clears it');
      await page.close(); N.patch({ compartments: { orchestrator: { network: 'on', bytesPerSec: null } } }, { by: 'person' });
    });
    await browser.close();
  }
  cockpit.close(); mgr.close(); sup.shutdown({ by: 'test' });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
