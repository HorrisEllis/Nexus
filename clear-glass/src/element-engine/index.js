'use strict';
/**
 * clear-glass/src/element-engine/index.js — the Element Engine's full page, its backend (EE3a, 0.60.416).
 * component_id: cg.element-engine · Spec: docs/2026-11-05-clear-glass-element-engine-phasemap.spec EE3a_the_full_page
 *
 * James, 2026-11-06: "That plugin needs to be front end too." · "It’s meant to replace the adblocker also like a full plugin page." · "It needs
 * to have a full page to edit, change and add. Like it needs to be fully featured. Not a small plugin at all dude."
 *
 * What the page edits that nothing served before (the rest it reaches through routes that already exist: /cli/adblock/*, /cli/eros/*):
 *   overview(svc, { editDir })            → { ok, blocker: { enabled, network, cosmetic, lists, custom, allowed, hidden }, copy }
 *   hidden.list(svc)                      → { ok, rules: [{ rule, site, selector, exception }] } — every element-hiding line in his filters
 *   hidden.add(svc, { site, selector, exception })     one line added to his filters (site '' = every site)
 *   hidden.edit(svc, { rule, site, selector, exception })  that line replaced, in place
 *   hidden.remove(svc, { rule })          that line taken out
 *   hideRule(site, selector, { exception }) → { ok, rule } | { ok:false, error } — the one check every hide goes through (the plugin's too)
 *   copy.list(dir, { edit })              → { ok, dir, exported, files: [{ file, bytes, changed }] } — his ErosmancerOS copy (ES5's export)
 *   copy.read(dir, file)                  → { ok, file, text }
 *   copy.write(dir, file, text, { edit }) → { ok, file, bytes, syntax: [errors] | null } — saved in HIS copy only; import (ES5) applies it
 *
 * His filters stay one text (the blocker's own `custom`, AB5): this module rewrites lines of it through svc.setCustom, so a rule written
 * here, in "My filters" or by the picker's Hide is the same rule. His copy: a path outside his folder, not .ts, under a dot folder or
 * node_modules, or over 1 MB is refused, said. Nothing here writes ErosmancerOS's live code; ES5's import does, with its checks.
 */
const fs = require('fs');
const path = require('path');

const MAX_FILE = 1024 * 1024;
const LINE_RE = /^([^#\s]*)(##|#@#)(.+)$/;   // site##selector · site#@#selector (an exception) · ##selector (every site)

function hideRule(site, selector, { exception = false } = {}) {
  const s = String(site || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const sel = String(selector || '').trim();
  if (s && !/^[a-z0-9.*,~-]+(:\d+)?$/.test(s)) return { ok: false, error: `not a site: ${site} (write it as example.com, or leave it empty for every site)` };
  if (!sel || sel === 'unknown') return { ok: false, error: 'a selector is needed (what to hide, e.g. .banner or #ad-slot)' };
  if (sel.length > 400) return { ok: false, error: 'that selector is over 400 characters' };
  if (/\n|##|#@#/.test(sel)) return { ok: false, error: 'a selector cannot hold a line break, ## or #@#' };
  return { ok: true, rule: `${s}${exception ? '#@#' : '##'}${sel}` };
}

const _lines = (svc) => String(svc.state().custom || '').split('\n');
const _parse = (line) => { const m = LINE_RE.exec(String(line).trim()); return m ? { rule: line.trim(), site: m[1], selector: m[3], exception: m[2] === '#@#' } : null; };
const _need = (svc) => (svc ? null : { ok: false, error: 'the blocker is not running yet (it starts with Clear Glass)' });
function _save(svc, lines, note) {
  const r = svc.setCustom(lines.join('\n').replace(/\n{3,}/g, '\n\n'));
  const skipped = r.skippedBy && Object.keys(r.skippedBy).length ? ` (the blocker skipped some: ${Object.keys(r.skippedBy).join(', ')})` : '';
  return { ok: true, note: note + skipped, rules: r.rules };
}

const hidden = {
  list(svc) { return _need(svc) || { ok: true, rules: _lines(svc).map(_parse).filter(Boolean) }; },
  add(svc, { site, selector, exception } = {}) {
    if (!svc) return _need(svc);
    const v = hideRule(site, selector, { exception }); if (!v.ok) return v;
    const L = _lines(svc);
    if (L.some(l => l.trim() === v.rule)) return { ok: true, note: `already in your filters: ${v.rule}`, rule: v.rule };
    while (L.length && !L[L.length - 1].trim()) L.pop();
    L.push(v.rule);
    return { ..._save(svc, L, `added: ${v.rule} (reload the page to see it)`), rule: v.rule };
  },
  edit(svc, { rule, site, selector, exception } = {}) {
    if (!svc) return _need(svc);
    const L = _lines(svc); const i = L.findIndex(l => l.trim() === String(rule || '').trim());
    if (i < 0) return { ok: false, error: `not in your filters: ${rule}` };
    const v = hideRule(site, selector, { exception }); if (!v.ok) return v;
    L[i] = v.rule;
    return { ..._save(svc, L, `changed: ${rule} → ${v.rule}`), rule: v.rule };
  },
  remove(svc, { rule } = {}) {
    if (!svc) return _need(svc);
    const L = _lines(svc); const left = L.filter(l => l.trim() !== String(rule || '').trim());
    if (left.length === L.length) return { ok: false, error: `not in your filters: ${rule}` };
    return _save(svc, left, `removed: ${rule} (reload the page)`);
  },
};

// ── his ErosmancerOS copy (ES5's export folder) ──────────────────────────────────────────────────────────────────────────────────
function _inCopy(dir, file) {
  const f = String(file || '').replace(/\\/g, '/');
  if (!f || !f.endsWith('.ts')) return { ok: false, error: `only .ts files are edited here: ${file || '(none)'}` };
  const parts = f.split('/');
  if (parts.some(p => !p || p === '..' || p.startsWith('.') || p === 'node_modules')) return { ok: false, error: `not a file of your copy: ${file}` };
  const base = path.resolve(dir); const abs = path.resolve(base, ...parts);
  if (!abs.startsWith(base + path.sep)) return { ok: false, error: `outside your copy: ${file}` };
  return { ok: true, abs, file: parts.join('/') };
}
const copy = {
  list(dir, { edit } = {}) {
    let manifest = null; try { manifest = JSON.parse(fs.readFileSync(path.join(dir, (edit && edit.MANIFEST) || '.erosmancer-edit.json'), 'utf8')); } catch (_) {}
    if (!manifest) return { ok: true, dir, exported: false, files: [] };
    const out = [];
    const walk = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of ents) { if (e.name.startsWith('.') || e.name === 'node_modules') continue; const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.endsWith('.ts')) out.push(p); } };
    walk(dir);
    const sha = (b) => require('crypto').createHash('sha256').update(b).digest('hex');
    const files = out.map(p => { const b = fs.readFileSync(p); const f = path.relative(dir, p).split(path.sep).join('/');
      return { file: f, bytes: b.length, changed: manifest.files[f] ? manifest.files[f] !== sha(b) : 'new' }; }).sort((a, b) => a.file.localeCompare(b.file));
    return { ok: true, dir, exported: true, at: manifest.at, files };
  },
  read(dir, file) {
    const v = _inCopy(dir, file); if (!v.ok) return v;
    let text; try { text = fs.readFileSync(v.abs, 'utf8'); } catch (_) { return { ok: false, error: `not in your copy: ${v.file}` }; }
    return { ok: true, file: v.file, text };
  },
  write(dir, file, text, { edit } = {}) {
    const v = _inCopy(dir, file); if (!v.ok) return v;
    if (typeof text !== 'string') return { ok: false, error: 'text is needed' };
    if (Buffer.byteLength(text) > MAX_FILE) return { ok: false, error: 'over 1 MB: not saved' };
    if (!fs.existsSync(path.join(dir, (edit && edit.MANIFEST) || '.erosmancer-edit.json'))) return { ok: false, error: `no export in ${dir} yet (Export a copy first)` };
    fs.mkdirSync(path.dirname(v.abs), { recursive: true });
    fs.writeFileSync(v.abs, text);
    const syntax = edit && typeof edit.syntaxErrors === 'function' ? edit.syntaxErrors(v.file, text) : null;
    return { ok: true, file: v.file, bytes: Buffer.byteLength(text), syntax, note: syntax && syntax.length ? `saved in your copy, but it does not parse: ${syntax[0]}` : `saved in your copy (${v.file}); Import applies it` };
  },
};

function overview(svc, { editDir = null, edit = null } = {}) {
  const c = editDir ? copy.list(editDir, { edit }) : { exported: false, files: [] };
  const cp = { dir: editDir, exported: c.exported, files: c.files.length, changed: c.files.filter(f => f.changed).length };
  if (!svc) return { ok: true, blocker: null, copy: cp, note: 'the blocker is not running yet (it starts with Clear Glass)' };
  const st = svc.state();
  return { ok: true, copy: cp, blocker: {
    enabled: st.enabled, network: st.network, cosmetic: st.cosmetic, custom: st.custom || '', allowed: st.allowed,
    hidden: _lines(svc).map(_parse).filter(Boolean).length,
    lists: st.lists.map(l => ({ id: l.id, title: l.title, about: l.about || null, url: l.url || (l.imported && l.imported.origin) || null, on: !!l.on, loaded: !!l.loaded, rules: l.rules || 0, skipped: l.skipped || 0, updatedAt: l.updatedAt || null, error: l.error || null, imported: !!l.imported })),
  } };
}

module.exports = { MODULE_ID: 'cg.element-engine', VERSION: '1.0.0', overview, hidden, copy, hideRule, MAX_FILE };
