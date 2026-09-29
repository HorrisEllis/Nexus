'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-eros-workbench.test.js — §0.39.281 EC10
 * Map: docs/2026-09-29-provider-economy-phasemap.spec (EC10).
 *
 * Settings → ErosmancerOS → Workbench, for real: the page's own files (renderer/settings/core.js + sections/eros.js)
 * run in jsdom; the wire answers /eros/* the way Clear Glass's proxy forwards them to ErosmancerOS's REST API
 * (erosmancer-os/src/api/server.ts shapes: tabs, attach, nodes, execute, replay/frames with the EC10 frame list).
 * The existing panes (connection, behaviour, hostile, learned) still render — the workbench is added, not a swap.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

// ── a fake ErosmancerOS, answering as server.ts does ────────────────────────
const EOS = {
  tabs: [{ targetId: 'T1', url: 'https://a.test/', title: 'A' }, { targetId: 'T2', url: 'https://b.test/', title: 'B' }],
  sessions: {},
  nodes: [{ uuid: 'n-1', tag: 'button', textContent: 'Apply now', tabId: 'T1', state: 'live' }, { uuid: 'n-2', tag: 'input', textContent: '', selector: '#q', tabId: 'T1', state: 'live' }],
  frames: [],
  replayed: [],
};
const calls = [];
function eros(method, p, body) {
  if (p === '/api/health') return [200, { ok: true, state: 'connected', status: { tabs: EOS.tabs.length }, routing: { level: 'direct' } }];
  if (p === '/api/behavior/profiles') return [200, { ok: true, profiles: ['precise', 'cautious'] }];
  if (p === '/api/hostile/state') return [200, { ok: true, states: {} }];
  if (p === '/api/adaptive/patterns') return [200, { ok: true, patterns: [] }];
  if (p === '/api/tabs' && method === 'GET') return [200, { ok: true, tabs: EOS.tabs }];
  if (p === '/api/tabs' && method === 'POST') { const t = { targetId: `T${EOS.tabs.length + 1}`, url: body.url, title: '' }; EOS.tabs.push(t); return [200, { ok: true, tab: t }]; }
  let m;
  if ((m = /^\/api\/tabs\/([^/]+)\/attach$/.exec(p))) {
    const id = decodeURIComponent(m[1]); EOS.sessions[id] = `S-${id}`;
    EOS.frames.unshift({ frameId: `frame-${id}`, tabId: id, commands: 0, checkpoint: { url: 'about:blank', nodeCount: 2, ts: 1 }, createdAt: Date.now(), replayCount: 0, replaying: false });
    return [200, { ok: true, tabId: id, sessionId: EOS.sessions[id], role: body.role || 'primary' }];
  }
  if ((m = /^\/api\/tabs\/([^/]+)$/.exec(p)) && method === 'DELETE') { const id = decodeURIComponent(m[1]); EOS.tabs = EOS.tabs.filter(t => t.targetId !== id); return [200, { ok: true }]; }
  if (p === '/api/nodes') return [200, { ok: true, nodes: EOS.nodes, total: EOS.nodes.length }];
  if ((m = /^\/api\/nodes\/([^/]+)$/.exec(p))) { const n = EOS.nodes.find(x => x.uuid === decodeURIComponent(m[1])); return n ? [200, { ok: true, node: { ...n, boundingBox: { x: 1, y: 2, width: 3, height: 4 } } }] : [404, { ok: false, error: 'Node not found' }]; }
  if (p === '/api/execute') {
    if (!body.tabId) return [400, { ok: false, error: 'tabId required' }];
    if (!EOS.sessions[body.tabId]) return [400, { ok: false, error: `No session for ${body.tabId}. POST /api/tabs/${body.tabId}/attach first.` }];
    if (body.sandbox) return [200, { ok: true, sandbox: true, plan: { planId: 'p1', steps: 3 } }];
    const f = EOS.frames.find(x => x.tabId === body.tabId); if (f) f.commands++;
    return [200, { ok: true, intentId: 'intent-1', result: { did: body.action } }];
  }
  if (p === '/api/replay/frames') return [200, { ok: true, snapshot: { totalFrames: EOS.frames.length, activeTabs: 1, replaying: 0, totalCommands: EOS.frames.reduce((s, f) => s + f.commands, 0) }, frames: EOS.noList ? undefined : EOS.frames }];
  if ((m = /^\/api\/replay\/([^/]+)$/.exec(p))) { const id = decodeURIComponent(m[1]); EOS.replayed.push({ id, delayMs: body.delayMs }); const f = EOS.frames.find(x => x.frameId === id); if (f) f.replayCount++; return [200, { ok: true, succeeded: f ? f.commands : 0, failed: 0 }]; }
  return [404, { ok: false, error: `no route ${method} ${p}` }];
}

const dom = new JSDOM('<!doctype html><html><head></head><body><nav id="rail"></nav><main id="main"></main><div id="toasts"></div></body></html>', { runScripts: 'outside-only', url: 'file:///settings.html' });
const w = dom.window;
w.ClearGlass = { mesh: { list: async () => ({ registry: [] }) }, window: { list: async () => ({ windows: [] }), closeSettings: () => {} } };
if (!w.AbortSignal.timeout) w.AbortSignal.timeout = () => undefined;
w.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : {};
  calls.push({ method, path: u.pathname, body });
  let status, out;
  if (u.pathname === '/eros-supervisor') [status, out] = [200, { state: 'running', port: 7702, cdpPort: 9333 }];
  else if (u.pathname.startsWith('/eros/')) [status, out] = eros(method, '/api' + u.pathname.replace(/^\/eros/, ''), body);   // Clear Glass's proxy rewrite
  else [status, out] = [404, { ok: false, error: 'not found' }];
  return { ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(out)) };
};
for (const f of ['clear-glass/renderer/settings/core.js', 'clear-glass/renderer/settings/sections/eros.js']) w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
w.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.stack || e.reason)));

const $ = (sel, root = w.document) => root.querySelector(sel);
const $$ = (sel, root = w.document) => [...root.querySelectorAll(sel)];
const byText = (text, sel = 'button', root = w.document) => $$(sel, root).find(b => b.textContent.trim() === text);
async function settle() { for (let i = 0; i < 60 && $('#main .loading'); i++) await tick(); await tick(); }
async function render() { await w.CGS.show('eros'); await settle(); }
async function view(k) { $(`.wb-view[data-view="${k}"]`).click(); await settle(); }
async function click(b) { b.click(); for (let i = 0; i < 30 && b.disabled; i++) await tick(); await settle(); }
const toasts = () => $$('#toasts .toast').map(t => t.textContent);

(async () => {

await test('WB-01', 'the page still shows its panes (connection, behaviour, hostile, learned) and adds the Workbench with four views, Tabs first', async () => {
  await render();
  const titles = $$('#main .pane h2').map(x => x.textContent);
  for (const t of ['Connection', 'Behaviour', 'Hostile pages', 'What it has learned', 'Workbench']) assert.ok(titles.includes(t), `${t} in ${titles}`);
  assert.deepStrictEqual($$('.wb-view').map(b => b.textContent), ['Tabs', 'Nodes', 'Console', 'Replay']);
  assert.strictEqual($('.wb-view.on').dataset.view, 'tabs');
  assert.deepStrictEqual($$('.wb-tab').map(r => r.dataset.tab), ['T1', 'T2']);
});

await test('WB-02', 'Tabs: attach with a role (POST /eros/tabs/:id/attach), the row says attached; open a tab; close one after confirming', async () => {
  const row = $('.wb-tab[data-tab="T1"]');
  $('select', row).value = 'shadow';
  await click(byText('Attach', 'button', row));
  const a = calls.filter(c => c.path === '/eros/tabs/T1/attach').pop();
  assert.deepStrictEqual([a.method, a.body.role], ['POST', 'shadow']);
  assert.match($('.wb-tab[data-tab="T1"] .d').textContent, /attached · shadow · session S-T1/);
  $('.wb-url').value = 'https://c.test/';
  await click(byText('Open tab'));
  assert.ok(EOS.tabs.some(t => t.url === 'https://c.test/') && $$('.wb-tab').length === 3);
  byText('Close', 'button', $('.wb-tab[data-tab="T2"]')).click();
  for (let i = 0; i < 30 && !$('#scrim .modal'); i++) await tick();
  byText('Close tab', 'button', $('#scrim')).click();
  for (let i = 0; i < 30 && EOS.tabs.some(t => t.targetId === 'T2'); i++) await tick();
  await settle();
  assert.ok(!EOS.tabs.some(t => t.targetId === 'T2') && !$('.wb-tab[data-tab="T2"]'), 'closed after confirming');
});

await test('WB-03', 'Nodes: search filters the registry; Inspect shows the node from /eros/nodes/:uuid; Use in console carries it over', async () => {
  await view('nodes');
  assert.strictEqual($$('.wb-node').length, 2);
  const q = $('.wb-q'); q.value = 'apply'; q.dispatchEvent(new w.Event('input'));
  assert.deepStrictEqual($$('.wb-node').map(r => r.dataset.uuid), ['n-1']);
  await click(byText('Inspect', 'button', $('.wb-node')));
  assert.match($('.wb-detail pre').textContent, /"boundingBox"/);
  await click(byText('Use in console', 'button', $('.wb-node')));
  assert.strictEqual($('.wb-view.on').dataset.view, 'console');
  assert.strictEqual($$('#main .wb-body input[type="text"]')[0].value, 'n-1');
});

await test('WB-04', 'Console: plan only sends sandbox and says nothing was sent; Run sends one /eros/execute; an unattached tab is refused in ErosmancerOS’s own words', async () => {
  const body = $('#main .wb-body');
  const [tab, action] = $$('select', body);
  assert.strictEqual(tab.value, 'T1', 'the attached tab is picked');
  $('input[type="checkbox"]', body).checked = true;
  await click(byText('Run', 'button', body));
  let x = calls.filter(c => c.path === '/eros/execute').pop();
  assert.deepStrictEqual([x.body.action, x.body.uuid, x.body.sandbox, x.body.tabId], ['click', 'n-1', true, 'T1']);
  assert.ok(!('profile' in x.body), 'the console sends no behaviour profile of its own (I6)');
  assert.ok(toasts().some(t => /Plan only — nothing sent/.test(t)));
  assert.match($('.wb-result pre').textContent, /"planId": "p1"/);
  const b2 = $('#main .wb-body');
  $('input[type="checkbox"]', b2).checked = false;
  $$('select', b2)[1].value = 'type'; $$('input[type="text"]', b2)[1].value = 'hello';
  await click(byText('Run', 'button', b2));
  x = calls.filter(c => c.path === '/eros/execute').pop();
  assert.deepStrictEqual([x.body.action, x.body.payload, x.body.sandbox], ['type', 'hello', false]);
  assert.ok(toasts().some(t => /type done/.test(t)));
  const b3 = $('#main .wb-body');
  $$('select', b3)[0].value = 'T3';
  await click(byText('Run', 'button', b3));
  assert.ok(toasts().some(t => /No session for T3\. POST \/api\/tabs\/T3\/attach first/.test(t)), toasts().join(' | '));
});

await test('WB-05', 'Replay: frames listed (the EC10 list); Replay posts the delay; an older ErosmancerOS with counts only is said, not blank', async () => {
  await view('replay');
  assert.deepStrictEqual($$('.wb-frame').map(r => r.dataset.frame), ['frame-T1']);
  assert.match($('.wb-frame .t').textContent, /^1 command\(s\)/, "one real command — the plan-only run sent nothing");
  $('#main .wb-body input[type="number"]').value = '120';
  await click(byText('Replay', 'button', $('.wb-frame')));
  assert.deepStrictEqual(EOS.replayed.pop(), { id: 'frame-T1', delayMs: 120 });
  assert.match($('.wb-result pre').textContent, /"succeeded": 1/);
  EOS.noList = true;
  await view('tabs'); await view('replay');
  assert.match($('#main .wb-body').textContent, /counts only/);
  EOS.noList = false;
});

await test('WB-06', 'the fake is faithful: the replay list is what erosmancer-os returns (server.ts sends frames: replay.list(); list() summarises every frame)', () => {
  const srv = fs.readFileSync(path.join(ROOT, 'erosmancer/erosmancer-os/src/api/server.ts'), 'utf8');
  assert.match(srv, /snapshot: replay\.snapshot\(\), frames: replay\.list\(\)/);
  const rq = fs.readFileSync(path.join(ROOT, 'erosmancer/erosmancer-os/src/replay/index.ts'), 'utf8');
  assert.match(rq, /list\(\): Array<\{ frameId: string; tabId: string; commands: number; checkpoint: Checkpoint; createdAt: number; replayCount: number; replaying: boolean \}>/);
  assert.deepStrictEqual(errors, [], errors.join('\n'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
})();
