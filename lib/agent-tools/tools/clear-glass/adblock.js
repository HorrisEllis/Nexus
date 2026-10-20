'use strict';
/**
 * lib/agent-tools/tools/clear-glass/adblock.js — clear_glass_adblock: Clear Glass's content blocker for agents (AB4, 0.60.183).
 * Spec: clear-glass/spec/adblock.spec MOD-ABK-SURFACE.
 *
 * James, 2026-10-21: "can you make a full adblocker". An agent can read the blocker's state, turn lists on or off, update them, allow a
 * site that the blocker breaks, and test whether a URL would be blocked (and by which rule). His own filters are his: this tool never
 * writes them. Reaches Clear Glass's :7702 /cli/adblock/*, the same door the `adblock` command uses.
 */
const { _call } = require('./net.js');

module.exports = {
  name: 'clear_glass_adblock',
  description: 'Clear Glass content blocker. action: status (lists, rule counts, allowed sites) | lists | list (id + on) | update (id or all) | ' +
    'import (url of a list, or path of a list file/folder) | remove (id of an imported list) | allow / disallow (site) | check (url, page: which rule would block it) | on | off. Lists: easylist, easyprivacy, peter-lowe, ublock, annoyances, cookies, builtin. ' +
    'Allow a site only when the blocker breaks it. Writing custom filters is the person\'s, refused here. ok:false if Clear Glass is not running.',
  parameters: { type: 'object', properties: {
    action: { type: 'string', enum: ['status', 'lists', 'list', 'update', 'import', 'remove', 'allow', 'disallow', 'check', 'on', 'off', 'rules'] },
    id: { type: 'string' }, path: { type: 'string' }, title: { type: 'string' }, on: { type: 'boolean' }, site: { type: 'string' }, url: { type: 'string' }, page: { type: 'string' } }, required: ['action'] },
  execute: async (a = {}) => {
    try {
      switch (a.action) {
        case 'rules': return { ok: false, error: 'his own filters are his to write. Ask him (idearium adblock rules …, or the Ad Blocker page in the 🧩 panel).' };
        case 'on': case 'off': return await _call('POST', '/cli/adblock/enabled', { on: a.action === 'on' });
        case 'list': if (!a.id) return { ok: false, error: 'id is required' }; return await _call('POST', '/cli/adblock/list', { id: a.id, on: a.on !== false });
        case 'update': return await _call('POST', '/cli/adblock/update', { id: a.id || 'all' });
        // AB5 (0.60.184): subscribe to a list by its URL, or bring in a list file or folder on this machine
        case 'import': if (!a.url && !a.path) return { ok: false, error: 'url or path is required' }; return await _call('POST', '/cli/adblock/import', a.url ? { url: a.url, title: a.title } : { paths: [a.path] });
        case 'remove': if (!a.id) return { ok: false, error: 'id is required' }; return await _call('POST', '/cli/adblock/remove', { id: a.id });
        case 'allow': case 'disallow': if (!a.site) return { ok: false, error: 'site is required' }; return await _call('POST', '/cli/adblock/allow', { site: a.site, on: a.action === 'allow' });
        case 'check': if (!a.url) return { ok: false, error: 'url is required' }; return await _call('GET', `/cli/adblock/check?url=${encodeURIComponent(a.url)}&page=${encodeURIComponent(a.page || '')}`);
        default: return await _call('GET', '/cli/adblock/status');
      }
    } catch (e) { return { ok: false, error: `clear_glass_adblock failed: ${e.message}` }; }
  },
};
