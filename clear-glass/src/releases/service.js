'use strict';
/**
 * clear-glass/src/releases/service.js — what Clear Glass knows about COS, and the two calls the bridge and the command use (COSA7, 0.60.72)
 * comp_id: clear-glass.releases.service
 * James, 2026-10-16: "auto updates from dropping in new zips, downloading it from clearglass."
 * COS's root is found the same way COS finds it (COS_APP_ROOT, else the platform default), so the inbox is the one COS watches.
 */
const path = require('path');
const D = require('./deliver.js');

function cosView(root, project = 'nexus') {
  let Store; try { Store = require('../../../cos/app/store.js'); } catch (e) { return { ok: false, error: `COS's store is not available here (${e.message})` }; }
  const r = root || process.env.COS_APP_ROOT || Store.defaultRoot(); const p = (Store.list(r, project)[0]) || null;
  let pending = 0; try { pending = require('fs').readdirSync(path.join(r, 'inbox')).filter(n => /\.zip$/i.test(n)).length; } catch (_) {}
  return { ok: true, root: r, inbox: path.join(r, 'inbox'), installed: p ? p.versions.map(v => v.version) : [], current: p && p.current, pending };
}
/** status(opts) → what is the latest release, what COS has, and what a fetch would do. Downloads nothing. */
async function status(o = {}) {
  const cos = cosView(o.root); if (!cos.ok) return cos; const c = await D.check({ repo: o.repo, fetch: o.fetch, apiBase: o.apiBase, token: o.token }); if (!c.ok) return { ...c, cos: { root: cos.root, current: cos.current } };
  const would = cos.installed.includes(c.version) ? 'nothing: already installed' : cos.installed.length && cos.installed.every(v => D.cmpVer(c.version, v) < 0) ? 'nothing: older than what is installed' : `download ${c.zip.name}${c.sums ? ' and check it against SHA256SUMS' : ' (no SHA256SUMS is published: it would NOT be verified)'}`;
  return { ok: true, latest: c.version, tag: c.tag, page: c.page, publishesChecksum: !!c.sums, installed: cos.installed, current: cos.current, inbox: cos.inbox, inboxPending: cos.pending, would };
}
/** fetch(opts) → deliver the latest release into COS's inbox (see deliver.js). COS's watcher and update.policy take it from there. */
async function fetchLatest(o = {}) {
  const cos = cosView(o.root); if (!cos.ok) return cos;
  return D.deliver({ repo: o.repo, inbox: cos.inbox, installed: cos.installed, fetch: o.fetch, apiBase: o.apiBase, token: o.token, maxBytes: o.maxBytes });
}
module.exports = { cosView, status, fetchLatest };
