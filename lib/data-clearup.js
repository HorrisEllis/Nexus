'use strict';
/**
 * lib/data-clearup.js — DL0 census + DL1 clear-up tool: every file of state placed in the system that owns it, moved safely.
 * comp_id: nexus.lib.data-clearup
 * Spec: docs/data-layout.spec (MOD-DATA-CENSUS, MOD-CLEARUP) · Map: docs/2026-10-21-data-layout-phasemap.spec (DL0, DL1)
 *
 * James, 2026-10-21: "need all data in the data folder migrated to each relative system" · "no data folder in the root." · "make a
 * file clearup tool, for safely moving and mapping tools."
 *
 * The ownership table is the spec's own `ownership:` section (read at run time — the spec is the source of truth, not a copy here).
 *   census({ root, dataDir })   every file: bytes, sha, git-tracked, the rule that places it, its destination, its status, and the
 *                               code files that still name its old path (refs — the "mapping": rewire these before moving)
 *   plan(census, opts)          → Move[] (planned | ask | archive | skipped-refs)
 *   apply(moves, { root, by })  manifest FIRST (_archive/clearup/<stamp>/manifest.json); per file: copy → sha256 equal → remove
 *                               the source; same bytes already there → duplicate (source archived); different → conflict (skipped)
 *   rollback(manifest)          every moved file back, hash-checked; duplicates and archived files returned
 *   verify(manifest)            every destination present with its hash
 * Nothing is deleted without a copy in place or in the archive (§0.3). Dry by default from the CLI.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.data-clearup';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const SPEC = 'docs/data-layout.spec';
const CODE_SKIP = new Set(['node_modules', '.git', '_archive', 'data', 'tests', 'test']);

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');

function loadRules(root = ROOT) {
  const yaml = require('js-yaml');
  const d = yaml.load(fs.readFileSync(path.join(root, SPEC), 'utf8'));
  return ((d && d.spec) || d).ownership || [];
}

/** match(rule, p, root) → { to, owner } | null — "x/*" prefix, "<system>" one segment that must be a system folder at the root */
function match(rule, p, root) {
  const pat = String(rule.match).split('/'), seg = p.split('/');
  let sys = null, i = 0;
  for (; i < pat.length; i++) {
    const t = pat[i];
    if (t === '*') return { to: rule.to.replace('<system>', sys || '').replace('*', seg.slice(i).join('/')), owner: rule.owner === '<system>' ? sys : rule.owner, sys };
    if (i >= seg.length) return null;
    if (t === '<system>') { sys = seg[i]; continue; }
    if (t.endsWith('*') && seg[i].startsWith(t.slice(0, -1)) && i === pat.length - 1) return { to: rule.to.replace('*', seg.slice(i).join('/')), owner: rule.owner, sys };
    if (t.endsWith('*') && seg[i].startsWith(t.slice(0, -1))) continue;
    if (t !== seg[i]) return null;
  }
  return i === seg.length ? { to: rule.to, owner: rule.owner, sys } : null;
}

function _walk(dir, out = []) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) _walk(p, out); else if (e.isFile()) out.push(p); }
  return out;
}

/** refsTo(root, prefix) → code files that name data/<prefix> (string joins or literal paths) */
function refsTo(root, prefix, _files) {
  const files = _files || (function walk(dir, acc = []) {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return acc; }
    for (const e of ents) {
      if (e.isDirectory()) { if (!CODE_SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), acc); }
      else if (/\.(c|m)?js$/.test(e.name)) acc.push(path.join(dir, e.name));
    }
    return acc;
  })(root);
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`['"\`]data['"\`]\\s*,\\s*['"\`]${esc}['"\`/]|['"\`/]data/${esc}(['"\`/]|$)`);
  const out = [];
  for (const f of files) { let t; try { t = fs.readFileSync(f, 'utf8'); } catch (_) { continue; } if (re.test(t)) out.push(rel(root, f)); }
  return out;
}

function census({ root = ROOT, dataDir = path.join(root, 'data'), rules = null, tracked = null, only = null } = {}) {
  const rs = rules || loadRules(root);
  let trackedSet = tracked;
  if (!trackedSet) { try { trackedSet = new Set(require('child_process').execFileSync('git', ['ls-files', '-z', rel(root, dataDir) || '.'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean)); } catch (_) { trackedSet = null; } }
  const codeFiles = []; (function walk(dir) { let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) { if (e.isDirectory()) { if (!CODE_SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name)); } else if (/\.(c|m)?js$/.test(e.name)) codeFiles.push(path.join(dir, e.name)); } })(root);
  const refCache = new Map();
  // 0.60.207 DL2 — only: [paths under dataDir] walks just those (a system bringing its own data home reads its paths, not all of data/)
  const files = only ? [].concat(...only.map(h => { const a = path.join(dataDir, h); try { return fs.statSync(a).isDirectory() ? _walk(a) : [a]; } catch (_) { return []; } })) : _walk(dataDir);
  const entries = files.map(abs => {
    const p = rel(dataDir, abs), repoPath = rel(root, abs);
    const st = fs.statSync(abs);
    let rule = null, m = null;
    for (const r of rs) { m = match(r, p, root); if (m) { rule = r; break; } }
    let status = rule ? rule.status : 'ask', why = rule ? rule.why : 'no ownership rule matches this path';
    if (rule && m.sys && rule.owner === '<system>' && !fs.existsSync(path.join(root, m.sys))) { status = 'ask'; why = `no system folder '${m.sys}' at the root — whose is it?`; }
    const prefix = p.split('/')[0];
    if (!refCache.has(prefix)) refCache.set(prefix, refsTo(root, prefix, codeFiles));
    return { path: repoPath, bytes: st.size, sha256: sha(abs), tracked: trackedSet ? trackedSet.has(repoPath) : null,
      rule: rule ? rule.match : null, owner: m ? m.owner : null, to: m ? m.to : null, status, why, refs: refCache.get(prefix) };
  });
  const byOwner = {}; for (const e of entries) { const k = e.status === 'move' ? e.owner : e.status; (byOwner[k] = byOwner[k] || { files: 0, bytes: 0 }); byOwner[k].files++; byOwner[k].bytes += e.bytes; }
  return { root, dataDir: rel(root, dataDir) || '.', at: Date.now(), entries, byOwner, ask: entries.filter(e => e.status === 'ask'), refs: Object.fromEntries(refCache) };
}

function plan(c, { onlyOwner = null, force = false } = {}) {
  return c.entries.filter(e => !onlyOwner || e.owner === onlyOwner).map(e => {
    const base = { from: e.path, to: e.to, sha256: e.sha256, bytes: e.bytes, rule: e.rule, tracked: e.tracked };
    if (e.status === 'ask') return { ...base, status: 'ask', why: e.why };
    if (e.status === 'archive') return { ...base, status: 'planned', archive: true, why: e.why };
    if (e.refs.length && !force) return { ...base, status: 'skipped-refs', why: `rewire first: ${e.refs.length} code file(s) still name this path (${e.refs.slice(0, 3).join(', ')}${e.refs.length > 3 ? ' …' : ''})` };
    return { ...base, status: 'planned', why: e.why, ...(e.refs.length ? { forced: true } : {}) };
  });
}

function _moveFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (sha(src) !== sha(dest)) { try { fs.unlinkSync(dest); } catch (_) {} return false; }
  fs.unlinkSync(src);
  return true;
}

function _prune(dir, stop) {
  for (let d = dir; d && d !== stop && d.startsWith(stop); d = path.dirname(d)) {
    try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch (_) { break; }
  }
}

function apply(moves, { root = ROOT, by = 'james', stamp = null } = {}) {
  const id = `clearup-${stamp || new Date().toISOString().replace(/[:.]/g, '-')}`;
  const arch = path.join(root, '_archive', 'clearup', id);
  const mf = path.join(arch, 'manifest.json');
  const manifest = { id, root, at: Date.now(), by, moves: [], archived: [], conflicts: [], asked: [], skipped: [], failed: [] };
  fs.mkdirSync(arch, { recursive: true });
  const save = () => fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
  save();   // GATE-DL-MANIFEST: before the first move
  for (const m of moves) {
    if (m.status === 'ask') { manifest.asked.push(m); continue; }
    if (m.status !== 'planned') { manifest.skipped.push(m); continue; }
    const src = path.join(root, m.from);
    if (!fs.existsSync(src)) { manifest.skipped.push({ ...m, status: 'skipped', why: 'source gone (already moved?)' }); continue; }
    const dest = path.join(root, m.archive ? path.join('_archive', 'clearup', id, 'archived', m.from) : m.to);
    if (!m.archive && fs.existsSync(dest)) {
      if (sha(dest) === m.sha256) {   // a true duplicate: the source goes to the archive, reported (§0.3)
        const a = path.join(arch, 'duplicates', m.from);
        if (_moveFile(src, a)) manifest.archived.push({ ...m, status: 'duplicate', archivedAt: rel(root, a) }); else manifest.failed.push({ ...m, status: 'failed', why: 'archive copy did not hash equal' });
      } else manifest.conflicts.push({ ...m, status: 'conflict', why: `${m.to} already holds a different file` });
      save(); continue;
    }
    if (_moveFile(src, dest)) (m.archive ? manifest.archived : manifest.moves).push({ ...m, status: m.archive ? 'archived' : 'moved', ...(m.archive ? { archivedAt: rel(root, dest) } : {}) });
    else manifest.failed.push({ ...m, status: 'failed', why: 'copy did not hash equal; source kept' });
    _prune(path.dirname(src), path.join(root, m.from.split('/')[0]));
    save();
  }
  for (const top of new Set(moves.map(m => m.from.split('/')[0]))) _prune(path.join(root, top), root);
  manifest.done = Date.now(); save();
  return { ...manifest, manifestPath: rel(root, mf) };
}

function rollback(manifestPath, { root = ROOT } = {}) {
  const m = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
  const restored = [], failed = [];
  for (const x of m.moves) { const d = path.join(root, x.to), s = path.join(root, x.from);
    if (!fs.existsSync(d)) { failed.push({ ...x, why: 'destination missing' }); continue; }
    if (_moveFile(d, s)) restored.push(x.from); else failed.push({ ...x, why: 'hash differs' }); }
  for (const x of m.archived) { const a = path.join(root, x.archivedAt), s = path.join(root, x.from);
    if (fs.existsSync(a) && _moveFile(a, s)) restored.push(x.from); else failed.push({ ...x, why: 'archive copy missing' }); }
  return { restored, failed };
}

function verify(manifestPath, { root = ROOT } = {}) {
  const m = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
  const missing = [], changed = [];
  for (const x of m.moves) { const d = path.join(root, x.to); if (!fs.existsSync(d)) missing.push(x.to); else if (sha(d) !== x.sha256) changed.push(x.to); }
  for (const x of m.archived) { const a = path.join(root, x.archivedAt); if (!fs.existsSync(a)) missing.push(x.archivedAt); }
  return { ok: !missing.length && !changed.length, missing, changed };
}

function toMarkdown(c) {
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const lines = [`# Data census — ${new Date(c.at).toISOString().slice(0, 10)}`, '', `Tree: \`${c.dataDir}\` · ${c.entries.length} files · rules: ${SPEC} \`ownership:\``, '',
    '| goes to | files | size |', '|---|---|---|', ...Object.entries(c.byOwner).sort().map(([k, v]) => `| ${k} | ${v.files} | ${kb(v.bytes)} |`), '',
    '## Code still naming the old paths (rewire before moving)', '', ...Object.entries(c.refs).filter(([, v]) => v.length).map(([k, v]) => `- \`data/${k}\` — ${v.length}: ${v.join(', ')}`), '',
    '## His call (ask)', '', ...c.ask.map(e => `- \`${e.path}\` — ${e.why}`)];
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (n) => rest.includes(`--${n}`); const val = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : null; };
  const root = val('root') ? path.resolve(val('root')) : ROOT;
  const dataDir = val('data') ? path.resolve(val('data')) : path.join(root, 'data');
  if (cmd === 'census' || cmd === 'plan' || cmd === 'apply') {
    const c = census({ root, dataDir });
    if (cmd === 'census') { const md = toMarkdown(c); if (val('out')) fs.writeFileSync(val('out'), md); console.log(md); process.exit(0); }
    const moves = plan(c, { onlyOwner: val('owner'), force: flag('force') });
    const n = (s) => moves.filter(m => m.status === s).length;
    console.log(`${moves.length} file(s): ${n('planned')} planned · ${n('skipped-refs')} wait for rewiring · ${n('ask')} his call`);
    if (cmd === 'plan' || !flag('apply')) { for (const m of moves.slice(0, 200)) console.log(`  ${m.status.padEnd(12)} ${m.from} → ${m.to || '-'}${m.why && m.status !== 'planned' ? `  (${m.why})` : ''}`); if (cmd === 'apply') console.log('\n  dry run — add --apply to move'); process.exit(0); }
    const r = apply(moves, { root, by: val('by') || 'james' });
    console.log(`moved ${r.moves.length} · archived ${r.archived.length} · conflicts ${r.conflicts.length} · failed ${r.failed.length} · manifest ${r.manifestPath}`);
    process.exit(r.failed.length ? 1 : 0);
  }
  if (cmd === 'rollback') { const r = rollback(rest[0], { root }); console.log(`restored ${r.restored.length} · failed ${r.failed.length}`); process.exit(r.failed.length ? 1 : 0); }
  if (cmd === 'verify') { const r = verify(rest[0], { root }); console.log(r.ok ? 'ok' : `missing ${r.missing.length} · changed ${r.changed.length}`); process.exit(r.ok ? 0 : 1); }
  console.error('usage: node lib/data-clearup.js census|plan|apply [--apply] [--owner s] [--force] [--root dir] [--data dir] [--out f] | rollback <manifest> | verify <manifest>');
  process.exit(2);
}

module.exports = { MODULE_ID, VERSION, SPEC, loadRules, match, census, plan, apply, rollback, verify, refsTo, toMarkdown };
