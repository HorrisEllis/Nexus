'use strict';
// clear-glass/test/storage-jaa.test.js — src/storage/jaa.js: every Clear Glass
// store on one JAA database; legacy JSON imported once and left on disk.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');

let pass = 0;
const t = (n, fn) => { fn(); pass++; console.log(`[PASS] ${n}`); };
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-jaa-'));
process.env.HOME = home; delete process.env.APPDATA; delete process.env.CG_JAA_DIR;
const cg = path.join(home, '.clear-glass');
fs.mkdirSync(cg, { recursive: true });
fs.writeFileSync(path.join(cg, 'site-settings.json'), JSON.stringify({ 'https://a.io': { zoomFactor: 1.5 } }));
fs.writeFileSync(path.join(cg, 'history.json'), JSON.stringify([{ id: 'h2', url: 'b', ts: 2 }, { id: 'h1', url: 'a', ts: 1 }]));

const J = require('../src/storage/jaa');

t('KV imports the legacy file once, leaves it on disk', () => {
  const { SiteSettingsStore } = require('../src/site-settings/store');
  const s = new SiteSettingsStore(); s.load();
  assert.strictEqual(s.get('https://a.io/x', 'zoomFactor'), 1.5);
  assert.ok(fs.existsSync(path.join(cg, 'site-settings.json')));
  s.set('https://b.io', 'javascript', 'block');
  fs.writeFileSync(path.join(cg, 'site-settings.json'), JSON.stringify({ 'https://evil.io': { x: 1 } }));
  const s2 = new SiteSettingsStore(); s2.load();
  assert.deepStrictEqual(s2.listOrigins().sort(), ['https://a.io', 'https://b.io'], 'a second load never re-imports');
});
t('rows ordered by their own field (history newest first), no _ord leaks', () => {
  const { HistoryStore } = require('../src/history/store');
  const h = new HistoryStore(); h.load();
  assert.deepStrictEqual(h.entries.map(e => e.id), ['h2', 'h1']);
  h.record({ url: 'c', title: 'c' });
  const h2 = new HistoryStore(); h2.load();
  assert.strictEqual(h2.entries[0].url, 'c');
  assert.ok(!('_ord' in h2.entries[0]));
});
t('replaceAll writes only changed rows and deletes removed ones', () => {
  const rows = new J.JaaRows('t_rows');
  rows.replaceAll([{ id: 'a', v: 1 }, { id: 'b', v: 2 }]);
  const st = J.store();
  const before = st.get('t_rows', { id: 'a' });
  rows.replaceAll([{ id: 'a', v: 1 }]);
  assert.deepStrictEqual(st.get('t_rows', { id: 'a' }), before);
  assert.strictEqual(st.get('t_rows', { id: 'b' }), null);
  assert.deepStrictEqual(rows.load(), [{ id: 'a', v: 1 }]);
});
t('a store for a different HOME is a different database', () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-jaa-b-'));
  process.env.HOME = other;
  delete require.cache[require.resolve('../src/site-settings/store')]; // legacy path is resolved at require time
  const { SiteSettingsStore } = require('../src/site-settings/store');
  const s = new SiteSettingsStore(); s.load();
  assert.deepStrictEqual(s.listOrigins(), []);
  process.env.HOME = home;
  fs.rmSync(other, { recursive: true, force: true });
});
t('passwords vault keeps its own database under its own dir', () => {
  const dir = path.join(home, 'pwv');
  const { PasswordVault } = require('../src/passwords/vault');
  const v = new PasswordVault({ dir }); v.load();
  v.save('https://x.io', 'j', 'p');
  const v2 = new PasswordVault({ dir }); v2.load();
  assert.strictEqual(v2.list().length, 1);
  assert.ok(fs.existsSync(path.join(dir, 'jaa')));
  assert.ok(!fs.existsSync(path.join(dir, 'passwords.json')), 'no passwords.json written');
});
J.store().flushAll();
fs.rmSync(home, { recursive: true, force: true });
console.log(`\n${pass} passed`);
process.exit(0);
