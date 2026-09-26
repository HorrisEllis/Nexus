'use strict';
/**
 * tests/probe/clearglass-library-window.js — v0.39.241
 * James: "need control j to popout a window like the screenshot... the settings ui
 * but with the library."
 *
 * Loads Clear Glass's REAL renderer/library.html (the Settings runtime + the eight
 * Library areas) in headless Chromium against Clear Glass's REAL bridge on :7702,
 * started in-process with only 'electron' faked. Real stores behind it, seeded:
 * DownloadsStore, BookmarkStore, HistoryStore, AutofillStore, and the Responses
 * index (written by guardian's real writer). Accounts and macros answer from two
 * small stand-ins (their real backends need a running Clear Glass). window.ClearGlass
 * is built from the REAL preload's namespaces, every call recorded, so a call to a
 * method the preload does not expose throws.
 *
 * Walks every area, screenshots it, exercises search / open file / show in folder /
 * remove / close, and fails on any page error or console error.
 * Usage: node tests/probe/clearglass-library-window.js [outDir]
 */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
const CG = path.join(ROOT, 'clear-glass');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'cg-library-probe'));
fs.mkdirSync(OUT, { recursive: true });
process.env.HOME = process.env.APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-lib-home-'));
require(path.join(ROOT, 'lib', 'test-sandbox.js')).ensure();

const fakeElectron = { ipcMain: { handle() {}, on() {}, removeHandler() {} }, session: { fromPartition: () => ({}), defaultSession: {} },
  Notification: class { static isSupported() { return false; } show() {} }, app: { getPath: () => os.tmpdir(), on() {} }, BrowserWindow: class {}, shell: {} };
const _load = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? fakeElectron : _load.call(this, req, ...a); };

function preloadShape() {
  const shape = {}; let cur = null;
  for (const line of fs.readFileSync(path.join(CG, 'src/preload/index.js'), 'utf8').split('\n')) {
    let m = /^  (\w+):\s*\{\s*$/.exec(line);
    if (m) { cur = m[1]; shape[cur] = []; continue; }
    if (cur) { if (/^  \},?\s*$/.test(line)) { cur = null; continue; } m = /^    (\w+)\s*:/.exec(line); if (m) shape[cur].push(m[1]); }
  }
  shape.__top = []; for (const m of fs.readFileSync(path.join(CG, 'src/preload/index.js'), 'utf8').matchAll(/^  (\w+):\s*\(/gm)) shape.__top.push(m[1]);
  return shape;
}

(async () => {
  const { DownloadsStore } = require(path.join(CG, 'src/downloads/store.js'));
  const BookmarkStore = require(path.join(CG, 'src/bookmarks/store.js'));
  const { HistoryStore } = require(path.join(CG, 'src/history/store.js'));
  const { AutofillStore } = require(path.join(CG, 'src/autofill/store.js'));
  const { recordAgentResponse } = require(path.join(ROOT, 'guardian/lib/code-artifact.js'));
  require(path.join(CG, 'src/core/bus.js')).createBus();
  const Bridge = require(path.join(CG, 'src/ipc/bridge.js')); const BridgeClass = Bridge.IpcBridge || Bridge;

  const now = Date.now(), H = 3600e3;
  const downloads = new DownloadsStore();
  const seed = [
    { filename: 'Nexus_v0_39_240.zip', url: 'https://claude.ai/api/files/x', bytes: 104124211, state: 'completed', agentId: 'repo-nexus-id-repo-0473b4ed', startedAt: now - 5 * 60e3 },
    { filename: 'Nexus_v0_39_239.zip', url: 'https://claude.ai/api/files/y', bytes: 103704985, state: 'completed', agentId: 'default', startedAt: now - 10 * 60e3 },
    { filename: 'eravos-organism-factory.js', url: 'https://chatgpt.com/backend-api/files/z', bytes: 18230, state: 'completed', agentId: 'repo-nexus-id-repo-0473b4ed', startedAt: now - 30 * 60e3 },
    { filename: 'screenshot-2026-09-25.png', url: 'https://www.perplexity.ai/f', bytes: 1840000, state: 'in_progress', agentId: 'default', startedAt: now - 20e3 },
    { filename: 'spec-v3-17.pdf', url: 'https://gemini.google.com/d', bytes: 420000, state: 'completed', agentId: 'default', startedAt: now - 26 * H },
    { filename: 'Nexus_v0_39_235.zip.part1', url: 'https://claude.ai/api/files/p', bytes: 26214400, state: 'interrupted', agentId: 'default', startedAt: now - 3 * H },
    { filename: 'setup.exe', url: 'https://example.com/setup.exe', bytes: 0, state: 'cancelled', agentId: 'default', startedAt: now - 4 * 864e5 },
  ];
  for (const d of seed) { const r = downloads.add({ ...d, savePath: path.join(os.tmpdir(), d.filename), mimeType: 'application/octet-stream' }); if (d.state !== 'in_progress') downloads.updateState(r.id, d.state, { bytes: d.bytes }); }
  const bookmarks = new BookmarkStore();
  bookmarks.add({ url: 'https://claude.ai/new', title: 'Claude', agentId: 'default', tags: ['ai'] });
  bookmarks.add({ url: 'https://chatgpt.com/', title: 'ChatGPT', agentId: 'repo-nexus-id-repo-0473b4ed' });
  bookmarks.add({ url: 'https://github.com/anthropics', title: 'Anthropic on GitHub', agentId: 'default', tags: ['code'] });
  const history = new HistoryStore();
  [['https://claude.ai/chat/1', 'Nexus 0.39.240 — Claude'], ['https://chatgpt.com/c/2', 'ERAVOS catalog — ChatGPT'], ['https://www.perplexity.ai/search/3', 'Electron web-contents-created — Perplexity']]
    .forEach(([url, title]) => history.record({ url, title, agentId: 'default' }));
  history.entries.push({ id: 'old-1', url: 'https://gemini.google.com/app', title: 'Gemini', agentId: 'default', ts: now - 30 * H });
  const autofillStore = new AutofillStore();
  const afp = autofillStore.createProfile({ label: 'James — job applications', fields: { 'given-name': 'James', 'family-name': 'Brooks' } }); if (afp.error) throw new Error(`autofill seed refused: ${afp.error}`);
  recordAgentResponse({ job: { id: '9409b2cd-9be4', provider: 'chatgpt', agentId: 'repo-nexus-id-repo-0473b4ed', prompt: 'You are the project agent for "ERAVOS v3-17 catalog"…\n───\nexplain the organism factory' },
    text: 'The organism factory spawns organisms from genomes.\n```js\nexport function spawn(g) { return new Organism(g); }\n```', blocks: [{ index: 0, syntax: 'js', code: 'export function spawn(g) { return new Organism(g); }' }] });
  recordAgentResponse({ job: { id: 'a1b2c3d4-0000', provider: 'claude', agentId: 'repo-nexus-id-repo-eb5a5d56', prompt: 'summarise' }, text: 'Summary: three systems.', blocks: [] });

  // 0.39.254 — chat transcripts, through guardian's real writer: one agent chat in two
  // versions (must list as ONE row) and one of James's own chats (no agent).
  const tx = require(path.join(ROOT, 'guardian/lib/chat-transcripts.js')).createChatTranscripts({ log: { log() {}, warn() {} } });
  const chat1 = { provider: 'chatgpt', chatId: 'WEB:b4b1d92a-9efa', url: 'https://chatgpt.com/c/WEB:b4b1d92a-9efa',
    messages: [{ role: 'user', text: 'what is the organism factory?' }, { role: 'assistant', text: 'It spawns organisms from genomes.' }] };
  const t1 = tx.record({ provider: 'chatgpt', tabId: 't', agentId: 'repo-nexus-id-repo-0473b4ed', chat: chat1 });
  const t2 = tx.record({ provider: 'chatgpt', tabId: 't', chat: { ...chat1, messages: [...chat1.messages, { role: 'user', text: 'and the kernel?' }, { role: 'assistant', text: 'The kernel owns the bus.' }] } });
  const t3 = tx.record({ provider: 'claude', tabId: 'u', chat: { provider: 'claude', chatId: 'c0ffee', url: 'https://claude.ai/chat/c0ffee', messages: [{ role: 'user', text: 'remember my port map' }, { role: 'assistant', text: 'Noted: guardian 7820.' }] } });
  if (!t1.recorded || !t2.recorded || t2.version !== 2 || !t3.recorded) throw new Error(`transcript seed refused: ${JSON.stringify([t1, t2, t3].map(t => t.reason || t.version))}`);

  const options = { listAccounts: () => [{ id: 'acc1', label: 'Work', agentKeys: ['claude', 'chatgpt'] }, { id: 'acc2', label: 'Personal', agentKeys: [] }] };
  const macroTool = { execute: async ({ action }) => action === 'list' ? { ok: true, macros: [{ name: 'login-chatgpt', urlPattern: 'chatgpt.com', steps: 4, runCount: 7, lastRunAt: now - 2 * H, params: ['email'] }] } : { ok: true } };

  const bridge = new BridgeClass({ port: 7702, sse: { emit() {} }, downloads, bookmarks, history, autofillStore, options, macroTool });
  await bridge.start();

  const srv = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }   // Chromium asks; Electron's loadFile does not
    const f = path.join(CG, 'renderer', decodeURIComponent(req.url.split(/[?#]/)[0]));
    if (!f.startsWith(path.join(CG, 'renderer')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'text/html' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const shape = preloadShape();
  const FAKE = `window.__calls=[];const __s=${JSON.stringify(shape)};window.ClearGlass={};
    for (const ns of Object.keys(__s)) { if (ns==='__top') continue; window.ClearGlass[ns]={}; for (const m of __s[ns]) window.ClearGlass[ns][m]=(...a)=>{ window.__calls.push(['cg.'+ns+'.'+m,a]);
      if (ns==='downloads'&&m==='listListeners') return Promise.resolve(window.__listeners||[]);
      if (ns==='downloads'&&m==='registerListener') { (window.__listeners=window.__listeners||[]).push({id:'l'+Date.now(),...a[0]}); return Promise.resolve({ok:true}); }
      if (ns==='window'&&m==='list') return Promise.resolve({windows:['default','repo-nexus-id-repo-0473b4ed']});
      return Promise.resolve(/list$/i.test(m)?[]:{ok:true}); }; }
    for (const m of __s.__top) window.ClearGlass[m]=(...a)=>{ window.__calls.push(['cg.'+m,a]); return Promise.resolve({ok:true}); };`;

  const { chromium } = require('playwright');
  // PLAYWRIGHT_CHROMIUM lets a sandbox whose pinned browser build differs point at the Chromium it has.
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  const pg = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`console: ${m.text()} @ ${(m.location() || {}).url || ""}`); });
  pg.on('requestfinished', () => {}); pg.on('response', r => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`); }); pg.on('requestfailed', r => errs.push(`failed ${r.url()}`));
  await pg.addInitScript(FAKE);
  const results = [];
  const ok = (name, cond, detail = '') => { results.push([name, !!cond, detail]); console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` — ${detail}`}`); };

  console.log('\n⬡  CLEAR GLASS LIBRARY WINDOW — real page, real bridge\n');
  await pg.goto(`${base}/library.html`);
  await pg.waitForSelector('.dl', { timeout: 8000 });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(OUT, '01-downloads.png') });
  const rail = await pg.$$eval('.rail-group', gs => gs.map(g => [g.querySelector('h3').textContent, [...g.querySelectorAll('.rail-item')].map(b => b.dataset.id)]));
  ok('opens on Downloads (Ctrl+J’s target) with the Settings frame: titlebar, rail, main', await pg.$eval('.page-head h1', e => e.textContent) === 'Downloads' && !!(await pg.$('#titlebar .mark')));
  ok('rail groups: Library / Identity / Agents with all eight areas', JSON.stringify(rail) === JSON.stringify([['Library', ['downloads', 'responses', 'bookmarks', 'history']], ['Identity', ['accounts', 'passwords', 'autofill']], ['Agents', ['macros']]]), JSON.stringify(rail));
  ok('it uses Settings’ own stylesheet (not a lookalike)', await pg.$eval('link[rel=stylesheet]', l => l.getAttribute('href')) === 'settings/settings.css');
  const rows = await pg.$$eval('.dl', rs => rs.map(r => [r.querySelector('.dl-name').textContent, r.querySelector('.d').textContent, r.querySelector('.dl-glyph').textContent]));
  ok('seven download rows, newest first', rows.length === 7 && rows[0][0] === 'screenshot-2026-09-25.png', JSON.stringify(rows.map(r => r[0])));
  ok('a finished row reads "size — site — time" like Firefox', /^99\.3 MB — claude\.ai — /.test(rows.find(r => r[0] === 'Nexus_v0_39_240.zip')[1]), rows[1] && rows[1][1]);
  ok('failed / canceled / in-progress are said in words', rows.some(r => /^Failed — claude\.ai/.test(r[1])) && rows.some(r => /^Canceled — example\.com/.test(r[1])) && rows.some(r => /^Downloading — /.test(r[1])));
  ok('the file-type tile shows the extension', rows.find(r => r[0] === 'spec-v3-17.pdf')[2] === 'PDF');
  ok('an in-progress download shows a progress bar', !!(await pg.$('.dl-in_progress .dl-bar')));
  ok('the agent a download came from is shown (not for default)', (await pg.$$eval('.dl-agent', xs => xs.map(x => x.textContent))).every(t => t.startsWith('repo-')));

  await pg.click('.dl:has-text("Nexus_v0_39_240.zip") .dl-name');
  await pg.click('.dl:has-text("Nexus_v0_39_240.zip") .dl-folder');
  await pg.waitForTimeout(150);
  const calls = await pg.evaluate(() => window.__calls.map(c => c[0]));
  ok('clicking a name opens the file; the folder button shows it in its folder (real preload methods)', calls.includes('cg.downloads.openFile') && calls.includes('cg.downloads.openFolder'), calls.join(','));
  ok('an unfinished download cannot be opened', await pg.$eval('.dl-in_progress .dl-name', b => b.disabled));

  await pg.fill('#search', 'zip');
  await pg.waitForTimeout(500);
  ok('the rail search filters the list on screen', (await pg.$$('.dl')).length === 3 && /3 of 7/.test(await pg.$eval('.pane-head h2', e => e.textContent)), `${(await pg.$$('.dl')).length} rows`);
  await pg.fill('#search', '');
  await pg.waitForTimeout(500);

  const before = (await pg.$$('.dl')).length;
  await pg.click('.dl:has-text("setup.exe") button[aria-label^="Remove"]');
  await pg.waitForTimeout(500);
  ok('remove takes the row off the list through the bridge (the store really lost it)', (await pg.$$('.dl')).length === before - 1 && !downloads.list().some(d => d.filename === 'setup.exe'));

  await pg.fill('.dl-listeners input.mono', '*.zip');
  await pg.click('.dl-listeners button:has-text("Add listener")');
  await pg.waitForTimeout(500);
  ok('download listeners moved here from the old dropdown, and add one', (await pg.evaluate(() => window.__calls.filter(c => c[0] === 'cg.downloads.registerListener').length)) === 1 && (await pg.$$('.dl-lrow')).length === 1);
  await pg.screenshot({ path: path.join(OUT, '01b-downloads-listeners.png'), fullPage: true });

  for (const [id, sel, n] of [['responses', '.resp-row', 4], ['bookmarks', '.bm-row', 3], ['history', '.hi-row', 4], ['accounts', '.row', 2], ['passwords', '.empty', 1], ['autofill', '.row', 1], ['macros', '.row', 1]]) {
    await pg.click(`.rail-item[data-id="${id}"]`);
    await pg.waitForSelector(`body[data-area="${id}"] ${sel}`, { timeout: 5000 }).catch(() => {});
    await pg.waitForTimeout(250);
    const count = (await pg.$$(`#main ${sel}`)).length;
    ok(`${id}: renders from the real bridge (${count} ${sel})`, count >= n && !(await pg.$('.err-box')), (await pg.$('.err-box')) ? await pg.$eval('.err-box', e => e.textContent) : `${count}`);
    await pg.screenshot({ path: path.join(OUT, `0${['responses', 'bookmarks', 'history', 'accounts', 'passwords', 'autofill', 'macros'].indexOf(id) + 2}-${id}.png`) });
  }

  await pg.click('.rail-item[data-id="responses"]');
  await pg.waitForSelector('.resp-row');
  await pg.click('.resp-row.resp-chat:has-text("0473b4ed") button:has-text("View")');
  await pg.waitForSelector('.modal');
  ok('Responses → View shows the reply and its code block in a Settings modal', /organism factory/.test(await pg.$eval('.modal', m => m.textContent)) && /js/.test(await pg.$eval('.modal', m => m.textContent)));
  await pg.screenshot({ path: path.join(OUT, '10-response-view.png') });
  await pg.keyboard.press('Escape');

  // 0.39.254 — chats: one row per chat, the conversation, and its versions
  await pg.waitForTimeout(150);
  const chatRows = await pg.$$eval('.resp-row.resp-transcript', rs => rs.map(r => r.textContent));
  ok('Responses lists each chat once, at its newest version (2 chats, not 3 versions)', chatRows.length === 2 && chatRows.some(t => /v2 \(2 versions\)/.test(t) && /4 messages/.test(t)), JSON.stringify(chatRows));
  ok('a chat keeps the agent it was first filed under; your own chat has none', chatRows.some(t => /0473b4ed/.test(t) && /v2/.test(t)) && chatRows.some(t => /\(no agent\)/.test(t) && /c0ffee/.test(t)), JSON.stringify(chatRows));
  await pg.click('.resp-row.resp-transcript:has-text("v2") button:has-text("View")');
  await pg.waitForSelector('.modal .resp-msg');
  const msgs = await pg.$$eval('.modal .resp-msg', ms => ms.map(m => m.className.includes('resp-user') ? 'U' : 'A').join(''));
  ok('View shows the conversation in order, prompts and replies', msgs === 'UAUA' && /The kernel owns the bus/.test(await pg.$eval('.modal', m => m.textContent)), msgs);
  await pg.screenshot({ path: path.join(OUT, '12-chat-view.png') });
  await pg.selectOption('.modal .resp-ver', { index: 1 });
  await pg.waitForFunction(() => document.querySelectorAll('.modal .resp-msg').length === 2, null, { timeout: 5000 }).catch(() => {});
  ok('picking v1 opens that version (2 messages), in one modal', (await pg.$$('.modal .resp-msg')).length === 2 && (await pg.$$('.modal')).length === 1, `${(await pg.$$('.modal .resp-msg')).length} msgs, ${(await pg.$$('.modal')).length} modals`);
  await pg.screenshot({ path: path.join(OUT, '13-chat-v1.png') });
  await pg.keyboard.press('Escape');

  await pg.click('#close');
  await pg.waitForTimeout(100);
  ok('the titlebar ✕ closes the Library window (window:closeLibrary)', (await pg.evaluate(() => window.__calls.map(c => c[0]))).includes('cg.window.closeLibrary'));

  // Opening straight to an area by hash (openLibraryWindow(area) loads library.html#area)
  const pg2 = await browser.newPage({ viewport: { width: 700, height: 600 } });
  pg2.on('pageerror', e => errs.push(`pageerror(2): ${e.message}`));
  await pg2.addInitScript(FAKE);
  await pg2.goto(`${base}/library.html#history`);
  await pg2.waitForSelector('body[data-area="history"] .hi-row', { timeout: 5000 }).catch(() => {});
  ok('library.html#history opens on History (how openLibraryWindow(area) picks the area)', await pg2.$eval('.page-head h1', e => e.textContent) === 'History');
  await pg2.screenshot({ path: path.join(OUT, '11-narrow-history.png') });

  ok('no page errors and no console errors', errs.length === 0, errs.join(' | '));
  await browser.close(); srv.close(); await bridge.stop?.();
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n  ${results.length - failed} passed, ${failed} failed · screenshots in ${OUT}\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
