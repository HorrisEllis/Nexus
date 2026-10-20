'use strict';
/**
 * clear-glass/src/net/host-import.js — host lists through Snowflake: a list (or a folder of them) becomes the sites that always take the
 * transport (SF8, 0.60.184). Spec: clear-glass/spec/snowflake.spec MOD-SF-HOST-IMPORT. comp_id: cg.net.host-import
 *
 * James, 2026-10-21: "you'll be able to import folders and host lists. Same with the Snowflake plugin." Reading, to confirm: the sites in a
 * host list always go through Snowflake. Each host is one origin rule in the one routing table (policy.js), via transport unless direct or
 * block is chosen, id hl-<list>-<host>, note list:<name>, so a list is listed and removed as one. The policy's own addRule decides each rule:
 * a host already routed another way is a collision, skipped and named — an import never overwrites a rule he made.
 */
const { sources } = require('../adblock/import');   // the same file and folder reading the blocker's imports use (list-like files, capped)

const MAX_HOSTS = 5000;   // each host is a condition in the window's PAC script
const HOST = /^(?:\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)\.?$/i;
const SKIP = new Set(['localhost', 'localhost.localdomain', 'local', 'broadcasthost', '0.0.0.0', 'ip6-localhost', 'ip6-loopback']);

/** hostsOf(text) → string[] — hosts-file lines, plain domains, ||host^ lines and URLs; comments, IPs, localhost and duplicates dropped */
function hostsOf(text) {
  const out = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    let l = raw.replace(/\s+#.*$/, '').trim();
    if (!l || l.startsWith('#') || l.startsWith('!') || l.startsWith('[')) continue;
    const hostsLine = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1?|::)\s+(.+)$/.exec(l); if (hostsLine) l = hostsLine[1].split(/\s+/)[0];
    const abp = /^\|\|([^\^\/$*]+)\^?(?:\$.*)?$/.exec(l); if (abp) l = abp[1];
    if (/^https?:\/\//i.test(l)) { try { l = new URL(l).hostname; } catch (_) { continue; } }
    const m = HOST.exec(l); if (!m) continue;
    const h = m[1].toLowerCase();
    if (SKIP.has(h) || /^[\d.]+$/.test(h)) continue;
    out.add(h);
  }
  return [...out];
}

const slug = (t) => String(t || 'list').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'list';
const hash = (t) => { let h = 2166136261; for (const ch of String(t)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h.toString(36); };
const idOf = (list, host) => { const id = `hl-${slug(list)}-${host}`; return id.length <= 60 ? id.replace(/[^\w.-]/g, '-') : `hl-${slug(list)}-${hash(host)}`; };

/** importHosts(service, hosts, { via, list }) → { added, skipped: { collision: [{ host, error }], duplicate, overLimit } } */
function importHosts(service, hosts, { via = 'transport', list = 'list' } = {}) {
  const existing = (service.routes().rules || []);
  const same = new Set(existing.filter(r => r.via === via && r.match && r.match.origin && !r.match.urlPattern && !r.match.provider && !r.match.caller).map(r => r.match.origin));
  const ids = new Set(existing.map(r => r.id));
  let duplicate = 0; const todo = [];
  for (const h of hosts) { const id = idOf(list, h); if (same.has(h) || ids.has(id)) { duplicate++; continue; } ids.add(id); todo.push({ id, via, match: { origin: h }, note: `list:${list}` }); }
  const overLimit = Math.max(0, todo.length - MAX_HOSTS);
  const r = service.addRoutes(todo.slice(0, MAX_HOSTS));
  return { ok: true, list, via, added: r.added.length, skipped: { collision: r.refused.map(x => ({ host: x.origin, error: x.error })), duplicate, overLimit }, note: r.note };
}

/** importPaths(service, paths, opts) — files and folders; each file is a list named after it unless opts.list is given */
function importPaths(service, paths, { via = 'transport', list = null } = {}) {
  const { files, skipped } = sources([].concat(paths).filter(Boolean).map(String));
  const results = files.map(f => ({ file: f.path, ...importHosts(service, hostsOf(f.text), { via, list: list || f.name }) }));
  return { ok: results.some(r => r.added > 0), results, skipped };
}

/** lists(service) → [{ list, via, hosts, ids }] — the imported lists in the routing table */
function lists(service) {
  const by = new Map();
  for (const r of service.routes().rules || []) {
    const m = /^list:(.+)$/.exec(r.note || ''); if (!m) continue;
    const k = `${m[1]}\u0000${r.via}`; const e = by.get(k) || { list: m[1], via: r.via, hosts: 0, ids: [], sample: [] };
    e.hosts++; e.ids.push(r.id); if (e.sample.length < 3) e.sample.push(r.match.origin); by.set(k, e);
  }
  return [...by.values()];
}

/** removeList(service, list) → { removed } — only that list's rules */
function removeList(service, list) { const ids = (service.routes().rules || []).filter(r => r.note === `list:${list}`).map(r => r.id); return service.removeRoutes(ids); }

module.exports = { hostsOf, importHosts, importPaths, lists, removeList, MAX_HOSTS, idOf };
