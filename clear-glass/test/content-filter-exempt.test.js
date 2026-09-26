'use strict';
// clear-glass/test/content-filter-exempt.test.js — per-site "content blocking
// off" (site setting contentFilter='off') skips filters for pages on that site.
const assert = require('assert');
const { attachContentFilters, _pageUrlOf } = require('../src/plugins/webrequest-adapter');
const { Bus } = (() => { try { return require('../src/core/bus.js'); } catch (_) { return {}; } })();
let handler;
const session = { webRequest: { onBeforeRequest: (fn) => { handler = fn; } } };
const emitted = [];
const listeners = {};
const bus = { emit: (ev) => { emitted.push(ev); setImmediate(() => (listeners['webrequest:decision'] || []).forEach(f => f({ data: { requestId: ev.data.requestId, block: true } }))); },
  on: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); return () => { listeners[type] = listeners[type].filter(x => x !== fn); }; } };
attachContentFilters(session, bus, { signatures: ['adblock'], exempt: (u) => u.startsWith('https://news.example') });
const run = (details) => new Promise(r => handler(details, r));
(async () => {
  const a = await run({ url: 'https://ads.tracker/x.js', webContents: { getURL: () => 'https://news.example/article' } });
  assert.deepStrictEqual(a, { cancel: false }); assert.strictEqual(emitted.length, 0, 'filters never asked on an exempt site');
  const b = await run({ url: 'https://ads.tracker/x.js', webContents: { getURL: () => 'https://other.example/' } });
  assert.deepStrictEqual(b, { cancel: true }); assert.strictEqual(emitted.length, 1);
  assert.strictEqual(_pageUrlOf({ url: 'https://a/', resourceType: 'mainFrame' }), 'https://a/');
  assert.strictEqual(_pageUrlOf({ url: 'https://a/x.js', referrer: 'https://r/' }), 'https://r/');
  void Bus;
  console.log('[PASS] content filter exemption: exempt site skipped, other site filtered, page url resolution');
  process.exit(0);
})().catch(e => { console.error('[FAIL]', e); process.exit(1); });
