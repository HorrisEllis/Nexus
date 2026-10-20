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
const Imp = require('./import');   // AB5 (0.60.184): his own lists

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

  function _apply(id, text, format = 'abp') {
    const p = parseList(text, { source: id, format });
    engine.load(id, p);
    const L = state.lists[id] || (state.lists[id] = {});
    L.rules = p.network.length + p.cosmetic.length; L.skipped = Object.values(p.skipped).reduce((a, b) => a + b, 0); L.skippedBy = p.skipped;
    return L;
  }
  function _loadOne(id) {
    if (id === 'builtin') return _apply('builtin', BUILTIN);
    if (id === 'custom') return state.custom ? _apply('custom', state.custom) : (engine.unload('custom'), null);
    const fmt = (state.lists[id] && state.lists[id].imported && state.lists[id].imported.format) || 'abp';
    try { return _apply(id, fs.readFileSync(listFile(id), 'utf8'), fmt); } catch (_) { return null; }   // not downloaded yet
  }

  function start() {
    state = readState();
    for (const c of CATALOGUE) if (state.lists[c.id] && state.lists[c.id].on) _loadOne(c.id);
    for (const [id, L] of Object.entries(state.lists)) if (L.imported && L.on) _loadOne(id);
    _loadOne('custom');
    return view();
  }

  async function update(id = 'all') {
    if (!state) start();
    const ids = id === 'all' ? Object.keys(state.lists).filter(k => state.lists[k].on && (entry(k) || {}).url || (state.lists[k].on && state.lists[k].imported)) : [id];
    const out = [];
    for (const lid of ids) {
      const c = entry(lid); const L = state.lists[lid];
      if (!c || !L) { out.push({ id: lid, ok: false, error: 'no such list' }); continue; }
      if (L.imported && L.imported.kind === 'file') { out.push(_reread(lid)); continue; }
      if (!c.url) { _loadOne(lid); out.push({ id: lid, ok: true, rules: L.rules }); continue; }
      if (!fetch) { L.error = 'no network here'; out.push({ id: lid, ok: false, error: L.error }); continue; }
      try {
        const res = await fetch(c.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!/^\s*(?:\[Adblock|!|#|0\.0\.0\.0|127\.0\.0\.1|\|\|)/m.test(text.slice(0, 2000))) throw new Error('that is not a filter list');
        const fmt = L.imported ? (L.imported.format = Imp.detectFormat(text)) : 'abp';
        const p = parseList(text, { source: lid, format: fmt });
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

  function due() { if (!state) start(); return Object.keys(state.lists).filter(k => { const c = entry(k); return c && c.url && state.lists[k].on && (!state.lists[k].updatedAt || now() - state.lists[k].updatedAt > DUE_MS); }); }

  // ── AB5 (0.60.184): his own lists — a file, a folder of them, a host list, a list's URL — each a list of its own ──────────────────
  // James: "Needs filters. you'll be able to import folders and host lists." A copy is kept under lists/, so moving the original loses nothing.
  const slug = (t) => String(t).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'list';
  const hash = (t) => { let h = 2166136261; for (const ch of String(t)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h.toString(36).slice(0, 5); };
  function entry(id) { const c = CATALOGUE.find(x => x.id === id); if (c) return c; const L = state && state.lists[id]; return L && L.imported ? { id, title: L.imported.title, about: L.imported.kind === 'url' ? L.imported.origin : `${L.imported.format} · ${L.imported.origin}`, url: L.imported.kind === 'url' ? L.imported.origin : null } : null; }
  function _keep(id, meta, text) {
    const format = Imp.detectFormat(text);
    const p = parseList(text, { source: id, format });
    if (!p.network.length && !p.cosmetic.length) return { ok: false, id, title: meta.title, error: `no rules in it (read as ${format})` };
    fs.mkdirSync(path.dirname(listFile(id)), { recursive: true }); fs.writeFileSync(listFile(id), text);
    engine.load(id, p);
    state.lists[id] = { on: true, updatedAt: now(), rules: p.network.length + p.cosmetic.length, skipped: Object.values(p.skipped).reduce((a, b) => a + b, 0), skippedBy: p.skipped, error: null, imported: { ...meta, format } };
    return { ok: true, id, title: meta.title, format, rules: state.lists[id].rules, skipped: state.lists[id].skipped };
  }
  function importPaths(paths = []) {
    if (!state) start();
    const { files, skipped } = Imp.sources([].concat(paths).filter(Boolean).map(String));
    const lists = files.map(f => _keep(`imp-${slug(f.name)}-${hash(f.path)}`, { title: f.name, kind: 'file', origin: f.path }, f.text));
    save();
    return { ok: lists.some(l => l.ok), lists, skipped: [...skipped, ...lists.filter(l => !l.ok).map(l => ({ path: l.title, why: l.error }))] };
  }
  function importText(text, title = 'pasted list') { if (!state) start(); const r = _keep(`imp-${slug(title)}-${hash(text.slice(0, 2000))}`, { title, kind: 'text', origin: 'pasted' }, String(text || '')); save(); return r; }
  async function addUrl(url, title) {
    if (!state) start();
    let u; try { u = new URL(String(url)); } catch (_) { return { ok: false, error: `not a URL: ${url}` }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'a list URL is http or https' };
    const id = `imp-${slug(title || u.pathname.split('/').pop() || u.host)}-${hash(u.href)}`;
    state.lists[id] = { on: true, updatedAt: null, rules: 0, skipped: 0, skippedBy: {}, error: null, imported: { title: title || u.pathname.split('/').pop() || u.host, kind: 'url', origin: u.href, format: 'abp' } };
    const r = await update(id);
    if (!r.ok) { delete state.lists[id]; save(); return { ok: false, error: r.results[0].error }; }
    return { ok: true, id, rules: state.lists[id].rules };
  }
  function _reread(id) {
    const L = state.lists[id];
    let text; try { text = fs.readFileSync(L.imported.origin, 'utf8'); } catch (_) { L.error = 'the original file is gone; the copy is kept'; return { id, ok: false, error: L.error, kept: engine.has(id) }; }
    const r = _keep(id, { title: L.imported.title, kind: 'file', origin: L.imported.origin }, text);
    return r.ok ? { id, ok: true, rules: r.rules } : { id, ok: false, error: r.error, kept: engine.has(id) };
  }
  function removeList(id) {
    if (!state) start();
    const L = state.lists[id]; if (!L || !L.imported) return { ok: false, error: CATALOGUE.some(c => c.id === id) ? 'a catalogue list is turned off, not removed' : `no list '${id}'` };
    engine.unload(id); delete state.lists[id]; try { fs.unlinkSync(listFile(id)); } catch (_) {}
    save(); return { ok: true, removed: id };
  }

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
      lists: [...CATALOGUE.map(x => ({ id: x.id, title: x.title, about: x.about, url: x.url, ...state.lists[x.id], loaded: engine.has(x.id) })),
        ...Object.entries(state.lists).filter(([, L]) => L.imported).map(([id, L]) => ({ id, ...entry(id), ...L, loaded: engine.has(id) }))],
    };
  }

  return { start, update, due, importPaths, importText, addUrl, removeList, setList, setEnabled, setCustom, allow, allowed, isAllowed, match, cosmetics, stats, state: view, engine };
}

// the process's one service (main sets it up at boot; the plugin and the routes reach it here), the pattern of net/service.js
let _one = null;
function service(opts) { if (opts) _one = createService(opts); return _one; }

module.exports = { CATALOGUE, BUILTIN, createService, service, DUE_MS };
