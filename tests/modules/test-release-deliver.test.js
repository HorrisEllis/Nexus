'use strict';
// RD-01..10 (0.60.93, COSA7): Clear Glass delivers a Nexus release to COS's inbox. A local http server plays GitHub; the zip is a real release zip and COS's real store imports it.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');
const D = require('../../clear-glass/src/releases/deliver.js'), Zip = require('../../lib/zip.js'), Store = require('../../cos/app/store.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ok ' + name); passed++; } catch (e) { console.log('  FAIL ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 4).join('\n    ')); failed++; } }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cg-rel-'));
const mkzip = (v) => { const t = `nexus-${v}`; return Zip.create([{ path: `${t}/VERSION`, data: Buffer.from(v + '\n') }, { path: `${t}/package.json`, data: Buffer.from('{}') }, { path: `${t}/nexus/autopilot.js`, data: Buffer.from('//x') }]); };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
async function gh(over = {}) {
  const cfg = { version: '0.60.72', tag: null, sums: 'ok', slow: false, apiStatus: 200, bodyOverride: null, ...over }; const zip = cfg.zip || mkzip(cfg.version); const name = `nexus-${cfg.version}.zip`; let port;
  const srv = http.createServer((q, r) => {
    const isList = q.url === '/repos/o/r/releases?per_page=100';   // 0.60.137: check() reads the list (COS's cos-v releases share the repo)
    if (q.url === '/repos/o/r/releases/latest' || isList) { if (cfg.apiStatus !== 200) { r.writeHead(cfg.apiStatus); return r.end('{}'); } r.writeHead(200, { 'Content-Type': 'application/json' }); if (cfg.bodyOverride) return r.end(cfg.bodyOverride);
      const assets = cfg.noAsset ? [] : [{ name, browser_download_url: `http://127.0.0.1:${port}/dl/${name}`, size: cfg.lieSize ? 10 : zip.length }, ...(cfg.sums === 'none' ? [] : [{ name: 'SHA256SUMS', browser_download_url: `http://127.0.0.1:${port}/dl/SHA256SUMS` }])];
      const rel = { tag_name: cfg.tag || 'v' + cfg.version, html_url: 'http://x/rel', assets };
      return r.end(JSON.stringify(isList ? [...(cfg.extra || []), rel] : rel)); }
    if (q.url === '/dl/SHA256SUMS') { if (cfg.sums === 'broken') { r.writeHead(500); return r.end('no'); } r.writeHead(200); return r.end(`${cfg.sums === 'wrong' ? 'a'.repeat(64) : sha(zip)}  ${name}\n`); }
    if (q.url === `/dl/${name}`) { r.writeHead(200, cfg.noLen ? {} : { 'Content-Length': zip.length }); if (!cfg.slow) return r.end(zip); r.write(zip.subarray(0, 10)); cfg.onMid && cfg.onMid(); return setTimeout(() => r.end(zip.subarray(10)), 400); }
    r.writeHead(404); r.end();
  }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); port = srv.address().port;
  return { cfg, zip, name, base: `http://127.0.0.1:${port}`, close: () => srv.close() };
}
(async () => {
  await test('RD-00 a COS release published after the Nexus one (cos-v0.1.1, 3 minutes after v0.60.111 on 2026-10-16) is not taken for Nexus; a draft or a lower version is not either', async () => {
    const g = await gh({ extra: [{ tag_name: 'cos-v0.1.2', assets: [] }, { tag_name: 'v0.60.9', assets: [] }, { tag_name: 'v0.60.200', draft: true, assets: [] }] });
    const c = await D.check({ repo: 'o/r', apiBase: g.base }); g.close();
    assert.ok(c.ok, JSON.stringify(c)); assert.strictEqual(c.version, '0.60.72');
  });
  await test('RD-01 check: reads the latest release: version without the v, the zip asset, the SHA256SUMS asset', async () => { const g = await gh(); const c = await D.check({ repo: 'o/r', apiBase: g.base }); assert.ok(c.ok); assert.strictEqual(c.version, '0.60.72'); assert.strictEqual(c.zip.name, 'nexus-0.60.72.zip'); assert.ok(c.sums); g.close(); });
  await test('RD-02 deliver, verified: the zip and its .sha256 land in the inbox, COS\'s real store imports it as VERIFIED, no .part left', async () => {
    const g = await gh(); const inbox = tmp(); const r = await D.deliver({ repo: 'o/r', inbox, apiBase: g.base }); g.close();
    assert.ok(r.ok && r.action === 'delivered' && r.verified, JSON.stringify(r)); assert.deepStrictEqual(fs.readdirSync(inbox).sort(), ['nexus-0.60.72.zip', 'nexus-0.60.72.zip.sha256']);
    const root = tmp(); const imp = Store.importZip(root, path.join(inbox, 'nexus-0.60.72.zip'), {}); assert.ok(imp.ok, imp.error); assert.strictEqual(imp.verified, true, 'COS found the .sha256 beside the zip');
  });
  await test('RD-03 checksum mismatch: the download is deleted, nothing is delivered, the error shows both hashes', async () => { const g = await gh({ sums: 'wrong' }); const inbox = tmp(); const r = await D.deliver({ repo: 'o/r', inbox, apiBase: g.base }); g.close(); assert.strictEqual(r.ok, false); assert.match(r.error, /checksum mismatch.*published a{64}.*downloaded [0-9a-f]{64}/); assert.deepStrictEqual(fs.readdirSync(inbox), []); });
  await test('RD-04 no SHA256SUMS published: delivered but NOT verified, and it says so; COS imports it unverified', async () => {
    const g = await gh({ sums: 'none' }); const inbox = tmp(); const r = await D.deliver({ repo: 'o/r', inbox, apiBase: g.base }); g.close(); assert.ok(r.ok && r.action === 'delivered'); assert.strictEqual(r.verified, false); assert.match(r.reason, /NOT verified/);
    assert.deepStrictEqual(fs.readdirSync(inbox), ['nexus-0.60.72.zip']); assert.strictEqual(Store.importZip(tmp(), path.join(inbox, 'nexus-0.60.72.zip'), {}).verified, false);
  });
  await test('RD-05 nothing to do: already installed, already in the inbox or done/, or older than what is installed', async () => {
    const g = await gh(); let r = await D.deliver({ repo: 'o/r', inbox: tmp(), installed: ['0.60.72'], apiBase: g.base }); assert.strictEqual(r.action, 'none'); assert.match(r.reason, /already installed/);
    r = await D.deliver({ repo: 'o/r', inbox: tmp(), installed: ['0.60.99'], apiBase: g.base }); assert.strictEqual(r.action, 'none'); assert.match(r.reason, /older than what is installed \(0\.60\.99\)/);
    const a = tmp(); fs.writeFileSync(path.join(a, 'nexus-0.60.72.zip'), 'x'); r = await D.deliver({ repo: 'o/r', inbox: a, apiBase: g.base }); assert.match(r.reason, /already delivered/);
    const b = tmp(); fs.mkdirSync(path.join(b, 'done')); fs.writeFileSync(path.join(b, 'done', 'nexus-0.60.72.zip'), 'x'); r = await D.deliver({ repo: 'o/r', inbox: b, apiBase: g.base }); assert.match(r.reason, /already delivered/); g.close();
  });
  await test('RD-06 size cap: refused before downloading by the asset size, and stopped mid-stream if more arrives; the partial file is removed', async () => {
    const g = await gh(); const inbox = tmp(); let r = await D.deliver({ repo: 'o/r', inbox, apiBase: g.base, maxBytes: 100 }); assert.strictEqual(r.ok, false); assert.match(r.error, /over the .* limit: not downloaded/); assert.deepStrictEqual(fs.readdirSync(inbox), []);
    g.close(); const liar = await gh({ lieSize: true, noLen: true }); const inbox2 = tmp(); r = await D.deliver({ repo: 'o/r', inbox: inbox2, apiBase: liar.base, maxBytes: liar.zip.length - 1 }); liar.close();
    assert.strictEqual(r.ok, false); assert.match(r.error, /download stopped: more than .* arrived\. The partial file was removed/); assert.deepStrictEqual(fs.readdirSync(inbox2), []);
  });
  await test('RD-07 GitHub errors say what happened: 404 (none or private), 403 rate limit, not JSON, a tag that is not a version, a release without the zip', async () => {
    for (const [over, re] of [[{ apiStatus: 404 }, /no published release/], [{ apiStatus: 403 }, /rate limited/], [{ bodyOverride: '<html>' }, /not JSON/], [{ tag: 'nightly' }, /not a version/], [{ noAsset: true }, /no nexus-0\.60\.72\.zip asset/]]) { const g = await gh(over); const r = await D.check({ repo: 'o/r', apiBase: g.base }); g.close(); assert.strictEqual(r.ok, false); assert.match(r.error, re); }
  });
  await test('RD-08 SHA256SUMS exists but cannot be read: nothing is downloaded (an unverifiable zip is not delivered by accident)', async () => { const g = await gh({ sums: 'broken' }); const inbox = tmp(); const r = await D.deliver({ repo: 'o/r', inbox, apiBase: g.base }); g.close(); assert.strictEqual(r.ok, false); assert.match(r.error, /could not read SHA256SUMS.*Nothing was downloaded/); assert.deepStrictEqual(fs.readdirSync(inbox), []); });
  await test('RD-09 GitHub unreachable: a plain error, nothing written', async () => { const inbox = tmp(); const r = await D.deliver({ repo: 'o/r', inbox, apiBase: 'http://127.0.0.1:1' }); assert.strictEqual(r.ok, false); assert.match(r.error, /could not reach GitHub/); assert.deepStrictEqual(fs.readdirSync(inbox), []); });
  await test('RD-10 while the zip streams the inbox holds no .zip (only a dot-part file): the watcher never sees half a file', async () => {
    const inbox = tmp(); let during = null; const g = await gh({ slow: true, onMid: () => { setTimeout(() => { during = fs.readdirSync(inbox); }, 100); } }); const r = await D.deliver({ repo: 'o/r', inbox, apiBase: g.base }); g.close();
    assert.ok(r.ok); assert.ok(during && during.length, 'sampled mid-download'); assert.ok(!during.some(n => /\.zip$/.test(n)), `saw ${during}`); assert.ok(fs.readdirSync(inbox).includes('nexus-0.60.72.zip'));
  });
  await test('RD-11 the service: status downloads nothing and says what a fetch would do; fetch uses COS\'s real root, installed list and inbox', async () => {
    const Svc = require('../../clear-glass/src/releases/service.js'); const g = await gh(); const root = tmp();
    let st = await Svc.status({ root, repo: 'o/r', apiBase: g.base }); assert.ok(st.ok); assert.strictEqual(st.latest, '0.60.72'); assert.match(st.would, /download nexus-0\.60\.72\.zip and check it against SHA256SUMS/); assert.deepStrictEqual(st.installed, []); assert.ok(!fs.existsSync(path.join(root, 'inbox', 'nexus-0.60.72.zip')));
    const f = await Svc.fetchLatest({ root, repo: 'o/r', apiBase: g.base }); assert.ok(f.ok && f.action === 'delivered'); assert.ok(fs.existsSync(path.join(root, 'inbox', 'nexus-0.60.72.zip')));
    // COS's own scan takes it: installed, verified; then the service sees it installed and a fetch does nothing
    const scan = Store.scanInbox(root, {}); assert.ok(scan[0].ok && scan[0].verified, JSON.stringify(scan)); const again = await Svc.fetchLatest({ root, repo: 'o/r', apiBase: g.base }); assert.strictEqual(again.action, 'none'); assert.match(again.reason, /already installed/); g.close();
  });
  await test('RD-12 the command row: nexus-release exists, status is open to agents, fetch is a person\'s act', async () => {
    const { SPEC } = await import('../../idearium/cli/route-commands.js'); const row = SPEC.find(r => r.key === 'nexus-release'); assert.ok(row);
    assert.strictEqual(row.personOnly({ args: ['status'] }), null); assert.match(row.personOnly({ args: ['fetch'] }), /his call/);
    assert.deepStrictEqual(row.req({ args: ['fetch'], flags: {} }).path, '/cli/releases/fetch'); assert.strictEqual(row.req({ args: [], flags: {} }).method, 'GET');
  });
  await test('RD-13 the bridge serves both routes, the job template exists and posts to the fetch route, and a release now publishes SHA256SUMS', () => {
    const R = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
    assert.match(R('clear-glass/src/ipc/bridge.js'), /get\('\/cli\/releases\/status'/); assert.match(R('clear-glass/src/ipc/bridge.js'), /post\('\/cli\/releases\/fetch'/);
    const T = require('../../orchestrator/automation/templates.js'); const list = T.TEMPLATES || T.templates || T.list || (typeof T.all === 'function' ? T.all() : T); const t = (Array.isArray(list) ? list : Object.values(list)).find(x => x && x.id === 'nexus-release-deliver'); assert.ok(t, 'template found');
    assert.ok(t.steps.some(st => st.type === 'http' && /\/cli\/releases\/fetch/.test(st.config.url))); assert.match(R('.github/workflows/release.yml'), /SHA256SUMS/);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
