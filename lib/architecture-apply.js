'use strict';
/**
 * lib/architecture-apply.js — the refactor tool's RF2: apply one proposed move, rewrite what points at it, check, keep or undo.
 * comp_id: nexus.lib.architecture-apply
 * UUID: nexus-lib-architecture-apply-v1-0000-2026-1024-jamesbrooks-001
 * Map: docs/2026-10-13-projects-raid-and-gates-phasemap.spec RF2_applied_one_phase_at_a_time · docs/2026-10-24-fifteen-systems-migration-phasemap.spec
 *
 * James, 2026-10-24: "yes start rf2, security goes with remote desktop" · "need the systems soveriegn".
 *
 * plan({ root, dir, homeDir })  → { moves:[{ from, to }], edits:[{ file, line, before, after, kind }], mentions:[{ file, line, text }] }   (dry run)
 *   moves     every tracked file of dir/ → homeDir (the folder keeps its own layout)
 *   edits     only what can be PROVEN to point at a moved file, three kinds:
 *               spec    a relative require()/import specifier that resolves into the moved folder (from outside), or out of it (from inside)
 *               join    a static path.join/resolve (__dirname | *ROOT* | literals) that resolves into the moved folder
 *               path    a string literal that IS a repo path under dir/ (it starts with "dir/" and that file or folder exists)
 *   mentions  the bare folder name in code that was NOT rewritten (a shared-folder list, a config key) — said, for a person to check (§1.2)
 *   .spec     only its contract fields (path:, file:, files:, entry:, module:, component:) — they are live; its prose is history and stays
 * apply(plan, { root })         → performs it: git mv, then the edits (each re-read and matched exactly, or refused)
 * check({ root, plan })         → { ok, problems[] }: every moved/edited .js parses (node --check); every rewritten specifier resolves
 * Undo is git's: each applied move is one commit (scripts/rf2 or the caller), so `git revert <commit>` puts it back (§0.3 reversible).
 * Files under data/ and _archive/ are never edited (state and history, not code).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODULE_ID = 'nexus.lib.architecture-apply';
const VERSION = '1.0.0';
// code and config only: history (CHANGELOG-*, docs/, *.md, *.spec) is never rewritten (§0.3); generated atlases and the README are regenerated
const TEXT_RE = /\.(js|cjs|mjs|ts|json|html|css|yml|yaml)$/i;
const HISTORY = /(^|\/)(docs|CHANGELOG[^/]*|README[^/]*)(\/|$)|\.(md|spec)$/i;
const BASELINE = 'contracts/drawbridge-baseline.json';   // edges "fromFile -> toFile": renamed in place, never added to
const CODE_RE = /\.(js|cjs|mjs|ts)$/i;
const NEVER = /(^|\/)(data|_archive|node_modules)\//;
const SPEC_RE = /(require\(\s*|from\s+|import\(\s*)(['"])(\.{1,2}\/[^'"]*)\2/g;
const JOIN_RE = /\b(?:path\.)?(?:join|resolve)\(([^()]*)\)/g;

function _git(root, args) { return execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString(); }
function _tracked(root) { return _git(root, ['ls-files']).split('\n').filter(Boolean); }
const _posix = (p) => p.split(path.sep).join('/');

/** where a file lives after the move (or where it already lives) */
function _mapper(dir, homeDir) {
  const from = dir.replace(/\/$/, '') + '/', to = homeDir.replace(/\/$/, '') + '/';
  return { from, to, map: (rel) => (rel === from.slice(0, -1) ? to.slice(0, -1) : rel.startsWith(from) ? to + rel.slice(from.length) : rel), inside: (rel) => rel === from.slice(0, -1) || rel.startsWith(from) };
}

/** resolve a relative specifier like node does, against the set of tracked files (no disk read needed) */
function _resolve(fromFile, spec, files) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  for (const c of [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.json`, `${base}.ts`, `${base}/index.js`, `${base}/index.ts`]) if (files.has(c)) return { target: base, file: c };
  return null;
}
function _rel(fromFile, target) {
  let r = path.posix.relative(path.posix.dirname(fromFile), target);
  if (!r.startsWith('.')) r = './' + r;
  return r;
}

function plan({ root, dir, homeDir }) {
  const all = _tracked(root); const files = new Set(all);
  const M = _mapper(dir, homeDir);
  const moves = all.filter(f => M.inside(f)).map(f => ({ from: f, to: M.map(f) }));
  if (!moves.length) return { error: `nothing tracked under ${dir}/` };
  const edits = [], mentions = [];
  const bare = new RegExp(`(['"\`])${dir.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\1`);
  for (const file of all) {
    const specFields = /\.spec$/i.test(file) && !/(^|\/)CHANGELOG/i.test(file);   // a spec's contract fields are live; its prose is history
    if ((!TEXT_RE.test(file) && !specFields) || NEVER.test(file) || (HISTORY.test(file) && !specFields) || file === BASELINE) continue;
    let text; try { text = fs.readFileSync(path.join(root, file), 'utf8'); } catch (_) { continue; }
    if (!text.includes(dir)) continue;
    const newFile = M.map(file); const fileInside = M.inside(file);
    const lines = text.split('\n');
    lines.forEach((ln, i) => {
      let after = ln;
      if (specFields && !/^\s*-?\s*(path|file|files|entry|module|component):/.test(ln)) return;   // in a .spec only the contract fields move
      if (CODE_RE.test(file)) {
        // 1. relative specifiers
        after = after.replace(SPEC_RE, (whole, pre, q, spec) => {
          const r = _resolve(file, spec, files); if (!r) return whole;
          if (!fileInside && !M.inside(r.target) && !M.inside(r.file)) return whole;
          const tgt = M.inside(r.target) ? M.map(r.target) : r.target;
          const ns = _rel(newFile, tgt);
          return ns === spec ? whole : `${pre}${q}${ns}${q}`;
        });
        // 2. static joins — rewrite the literal segments
        after = after.replace(JOIN_RE, (whole, argsTxt) => {
          const args = argsTxt.split(',').map(a => a.trim());
          if (!args.length) return whole;
          let base = null; const lits = [];
          for (let k = 0; k < args.length; k++) {
            const a = args[k];
            if (k === 0 && a === '__dirname') base = path.posix.dirname(file);
            else if (k === 0 && /^[A-Z_]*ROOT[A-Z_]*$/.test(a)) base = '';
            else if (/^(['"])[^'"]*\1$/.test(a)) lits.push(a.slice(1, -1));
            else return whole;
          }
          if (base === null) return whole;
          const target = path.posix.normalize(path.posix.join(base, ...lits));
          if (target.startsWith('..')) return whole;
          if (!fileInside && !M.inside(target)) return whole;
          const newBase = base === '' ? '' : path.posix.dirname(newFile);
          const newTarget = M.inside(target) ? M.map(target) : target;
          if (base === '') { if (!M.inside(target)) return whole; }   // ROOT-relative: only a target inside moves
          const relParts = (base === '' ? newTarget : path.posix.relative(newBase, newTarget)).split('/').filter(Boolean);
          const q = (/'/.test(argsTxt) ? "'" : '"');
          const rebuilt = [args[0], ...relParts.map(p => `${q}${p}${q}`)].join(', ');
          return whole.replace(argsTxt, rebuilt);
        });
      }
      // 3. repo-path string literals: "dir/…" that exist
      after = after.replace(new RegExp(`(['"\`])(${dir.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}/[^'"\`\\s]*)\\1`, 'g'), (whole, q, p) => {
        const clean = p.replace(/\/$/, '');
        const exists = files.has(clean) || all.some(f => f.startsWith(clean + '/'));
        return exists ? `${q}${M.map(clean)}${p.endsWith('/') ? '/' : ''}${q}` : whole;
      });
      if (specFields) after = after.replace(new RegExp(`(^|[\\s\\[,:])(${dir.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}/[^\\s,\\]#]*)`, 'g'), (whole, pre, p) => {
        const clean = p.replace(/\/$/, '').replace(/\{[^}]*\}.*$/, '').replace(/\/$/, '');
        const exists = files.has(clean) || all.some(f => f.startsWith(clean + '/'));
        return exists ? `${pre}${M.map(clean)}${p.slice(clean.length)}` : whole;
      });
      if (after !== ln) edits.push({ file, line: i + 1, before: ln, after, kind: 'rewrite' });
      else if (bare.test(ln) && !/^\s*(\/\/|\*|#)/.test(ln)) mentions.push({ file, line: i + 1, text: ln.trim().slice(0, 200) });
    });
  }
  return { dir, homeDir, moves, edits, mentions };
}

function apply(p, { root }) {
  if (p.error) return { ok: false, error: p.error };
  const target = path.join(root, p.homeDir);
  if (fs.existsSync(target) && fs.readdirSync(target).length) return { ok: false, error: `${p.homeDir} already exists and is not empty — refusing to merge folders` };
  fs.mkdirSync(path.dirname(target.replace(/\/$/, '')), { recursive: true });
  _git(root, ['mv', p.dir.replace(/\/$/, ''), p.homeDir.replace(/\/$/, '')]);
  const byFile = new Map();
  for (const e of p.edits) { const f = p.moves.find(m => m.from === e.file); const at = f ? f.to : e.file; (byFile.get(at) || byFile.set(at, []).get(at)).push(e); }
  const refused = [];
  for (const [file, es] of byFile) {
    const abs = path.join(root, file); const lines = fs.readFileSync(abs, 'utf8').split('\n');
    for (const e of es) { if (lines[e.line - 1] === e.before) lines[e.line - 1] = e.after; else refused.push({ file, line: e.line, why: 'the line changed since the plan' }); }
    fs.writeFileSync(abs, lines.join('\n'));
  }
  // the ratchet's baseline names files: a moved file's edges are renamed so the same crossing is still the same crossing
  const bAbs = path.join(root, BASELINE); let baselineRenamed = 0;
  if (fs.existsSync(bAbs)) {
    const M = _mapper(p.dir, p.homeDir); const b = JSON.parse(fs.readFileSync(bAbs, 'utf8'));
    b.edges = (b.edges || []).map(e => { const [a, c] = e.split(' -> '); const n = `${M.map(a)} -> ${M.map(c)}`; if (n !== e) baselineRenamed++; return n; });
    if (baselineRenamed) { fs.writeFileSync(bAbs, JSON.stringify(b, null, 1) + '\n'); byFile.set(BASELINE, []); }
  }
  _git(root, ['add', '-A', '--', p.homeDir.replace(/\/$/, ''), ...byFile.keys()]);
  return { ok: !refused.length, moved: p.moves.length, edited: [...byFile.keys()].length, baselineRenamed, refused };
}

function check({ root, plan: p }) {
  const problems = [];
  const files = new Set(_tracked(root));
  const touched = new Set([...p.moves.map(m => m.to), ...p.edits.map(e => (p.moves.find(m => m.from === e.file) || {}).to || e.file)]);
  for (const f of touched) {
    if (!/\.(js|cjs)$/.test(f) || !fs.existsSync(path.join(root, f))) continue;
    try { execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); } catch (e) { problems.push(`${f}: does not parse — ${String(e.stderr || e.message).split('\n').find(Boolean)}`); }
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of text.matchAll(SPEC_RE)) if (!_resolve(f, m[3], files) && !/^\.\/?$/.test(m[3])) {
      const old = p.moves.find(x => x.to === f);   // only claim a break the move could have caused: the specifier resolved before
      const before = old ? _resolve(old.from, m[3], new Set([...files].map(x => (p.moves.find(y => y.to === x) || {}).from || x))) : null;
      if (before || p.edits.some(e => e.after.includes(m[3]))) problems.push(`${f}: '${m[3]}' does not resolve`);
    }
  }
  return { ok: !problems.length, problems };
}

module.exports = { MODULE_ID, VERSION, plan, apply, check };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const [dir, homeDir] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!dir || !homeDir) { console.log('usage: node lib/architecture-apply.js <dir> <homeDir> [--apply]   (dry run without --apply)'); process.exit(1); }
  const p = plan({ root, dir, homeDir });
  if (p.error) { console.error(p.error); process.exit(1); }
  console.log(`${dir}/ → ${homeDir}: ${p.moves.length} files move, ${p.edits.length} lines rewritten, ${p.mentions.length} mentions to check`);
  for (const e of p.edits) console.log(`  edit ${e.file}:${e.line}\n    - ${e.before.trim().slice(0, 160)}\n    + ${e.after.trim().slice(0, 160)}`);
  for (const m of p.mentions) console.log(`  mention ${m.file}:${m.line}  ${m.text.slice(0, 140)}`);
  if (process.argv.includes('--apply')) {
    const r = apply(p, { root }); console.log('apply', JSON.stringify(r));
    const c = check({ root, plan: p }); console.log('check', JSON.stringify(c));
    process.exit(r.ok && c.ok ? 0 : 2);
  }
}
