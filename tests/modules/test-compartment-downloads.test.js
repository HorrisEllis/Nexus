'use strict';
/**
 * tests/modules/test-compartment-downloads.test.js — CD1–CD5 (0.60.179). Spec: clear-glass/spec/compartment-downloads.spec
 * Map: docs/2026-10-21-compartment-downloads-phasemap.spec
 * James, 2026-10-21: "add magnet link handling, download manage for the compartment. kill on disconnect."
 *
 *   CDT-01  magnet: hex and base32 btih give one hash; dn/xl/tr/ws read; btmh kept; not a magnet → null
 *   CDT-02  quarantine: a download is saved under the quarantine (never Downloads), hashed when done; release copies with the hash
 *           checked and a name clash gets " (2)"; discard keeps the bytes; a magnet navigation is stopped and listed once
 *   CDT-03  qBittorrent: v4 int and v5 string proxy types; peers not proxied → refused; a Tor port → refused; a bound interface → ok;
 *           add verifies in the same call; stop picks /stop or /pause by version
 *   CDT-04  kill switch: an unasked drop runs kill_tabs (windows closed, downloads cancelled, torrents stopped), once; a deliberate stop
 *           does nothing; kill_compartment wipes; block only records
 *   CDT-05  service + surface: rung and qbit settings (no password on disk), handoff marks the item; routes, verbs, agent scope
 *   CDT-06  Settings → Network in Clear Glass's engine against a stub :7702: the rung, quarantined items with their actions, qBittorrent
 * No Electron session, no qBittorrent, no tor here: fakes of their documented APIs.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '../..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const Magnet = require(CG('src/net/magnet.js'));
const { Quarantine } = require(CG('src/net/quarantine.js'));
const { verify, QBit } = require(CG('src/net/qbittorrent.js'));
const { KillSwitch } = require(CG('src/net/kill-switch.js'));
const { NetService } = require(CG('src/net/service.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const HEX = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a';
const B32 = 'YEX6DQDLXISUVHOJ6UM3GNNKPQJWPKEK';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-'));
const store = (v = null) => { let x = v; return { get: () => x, set: (n) => { x = n; } }; };
function fakeItem(name, url, bytes) {
  const it = new EventEmitter(); it.savePath = null; it.cancelled = false;
  Object.assign(it, { getFilename: () => name, getURL: () => url, getTotalBytes: () => bytes.length, getReceivedBytes: () => bytes.length, getMimeType: () => 'application/octet-stream',
    setSavePath: (p) => { it.savePath = p; }, cancel: () => { it.cancelled = true; it.emit('done', {}, 'cancelled'); },
    finish: () => { fs.writeFileSync(it.savePath, bytes); it.emit('done', {}, 'completed'); } });
  return it;
}
function fakeSession() { const s = new EventEmitter(); s.protocol = { handle: (scheme, fn) => { s.handled = { scheme, fn }; } }; return s; }

console.log('\ntest-compartment-downloads — magnets caught, downloads quarantined, a verified hand-off, kill on disconnect');

(async () => {
  await test('CDT-01', 'magnet: one hash for hex and base32; fields read; btmh kept; garbage → null', () => {
    const a = Magnet.parse(`magnet:?xt=urn:btih:${HEX}&dn=Ubuntu%2024.04&xl=6114656256&tr=udp%3A%2F%2Ft.example%3A80&tr=udp%3A%2F%2Ft.example%3A80&ws=https%3A%2F%2Fws.example%2Ff`);
    const b = Magnet.parse(`magnet:?xt=urn:btih:${B32}`);
    assert.strictEqual(a.infoHash, HEX); assert.strictEqual(b.infoHash, HEX);
    assert.deepStrictEqual([a.name, a.size, a.trackers, a.webSeeds], ['Ubuntu 24.04', 6114656256, ['udp://t.example:80'], ['https://ws.example/f']]);
    const v2 = Magnet.parse('magnet:?xt=urn:btmh:1220abcdef&dn=x');
    assert.deepStrictEqual([v2.infoHash, v2.v2], [null, '1220abcdef']);
    assert.strictEqual(Magnet.parse('magnet:?dn=nothing'), null); assert.strictEqual(Magnet.parse('https://x'), null);
  });

  await test('CDT-02', 'quarantine: saved there, hashed, released with a hash check, clash numbered, discard kept, magnets caught once', () => {
    const dir = tmp(); const q = new Quarantine({ dir: path.join(dir, 'q'), log: () => {} });
    const ses = fakeSession(); q.attach(ses, 'cg-snow-1');
    const it = fakeItem('../../evil.exe', 'https://site.example/f', Buffer.from('payload'));
    ses.emit('will-download', {}, it, null);
    assert.ok(it.savePath.startsWith(path.join(dir, 'q')), 'saved in quarantine'); assert.ok(!it.savePath.includes('..'), 'name cleaned');
    it.finish();
    const rec = q.list()[0];
    assert.deepStrictEqual([rec.state, rec.sha256], ['quarantined', crypto.createHash('sha256').update('payload').digest('hex')]);
    const dl = path.join(dir, 'Downloads'); fs.mkdirSync(dl); fs.writeFileSync(path.join(dl, rec.filename), 'already here');
    const r = q.release(rec.id, dl);
    assert.ok(r.ok, r.error); assert.ok(/ \(2\)\.exe$/.test(r.path), r.path); assert.strictEqual(fs.readFileSync(r.path, 'utf8'), 'payload');
    assert.ok(!fs.existsSync(path.join(dir, 'q', rec.id)), 'the quarantined copy is gone after a verified release');
    const it2 = fakeItem('b.bin', 'https://x/b', Buffer.from('bbb')); ses.emit('will-download', {}, it2, null); it2.finish();
    const r2 = q.list().find(x => x.filename === 'b.bin'); assert.ok(q.discard(r2.id).ok);
    assert.ok(fs.existsSync(path.join(dir, 'q', '_discarded', r2.id, 'b.bin')), 'discard keeps the bytes (§0.3)');
    const c = new EventEmitter(); q.watch(c, 'cg-snow-1'); let prevented = 0;
    c.emit('will-navigate', { preventDefault: () => prevented++ }, `magnet:?xt=urn:btih:${HEX}&dn=a`);
    c.emit('will-navigate', { preventDefault: () => prevented++ }, `magnet:?xt=urn:btih:${B32}`);
    c.emit('will-navigate', { preventDefault: () => prevented++ }, 'https://ok.example/');
    assert.strictEqual(prevented, 2); assert.strictEqual(q.list().filter(x => x.kind === 'magnet').length, 1, 'the same torrent listed once');
    assert.strictEqual(ses.handled.scheme, 'magnet', 'the protocol backstop is set');
    const q2 = new Quarantine({ dir: path.join(dir, 'q'), log: () => {} });
    assert.strictEqual(q2.list().length, q.list().length, 'the index survives a restart (inside the quarantine folder)');
    assert.ok(!fs.readFileSync(CG('src/net/quarantine.js'), 'utf8').includes("require('../downloads/store"), 'never the persistent downloads store');
  });

  await test('CDT-03', 'qBittorrent: proxy read from the client; Tor and unproxied peers refused; verified in the same call as add', async () => {
    assert.ok(verify({ proxy_type: 2, proxy_ip: '10.8.0.1', proxy_port: 1080, proxy_peer_connections: true }).ok, 'v4 SOCKS5');
    assert.ok(verify({ proxy_type: 'SOCKS5', proxy_ip: 'vpn', proxy_port: 1080, proxy_peer_connections: true }).ok, 'v5 SOCKS5');
    assert.ok(/peer connections/.test(verify({ proxy_type: 'HTTP', proxy_port: 3128, proxy_peer_connections: false }).why));
    assert.ok(/Tor port/.test(verify({ proxy_type: 'SOCKS5', proxy_ip: '127.0.0.1', proxy_port: 9150, proxy_peer_connections: true }).why));
    assert.ok(/Tor port/.test(verify({ proxy_type: 2, proxy_port: 41234, proxy_peer_connections: true }, { torPorts: [41234] }).why), 'the transport\'s own port');
    assert.ok(/VPN/.test(verify({ proxy_type: -1, current_network_interface: 'wg0' }).path));
    assert.ok(/directly/.test(verify({ proxy_type: 'None', current_network_interface: '' }).why));
    const calls = []; let prefs = { proxy_type: 'None' };
    const res = (status, body, headers = {}) => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body), headers: { get: (k) => headers[k.toLowerCase()] || null } });
    const fetch = async (u, o) => { const p = new URL(u).pathname; calls.push(p); if (p.endsWith('/auth/login')) return res(200, 'Ok.', { 'set-cookie': 'SID=abc; path=/' }); if (p.endsWith('/app/version')) return res(200, 'v5.0.1'); if (p.endsWith('/app/preferences')) return res(200, JSON.stringify(prefs)); if (p.endsWith('/torrents/add')) return res(200, 'Ok.'); if (p.endsWith('/torrents/stop')) return res(200, ''); return res(404, ''); };
    const qb = new QBit({ url: 'http://127.0.0.1:8080', fetch });
    const m = Magnet.parse(`magnet:?xt=urn:btih:${HEX}`);
    const refused = await qb.add(m);
    assert.ok(!refused.ok && !calls.includes('/api/v2/torrents/add'), 'nothing added on a direct client');
    prefs = { proxy_type: 'SOCKS5', proxy_ip: '10.8.0.1', proxy_port: 1080, proxy_peer_connections: true };
    const ok = await qb.add(m);
    assert.ok(ok.ok && ok.hash === HEX, JSON.stringify(ok));
    const i = calls.lastIndexOf('/api/v2/torrents/add'); assert.ok(calls.lastIndexOf('/api/v2/app/preferences') < i && calls.lastIndexOf('/api/v2/app/preferences') > calls.lastIndexOf('/api/v2/torrents/add', i - 1), 'preferences read in the same call');
    assert.ok((await qb.stop([HEX])).ok && calls.includes('/api/v2/torrents/stop'));
  });

  await test('CDT-04', 'kill switch: an unasked drop runs the rung once; a deliberate stop does nothing; kill_compartment wipes', async () => {
    const mk = (rung) => {
      const host = new EventEmitter(); host.intentional = false; host.state = 'ready'; host.status = () => ({ state: host.state }); host.stopped = null;
      host.stop = async (o) => { host.stopped = o; return { ok: true, wiped: true }; };
      const set = (state) => { host.state = state; host.emit('state', { state, error: state === 'failed' ? 'tor exited (SIGKILL)' : null }); };
      const q = { cancelled: 0, wiped: 0, cancelAll() { return ++this.cancelled && 2; }, wipe() { this.wiped++; return { ok: true }; } };
      const stopped = []; const qbit = { stop: async (h) => { stopped.push(...h); return { ok: true }; } };
      const ks = new KillSwitch({ host, quarantine: q, rung: () => rung, closeWindows: () => ['snow-a', 'snow-b'], qbit: () => qbit, handedHashes: () => [HEX], log: () => {} });
      ks.arm(); return { host, set, q, stopped, ks };
    };
    const a = mk('kill_tabs');
    a.set('failed'); await new Promise(r => setImmediate(r));
    a.set('starting'); a.set('failed'); await new Promise(r => setImmediate(r));   // backoff without having come back: not a second drop
    const rec = a.ks.records();
    assert.strictEqual(rec.length, 1, 'one drop, one record');
    assert.deepStrictEqual([rec[0].rung, rec[0].closed, rec[0].cancelled, rec[0].paused, rec[0].wiped], ['kill_tabs', ['snow-a', 'snow-b'], 2, [HEX], null]);
    const b = mk('kill_tabs'); b.host.intentional = true; b.set('stopped'); await new Promise(r => setImmediate(r));
    assert.strictEqual(b.ks.records().length, 0, 'a deliberate stop never kills');
    const c = mk('kill_compartment'); c.set('failed'); await new Promise(r => setImmediate(r));
    assert.deepStrictEqual([c.host.stopped, c.q.wiped, c.ks.records()[0].wiped], [{ wipe: true }, 1, true]);
    const d = mk('block'); d.set('failed'); await new Promise(r => setImmediate(r));
    assert.deepStrictEqual([d.ks.records()[0].closed, d.q.cancelled], [[], 0], 'block only records');
  });

  await test('CDT-05', 'service and surface: rung, qbit without a stored password, handoff marks; routes, verbs, agent scope', async () => {
    const st = store(); const svc = new NetService({ store: st });
    assert.strictEqual(svc.status().onDisconnect, 'kill_tabs', 'kill on disconnect by default');
    assert.ok(!svc.setOnDisconnect('explode').ok); assert.ok(svc.setOnDisconnect('kill_compartment').ok);
    svc.setQbit({ url: 'http://127.0.0.1:8080', user: 'j', pass: 'secret' });
    assert.ok(!JSON.stringify(st.get()).includes('secret'), 'the password is never in the stored policy');
    assert.strictEqual(svc.status().qbit.password, true);
    const q = new Quarantine({ dir: path.join(tmp(), 'q'), log: () => {} }); svc.useCompartmentParts({ quarantine: q });
    const m = q.catchMagnet(`magnet:?xt=urn:btih:${HEX}`, 'cg-snow-1');
    svc._qbit = { add: async () => ({ ok: true, hash: HEX, path: 'SOCKS5 proxy 10.8.0.1:1080 for peer connections' }) };
    assert.ok((await svc.handoff(m.id)).ok); assert.deepStrictEqual([q.get(m.id).handedTo, svc.handedHashes()], ['qbittorrent', [HEX]]);
    const bridge = fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8');
    for (const r of ['/cli/net/quarantine', '/cli/net/quarantine/release', '/cli/net/quarantine/discard', '/cli/net/magnet/handoff', '/cli/net/on-disconnect', '/cli/net/qbit', '/cli/net/qbit/check']) assert.ok(bridge.includes(`'${r}'`), r);
    const main = fs.readFileSync(CG('src/main/index.js'), 'utf8');
    assert.ok(/if \(Compartment\) \{[\s\S]{0,400}ensureQuarantine[\s\S]{0,200}\.attach\(session\.fromPartition\(partition\), partition\)/.test(main), 'compartments get the quarantine');
    assert.ok(/\} else if \(downloads\) \{/.test(main), 'and not the ordinary downloads adapter');
    const { SPEC } = await import(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(r => r.key === 'net'); const A = (args) => ({ args, flags: {} });
    assert.strictEqual(row.personOnly(A(['quarantine'])), null);
    for (const v of ['release', 'discard', 'handoff', 'on-disconnect', 'qbit']) assert.ok(row.personOnly(A([v, 'x'])), v);
    assert.strictEqual(row.req(A(['on-disconnect', 'block'])).body.rung, 'block');
    const tool = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/net.js'));
    assert.ok(tool.parameters.properties.action.enum.includes('quarantine')); assert.ok(/person's act/.test((await tool.execute({ action: 'release' })).error));
  });

  // ── CDT-06 in Clear Glass's engine ──
  await (async () => {
    const glass = require(CG('src/driver/glass.js')); const eng = glass.engine();
    if (!eng) { console.log('  - CDT-06 SKIPPED: Clear Glass has no engine here — the page did not run'); return; }
    const http = require('http'); const asked = [];
    const answers = {
      'GET /cli/net/status': { ok: true, default: 'direct', rules: 0, transport: { state: 'ready', socksPort: 41234 }, bridgeLine: 'set', httpsOnly: true, lastCheck: null, onDisconnect: 'kill_tabs',
        kills: [{ at: 1792400000000, rung: 'kill_tabs', closed: ['snow-a'], cancelled: 1, paused: [], why: 'tor exited' }], qbit: { url: 'http://127.0.0.1:8080', user: '', password: false },
        detect: { tor: '/usr/bin/tor', snowflake: '/usr/bin/snowflake-client', torFrom: 'path', snowflakeFrom: 'path', bridgeLine: 'set', missing: [] } },
      'GET /cli/net/routes': { ok: true, default: 'direct', rules: [] },
      'GET /cli/net/setup/status': { ok: true, phase: 'idle', pct: 0, running: false },
      'GET /cli/net/quarantine': { ok: true, onDisconnect: 'kill_tabs', items: [
        { id: 'q-1', kind: 'file', state: 'quarantined', filename: 'report.pdf', bytes: 2097152, sha256: 'ab'.repeat(32), url: 'https://x/report.pdf' },
        { id: 'q-2', kind: 'magnet', state: 'quarantined', filename: 'Ubuntu 24.04', bytes: 0, url: `magnet:?xt=urn:btih:${HEX}` }] },
      'POST /cli/net/quarantine/release': { ok: true, path: '/home/j/Downloads/report.pdf' },
      'POST /cli/net/qbit/check': { ok: false, error: 'qBittorrent sends peer traffic directly' },
    };
    const srv = http.createServer((req, res) => {
      const key = `${req.method} ${req.url.split('?')[0]}`; asked.push(key);
      res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(answers[key] || { ok: true }));
    });
    const up = await new Promise(ok => { srv.once('error', () => ok(false)); srv.listen(7702, '127.0.0.1', () => ok(true)); });
    if (!up) { console.log('  - CDT-06 SKIPPED: port 7702 is in use here — the page did not run against the stub'); return; }
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { srv.close(); console.log(`  - CDT-06 SKIPPED: engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      await test('CDT-06', 'Settings → Network in Clear Glass: on-disconnect rung, quarantined file and magnet with their actions, qBittorrent check', async () => {
        const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => { const fn = () => Promise.resolve({}); window.ClearGlass = new Proxy({}, { get: () => new Proxy(fn, { get: () => fn }) }); });
        await page.goto(require('url').pathToFileURL(CG('renderer/settings.html')).href + '#network');
        await page.waitForSelector('text=Snowflake downloads', { timeout: 15000 });
        const t = await page.evaluate(() => document.querySelector('.net-quarantine').innerText);
        assert.ok(t.includes('report.pdf') && t.includes('Ubuntu 24.04') && t.includes('Release') && t.includes('Send to qBittorrent'), t);
        assert.ok((await page.evaluate(() => document.body.innerText)).includes('Close the windows'), 'the rung said in words');
        await page.click('.net-quarantine button:has-text("Release")'); await page.waitForTimeout(300);
        await page.click('button:has-text("Check qBittorrent")'); await page.waitForTimeout(300);
        assert.ok(asked.includes('POST /cli/net/quarantine/release') && asked.includes('POST /cli/net/qbit/check'), asked.join(', '));
        assert.ok(/directly/.test(await page.evaluate(() => document.querySelector('.net-qbit-out').textContent)), 'the refusal is shown');
        assert.ok(!asked.includes('POST /cli/net/magnet/handoff'), 'nothing handed off by itself');
        assert.deepStrictEqual(errors, []); await page.close();
      });
    } finally { await browser.close().catch(() => {}); srv.close(); }
  })();

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
