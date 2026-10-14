'use strict';
/**
 * lib/checks/ck-233-deny.js — CK-233 "forbidden things absent" (cos/spec/check-catalogue.spec, family negative-space).
 * component_id: nexus.lib.checks.ck-233-deny
 *
 * James (2026-10-13): "it should have it no where. im scared of regression." What must never appear again is listed
 * once, as data: cos/spec/deny-list.spec for Nexus, and a repo's own <repo>/.nexus/deny.yaml. Each entry's pattern is
 * matched line by line over its files and paths; every hit is file:line. A pattern that does not compile is a failure of
 * the list, said — never a pass.
 *
 *   load({ root, list }) → [entry]          the entries that apply under root (Nexus's list only when root is Nexus)
 *   run({ path, only }, { root }) → { ok, verifiable, evidence, reason, items: [{ id, file, line, text }] }
 * except: a name without '/' skips that directory name anywhere; with '/', a path prefix.
 */
const fs = require('fs');
const path = require('path');

const ID = 'CK-233';
const NEXUS_ROOT = path.resolve(__dirname, '../..');
const NEXUS_LIST = path.join(NEXUS_ROOT, 'cos/spec/deny-list.spec');
const ALWAYS_SKIP = new Set(['node_modules', '.git']);
const COMMENT_RX = /^\s*(\/\/|\*|\/\*|#|<!--)/;

function _yaml(file) { return require('js-yaml').load(fs.readFileSync(file, 'utf8')); }

function load({ root = NEXUS_ROOT, list = null } = {}) {
  const out = [];
  const files = list ? [list] : [...(path.resolve(root) === NEXUS_ROOT ? [NEXUS_LIST] : []), path.join(root, '.nexus', 'deny.yaml')];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const doc = _yaml(f) || {};
    const entries = (doc.spec && doc.spec.deny) || doc.deny || [];
    for (const e of entries) out.push({ ...e, source: path.relative(root, f) || f });
  }
  return out;
}

function _skipped(rel, name, except) {
  if (ALWAYS_SKIP.has(name) || name.startsWith('.')) return true;
  for (const x of except) {
    if (!x.includes('/')) { if (name === x) return true; }
    else if (rel === x || rel.startsWith(`${x}/`)) return true;
  }
  return false;
}

function _scan(root, entry, rx, hits) {
  const exts = new Set((entry.files || []).map(e => String(e).replace(/^\./, '').toLowerCase()));
  const except = (entry.except || []).map(String);
  const walk = (abs, rel) => {
    let list; try { list = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { return; }
    for (const d of list) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) { if (!_skipped(r, d.name, except)) walk(path.join(abs, d.name), r); continue; }
      const ext = (d.name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
      if (exts.size && !exts.has(ext)) continue;
      if (except.some(x => x.includes('/') && (r === x || r.startsWith(`${x}/`)))) continue;
      let text; try { const st = fs.statSync(path.join(abs, d.name)); if (st.size > 2 * 1024 * 1024) continue; text = fs.readFileSync(path.join(abs, d.name), 'utf8'); } catch (_) { continue; }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!rx.test(lines[i])) continue;
        if (entry.skip_comments && COMMENT_RX.test(lines[i])) continue;
        hits.push({ id: entry.id, file: r, line: i + 1, text: lines[i].trim().slice(0, 160) });
      }
    }
  };
  for (const p of (entry.paths && entry.paths.length ? entry.paths : ['.'])) {
    const abs = path.resolve(root, p);
    if (!abs.startsWith(path.resolve(root))) continue;   // a list never reads outside the repo it guards
    if (fs.existsSync(abs)) walk(abs, p === '.' ? '' : String(p).replace(/\/$/, ''));
  }
}

function run(c = {}, { root = NEXUS_ROOT } = {}) {
  const base = c.path ? path.resolve(root, c.path) : root;
  let entries;
  try { entries = load({ root: base, list: c.list ? path.resolve(root, c.list) : null }); }
  catch (e) { return { ok: false, verifiable: true, reason: `${ID}: the deny list does not parse — ${e.message}` }; }
  if (c.only) entries = entries.filter(e => [].concat(c.only).includes(e.id));
  if (!entries.length) return { ok: false, verifiable: false, reason: `unverifiable: no deny list for ${path.relative(NEXUS_ROOT, base) || 'Nexus'} (cos/spec/deny-list.spec, or the repo's .nexus/deny.yaml)` };
  const hits = [], broken = [];
  for (const e of entries) {
    let rx; try { rx = new RegExp(e.pattern, e.flags || 'i'); } catch (err) { broken.push(`${e.id}: ${err.message}`); continue; }
    _scan(base, e, rx, hits);
  }
  if (broken.length) return { ok: false, verifiable: true, items: hits, reason: `${ID}: deny entries that do not compile — ${broken.join('; ')}` };
  if (hits.length) {
    const by = {}; for (const h of hits) (by[h.id] = by[h.id] || []).push(`${h.file}:${h.line}`);
    return { ok: false, verifiable: true, items: hits, reason: `${ID}: forbidden things present — ${Object.entries(by).map(([id, at]) => `${id} at ${at.slice(0, 5).join(', ')}${at.length > 5 ? ` (+${at.length - 5})` : ''}`).join('; ')}` };
  }
  return { ok: true, verifiable: true, items: [], evidence: { check: ID, entries: entries.map(e => e.id), root: path.relative(NEXUS_ROOT, base) || '.' } };
}

module.exports = { ID, load, run };
