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
const loom = _require('../../loom/scanners/phasemap-map.js');

export const MODULE_ID = 'nexus.idearium.repo.roadmap-import';
export const VERSION = '1.0.0';

export class RoadmapImportError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const JSON_NAMES = /^(phases|roadmap)\.json$/i;
const MD_NAMES = /^(phasemap|phase-map|roadmap)\.md$/i;
const SRC_ID = /^[A-Z]{1,5}\d+(?:-[A-Z0-9]+)?$/;            // P0, P3-UI, SB12, AP3-X
const NEXUS_ID = /^[A-Z]{1,5}(?:\d+[a-z]?|-[A-Z0-9]+)$/;      // what loom's PHASE_RE takes before the underscore

/** findRoadmaps(paths) — the folders holding a roadmap Idearium cannot read yet; target is the phasemap it would become */
export function findRoadmaps(paths = []) {
  const byDir = new Map();
  for (const p of paths) {
    const s = String(p).replace(/\\/g, '/');
    if (/(^|\/)(node_modules|\.git|_archive|dist|build)\//.test(s)) continue;
    const base = s.split('/').pop(); const dir = s.includes('/') ? s.slice(0, s.lastIndexOf('/')) : '';
    const kind = JSON_NAMES.test(base) ? 'json' : MD_NAMES.test(base) ? 'md' : null;
    if (!kind) continue;
    const e = byDir.get(dir) || { dir, json: null, md: null };
    e[kind] = s; byDir.set(dir, e);
  }
  return [...byDir.values()].map(e => ({ ...e, target: `${e.dir ? `${e.dir}/` : ''}roadmap-phasemap.spec` }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
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
export function parseRoadmapMd(text) {
  const lines = String(text).split(/\r?\n/);
  const items = []; let cur = null;
  for (const l of lines) {
    const h = l.match(/^##\s+([A-Z]{1,5}\d+(?:-[A-Z0-9]+)?)\s*[—–-]\s*(.+)$/);
    if (h) {
      const parts = h[2].split('·').map(x => x.trim());
      const bold = (h[2].match(/\*\*([^*]+)\*\*/) || [])[1] || null;
      cur = { srcId: h[1], name: parts[0].replace(/\*\*/g, '').trim(), subtitle: parts.slice(1).filter(x => !/^\*\*/.test(x)).join(' · ') || null, stateText: bold, exit: null };
      items.push(cur); continue;
    }
    if (/^##\s/.test(l)) { cur = null; continue; }
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
export function importRoadmap({ json = null, md = null, name = 'roadmap', source = {}, date = new Date().toISOString().slice(0, 10) } = {}) {
  const J = json != null ? parsePhasesJson(json) : null;
  const M = md != null ? parseRoadmapMd(md) : null;
  const said = [];
  const order = []; const byId = new Map();
  const touch = (srcId) => { if (!byId.has(srcId)) { byId.set(srcId, { srcId, deps: new Map() }); order.push(srcId); } return byId.get(srcId); };
  for (const it of (J ? J.items : [])) Object.assign(touch(it.srcId), { name: it.name, note: it.note, state: it.state, pct: it.pct, fromJson: true, jsonDeps: it.dependsOn, blocks: it.blocks });
  for (const it of (M ? M.items : [])) { const e = touch(it.srcId); e.mdName = it.name; e.subtitle = it.subtitle; e.stateText = it.stateText; e.exit = it.exit; e.fromMd = true; }
  if (!order.length) throw new RoadmapImportError('NO_PHASES', 'neither file names a phase');
  const jsonFile = source.json || 'the roadmap JSON', mdFile = source.md || 'the roadmap markdown';
  const add = (to, from, why) => { const e = byId.get(to); if (!e || !byId.has(from) || from === to) return false; if (!e.deps.has(from)) e.deps.set(from, why); return true; };
  for (const e of byId.values()) {
    for (const t of e.blocks || []) if (!add(t, e.srcId, `${jsonFile}: ${e.srcId} blocks ${t}`)) said.push(`${jsonFile}: ${e.srcId} blocks ${t}, which is not a phase — not an edge`);
    for (const d of e.jsonDeps || []) if (!add(e.srcId, d, `${jsonFile}: ${e.srcId} depends on ${d}`)) said.push(`${jsonFile}: ${e.srcId} depends on ${d}, which is not a phase — not an edge`);
  }
  for (const [from, to] of (M ? M.chains : [])) add(to, from, `${mdFile} critical path: ${from} → ${to}`);
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
  const block = (p) => {
    const e = byId.get(p.srcId);
    const out = [`    ${p.id}:`, `      status: ${p.status}`];
    if (p.srcId !== p.id.split('_')[0]) out.push(`      source_id: ${_yamlStr(p.srcId)}`);
    out.push(`      title: ${_yamlStr(e.name || e.mdName || p.srcId)}`);
    if (e.state || e.stateText) out.push(`      source_state: ${_yamlStr([e.state, e.stateText].filter(Boolean).join(' · '))}`);
    if (p.pct != null) out.push(`      progress: ${p.pct}`);
    out.push(`      depends_on: [${p.dependsOn.join(', ')}]`);
    if (p.evidence.length) { out.push('      depends_from:'); for (const w of p.evidence) out.push(`        - ${_yamlStr(w)}`); }
    out.push('      does: >-', `        ${_esc(e.note || [e.mdName, e.subtitle].filter(Boolean).join(' — ') || e.name || p.srcId)}`);
    if (e.exit) out.push(`      proof: ${_yamlStr(e.exit)}`);
    out.push('');
    return out.join('\n');
  };
  const sources = [source.json, source.md].filter(Boolean);
  const head = [
    'spec:', '  meta:',
    `    name:    ${name}`,
    '    version: 0.1.0-phasemap',
    `    status:  ${_yamlStr(`IMPORTED ${date} from ${sources.join(' + ') || 'the project\'s roadmap'} by Idearium (roadmap-import ${VERSION}); the source files are kept and stay the project's own words`)}`,
    ...(J && J.meta.thesis ? [`    thesis:  ${_yamlStr(J.meta.thesis)}`] : []),
    ...(J && (J.meta.version != null || J.meta.updated) ? [`    source_version: ${_yamlStr([J.meta.version != null ? `v${J.meta.version}` : null, J.meta.updated].filter(Boolean).join(' · '))}`] : []),
    '    files:   "not named by the source: unknown until mapped (Phases → ⇄ map files & dependencies)"',
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
