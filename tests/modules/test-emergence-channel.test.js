'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-emergence-channel.test.js — TV3, 0.60.344. Map: docs/2026-11-01-tv-ui-cleanup-phasemap.spec TV3.
 * James, 2026-11-01: "the tv ui needs the emergence channel".
 *   EC-01  Intelligence's GET /api/intelligence/patterns: each pattern carries its sentence (said) and self (one side is Intelligence's own)
 *   EC-02  lib/emergence.js sessions(): his emergence runs read back newest first, with attempts, method pivots and outcome
 *   EC-03  the command rows: emergence patterns | liminal | sessions, each a call to the orchestrator's /api/emergence/*
 *   EC-04  the orchestrator forwards the three (read in its source: the orchestrator cannot be started on a test port; said, not run)
 *   EC-05  the channel in Clear Glass against a stand-in orchestrator: three columns; self hidden by default and counted; shown on the switch
 *   EC-06  one system down: its column says so in red, by name; the others still show
 *   EC-07  the TV: EMERGENCE is the last channel (CH_INSPECT is read by position), its page loads on tune, and a rail he saved before it
 *          existed gets it added at its end
 *   EC-08  COS ("i also meant cos ui"): COS's manager answers /api/cos/emergence/* from a stand-in Intelligence (its origin from its
 *          declaration) and the kernel; the cockpit serves the one shared script; COS's Emergence page, in Clear Glass, shows all three
 */
const assert = require('assert'), http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'lib/ui/tv-shell');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
{ const log = console.log; console.log = (...a) => { if (!/^\[(jaa|cortex|intelligence|liminal)/.test(String(a[0]))) log(...a); }; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const PATTERNS = [
  { patternType: 'co_occurrence', typeA: 'intelligence.command_invoked', typeB: 'ledger.copilot.event', count: 1944, confidence: 1 },
  { patternType: 'failure_precursor', precursorType: 'ledger.cg.registered', failureTypes: ['intelligence.failure_scan'], count: 39, confidence: 0.8 },
  { patternType: 'bottleneck', gapType: 'dangling-hook', count: 13, confidence: 0.6 },
];

(async () => {
  console.log('\n⬡  The EMERGENCE channel (TV3)\n');
  await test('EC-01', 'Intelligence\'s patterns carry their sentence and self', async () => {
    const I = require(path.join(ROOT, 'intelligence/index.js'));
    const idx = I.getPatterns(); idx.length = 0; idx.push(...PATTERNS.map(p => ({ ...p })));
    let out = null; await I.handleRequest('GET', '/api/intelligence/patterns', new URLSearchParams(), {}, (s, d) => { out = { s, d }; });
    assert.strictEqual(out.s, 200);
    const [a, b, c] = out.d.patterns;
    assert.strictEqual(a.said, '"intelligence: command invoked" always fires alongside "ledger: copilot event" (1944× — 100% confidence)');
    assert.deepStrictEqual([a.self, b.self, c.self], [false, false, false].map((_, i) => i === 0), 'only the first has Intelligence on one side');
    assert.ok(/reliably appears before failures/.test(b.said) && /keep recurring/.test(c.said));
    assert.strictEqual(out.d.self, 1);
  });
  await test('EC-02', 'sessions(): his runs, newest first, with attempts, pivots and outcome', async () => {
    const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
    jaaDB.insert('emergence_sessions', { compartmentId: 'c1', spec: { axioms: ['no network'], endState: 'a parser that passes' }, history: [{ why: 'off by one' }, { why: 'same method failed', pivot: true }, { result: 'ok' }], outcome: 'passed', ts: 2000 });
    jaaDB.insert('emergence_sessions', { compartmentId: 'c0', spec: { axioms: [], endState: 'old' }, history: [{ error: 'x' }], outcome: 'exhausted', ts: 1000 });
    const r = require(path.join(ROOT, 'lib/emergence.js')).sessions({ limit: 10 });
    assert.ok(r.ok, JSON.stringify(r));
    const mine = r.sessions.filter(s => ['c1', 'c0'].includes(s.compartmentId));
    assert.deepStrictEqual(mine.map(s => [s.compartmentId, s.outcome, s.attempts, s.pivots]), [['c1', 'passed', 3, 1], ['c0', 'exhausted', 1, 0]]);
    assert.deepStrictEqual(mine[0].axioms, ['no network']); assert.strictEqual(mine[0].endState, 'a parser that passes');
  });
  await test('EC-03', 'the command rows call the orchestrator', async () => {
    const { SPEC } = await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = (k) => SPEC.find(r => r.key === k);
    assert.deepStrictEqual(row('emergence.patterns').req({ args: [], flags: {} }), { system: 'orchestrator', method: 'GET', path: '/api/emergence/patterns' });
    assert.strictEqual(row('emergence.liminal').req({ args: [], flags: { focal: 'L1/L2' } }).path, '/api/emergence/liminal?focalPoint=L1%2FL2');
    assert.strictEqual(row('emergence.sessions').req({ args: [], flags: { limit: '5' } }).path, '/api/emergence/sessions?limit=5');
  });
  await test('EC-04', 'the orchestrator forwards the three (source read, not run)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'orchestrator/orchestrator.js'), 'utf8');
    const b = src.slice(src.indexOf("sub === 'emergence'"), src.indexOf("sub === 'emergence'") + 2200);
    assert.ok(/GET\('intelligence', '\/api\/intelligence\/patterns'/.test(b) && /\/api\/liminal-space\/status/.test(b) && /lib\/emergence\.js'\)\.sessions/.test(b) && /503/.test(b), 'patterns, liminal and sessions forwarded; a silent system is a 503 that names it');
  });

  // a stand-in orchestrator for the channel page
  let down = new Set();
  const pats = PATTERNS.map(p => ({ ...p, said: `${p.patternType} said`, self: p.typeA === 'intelligence.command_invoked', ts: Date.now() - 60000 }));
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]); res.setHeader('Access-Control-Allow-Origin', '*');
    const j = (s, d) => { res.statusCode = s; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); };
    if (u === '/api/emergence/patterns') return down.has('patterns') ? j(503, { ok: false, error: 'intelligence did not answer: timeout' }) : j(200, { ok: true, patterns: pats, total: 3, self: 1 });
    if (u === '/api/emergence/liminal') return down.has('liminal') ? j(503, { ok: false, error: 'intelligence did not answer: ECONNREFUSED' }) : j(200, { ok: true, status: { spaces: { 'L1/L2': { name: 'Coherence Surface', invariant: 'what holds together', active: 172, resolved: 4, crystals: 9, velocity: 0.42, runaway: false }, 'L2/L4': { name: 'Runaway edge', invariant: 'speed', active: 3, resolved: 0, crystals: 0, velocity: 2.1, runaway: true } } }, items: [] });
    if (u === '/api/emergence/sessions') return j(200, { ok: true, sessions: [{ compartmentId: 'c1', outcome: 'passed', ts: Date.now() - 3600000, axioms: ['no network'], endState: 'a parser that passes', attempts: 3, pivots: 1 }], total: 1 });
    const f = path.join(UI, u); if (!f.startsWith(UI) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'application/javascript' : 'text/html'); res.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - EC-05..06 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    const open = async () => { await page.goto(`${origin}/channels/emergence/emergence.html?orch=${encodeURIComponent(origin)}`); await page.waitForFunction(() => !/reading…/.test(document.getElementById('em-runs').textContent)); };
    await test('EC-05', 'three columns; Intelligence watching itself hidden by default, counted, shown on the switch', async () => {
      await open();
      const said = await page.evaluate(() => [...document.querySelectorAll('#em-crystals .em-said')].map(e => e.textContent));
      assert.deepStrictEqual(said, ['failure_precursor said', 'bottleneck said'], 'sorted by confidence, the self one hidden');
      assert.strictEqual(await page.evaluate(() => document.getElementById('em-self-n').textContent), '(1)');
      const lim = await page.evaluate(() => document.getElementById('em-liminal').textContent);
      assert.ok(/Coherence Surface/.test(lim) && /172 forming/.test(lim) && /runaway/.test(lim), lim);
      const runs = await page.evaluate(() => document.getElementById('em-runs').textContent);
      assert.ok(/a parser that passes/.test(runs) && /3 attempts/.test(runs) && /1 method pivot(?!s)/.test(runs) && /no network/.test(runs), runs);
      if (process.env.EC_SHOTS) await page.screenshot({ path: path.join(process.env.EC_SHOTS, 'emergence-channel.png') });
      await page.evaluate(() => { const c = document.getElementById('em-hide-self'); c.checked = false; c.dispatchEvent(new Event('change')); });
      assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#em-crystals .em-said').length), 3);
    });
    await test('EC-06', 'one system down: its column says which, in red; the others still show', async () => {
      down = new Set(['liminal']); await open();
      assert.ok(/intelligence did not answer: ECONNREFUSED/.test(await page.evaluate(() => document.querySelector('#em-liminal .em-bad').textContent)));
      assert.ok(await page.evaluate(() => document.querySelectorAll('#em-crystals .em-card').length) >= 1 && /a parser that passes/.test(await page.evaluate(() => document.getElementById('em-runs').textContent)));
      down = new Set();
    });
    await browser.close();
  }
  srv.close();
  await test('EC-07', 'the TV: EMERGENCE last, loaded on tune; a rail saved before it gets it added', () => {
    const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
    const meta = html.slice(html.indexOf('const CH_META=['), html.indexOf('];', html.indexOf('const CH_META=[')));
    const ids = [...meta.matchAll(/\{id:'([^']+)'/g)].map(m => m[1]);
    // appended after the original channels (the last of them is ch-perplexity-agent), never inserted among them: CH_INSPECT is read by
    // position. Later channels (ch-cos, 0.60.347) are appended after it, which is why this is not "the last one".
    assert.ok(ids.indexOf('ch-emergence') > ids.indexOf('ch-perplexity-agent'), 'appended, never inserted');
    assert.ok(/id="ch-emergence"/.test(html) && /f\.src='channels\/emergence\/emergence\.html'/.test(html));
    const fnSrc = html.slice(html.indexOf('function loadChannelList()'), html.indexOf('function saveChannelList'));
    const store = { 'nexus.tv.channels': JSON.stringify([{ id: 'ch-log', name: 'LOG' }, { id: 'ch-overview', name: 'NEXUS', hidden: true }]) };
    const load = new Function('localStorage', 'DEFAULT_CH_META', 'CHANNEL_STORE_KEY', 'console', fnSrc + '; return loadChannelList();');
    const got = load({ getItem: (k) => store[k] }, [{ id: 'ch-overview', name: 'NEXUS' }, { id: 'ch-log', name: 'LOG' }, { id: 'ch-emergence', name: 'EMERGENCE' }], 'nexus.tv.channels', console);
    assert.deepStrictEqual(got.map(c => [c.id, !!c.hidden]), [['ch-log', false], ['ch-overview', true], ['ch-emergence', false]], 'his order and his hidden one kept; the new one added at the end');
  });
  // EC-08 — COS: the real manager server and the real cockpit server, a stand-in Intelligence behind the manager
  const intel = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); const u = req.url.split('?')[0];
    if (u === '/api/intelligence/patterns') return res.end(JSON.stringify({ ok: true, patterns: [{ patternType: 'bottleneck', said: '"dangling hook" gaps keep recurring (13× open) — likely a systemic bottleneck', count: 13, confidence: 0.6, self: false }], total: 1, self: 0 }));
    if (u === '/api/liminal-space/status') return res.end(JSON.stringify({ spaces: { 'L1/L3': { name: 'Pattern-Causality Membrane', invariant: 'cause before pattern', active: 21, resolved: 2, crystals: 5, velocity: 0.3 } } }));
    if (u === '/api/liminal-space/list') return res.end(JSON.stringify({ ok: true, items: [] }));
    res.statusCode = 404; res.end('{}'); });
  await new Promise(r => intel.listen(0, '127.0.0.1', r));
  const sup = { on() {}, setHooks() {}, list: () => [], ledgerFile: path.join(require('os').tmpdir(), `ec-cos-${process.pid}`, 'ledger.jsonl'), declarations: () => [{ name: 'intelligence', healthUrl: `http://127.0.0.1:${intel.address().port}/health` }] };
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: ROOT });
  const cockpit = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: 0, manager: `http://127.0.0.1:${mgr.address().port}` });
  await new Promise(r => cockpit.listen(0, '127.0.0.1', r));
  const cp = `http://127.0.0.1:${cockpit.address().port}`;
  const getJ = (u) => new Promise(r => http.get(u, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => r({ status: x.statusCode, body: t })); }));
  await test('EC-08', 'COS: its door answers from Intelligence and the kernel; the cockpit serves the one script; its page shows all three', async () => {
    const p = JSON.parse((await getJ(`${cp}/api/cos/emergence/patterns`)).body); assert.ok(p.ok && p.patterns[0].patternType === 'bottleneck', JSON.stringify(p));
    const l = JSON.parse((await getJ(`${cp}/api/cos/emergence/liminal`)).body); assert.ok(l.ok && l.status.spaces['L1/L3'], JSON.stringify(l));
    const s = JSON.parse((await getJ(`${cp}/api/cos/emergence/sessions`)).body); assert.ok(s.ok && s.sessions.some(x => x.compartmentId === 'c1'), JSON.stringify(s));
    const js = await getJ(`${cp}/kernel/emergence/emergence.js`); assert.strictEqual(js.status, 200);
    assert.strictEqual(js.body, fs.readFileSync(path.join(UI, 'channels/emergence/emergence.js'), 'utf8'), 'the same file, not a copy');
    assert.strictEqual((await getJ(`${cp}/kernel/emergence/emergence.html`)).status, 404, 'its script and style only');
    assert.strictEqual((await getJ(`${cp}/kernel/emergence/%2e%2e%2f%2e%2e%2findex.html`)).status, 404, 'nothing above that folder');
    if (browser || true) {
      let b2; try { b2 = await glass.chromium.launch(); } catch (_) { return; }
      try {
        const pg = await b2.newPage({ viewport: { width: 1280, height: 800 } });
        await pg.goto(`${cp}/emergence/index.html`);
        await pg.waitForFunction(() => !/reading…/.test(document.getElementById('em-runs').textContent) && !/reading…/.test(document.getElementById('em-liminal').textContent));
        const t = await pg.evaluate(() => document.body.textContent);
        assert.ok(/systemic bottleneck/.test(t) && /Pattern-Causality Membrane/.test(t) && /a parser that passes/.test(t), t.slice(0, 600));
        if (process.env.EC_SHOTS) await pg.screenshot({ path: path.join(process.env.EC_SHOTS, 'emergence-cos.png') });
      } finally { await b2.close(); }
    }
  });
  cockpit.close(); mgr.close(); intel.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
