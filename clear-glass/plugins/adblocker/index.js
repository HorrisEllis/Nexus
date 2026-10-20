'use strict';
/**
 * plugins/adblocker/index.js — the Ad Blocker plugin: the surface of Clear Glass's content blocker (AB3, 0.60.183).
 * Spec: clear-glass/spec/adblock.spec MOD-ABK-WIRING.
 *
 * James, 2026-10-21: "can you make a full adblocker and make it so i can click on them t ochange their settings."
 * Until 0.60.182 this file was the blocker: 16 domains matched by host suffix. The engine now lives in Clear Glass's core
 * (src/adblock: real filter lists, exceptions, options, element hiding — decision AB0), and this plugin is how a person reaches it:
 *   content-filter  filterRequest asks the service for each request (type, page and tab come from webrequest-adapter.js). Turning the
 *                   plugin off in the 🧩 panel deregisters this, so nothing is blocked, as before.
 *   settings        its page in the 🧩 panel (MOD-BSH-PLUGIN-SETTINGS): on/off, blocked on this page, this site allowed, the lists,
 *                   Update now, his own filters, the allowed sites.
 * isBlocked(url) keeps its 0.60.x contract over the built-in list (the old 16 entries are in it, §0.3).
 * A plugin handler's only channel is its returned event (COS-4/10/14); the service is reached as a library, like the engine was before.
 */
const { Engine, parseList } = require('../../src/adblock/engine');
const lists = require('../../src/adblock/lists');

const BLOCKLIST = Object.freeze(['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'googletagmanager.com',
  'google-analytics.com', 'facebook.com/tr', 'amazon-adsystem.com', 'scorecardresearch.com', 'outbrain.com', 'taboola.com', 'criteo.com',
  'adnxs.com', 'pubmatic.com', 'rubiconproject.com', 'quantserve.com']);   // the 0.60.x list, kept for its readers (§0.3)

let _builtin = null;
const builtin = () => _builtin || (_builtin = new Engine().load('builtin', parseList(lists.BUILTIN.replace(/\$third-party/g, ''), { source: 'builtin' })));

/** isBlocked(url) → { blocked, reason } — pure, over the built-in list (0.60.x contract: a malformed url never throws) */
function isBlocked(url) {
  const v = builtin().match({ url, type: 'script', pageUrl: '' });
  return { blocked: !!v.block, reason: v.block ? v.rule.replace(/^\|\||\^\/?$|\/$/g, '').replace(/\^$/, '') : null };
}

let _enabled = true;
function toggleFromToolbar() { _enabled = !_enabled; const s = lists.service(); if (s) s.setEnabled(_enabled); return { type: 'plugin:adblocker:toggled', data: { enabled: _enabled } }; }

/** filterRequest({ url, requestId, resourceType, pageUrl, tabId }) → webrequest:decision */
function filterRequest(data = {}) {
  const decide = (block, reason) => ({ type: 'webrequest:decision', data: { requestId: data.requestId, url: data.url, block, reason } });
  if (!_enabled) return decide(false, 'disabled');
  const svc = lists.service();
  if (!svc) { const v = isBlocked(data.url); return decide(v.blocked, v.reason); }   // no service (a test, or before boot): the built-in list
  try { const v = svc.match({ url: data.url, type: data.resourceType || 'other', pageUrl: data.pageUrl || '', tabId: data.tabId }); return decide(!!v.block, v.rule || v.exception || null); }
  catch (_) { return decide(false, 'error'); }   // fail open for pages (MOD-ABK-WIRING)
}

const ago = (t, now) => { if (!t) return 'never updated'; const m = Math.round((now - t) / 60000); return m < 1 ? 'updated just now' : m < 60 ? `updated ${m} min ago` : m < 2880 ? `updated ${Math.round(m / 60)} h ago` : `updated ${Math.round(m / 1440)} days ago`; };
const hostOf = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.host : null; } catch (_) { return null; } };

function _view(svc, page = {}) {
  const st = svc.state(); const now = Date.now(); const host = hostOf(page.url);
  const tab = page.tabId != null ? svc.stats(page.tabId) : { count: 0, last: [] };
  const fields = [
    { key: 'enabled', type: 'toggle', label: 'Block ads and trackers', value: st.enabled },
  ];
  if (host) fields.push({ key: 'site', type: 'toggle', label: `Block on ${host}`, help: 'Off allows this site (Settings → Site settings keeps the same list).', value: !svc.isAllowed(page.url) });
  fields.push({ type: 'info', label: 'Rules in use', value: `${st.network.toLocaleString('en')} blocking · ${st.cosmetic.toLocaleString('en')} hiding` });
  fields.push({ key: 'lists', type: 'list', label: 'Filter lists', items: st.lists.map(l => ({
    id: l.id, label: l.title, on: !!l.on, remove: !!l.imported,
    sub: [l.about, l.on ? (l.loaded ? `${(l.rules || 0).toLocaleString('en')} rules` : 'not downloaded yet') : null, l.url && l.on ? ago(l.updatedAt, now) : null, l.skipped ? `${l.skipped} skipped` : null, l.error ? `last update failed: ${l.error}` : null].filter(Boolean).join(' · '),
  })) });
  fields.push({ key: 'update', type: 'action', label: 'Update lists now', kind: 'primary' });
  // AB5 (0.60.184) — James: "Needs filters. you'll be able to import folders and host lists."
  fields.push({ key: 'import', type: 'import', label: 'Add your own lists', accept: ['file', 'folder'], help: 'A filter list, a hosts file or a list of domains — or a whole folder of them. Each becomes a list above that you can switch off or remove.' });
  fields.push({ key: 'url', type: 'add', label: 'Subscribe to a list by its address', placeholder: 'https://…/list.txt', button: 'Subscribe' });
  fields.push({ key: 'custom', type: 'textarea', label: 'My filters', placeholder: '||ads.example.com^\nexample.com##.banner', value: st.custom || '', help: 'Adblock Plus / uBlock syntax, one per line. Saved when you leave the box.' });
  fields.push({ key: 'allowed', type: 'list', label: 'Allowed sites', empty: 'No site is allowed.', items: st.allowed.map(o => ({ id: o, label: o, remove: true })) });
  if (tab.last.length) fields.push({ key: 'recent', type: 'list', label: 'Blocked on this page', items: tab.last.slice(-6).reverse().map((b, i) => ({ id: String(i), label: b.url, sub: b.rule })) });
  return { summary: { value: String(tab.count), label: !st.enabled ? 'blocking is off' : host && svc.isAllowed(page.url) ? `${host} is allowed` : 'blocked on this page' }, fields };
}

/** settings({ op: get|set|action, key, value, page, requestId }) → plugin:settings { requestId, view } */
function settings(data = {}) {
  const svc = lists.service();
  const reply = (view, extra = {}) => ({ type: 'plugin:settings', data: { requestId: data.requestId, view, ...extra } });
  if (!svc) return reply({ fields: [{ type: 'info', label: 'Not running', value: 'The blocker starts with Clear Glass; open a window first.' }] });
  const page = data.page || {};
  const { op = 'get', key, value } = data;
  if (op === 'summary') { const t = page.tabId != null ? svc.stats(page.tabId) : { count: 0 }; return reply({ summary: { value: String(svc.state().enabled && !svc.isAllowed(page.url) ? t.count : 0), label: 'blocked on this page' } }); }
  let note = null;
  if (op === 'set') {
    if (key === 'enabled') { svc.setEnabled(!!value); _enabled = !!value; }
    else if (key === 'site') svc.allow(page.url, !value);
    else if (key === 'lists' && value && value.id && value.remove) { const r = svc.removeList(value.id); note = r.ok ? 'List removed' : r.error; }
    else if (key === 'import' && value && Array.isArray(value.paths)) {
      const r = svc.importPaths(value.paths);
      const ok = r.lists.filter(l => l.ok);
      note = `${ok.length ? `Added ${ok.map(l => `${l.title} (${l.rules.toLocaleString('en')} rules${l.format !== 'abp' ? `, ${l.format}` : ''})`).join(', ')}` : 'Nothing added'}${r.skipped.length ? ` · skipped: ${r.skipped.slice(0, 4).map(x => `${require('path').basename(x.path)} (${x.why})`).join(', ')}${r.skipped.length > 4 ? ` and ${r.skipped.length - 4} more` : ''}` : ''}`;
    }
    else if (key === 'url' && value) return svc.addUrl(String(value)).then(r => reply(_view(svc, page), { note: r.ok ? `Subscribed: ${r.rules.toLocaleString('en')} rules` : `Not added: ${r.error}` }));
    else if (key === 'lists' && value && value.id) {
      const r = svc.setList(value.id, !!value.on);
      if (r.needsUpdate) return svc.update(value.id).then(u => reply(_view(svc, page), { note: u.ok ? `${value.id} downloaded` : `${value.id}: ${u.results[0].error}` }));
    }
    else if (key === 'custom') { const r = svc.setCustom(value); note = `${r.rules} of your filters in use${r.skipped ? `, ${r.skipped} skipped (${Object.keys(r.skippedBy).join(', ')})` : ''}`; }
    else if (key === 'allowed' && value && value.remove) svc.allow(value.id, false);
  } else if (op === 'action' && key === 'update') {
    return svc.update('all').then(u => reply(_view(svc, page), { note: u.ok ? 'Lists updated' : u.results.filter(r => !r.ok).map(r => `${r.id}: ${r.error}`).join('; ') }));
  }
  return reply(_view(svc, page), note ? { note } : {});
}

module.exports = { isBlocked, filterRequest, toggleFromToolbar, settings, BLOCKLIST };
