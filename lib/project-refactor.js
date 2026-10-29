'use strict';
/**
 * lib/project-refactor.js — refactor a project through its registry: ask the spine by component id, and the files follow.
 * comp_id: nexus.lib.project-refactor
 * UUID: nexus-lib-project-refactor-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-REFACTOR · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA3
 *
 * James, 2026-10-29: "refactor tool for the architecture to use the component registry as the spine". Who reaches a component is
 * read from the spine's wires (lib/project-spine.js), never a grep; each one is rewritten on the line the wire names. Nothing is
 * written here: move/rename return a plan (each write's before and after), verify re-scans the tree as it would be, and the caller
 * (Idearium's route) applies a verified plan through the repo layer, a version per write.
 *
 *   move(spine, files, { id, to })     → { ok, writes:[{ path, before, after }], moves:[{ from, to }], spine, refused? }
 *   rename(spine, files, { id, name }) → move within the same folder
 *   verify(plan, files)                → { ok, lost:[…] } — no wire that resolved before is unresolved after
 *   applyTo(files, plan)               → the file list as it would be after the plan
 */

const path = require('path');
const S = require('./project-spine.js');

const MODULE_ID = 'nexus.lib.project-refactor';
const VERSION = '1.0.0';

function _find(spine, id) { return spine.components.find(c => c.id === id || c.path === id) || null; }
const _ext = (p) => (/\.[^./]+$/.exec(p) || [''])[0];

/** the spec a file at fromPath writes to reach target, shaped like the spec it wrote before */
function specFor(fromPath, target, oldSpec, adapter) {
  let rel = path.posix.relative(path.posix.dirname(fromPath), target);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  if (adapter === 'documents' && !/^\.{1,2}\//.test(oldSpec)) rel = rel.replace(/^\.\//, '');
  if (adapter === 'javascript' && !_ext(oldSpec.split('/').pop())) {
    rel = rel.replace(/\.(js|cjs|mjs|json|ts)$/, '');
    if (/\/index$/.test(rel) && !/\/index$/.test(oldSpec)) rel = rel.replace(/\/index$/, '') || '.';
  }
  return rel;
}

/** replace the spec on one line (1-based), only where it stands as the quoted / linked text — never elsewhere in the file */
function _replaceOnLine(text, line, oldSpec, newSpec) {
  const lines = text.split('\n'); const i = line - 1;
  if (i < 0 || i >= lines.length) return null;
  const esc = oldSpec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(['"\`(])${esc}(['"\`)#])`, 'g');
  let next = lines[i].replace(re, (_, a, b) => `${a}${newSpec}${b}`);
  if (next === lines[i]) next = lines[i].replace(new RegExp(`(^|[\\s\\[])${esc}(?=$|[\\s),:;\\]])`, 'g'), (_, a) => `${a}${newSpec}`);
  if (next === lines[i]) return null;
  lines[i] = next;
  return lines.join('\n');
}

function move(spine, files, { id, to } = {}) {
  const comp = _find(spine, id);
  if (!comp) return { ok: false, refused: `no component ${id} in the spine — rescan, or name it by its id or path` };
  let target = String(to || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!target) return { ok: false, refused: 'no target path (to)' };
  if (target.endsWith('/')) target += path.posix.basename(comp.path);
  if (target === comp.path) return { ok: false, refused: 'the component is already there' };
  const byPath = new Map(files.map(f => [String(f.path).replace(/\\/g, '/'), f]));
  if (byPath.has(target)) return { ok: false, refused: `${target} is taken — nothing moves over a file (§0.3)` };
  const src = byPath.get(comp.path);
  if (!src || typeof src.content !== 'string') return { ok: false, refused: `${comp.path} is not in the repo's text files` };

  const edits = new Map();   // path → text after
  const said = [];
  const textOf = (p) => (edits.has(p) ? edits.get(p) : (byPath.get(p) || {}).content);
  // 1) every consumer the spine names, on the line its wire names
  for (const w of spine.wires) {
    if (w.toPath !== comp.path || w.fromPath === comp.path || String(w.evidence).startsWith('declared')) continue;
    if (w.evidence === 'discovered:documents (by name)') { said.push(`${w.fromPath}:${w.line} names ${w.spec} in prose — left as written`); continue; }
    const fromComp = spine.components.find(c => c.path === w.fromPath) || {};
    const t = textOf(w.fromPath); if (typeof t !== 'string') continue;
    const nextSpec = specFor(w.fromPath, target, w.spec, fromComp.adapter);
    const r = _replaceOnLine(t, w.line, w.spec, nextSpec);
    if (r == null) { said.push(`${w.fromPath}:${w.line} — '${w.spec}' not found on that line; rescan the spine`); continue; }
    edits.set(w.fromPath, r);
  }
  // 2) the moved file's own relative wires, seen from its new folder
  let moved = src.content;
  for (const w of spine.wires) {
    if (w.fromPath !== comp.path || !w.toPath || !/^\.{1,2}\//.test(w.spec)) continue;
    const nextSpec = specFor(target, w.toPath === comp.path ? target : w.toPath, w.spec, comp.adapter);
    if (nextSpec === w.spec) continue;
    const r = _replaceOnLine(moved, w.line, w.spec, nextSpec);
    if (r == null) said.push(`${comp.path}:${w.line} — its own '${w.spec}' not found on that line`); else moved = r;
  }
  const writes = [...edits.entries()].map(([p, after]) => ({ path: p, before: byPath.get(p).content, after }));
  writes.push({ path: target, before: null, after: moved });
  const plan = { ok: true, op: 'move', id: comp.id, from: comp.path, to: target, writes, moves: [{ from: comp.path, to: target }], said };
  const v = verify(plan, files, spine.project);
  plan.verify = v; plan.spine = v.after;
  if (!v.ok) { plan.ok = false; plan.refused = `the tree after loses ${v.lost.length} wire(s): ${v.lost.slice(0, 5).join('; ')}`; }
  return plan;
}

function rename(spine, files, { id, name } = {}) {
  const comp = _find(spine, id);
  if (!comp) return { ok: false, refused: `no component ${id} in the spine` };
  const n = String(name || '').trim(); if (!n || n.includes('/')) return { ok: false, refused: 'a new file name, without a folder' };
  const base = _ext(n) ? n : `${n}${_ext(comp.path)}`;
  return { ...move(spine, files, { id: comp.id, to: path.posix.join(path.posix.dirname(comp.path), base) }), op: 'rename' };
}

/** the file list as it would be after the plan */
function applyTo(files, plan) {
  const out = new Map(files.map(f => [String(f.path).replace(/\\/g, '/'), { ...f, path: String(f.path).replace(/\\/g, '/') }]));
  for (const m of plan.moves || []) out.delete(m.from);
  for (const w of plan.writes || []) out.set(w.path, { path: w.path, content: w.after });
  for (const d of plan.deletes || []) out.delete(d);
  return [...out.values()];
}

/** verify(plan, files) — every wire that resolved before still resolves after (through the move), none gained an unknown */
function verify(plan, files, project = 'project') {
  const before = S.scan({ files, project });
  const afterFiles = applyTo(files, plan);
  const after = S.scan({ files: afterFiles, project });
  const moved = new Map((plan.moves || []).map(m => [m.from, m.to]));
  const map = (p) => (moved.has(p) ? moved.get(p) : p);
  const key = (w) => `${w.fromPath}→${w.toPath}`;
  const had = new Set(before.wires.filter(w => w.toPath && w.evidence !== 'discovered:documents (by name)').map(w => `${map(w.fromPath)}→${map(w.toPath)}`));
  const has = new Set(after.wires.filter(w => w.toPath).map(key));
  const lost = [...had].filter(k => !has.has(k) && !(plan.expectGone || []).includes(k));
  return { ok: !lost.length && after.unknown <= before.unknown, lost, unknownBefore: before.unknown, unknownAfter: after.unknown, after };
}

module.exports = { MODULE_ID, VERSION, move, rename, verify, applyTo, specFor };
