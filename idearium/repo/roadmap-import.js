/**
 * idearium/repo/roadmap-import.js — a project's own roadmap, imported as a Nexus phasemap, so the project continues (0.60.199, SD17)
 * comp_id: nexus.idearium.repo.roadmap-import
 * UUID: nexus-idearium-repo-roadmap-import-v1-0000-2026-1021-jamesbrooks-001
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD17_an_imported_project_continues)
 *
 * James, 2026-10-21, uploading MASTERMIND-v0_1_50: "so i can import a project and have it continue? Like the one uploaded" · "yes."
 *
 * Idearium reads a repo's plan only from *-phasemap.spec (loom's isPhasemapFile). A project made elsewhere carries its plan in its
 * own shape — MASTERMIND's phasemap/phases.json (id, name, state, pct, note, blocks) and PHASEMAP.md (one `## P1 — TITLE · … ·
 * **state**` section per phase with a `> **P1 exit:** …` line, and a "Critical path" tree). Imported, nothing of it showed.
 *
 * What it stands on (§8.6): the phase shape idearium/repo/roadmap.js addPhase writes (4-space `ID_slug:`, status, depends_on,
 * does) and its rule that a map is parsed back by loom's own parser before it is returned; the caller writes through the same
 * writer as an added phase (idearium/api/index.js _phaseWrite), so every import is a repo version.
 *
 *   findRoadmaps(paths)                         → [{ dir, json, md, target }]   roadmap files a repo holds, one per folder
 *   parsePhasesJson(text)                       → { meta, items:[{ srcId, name, note, state, pct, blocks, dependsOn }] }
 *   parseRoadmapMd(text)                        → { items:[{ srcId, name, stateText, exit }], chains:[[from, to]] }
 *   importRoadmap({ json, md, name, source })   → { text, phases:[{ id, srcId, status, dependsOn, evidence }], next, said }
 *
 * Evidence (NC0): every depends_on edge names the file it came from; a phase's files are not named by either source, so they are
 * left unknown (never an empty list that would read as "no files") for "map files & dependencies" to fill.
 */
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const loom = _require('../../lib/phasemap-parse.js');   // 0.60.244 SV0: the parser is core's (was loom's: a crossing into loom)

export const MODULE_ID = 'nexus.idearium.repo.roadmap-import';
export const VERSION = '1.1.0';   // 1.1.0 (0.60.221 SD17b): phased specs (SPEC.md), issue lists (ISSUES.md), done by evidence

export class RoadmapImportError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const JSON_NAMES = /^(phases|roadmap)\.json$/i;
const MD_NAMES = /^(phasemap|phase-map|roadmap)\.md$/i;
// §SD17b 0.60.221 — a phased SPEC.md (worker_clean's `## Phase 6 — …`) and an ISSUES.md (core13's open issues); a roadmap name in the
// same folder wins over SPEC.md, and an ISSUES.md is its own map (issues-phasemap.spec). One that names no phase is left out (rankRoadmaps).
const SPEC_NAMES = /^spec\.md$/i;
const ISSUE_NAMES = /^(issues|open-issues|known-issues)\.md$/i;
const SRC_ID = /^[A-Z]{1,5}\d+(?:-[A-Z0-9]+)?$/;            // P0, P3-UI, SB12, AP3-X
const NEXUS_ID = /^[A-Z]{1,5}(?:\d+[a-z]?|-[A-Z0-9]+)$/;      // what loom's PHASE_RE takes before the underscore

/** findRoadmaps(paths) — the folders holding a roadmap Idearium cannot read yet; target is the phasemap it would become */
export function findRoadmaps(paths = []) {
  const byDir = new Map(), issues = [];
  for (const p of paths) {
    const s = String(p).replace(/\\/g, '/');
    if (/(^|\/)(node_modules|\.git|_archive|dist|build|vendor)\//.test(s)) continue;
    const base = s.split('/').pop(); const dir = s.includes('/') ? s.slice(0, s.lastIndexOf('/')) : '';
    if (ISSUE_NAMES.test(base)) { issues.push({ dir, json: null, md: s, kind: 'issues', target: `${dir ? `${dir}/` : ''}issues-phasemap.spec` }); continue; }
    const kind = JSON_NAMES.test(base) ? 'json' : MD_NAMES.test(base) ? 'md' : SPEC_NAMES.test(base) ? 'spec' : null;
    if (!kind) continue;
    const e = byDir.get(dir) || { dir, json: null, md: null, specMd: null };
    if (kind === 'spec') e.specMd = s; else e[kind] = s;
    byDir.set(dir, e);
  }
  const maps = [...byDir.values()].map(e => ({ dir: e.dir, json: e.json, md: e.md || e.specMd, ...(e.md ? {} : e.specMd ? { kind: 'spec' } : {}),
    target: `${e.dir ? `${e.dir}/` : ''}roadmap-phasemap.spec` }));
  return [...maps, ...issues].sort((a, b) => a.dir.localeCompare(b.dir) || String(a.kind || '').localeCompare(String(b.kind || '')));
}

/**
 * rankRoadmaps(found, read) — 0.60.200: MASTERMIND holds nine files with roadmap names (its phasemap/, docs/PHASEMAP.md, and
 * Roadmap.md files inside archived folders under unintegrated/). Each is parsed and counted; one that yields no phase is not a
 * roadmap (left out, said in `ignored`). The primary is the one with a JSON roadmap (machine-kept state), then the most phases,
 * then the shallowest folder; it is what an import with no folder named takes.
 */
export function rankRoadmaps(found = [], read = () => null) {
  const kept = [], ignored = [];
  for (const r of found) {
    let n = 0, why = null;
    try { const J = r.json ? parsePhasesJson(read(r.json) || '') : null; const M = r.md ? parseRoadmapMd(read(r.md) || '') : null;
      n = new Set([...(J ? J.items : []), ...(M ? M.items : [])].map(i => i.srcId)).size; }
    catch (e) { why = e.message; }
    if (n) kept.push({ ...r, phases: n }); else ignored.push({ dir: r.dir, files: [r.json, r.md].filter(Boolean), why: why || 'names no phase' });   // a contract SPEC.md (core13's) names none: left out, said
  }
  const depth = (d) => (d ? d.split('/').length : 0);
  kept.sort((a, b) => (!!b.json - !!a.json) || (b.phases - a.phases) || (depth(a.dir) - depth(b.dir)) || a.dir.localeCompare(b.dir));
  return { roadmaps: kept.map((r, i) => ({ ...r, primary: i === 0 })), ignored };
}

/** parsePhasesJson(text) — { phases: [...] } or a bare array; any item without an id is skipped and counted */
export function parsePhasesJson(text) {
  let j; try { j = JSON.parse(text); } catch (e) { throw new RoadmapImportError('BAD_JSON', `the roadmap JSON does not parse: ${e.message}`); }
  const list = Array.isArray(j) ? j : Array.isArray(j && j.phases) ? j.phases : null;
  if (!list) throw new RoadmapImportError('NO_PHASES', 'the roadmap JSON has no phases list');
  const items = []; let skipped = 0;
  for (const p of list) {
    const srcId = p && String(p.id || '').trim();
    if (!srcId) { skipped++; continue; }
    const arr = (v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(/[,\s]+/).filter(Boolean) : []);
    items.push({ srcId, name: String(p.name || p.title || srcId), note: p.note || p.description || p.does || '', state: p.state || p.status || null,
      pct: Number.isFinite(Number(p.pct ?? p.progress)) ? Number(p.pct ?? p.progress) : null,
      blocks: arr(p.blocks), dependsOn: arr(p.depends_on || p.dependsOn || p.after) });
  }
  return { meta: { thesis: (j && j.thesis) || null, version: (j && j.version) ?? null, updated: (j && j.updated) || null }, items, skipped };
}

/** parseRoadmapMd(text) — one item per `## <ID> — TITLE …` heading; the "Critical path" tree's chains */
export function parseRoadmapMd(text, opts = {}) {
  if (/^##\s+Phase\s+\d+(?:\.\d+)?\s*[—–-]/m.test(String(text))) return parsePhasedSpecMd(text, opts);
  if (/^#\s+(open\s+issues|issues|known\s+issues)\b/im.test(String(text))) return parseIssuesMd(text);
  const lines = String(text).split(/\r?\n/);
  const items = []; let cur = null;
  for (const l of lines) {
    const h = l.match(/^##\s+([A-Z]{1,5}\d+(?:-[A-Z0-9]+)?)\s*[—–-]\s*(.+)$/);
    if (h) {
      const parts = h[2].split('·').map(x => x.trim());
      const bold = (h[2].match(/\*\*([^*]+)\*\*/) || [])[1] || null;
      cur = { srcId: h[1], name: parts[0].replace(/\*\*/g, '').trim(), subtitle: parts.slice(1).filter(x => !/^\*\*/.test(x)).join(' · ') || null, stateText: bold, exit: null, paths: [] };
      items.push(cur); continue;
    }
    if (/^##\s/.test(l)) { cur = null; continue; }
    // 0.60.200 — the files a section names (`schemas/node.schema.json`): carried as named_in_source, so the file mapper finds them
    // as evidence with no model (MASTERMIND's sections name files for 8 of its 16 phases)
    if (cur) for (const m of l.matchAll(/`([A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]+)+)`/g)) if (/\.[A-Za-z0-9]+$/.test(m[1].split('/').pop()) && !cur.paths.includes(m[1]) && cur.paths.length < 12) cur.paths.push(m[1]);   // a file: its last part has an extension (not `EXPR/POSTURE/GAZE`)
    const ex = cur && l.match(/^>\s*\*\*\s*[A-Z0-9-]+\s+exit:?\s*\*\*\s*(.*)$/i);
    if (ex) { cur.exit = ex[1].trim(); continue; }
    if (cur && cur.exit && /^>\s*/.test(l) && l.replace(/^>\s*/, '').trim()) cur.exit += ' ' + l.replace(/^>\s*/, '').trim();
  }
  // the critical path: the fenced block under a heading naming it; each line's ids in order are a chain, and a line's first id
  // follows the first id of the nearest line above it with less indentation (the tree)
  const chains = [];
  const at = lines.findIndex(l => /^#{2,3}\s+critical path/i.test(l));
  if (at >= 0) {
    const open = lines.findIndex((l, i) => i > at && /^```/.test(l));
    const close = open >= 0 ? lines.findIndex((l, i) => i > open && /^```/.test(l)) : -1;
    const stack = [];
    for (const l of open >= 0 && close > open ? lines.slice(open + 1, close) : []) {
      const ids = [...l.matchAll(/(?<![A-Za-z0-9-])([A-Z]{1,5}\d+(?:-[A-Z0-9]+)?)(?![A-Za-z0-9])/g)].map(m => ({ id: m[1], col: m.index }));
      if (!ids.length) continue;
      const col = ids[0].col;
      while (stack.length && stack[stack.length - 1].col >= col) stack.pop();
      // a line the source annotates as unblocked keeps its place in the tree but gets no edge from it
      if (stack.length && !/unblocked|independent|no dependenc/i.test(l)) chains.push([stack[stack.length - 1].id, ids[0].id]);
      for (let i = 1; i < ids.length; i++) chains.push([ids[i - 1].id, ids[i].id]);
      stack.push({ id: ids[0].id, col });
    }
  }
  return { items, chains };
}


// a path a source names: `lib/x.js`, `index.php`, public/js/ui/map.js — its last part has an extension; a sentence word does not
const PATH_RE = /(?:^|[\s`(\[])((?:[A-Za-z0-9_.\-]+\/)*[A-Za-z0-9_\-][A-Za-z0-9_.\-]*\.[A-Za-z][A-Za-z0-9]{0,5})(?=[\s`),:;\]]|$)/g;
const _pathsIn = (line) => [...String(line).matchAll(PATH_RE)].map(m => m[1]).filter(p => !/^\d+(\.\d+)+$/.test(p) && !/^(e\.g|i\.e|v\d)/i.test(p));

/**
 * parsePhasedSpecMd(text) — §SD17b: a phased development spec (worker_clean's SPEC.md). `## Phase 6 — Title` is a phase; its
 * **Goal:** is what it does; the files its `### Changelog.N` adds or changes ([ADDED]/[CHANGED] path) and its "What to build"
 * bullets name are its files; `added` keeps the [ADDED] ones (done-by-evidence when they all exist). A "Completed Phases" table's
 * rows (`| 4 | Summary |`) are phases already done. The numbering is the order: each phase after the one before (said so).
 */
export function parsePhasedSpecMd(text, { statusTables = [] } = {}) {
  const lines = String(text).split(/\r?\n/);
  const items = []; let cur = null, sect = null, inTable = false, goal = false;
  const idOf = (n) => `P${String(n).replace('.', '-')}`;
  for (const l of lines) {
    if (/^##\s+completed phases/i.test(l)) { inTable = true; cur = null; continue; }
    const h = l.match(/^##\s+Phase\s+(\d+(?:\.\d+)?)\s*[—–-]\s*(.+)$/);
    if (h) { inTable = false; cur = { srcId: idOf(h[1]), name: h[2].replace(/\*\*/g, '').trim(), subtitle: null, stateText: null, exit: null, goal: '', paths: [], added: [], order: Number(h[1]) }; items.push(cur); sect = null; goal = false; continue; }
    if (/^##\s/.test(l)) { cur = null; inTable = false; continue; }
    if (inTable) { const r = l.match(/^\|\s*(\d+(?:\.\d+)?)\s*\|\s*(.+?)\s*\|\s*$/); if (r) items.push({ srcId: idOf(r[1]), name: r[2].split('—')[0].trim(), subtitle: r[2].includes('—') ? r[2].split('—').slice(1).join('—').trim() : null, stateText: 'done (Completed Phases table)', exit: null, goal: r[2], paths: [], added: [], order: Number(r[1]) }); continue; }
    if (!cur) continue;
    const g = l.match(/^\*\*Goal:\*\*\s*(.*)$/); if (g) { cur.goal = g[1].trim(); goal = true; continue; }
    if (goal) { if (l.trim() && !/^#/.test(l)) { cur.goal += ' ' + l.trim(); continue; } goal = false; }
    const sh = l.match(/^###\s+(.+)$/); if (sh) { sect = /changelog/i.test(sh[1]) ? 'changelog' : /manifest/i.test(sh[1]) ? 'manifest' : /what to build/i.test(sh[1]) ? 'build' : 'other'; continue; }
    const add = (p, isAdded) => { if (!p || cur.paths.includes(p)) { if (isAdded && p && !cur.added.includes(p)) cur.added.push(p); return; } if (cur.paths.length < 40) cur.paths.push(p); if (isAdded && !cur.added.includes(p)) cur.added.push(p); };
    if (sect === 'changelog') { const c = l.match(/^\[(ADDED|CHANGED)\]\s+(\S+)/); if (c) add(c[2].replace(/[`,]+$/, ''), c[1] === 'ADDED'); continue; }
    if (sect === 'build' && /^\s*[-*]\s+`/.test(l)) { const m = l.match(/`([^`]+\.[A-Za-z0-9]+)`/); if (m && !/\s/.test(m[1])) add(m[1], false); }
  }
  // one id per phase: a phase both in the table and described below keeps the description, with the table's done state
  const byId = new Map();
  for (const it of items) { const had = byId.get(it.srcId); if (!had) byId.set(it.srcId, it); else { if (it.stateText && !had.stateText) had.stateText = it.stateText; if (it.paths.length) Object.assign(had, { paths: it.paths, added: it.added, goal: it.goal || had.goal }); } }
  // the project's own status table beside the spec (README.md "Project status": `| 5.1 | … |`) — what it says is done is done, by
  // its own record; a phase it names that the spec does not (5.1, 5.2: ports between phases) joins in its place in the order
  for (const t of statusTables) {
    const tl = String(t.text || '').split(/\r?\n/); let on = false;
    for (const l of tl) {
      if (/^\|\s*phase\s*\|/i.test(l)) { on = true; continue; }
      if (on && /^\|\s*-/.test(l)) continue;
      const r = on && l.replace(/\*\*/g, '').match(/^\|\s*(\d+(?:\.\d+)?)\s*\|\s*(.+?)\s*\|\s*$/);
      if (!r) { if (on && !/^\|/.test(l)) on = false; continue; }
      const id = idOf(r[1]), why = `done (${t.path || 'the project status table'})`;
      const had = byId.get(id);
      if (had) { if (!/done/i.test(had.stateText || '')) had.stateText = why; }
      else byId.set(id, { srcId: id, name: r[2].split(/[—;(]/)[0].trim(), subtitle: null, stateText: why, exit: null, goal: r[2], paths: [], added: [], order: Number(r[1]) });
    }
  }
  const list = [...byId.values()].sort((a, b) => a.order - b.order);
  const chains = []; for (let i = 1; i < list.length; i++) chains.push([list[i - 1].srcId, list[i].srcId]);
  return { items: list.map(({ order, ...x }) => ({ ...x, subtitle: x.subtitle || null })), chains, chainWhy: 'the phases are numbered in order' , shape: 'phased-spec' };
}

/**
 * parseIssuesMd(text) — §SD17b: an open-issues list (core13's doc/ISSUES.md). Each top-level bullet under a `## group` is an open
 * item (IS1, IS2 …), its group kept; a group that says it is other projects' work is not imported (said in `skipped`); "Deferred"
 * and "named, not fixed" groups keep those words as the item's state. Issues have no order between them: no chains.
 */
export function parseIssuesMd(text) {
  const lines = String(text).split(/\r?\n/);
  const items = [], skipped = []; let group = null, cur = null, n = 0;
  const foreign = (g) => /not this project|cross-project|for consumers/i.test(g);
  const close = () => { if (cur) { cur.text = cur.text.replace(/\s+/g, ' ').trim(); for (const p of _pathsIn(cur.text)) if (!cur.paths.includes(p) && cur.paths.length < 12) cur.paths.push(p); cur.name = (cur.text.match(/^(.{8,90}?[.:;])(\s|$)/) || [null, cur.text.slice(0, 90)])[1]; cur.goal = cur.text; cur = null; } };
  for (const l of lines) {
    const h = l.match(/^##\s+(.+)$/);
    if (h) { close(); group = h[1].trim(); continue; }
    if (!group) continue;
    const b = l.match(/^[-*]\s+(.*)$/);
    if (b) {
      close();
      if (foreign(group)) { skipped.push({ group, text: b[1].slice(0, 120) }); cur = null; continue; }
      const st = /deferred/i.test(group) ? 'deferred' : /named,?\s+not\s+fixed/i.test(group) ? 'named, not fixed (an accepted risk)' : 'open';
      cur = { srcId: `IS${++n}`, name: '', subtitle: group, stateText: st, exit: null, goal: '', text: b[1], paths: [], added: [] }; items.push(cur); continue;
    }
    if (cur && /^\s{2,}\S/.test(l)) { cur.text += ' ' + l.trim(); continue; }
    if (cur && !l.trim()) continue;
    if (cur && /^\S/.test(l)) close();
  }
  close();
  return { items, chains: [], skipped, shape: 'issues' };
}

const _slug = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'phase';
const _esc = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const _yamlStr = (s) => `"${_esc(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** the project's id when loom's parser takes it, else the nearest form it takes (P3-UI → P3u), the original kept as source_id */
function _nexusId(srcId, taken) {
  let base = NEXUS_ID.test(srcId) ? srcId : null;
  if (!base) { const m = srcId.match(/^([A-Z]{1,5})(\d+)-([A-Z0-9]+)$/); base = m ? `${m[1]}${m[2]}${m[3][0].toLowerCase()}` : srcId.replace(/[^A-Za-z0-9]/g, ''); }
  let id = base, n = 0;
  while (taken.has(id)) id = `${base.replace(/[a-z]$/, '')}${String.fromCharCode(97 + (++n))}`;
  taken.add(id);
  return id;
}

/** state (and percent) → loom's status: done | in-progress | pending — the source's own words are kept beside it */
function _status(state, pct, stateText) {
  const s = String(state || stateText || '').toLowerCase();
  if (/\bdone\b|complete|finished|shipped/.test(s) || pct === 100) return 'done';
  if (/partial|progress|active|started|begun|written|specified/.test(s) || (pct != null && pct > 0)) return 'in-progress';
  return 'pending';
}

/**
 * importRoadmap({ json, md, name, source }) — the Nexus phasemap text for a project's roadmap. json and md are file texts (either may
 * be null); source names them ({ json: path, md: path }) for the evidence. Refuses when neither yields a phase, or when the result
 * would not parse back the same.
 */
export function importRoadmap({ json = null, md = null, name = 'roadmap', source = {}, date = new Date().toISOString().slice(0, 10), exists = null, statusTables = [] } = {}) {
  const J = json != null ? parsePhasesJson(json) : null;
  const M = md != null ? parseRoadmapMd(md, { statusTables }) : null;
  const said = [];
  const order = []; const byId = new Map();
  const touch = (srcId) => { if (!byId.has(srcId)) { byId.set(srcId, { srcId, deps: new Map() }); order.push(srcId); } return byId.get(srcId); };
  for (const it of (J ? J.items : [])) Object.assign(touch(it.srcId), { name: it.name, note: it.note, state: it.state, pct: it.pct, fromJson: true, jsonDeps: it.dependsOn, blocks: it.blocks });
  for (const it of (M ? M.items : [])) { const e = touch(it.srcId); e.mdName = it.name; e.subtitle = it.subtitle; e.stateText = it.stateText; e.exit = it.exit; e.paths = it.paths || []; e.fromMd = true;
    if (it.goal && !e.note) e.note = it.goal;
    // §SD17b — done by evidence: every file its changelog adds is already in the repo (the caller's exists(), the repo's own files)
    if (typeof exists === 'function' && (it.added || []).length && !/done/i.test(e.stateText || '') && it.added.every(p => exists(p))) e.stateText = `done (every file its changelog adds exists: ${it.added.length})`; }
  if (M && M.skipped && M.skipped.length) said.push(`not imported, the source says they are other projects' work: ${M.skipped.length} item(s) under ${[...new Set(M.skipped.map(x => `"${x.group}"`))].join(', ')}`);
  if (!order.length) throw new RoadmapImportError('NO_PHASES', 'neither file names a phase');
  // an edge names its file by its bare name: a path in a phase's text is read as a file the phase changes (lib/phase-files.js
  // candidates), and the roadmap is not what a phase builds (0.60.200 — MASTERMIND's P1 was mapped to phasemap/phases.json).
  // The full paths are in the map's meta (status), outside every phase.
  const base = (p) => String(p).split('/').pop();
  const jsonFile = source.json ? base(source.json) : 'the roadmap JSON', mdFile = source.md ? base(source.md) : 'the roadmap markdown';
  const add = (to, from, why) => { const e = byId.get(to); if (!e || !byId.has(from) || from === to) return false; if (!e.deps.has(from)) e.deps.set(from, why); return true; };
  for (const e of byId.values()) {
    for (const t of e.blocks || []) if (!add(t, e.srcId, `${jsonFile}: ${e.srcId} blocks ${t}`)) said.push(`${jsonFile}: ${e.srcId} blocks ${t}, which is not a phase — not an edge`);
    for (const d of e.jsonDeps || []) if (!add(e.srcId, d, `${jsonFile}: ${e.srcId} depends on ${d}`)) said.push(`${jsonFile}: ${e.srcId} depends on ${d}, which is not a phase — not an edge`);
  }
  for (const [from, to] of (M ? M.chains : [])) add(to, from, `${mdFile} ${M.chainWhy || 'critical path'}: ${from} → ${to}`);
  if (J && J.skipped) said.push(`${jsonFile}: ${J.skipped} item(s) without an id were not imported`);
  if (J && M) { const onlyMd = M.items.filter(i => !J.items.some(j => j.srcId === i.srcId)).map(i => i.srcId); if (onlyMd.length) said.push(`only in ${mdFile}: ${onlyMd.join(', ')}`); }

  // a cycle in the source is said and its closing edge dropped (the DAG would refuse the whole map otherwise)
  const seen = new Set(), on = new Set();
  const visit = (id) => {
    seen.add(id); on.add(id);
    for (const d of [...byId.get(id).deps.keys()]) {
      if (on.has(d)) { said.push(`cycle in the source: ${d} ⇄ ${id} — the edge ${d} → ${id} (${byId.get(id).deps.get(d)}) was dropped`); byId.get(id).deps.delete(d); }
      else if (!seen.has(d)) visit(d);
    }
    on.delete(id);
  };
  for (const id of order) if (!seen.has(id)) visit(id);

  const taken = new Set(); const ids = new Map();
  for (const srcId of order) ids.set(srcId, `${_nexusId(srcId, taken)}_${_slug(byId.get(srcId).name || byId.get(srcId).mdName || srcId)}`);
  const phases = order.map(srcId => {
    const e = byId.get(srcId);
    return { id: ids.get(srcId), srcId, status: _status(e.state, e.pct, e.stateText), pct: e.pct ?? null,
      dependsOn: [...e.deps.keys()].map(d => ids.get(d)), evidence: [...e.deps.values()] };
  });
  const sources = [source.json, source.md].filter(Boolean);
  const block = (p) => {
    const e = byId.get(p.srcId);
    const out = [`    ${p.id}:`, `      status: ${p.status}`];
    if (p.srcId !== p.id.split('_')[0]) out.push(`      source_id: ${_yamlStr(p.srcId)}`);
    out.push(`      title: ${_yamlStr(e.name || e.mdName || p.srcId)}`);
    if (e.state || e.stateText) out.push(`      source_state: ${_yamlStr([e.state, e.stateText].filter(Boolean).join(' · '))}`);
    if (p.pct != null) out.push(`      progress: ${p.pct}`);
    out.push(`      depends_on: [${p.dependsOn.join(', ')}]`);
    if (p.evidence.length) { out.push('      depends_from:'); for (const w of p.evidence) out.push(`        - ${_yamlStr(w)}`); }
    // the roadmap's own files are never a phase's (a phase does not build its plan)
    const named = (e.paths || []).filter(x => !(sources.includes(x) || /(^|\/)(phases|roadmap)\.json$|(^|\/)(phasemap|phase-map|roadmap)\.md$/i.test(x)));
    if (named.length) out.push(`      named_in_source: [${named.join(', ')}]`);
    out.push('      does: >-', `        ${_esc(e.note || [e.mdName, e.subtitle].filter(Boolean).join(' — ') || e.name || p.srcId)}`);
    if (e.exit) out.push(`      proof: ${_yamlStr(e.exit)}`);
    out.push('');
    return out.join('\n');
  };
  const head = [
    'spec:', '  meta:',
    `    name:    ${name}`,
    '    version: 0.1.0-phasemap',
    `    status:  ${_yamlStr(`IMPORTED ${date} from ${sources.join(' + ') || 'the project\'s roadmap'} by Idearium (roadmap-import ${VERSION}); the source files are kept and stay the project's own words`)}`,
    ...(J && J.meta.thesis ? [`    thesis:  ${_yamlStr(J.meta.thesis)}`] : []),
    ...(J && (J.meta.version != null || J.meta.updated) ? [`    source_version: ${_yamlStr([J.meta.version != null ? `v${J.meta.version}` : null, J.meta.updated].filter(Boolean).join(' · '))}`] : []),
    (phases.some(p => (byId.get(p.srcId).paths || []).length) ? '    files:   "named by the source per phase (named_in_source: its changelog and build list, or the paths an issue names); the rest unknown until mapped"'
      : '    files:   "not named by the source: unknown until mapped (Phases → ⇄ map files & dependencies)"'),
    ...(M && M.shape ? [`    source_shape: ${M.shape}`] : []),
    ...(said.length ? ['    said:', ...said.map(w => `      - ${_yamlStr(w)}`)] : []),
    '', '  phases:', '',
  ].join('\n');
  const text = head + phases.map(block).join('\n');

  const back = loom.parsePhasemapText(text, name);
  if (back.length !== phases.length || phases.some(p => !back.find(b => b.id === p.id && b.status === p.status)))
    throw new RoadmapImportError('ROUNDTRIP_FAILED', `the imported map does not read back: ${phases.length} written, ${back.length} parsed`);
  // the next to build: not done, every dependency done; on the critical path first (the most phases waiting downstream)
  const done = new Set(phases.filter(p => p.status === 'done').map(p => p.id));
  const downstream = (id, acc = new Set()) => { for (const p of phases) if (p.dependsOn.includes(id) && !acc.has(p.id)) { acc.add(p.id); downstream(p.id, acc); } return acc; };
  const ready = phases.filter(p => !done.has(p.id) && p.dependsOn.every(d => done.has(d)))
    .map(p => ({ id: p.id, srcId: p.srcId, waiting: downstream(p.id).size })).sort((a, b) => b.waiting - a.waiting);
  return { text, phases, next: ready, said };
}
