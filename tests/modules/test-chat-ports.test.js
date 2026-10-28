'use strict';
// PT-01..07 (0.60.85 PI5b): the crawler's three ports made of automations, run on the REAL automation engine against a fake chat site in jsdom (the same browserFn hook
// Clear Glass sets; no Playwright). The site has a sidebar of chats and chat pages with messages; one page is a login wall, one a challenge.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os');
const { JSDOM } = require(path.join(__dirname, '..', '..', 'node_modules', 'jsdom'));
const ROOT = path.resolve(__dirname, '..', '..');
const { AutomationEngine, WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR } = require(path.join(ROOT, 'lib/automation/engine.js'));
const Ports = require(path.join(ROOT, 'clear-glass/src/chats/ports.js')); const { Crawler } = require(path.join(ROOT, 'clear-glass/src/chats/crawler.js'));
const { ChatCrawlService } = require(path.join(ROOT, 'clear-glass/src/chats/service.js')); const ledger = require(path.join(ROOT, 'clear-glass/src/downloads/chat-ledger.js'));
const S = require(path.join(ROOT, 'lib/chat-crawl-settings.js'));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); failed++; } }

const IDS = ['aaaaaaaa-0001', 'aaaaaaaa-0002', 'aaaaaaaa-0003'];
function site(over = {}) {
  const w = { chats: IDS.slice(), msgs: (id) => [['user', 'hello ' + id], ['assistant', 'reply to ' + id]], mode: 'ok', ...over }; const calls = []; let win = null;
  const html = (url) => {
    if (w.mode === 'login') return '<html><head><title>ChatGPT</title></head><body>Log in Sign up</body></html>';
    if (w.mode === 'challenge') return '<html><head><title>Just a moment...</title></head><body>Checking if the site connection is secure</body></html>';
    const m = /\/c\/([\w-]+)/.exec(url);
    if (!m) return '<html><head><title>ChatGPT</title></head><body><nav>' + w.chats.map(id => `<a href="/c/${id}">Chat ${id}</a>`).join('') + '</nav>New chat</body></html>';
    return '<html><head><title>chat</title></head><body>' + w.msgs(m[1]).map(([r, t], i) => `<div data-message-author-role="${r}" data-message-id="${m[1]}-${i}">${t}</div>`).join('') + '</body></html>';
  };
  const fn = async ({ page, action, args = {}, settings }) => {
    calls.push({ page, action, partition: settings && settings.partition });
    if (action === 'navigate') { win = new JSDOM(html(args.url), { url: args.url, runScripts: 'outside-only' }).window; win.Element.prototype.scrollBy = function () {}; win.Element.prototype.scrollTo = function () {}; win.scrollBy = function () {}; win.scrollTo = function () {}; win.document.elementFromPoint = () => win.document.body; return { url: args.url, title: win.document.title }; }
    if (action === 'eval') { const code = args.code; if (/scrollTop|scrollBy|scrollHeight/.test(code) && !/querySelector/.test(code.replace(/scroll\w+/g, ''))) return { result: { moved: false, y: 0, height: 0 } }; try { return { result: win.eval(code) }; } catch (e) { return { result: { __nxError: e.message } }; } }
    return {};
  };
  return { w, fn, calls };
}
const fresh = () => { for (const d of [WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chatports-'));
function rig(siteOver, cfgOver = {}) {
  fresh(); const s = site(siteOver); const e = new AutomationEngine({}); e.setHooks({ browserFn: s.fn });
  const dir = tmp(), root = tmp(); const cfg = { ...S.defaults(), enabled: true, paceMinSec: 0, paceMaxSec: 0, perHour: 1e6, perDay: 1e6, scrollVia: 'page', scrollPauseMs: 100, scrollStableRounds: 2, listScrollRounds: 3, maxScrollRounds: 3, ...cfgOver };
  const ports = Ports.makePorts({ engine: e, accountKey: 'chatgpt:a1', provider: 'chatgpt', partition: 'persist:agent-a1', cfg, dir, ledgerRoot: root });
  const quick = { ...ports, sleep: async () => {}, rng: () => 0 };
  return { s, e, dir, root, cfg, ports, crawler: () => new Crawler({ accountKey: 'chatgpt:a1', cfg, ports: quick }) };
}

(async () => {
  await test('PT-01 classifyPage tells a login wall and a challenge from a normal page', () => {
    assert.strictEqual(Ports.classifyPage({ url: 'https://chatgpt.com/auth/login', title: 'x' }, 0), 'login');
    assert.strictEqual(Ports.classifyPage({ url: 'https://chatgpt.com/', title: 'Just a moment...' }, 0), 'challenge');
    assert.strictEqual(Ports.classifyPage({ url: 'https://chatgpt.com/', title: 'ChatGPT', text: 'Log in\nSign up' }, 0), 'login');
    assert.strictEqual(Ports.classifyPage({ url: 'https://chatgpt.com/', title: 'ChatGPT', text: 'New chat' }, 5), null);
  });
  await test('PT-02 the two workflows are made once, on the account\'s own session, and validate', () => {
    const r = rig(); const a = r.e.list().filter(w => /^Chat crawler/.test(w.name)); assert.strictEqual(a.length, 2);
    assert.ok(a.every(w => w.settings.partition === 'persist:agent-a1')); a.forEach(w => assert.deepStrictEqual(r.e.validate(w.id).problems, []));
    Ports.makePorts({ engine: r.e, accountKey: 'chatgpt:a1', provider: 'chatgpt', partition: 'persist:agent-a1', cfg: r.cfg, dir: r.dir });
    assert.strictEqual(r.e.list().filter(w => /^Chat crawler/.test(w.name)).length, 2, 'a second make reuses them');
  });
  await test('PT-03 readList reads the sidebar through the engine and visit files each chat into the ledger', async () => {
    const r = rig(); const L = await r.ports.readList({}); assert.strictEqual(L.ok, true, JSON.stringify(L)); assert.strictEqual(L.list.length, 3);
    assert.ok(L.list[0].url.startsWith('https://chatgpt.com/c/')); assert.ok(r.s.calls.some(c => c.partition === 'persist:agent-a1'), 'the hidden page is opened on the account partition');
    const v = await r.ports.visit(L.list[0].url); assert.strictEqual(v.kind, 'ok', JSON.stringify(v)); assert.strictEqual(v.turns, 2); assert.strictEqual(v.wrote, 2);
    const chat = ledger.readChat({ provider: 'chatgpt', chatId: 'aaaaaaaa-0001' }, { root: r.root }); assert.deepStrictEqual(chat.turns.map(t => [t.role, t.text]), [['user', 'hello aaaaaaaa-0001'], ['assistant', 'reply to aaaaaaaa-0001']]);
  });
  await test('PT-04 the whole backfill: every chat logged once; a second pass writes nothing new (novel only)', async () => {
    const r = rig(); const c = r.crawler(); await c.run({ maxSteps: 30 }); const a = c.status().audit; assert.strictEqual(a.nothingMissed, true, JSON.stringify(a)); assert.strictEqual(a.logged, 3);
    for (const id of IDS) assert.strictEqual(ledger.readChat({ provider: 'chatgpt', chatId: id }, { root: r.root }).turns.length, 2);
    const again = await r.ports.visit('https://chatgpt.com/c/aaaaaaaa-0001'); assert.strictEqual(again.wrote, 0, 'the same chat again adds nothing'); assert.ok(fs.existsSync(r.ports.store.file), 'state is on disk');
    r.s.w.msgs = (id) => [['user', 'hello ' + id], ['assistant', 'reply to ' + id], ['user', 'one more']];
    const grew = await r.ports.visit('https://chatgpt.com/c/aaaaaaaa-0002'); assert.strictEqual(grew.wrote, 1, 'only the new turn is filed');
  });
  await test('PT-05 a restart reads the saved state and does not visit logged chats again', async () => {
    const r = rig(); await r.crawler().run({ maxSteps: 4 }); const before = r.s.calls.filter(c => c.action === 'navigate').length;
    const c2 = r.crawler(); await c2.run({ maxSteps: 30 }); assert.strictEqual(c2.status().audit.nothingMissed, true);
    const chatNavs = r.s.calls.filter(c => c.action === 'navigate').length - before; assert.ok(chatNavs <= 4 + 1, `no chat visited twice (navigations after restart: ${chatNavs})`);
  });
  await test('PT-06 a signed-out account stops with the reason; a challenge page stops too', async () => {
    for (const [mode, re] of [['login', /signed out/], ['challenge', /captcha|challenge/]]) {
      const r = rig({ mode }); const c = r.crawler(); const last = await c.run({ maxSteps: 5 }); assert.strictEqual(last.action, 'stopped', mode); assert.match(last.reason, re);
      assert.strictEqual(r.s.calls.filter(x => x.action === 'navigate').length, 1, 'only the list was opened');
    }
  });
  await test('PT-07 the service: off until the account switch is on; then runs and reports', async () => {
    const r = rig(); let settings = { global: S.defaults(), accounts: {} };
    const svc = new ChatCrawlService({ engine: () => r.e, settings: () => settings, dir: r.dir, makePorts: (o) => ({ ...Ports.makePorts({ ...o, ledgerRoot: r.root }), sleep: async () => {}, rng: () => 0 }) });
    const off = svc.start('chatgpt:a1'); assert.strictEqual(off.ok, false); assert.match(off.error, /off for this account/);
    assert.strictEqual(svc.start('nope').ok, false);
    settings = { global: { ...S.defaults(), paceMinSec: 0, paceMaxSec: 0 }, accounts: { 'chatgpt:a1': { enabled: true }, 'claude:c1': { enabled: true } } };
    assert.match(svc.start('claude:c1').error, /no chat page is known/);
    const on = svc.start('chatgpt:a1'); assert.strictEqual(on.ok, true, JSON.stringify(on)); assert.strictEqual(svc.start('chatgpt:a1').error, 'already running');
    for (let i = 0; i < 100 && svc.status('chatgpt:a1').running; i++) await new Promise(res => setTimeout(res, 50)); svc.stop('chatgpt:a1');
    const st = svc.status('chatgpt:a1'); assert.ok(st.ok && st.phase, JSON.stringify(st).slice(0, 200));
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
