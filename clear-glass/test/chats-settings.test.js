'use strict';
// CS-01..04 (0.60.55 PI5): the Chat capture settings render from the table, save through the bridge's rules, and start off. jsdom, stubbed cg (no Playwright, AXIOMS 4.1).
const { JSDOM } = require('jsdom'); const fs = require('fs'), path = require('path'), assert = require('assert');
const S = require('../../lib/chat-crawl-settings.js'); const root = path.join(__dirname, '..', 'renderer');
const html = fs.readFileSync(path.join(root, 'settings.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'file://' + root + '/settings.html', pretendToBeVisual: true }); const w = dom.window;
const saved = [];
const cg = new Proxy({}, { get: (_t, k) => k === 'chats' ? { schema: async () => ({ GROUPS: S.GROUPS, SCHEMA: S.SCHEMA }), settings: async () => ({ global: S.defaults(), accounts: {} }), save: async (d) => { saved.push(d); const g = S.clean(d.global || {}); return { ok: true, notes: g.notes, global: g.settings, accounts: d.accounts || {} }; } }
  : k === 'accounts' ? { portal: { providers: async () => [{ id: 'chatgpt', name: 'ChatGPT', color: '#10a37f' }] }, list: async () => [{ id: 'a1', label: 'ChatGPT 1', agentKeys: ['chatgpt'], createdAt: 1 }], defaults: async () => ({}) } : new Proxy(function () {}, { get: () => () => Promise.resolve([]), apply: () => Promise.resolve([]) }) });
w.ClearGlass = cg; w.cg = cg; w.fetch = async () => ({ ok: true, json: async () => ({}) }); w.CSS = w.CSS || { escape: s => s };
for (const f of ['settings/core.js', 'settings/sections/chats.js']) w.eval(fs.readFileSync(path.join(root, f), 'utf8'));
let pass = 0, fail = 0; const t = (n, ok, d) => { if (ok) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + (d || '')); } };
(async () => {
  w.location.hash = '#chats'; w.CGS.boot(); await new Promise(r => setTimeout(r, 600));
  const main = w.document.getElementById('main'); const txt = main.textContent;
  t('CS-01 every group in the table has a pane', S.GROUPS.filter(g => g !== 'Capture' || S.SCHEMA.some(s => s.group === 'Capture' && s.key !== 'enabled')).every(g => txt.includes(g)), txt.slice(0, 80));
  t('CS-02 every setting except the per-account switch is drawn, by its table label', S.SCHEMA.filter(s => s.key !== 'enabled').every(s => txt.includes(s.label)), S.SCHEMA.filter(s => !txt.includes(s.label)).map(s => s.key).join());
  t('CS-03 the account is listed and off, and the page says the crawler is not running yet', /ChatGPT · ChatGPT 1/.test(txt) && /not running yet/.test(txt) && !!main.querySelector('.acct-row .chip, .acct-row [class*="chip"]'));
  const tog = [...main.querySelectorAll('.acct-row > .acts .tog, .acct-row .tog')][0]; tog.click(); await new Promise(r => setTimeout(r, 700));
  t('CS-04 turning an account on saves it under provider:accountId', saved.length >= 1 && saved[saved.length - 1].accounts['chatgpt:a1'] && saved[saved.length - 1].accounts['chatgpt:a1'].enabled === true, JSON.stringify(saved));
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
