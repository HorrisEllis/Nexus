'use strict';
/**
 * clear-glass/src/adblock/lists.js — the blocker's lists, state and store, and the one service a process has (AB2, 0.60.183).
 * Spec: clear-glass/spec/adblock.spec MOD-ABK-LISTS. comp_id: cg.adblock.lists
 *
 * James, 2026-10-21: "can you make a full adblocker". The catalogue is the lists uBlock Origin and Adblock Plus subscribe a person to.
 * The built-in list (the 0.60.x plugin's 16 entries, §0.3, plus the common trackers) loads with no network, so blocking starts at the
 * first page (ABK-004). A list is downloaded with the injected fetch (main passes Electron's net.fetch), kept under
 * <userData>/adblock/lists/<id>.txt, and swapped in only when it parsed; a failed download keeps the last copy and records the error.
 * Allowed sites are site settings' contentFilter = 'off', the one place Settings → Site settings already edits (AB0).
 */
const fs = require('fs');
const path = require('path');
const { parseList, Engine } = require('./engine');

const CATALOGUE = Object.freeze([
  { id: 'easylist',    title: 'EasyList',               about: 'Ads',                                on: true,  url: 'https://easylist.to/easylist/easylist.txt' },
  { id: 'easyprivacy', title: 'EasyPrivacy',            about: 'Trackers and analytics',             on: true,  url: 'https://easylist.to/easylist/easyprivacy.txt' },
  { id: 'peter-lowe',  title: "Peter Lowe's list",      about: 'Ad and tracking servers',            on: true,  url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext' },
  { id: 'ublock',      title: 'uBlock filters',         about: 'uBlock Origin’s own fixes (scriptlets skipped)', on: false, url: 'https://ublockorigin.github.io/uAssets/filters/filters.txt' },
  { id: 'annoyances',  title: "Fanboy's Annoyances",    about: 'Pop-overs, newsletters, chat boxes', on: false, url: 'https://easylist.to/easylist/fanboy-annoyance.txt' },
  { id: 'cookies',     title: 'EasyList Cookie',        about: 'Cookie banners',                     on: false, url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt' },
  { id: 'builtin',     title: 'Clear Glass built-in',   about: 'Works offline; always ready',        on: true,  url: null },
]);

// the 0.60.x plugin's list (kept, §0.3) and the trackers every list above also names, so a first start with no network still blocks them
const BUILTIN = `! Title: Clear Glass built-in
||doubleclick.net^
||googlesyndication.com^
||googleadservices.com^
||adservice.google.com^
||googletagmanager.com^
||google-analytics.com^
||facebook.com/tr^
||facebook.com/tr/
||amazon-adsystem.com^
||scorecardresearch.com^
||outbrain.com^$third-party
||taboola.com^$third-party
||criteo.com^
||criteo.net^
||adnxs.com^
||pubmatic.com^
||rubiconproject.com^
||quantserve.com^
||moatads.com^
||adsrvr.org^
||openx.net^
||casalemedia.com^
||advertising.com^
||adform.net^
||smartadserver.com^
||yieldmo.com^
||sharethrough.com^
||media.net^$third-party
||hotjar.com^$third-party
||mixpanel.com^$third-party
||segment.io^$third-party
||bat.bing.com^
||connect.facebook.net^$third-party
||ads-twitter.com^
||static.ads-twitter.com^
||analytics.tiktok.com^
||ads.linkedin.com^
##.adsbygoogle
##ins.adsbygoogle
##[id^="google_ads_iframe"]
##[id^="div-gpt-ad"]
##.ad-banner
##.advertisement
`;

const DUE_MS = 4 * 24 * 3600 * 1000;

function createService({ dir, fetch = null, sites = null, now = () => Date.now(), log = () => {} } = {}) {
  if (!dir) throw new Error('adblock: dir is required');
  const engine = new Engine();
  const stateFile = path.join(dir, 'state.json');
  const listFile = (id) => path.join(dir, 'lists', `${id}.txt`);
  let state = null;
  const tabs = new Map();   // tabId → { count, last: [{ url, rule }] }
  const errors = { match: 0 };

  function defaults() {
    return { enabled: true, custom: '', lists: Object.fromEntries(CATALOGUE.map(c => [c.id, { on: c.on, updatedAt: null, rules: 0, skipped: 0, skippedBy: {}, error: null }])) };
  }
  function readState() {
    try { const s = JSON.parse(fs.readFileSync(stateFile, 'utf8')); const d = defaults(); return { ...d, ...s, lists: { ...d.lists, ...(s.lists || {}) } }; }
    catch (e) { if (e.code !== 'ENOENT') log(`[adblock] state.json unreadable (${e.message}); defaults used`); return defaults(); }
  }
  function save() { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(state, null, 2)); } catch (e) { log(`[adblock] state not saved: ${e.message}`); } }

  function _apply(id, text) {
    const p = parseList(text, { source: id });
    engine.load(id, p);
    const L = state.lists[id] || (state.lists[id] = {});
    L.rules = p.network.length + p.cosmetic.length; L.skipped = Object.values(p.skipped).reduce((a, b) => a + b, 0); L.skippedBy = p.skipped;
    return L;
  }
  function _loadOne(id) {
    if (id === 'builtin') return _apply('builtin', BUILTIN);
    if (id === 'custom') return state.custom ? _apply('custom', state.custom) : (engine.unload('custom'), null);
    try { return _apply(id, fs.readFileSync(listFile(id), 'utf8')); } catch (_) { return null; }   // not downloaded yet
  }

  function start() {
    state = readState();
    for (const c of CATALOGUE) if (state.lists[c.id] && state.lists[c.id].on) _loadOne(c.id);
    _loadOne('custom');
    return view();
  }

  async function update(id = 'all') {
    if (!state) start();
    const ids = id === 'all' ? CATALOGUE.filter(c => c.url && state.lists[c.id].on).map(c => c.id) : [id];
    const out = [];
    for (const lid of ids) {
      const c = CATALOGUE.find(x => x.id === lid); const L = state.lists[lid];
      if (!c || !L) { out.push({ id: lid, ok: false, error: 'no such list' }); continue; }
      if (!c.url) { _loadOne(lid); out.push({ id: lid, ok: true, rules: L.rules }); continue; }
      if (!fetch) { L.error = 'no network here'; out.push({ id: lid, ok: false, error: L.error }); continue; }
      try {
        const res = await fetch(c.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!/^\s*(?:\[Adblock|!|#|0\.0\.0\.0|127\.0\.0\.1|\|\|)/m.test(text.slice(0, 2000))) throw new Error('that is not a filter list');
        const p = parseList(text, { source: lid });
        if (!p.network.length && !p.cosmetic.length) throw new Error('the list had no rules');
        fs.mkdirSync(path.dirname(listFile(lid)), { recursive: true });
        fs.writeFileSync(listFile(lid), text);
        engine.load(lid, p);
        Object.assign(L, { updatedAt: now(), rules: p.network.length + p.cosmetic.length, skipped: Object.values(p.skipped).reduce((a, b) => a + b, 0), skippedBy: p.skipped, error: null });
        out.push({ id: lid, ok: true, rules: L.rules, skipped: L.skipped });
      } catch (e) {
        L.error = e.message;   // the last copy, if any, stays loaded (ABK-004)
        out.push({ id: lid, ok: false, error: e.message, kept: engine.has(lid) });
      }
    }
    save();
    return { ok: out.every(r => r.ok), results: out, lists: view().lists };
  }

  function due() { if (!state) start(); return CATALOGUE.filter(c => c.url && state.lists[c.id].on && (!state.lists[c.id].updatedAt || now() - state.lists[c.id].updatedAt > DUE_MS)).map(c => c.id); }

  function setList(id, on) {
    if (!state) start();
    if (!state.lists[id]) return { ok: false, error: `no list '${id}'` };
    state.lists[id].on = !!on;
    if (on) _loadOne(id); else engine.unload(id);
    save();
    return { ok: true, needsUpdate: !!on && !engine.has(id) };
  }
  function setEnabled(on) { if (!state) start(); state.enabled = !!on; save(); return { ok: true, enabled: state.enabled }; }
  function setCustom(text) { if (!state) start(); state.custom = String(text || '').slice(0, 200000); const L = _loadOne('custom'); save(); return { ok: true, rules: L ? L.rules : 0, skipped: L ? L.skipped : 0, skippedBy: L ? L.skippedBy : {} }; }

  function isAllowed(pageUrl) { try { return !!(sites && pageUrl && sites.get(pageUrl, 'contentFilter') === 'off'); } catch (_) { return false; } }
  function allow(url, on = true) {
    if (!sites) return { ok: false, error: 'site settings are not available' };
    let origin; try { origin = new URL(url).origin; } catch (_) { return { ok: false, error: `not a site: ${url}` }; }
    const done = on ? sites.set(url, 'contentFilter', 'off') : sites.deleteKey(url, 'contentFilter');
    return { ok: done !== false, origin, allowed: !!on };
  }
  function allowed() {
    if (!sites || typeof sites.listOrigins !== 'function') return [];
    return sites.listOrigins().filter(o => sites.get(o, 'contentFilter') === 'off');
  }

  /** match({ url, type, pageUrl, tabId }) → verdict; counts per tab; a main-frame request starts the tab's count again */
  function match(req = {}) {
    if (!state) start();
    if (req.type === 'mainFrame' && req.tabId != null) tabs.set(req.tabId, { count: 0, last: [], page: req.url });
    if (!state.enabled || isAllowed(req.pageUrl || (req.type === 'mainFrame' ? req.url : ''))) return { block: false, rule: null, exception: state.enabled ? 'site allowed' : 'off' };
    let v;
    try { v = engine.match(req); } catch (e) { errors.match++; return { block: false, rule: null, exception: null, error: e.message }; }
    if (v.block && req.tabId != null) {
      const t = tabs.get(req.tabId) || { count: 0, last: [], page: req.pageUrl };
      t.count++; t.last.push({ url: String(req.url).slice(0, 200), rule: v.rule }); if (t.last.length > 20) t.last.shift();
      tabs.set(req.tabId, t);
    }
    return v;
  }
  function cosmetics(pageUrl) { if (!state) start(); if (!state.enabled || isAllowed(pageUrl)) return ''; try { return engine.cosmetics(pageUrl); } catch (_) { return ''; } }
  function stats(tabId) { const t = tabs.get(tabId); return t ? { count: t.count, last: t.last.slice(-10), page: t.page } : { count: 0, last: [], page: null }; }

  function view() {
    if (!state) state = readState();
    const c = engine.counts();
    return {
      enabled: state.enabled, network: c.network, cosmetic: c.cosmetic, custom: state.custom, allowed: allowed(), errors: { ...errors },
      lists: CATALOGUE.map(x => ({ id: x.id, title: x.title, about: x.about, url: x.url, ...state.lists[x.id], loaded: engine.has(x.id) })),
    };
  }

  return { start, update, due, setList, setEnabled, setCustom, allow, allowed, isAllowed, match, cosmetics, stats, state: view, engine };
}

// the process's one service (main sets it up at boot; the plugin and the routes reach it here), the pattern of net/service.js
let _one = null;
function service(opts) { if (opts) _one = createService(opts); return _one; }

module.exports = { CATALOGUE, BUILTIN, createService, service, DUE_MS };
