/**
 * idearium/repo/roadmap.js — a repo's roadmap, from the phasemaps inside it (MCO-E).
 * UUID: nexus-idearium-repo-roadmap-v1-0000-2026-0920-jamesbrooks-001
 * Spec: idearium/spec/idearium.repo-roadmap.spec (written first, §8.5).
 *
 * §RENDER LAYER ONLY, and no second source of truth. The phases are the ones in
 * the repo's own `*phasemap*.spec` files, read by LOOM'S parser
 * (loom/scanners/phasemap-map.js parsePhasemapText — the same code loom's
 * roadmap uses on docs/, extracted so this reuses it rather than forking it).
 * A phase_node (idearium/schemas/schema.phase_node) is a derived view of one
 * of those phase entries, produced on every read and never stored, so it cannot
 * drift from the file. An edit changes the file, which is the row loom's
 * scanner reads.
 *
 * §DEPENDENCY-RESPECTING. `depends_on: [MCO0]` names a phase by its key (the id
 * up to the first underscore); an exact id also resolves. Phases are layered
 * (layer 0 = no unresolved dependency) and numbered so every resolved
 * dependency has a lower `order` than its dependent. A cycle, an ambiguous
 * reference and a reference to something that is not a phase in this map
 * (`nexus-repository-system.spec`, a URL) are reported as warnings, never
 * dropped: a cycle's members get layer:null and sort last.
 *
 * §EDITS ARE PROVEN. setPhaseStatus rewrites one phase's `status:` value and
 * then re-parses the result with loom's parser. If the target phase does not
 * read back as requested, or ANY other phase's id/status/dependency changed, or
 * a file that was valid YAML no longer is, the edit is refused and nothing is
 * returned to write. The previous status value is not thrown away: it moves to
 * a `status_previous:` key and a `# roadmap edit` comment, both placed ABOVE the
 * `status:` line (loom's status reader looks at that line and the three after it).
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { loadSourceManifest, sourcePathSet } from './source-files.js';
const _require = createRequire(import.meta.url);
const loom = _require('../../loom/scanners/phasemap-map.js');
let _yaml = null;
try { _yaml = _require('js-yaml'); } catch (_) { /* validity check skipped if unavailable */ }

export const MODULE_ID = 'nexus-idearium-repo-roadmap-v1-0000-2026-0920-jamesbrooks-001';
export const EDITABLE_STATUSES = ['planned', 'active', 'complete'];
const LOOM_TO_NODE = { done: 'complete', 'in-progress': 'active', pending: 'planned' };
const NODE_TO_LOOM = { complete: 'done', active: 'in-progress', planned: 'pending' };

export class RoadmapError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

export function isPhasemapPath(p) {
  return loom.isPhasemapFile(String(p).split('/').pop());
}

const MAX_MAP_BYTES = parseInt(process.env.IDEARIUM_ROADMAP_MAX_MAP_BYTES || String(2 * 1024 * 1024), 10);

/**
 * collectPhasemaps(repo, repoDir) -> { maps:[{path, text}], skipped:[{path, reason}] }
 * The repo's phasemap files: its file list plus the source layer's, filtered by
 * loom's own definition of a phasemap filename, read from disk.
 */
export function collectPhasemaps(repo, repoDir) {
  const seen = new Set(); const paths = [];
  const add = (p) => { if (typeof p === 'string' && !seen.has(p) && isPhasemapPath(p)) { seen.add(p); paths.push(p); } };
  for (const f of (repo && repo.files) || []) add(f && f.path);
  const man = loadSourceManifest(repoDir);
  if (man && !man.unreadable) for (const p of sourcePathSet(man)) add(p);
  const root = path.resolve(repoDir); const maps = []; const skipped = [];
  for (const rel of paths.sort()) {
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) { skipped.push({ path: rel, reason: 'resolves outside the repo directory' }); continue; }
    let st; try { st = fs.lstatSync(abs); } catch (_) { skipped.push({ path: rel, reason: 'not on disk' }); continue; }
    if (!st.isFile()) { skipped.push({ path: rel, reason: 'not a regular file' }); continue; }
    if (st.size > MAX_MAP_BYTES) { skipped.push({ path: rel, reason: `over the ${MAX_MAP_BYTES}-byte limit` }); continue; }
    const buf = fs.readFileSync(abs); const text = buf.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(buf)) { skipped.push({ path: rel, reason: 'not valid UTF-8' }); continue; }
    maps.push({ path: rel, text });
  }
  return { maps, skipped };
}

const keyOf = (id) => id.split('_')[0];
const mapNameOf = (p) => String(p).split('/').pop().replace(/\.spec$/, '');
// A YAML flow list separates with commas. A prose dependency ("the auth spec") is ONE
// token, not three: splitting on spaces made each word an 'unresolved dependency'.
const splitDeps = (s) => (s || '').split(',').map(x => x.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean);

/**
 * buildRoadmap({ projectId, maps:[{ path, text }] })
 * -> { project_id, maps, phases, layers, warnings, summary }
 */
export function buildRoadmap({ projectId, maps = [] } = {}) {
  if (!projectId) throw new RoadmapError('BAD_INPUT', 'projectId is required');
  const warnings = [];
  const nodes = [];
  const mapInfo = [];
  const crossPending = [];   // §0.39.275 — dependencies naming a phase in ANOTHER map, resolved once every map is read

  maps.forEach((m, mapIdx) => {
    const name = mapNameOf(m.path);
    const parsed = loom.parsePhasemapText(m.text, name);
    // loom counts every header-shaped line, including dict entries that repeat a
    // phase id further down the file. The FIRST is the phase; later ones are noted.
    const seen = new Map(); const mine = [];
    for (const p of parsed) {
      if (seen.has(p.id)) { seen.get(p.id).dups++; continue; }
      const rec = { p, dups: 0 }; seen.set(p.id, rec); mine.push(rec);
    }
    for (const rec of mine) if (rec.dups) warnings.push({ type: 'duplicate_phase_id', map: m.path, phase: rec.p.id, count: rec.dups + 1, note: 'the first entry is the phase; later header-shaped lines with the same id are not edited' });
    mapInfo.push({ path: m.path, name, phaseCount: mine.length });

    const byKey = new Map(); const byId = new Map();
    for (const rec of mine) { byId.set(rec.p.id, rec.p); const k = keyOf(rec.p.id); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(rec.p); }
    for (const rec of mine) {
      const p = rec.p;
      const uuid = `${projectId}:${m.path}:${p.id}`;
      const deps = []; const unresolved = [];
      for (const tok of splitDeps(p.dependsOn)) {
        const exact = byId.get(tok);
        const cands = exact ? [exact] : (byKey.get(tok) || []);
        if (cands.length === 1 && cands[0].id !== p.id) deps.push(`${projectId}:${m.path}:${cands[0].id}`);
        else if (cands.length === 1) warnings.push({ type: 'self_dependency', map: m.path, phase: p.id });
        else if (cands.length > 1) { unresolved.push(tok); warnings.push({ type: 'ambiguous_dependency', map: m.path, phase: p.id, token: tok, candidates: cands.map(c => c.id) }); }
        else {
          unresolved.push(tok);
          const w = { type: 'unresolved_dependency', map: m.path, phase: p.id, token: tok, note: 'not a phase in this phasemap; it does not order or block anything' };
          warnings.push(w);
          crossPending.push({ node: () => byUuid.get(uuid), tok, w, mapPath: m.path });
        }
      }
      // §0.39.271 P2 — a list-form phase ("- id: T1", loom P1) has no slug after its key;
      // its title is its name:. Key-form titles are unchanged.
      const slugTitle = p.id.slice(keyOf(p.id).length + 1).replace(/_/g, ' ');
      const nm = p.name ? String(p.name).replace(/\s+/g, ' ').trim() : '';
      nodes.push({
        uuid, project_id: projectId, order: 0,
        title: `${keyOf(p.id)} · ${slugTitle || (p.form === 'list' && nm ? nm : '') || p.id}`,
        status: LOOM_TO_NODE[p.status] || 'planned',
        depends_on: deps, module_path: null,
        // additive fields (schema.phase_node, optional)
        map: m.path, phase_key: p.id, line: p.line + 1,
        ...(p.shelf ? { shelf: true } : {}),   // §HP9 0.55.1 — the declutter's shelf: kept, never the queue
        unresolved_deps: unresolved, blocked_by: [], ready: false, layer: null,
        // §0.39.271 P2 — what the phase says it does, closes and touches (loom P1)
        name: nm || null, closes: p.closes || [], files: p.files || [], systems: p.systems || [], blocks: p.blocks || [], form: p.form || 'key',   // §RS10 0.50.0 — the spec blocks it was planned from
        _mapIdx: mapIdx,
      });
    }
  });

  // §0.39.275 — CROSS-MAP dependencies. A phase can wait on a phase in a different spec, written as
  // "<map words> <phase>" (graph-build-context-settings-memory B1: `depends_on: [B0, staging S0]`). It
  // resolves only when the words name exactly one OTHER map and that map has exactly one phase by that
  // id or key: both specs of one day reuse C0/C1/L1/A1/X1, so a bare key across maps is never guessed.
  // Anything less exact stays an unresolved_dependency, as before.
  const byUuid = new Map(nodes.map(n => [n.uuid, n]));
  for (const c of crossPending) {
    const parts = c.tok.split(/\s+/);
    if (parts.length < 2) continue;
    const key = parts[parts.length - 1]; const words = parts.slice(0, -1).join(' ').toLowerCase();
    const mapsHit = [...new Set(nodes.filter(n => n.map !== c.mapPath && mapNameOf(n.map).toLowerCase().includes(words)).map(n => n.map))];
    if (mapsHit.length !== 1) continue;
    const hits = nodes.filter(n => n.map === mapsHit[0] && (n.phase_key === key || keyOf(n.phase_key) === key));
    if (hits.length !== 1) continue;
    const self = c.node(); if (!self) continue;
    self.depends_on.push(hits[0].uuid);
    self.unresolved_deps = self.unresolved_deps.filter(t => t !== c.tok);
    warnings.splice(warnings.indexOf(c.w), 1);
  }

  // layering (Kahn); a node is placed once every dependency is placed
  const remaining = new Set(nodes.map(n => n.uuid)); let layer = 0; const layers = [];
  while (remaining.size) {
    const now = [...remaining].filter(u => byUuid.get(u).depends_on.every(d => !remaining.has(d)));
    if (!now.length) break; // what is left is in a cycle
    for (const u of now) { byUuid.get(u).layer = layer; remaining.delete(u); }
    layers.push(now); layer++;
  }
  if (remaining.size) {
    const members = [...remaining].map(u => byUuid.get(u).phase_key);
    warnings.push({ type: 'dependency_cycle', phases: members, note: 'these phases depend on each other (or on each other transitively); they have no layer and sort last' });
  }

  // order: layer, then file position. Every resolved dependency sorts before its dependent.
  nodes.sort((a, b) => (a.layer ?? 1e9) - (b.layer ?? 1e9) || a._mapIdx - b._mapIdx || a.line - b.line);
  nodes.forEach((n, i) => { n.order = i + 1; });
  for (const n of nodes) {
    n.blocked_by = n.depends_on.filter(d => byUuid.get(d).status !== 'complete');
    n.ready = n.status !== 'complete' && n.blocked_by.length === 0;
    delete n._mapIdx;
  }
  const count = (s) => nodes.filter(n => n.status === s).length;
  return {
    project_id: projectId, maps: mapInfo, phases: nodes, layers, warnings,
    summary: {
      total: nodes.length, planned: count('planned'), active: count('active'), complete: count('complete'),
      blocked: nodes.filter(n => n.status !== 'complete' && n.blocked_by.length).length,
      ready: nodes.filter(n => n.ready).length,
    },
  };
}

// ── edit ──────────────────────────────────────────────────────────────────
const NEW_VALUE = {
  complete: (d) => `DONE ${d}.`,
  active:   (d) => `IN PROGRESS ${d}.`,
  planned:  () => 'NOT STARTED',
};

const indentOf = (l) => (/^(\s*)/.exec(l) || ['', ''])[1].length;
const oneLine = (s, n = 70) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * setPhaseStatus({ text, mapName, phaseId, status, date, force })
 * -> { text, before, after }   (throws RoadmapError; returns text only if proven)
 */
export function setPhaseStatus({ text, mapName, phaseId, status, date = new Date().toISOString().slice(0, 10), force = false } = {}) {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new RoadmapError('BAD_STATUS', status === 'blocked'
      ? "'blocked' is not a stored status: loom's scanner has no such value. A phase is blocked when a dependency is not complete, and that is shown, not written."
      : `status must be one of ${EDITABLE_STATUSES.join(', ')}, got ${JSON.stringify(status)}`);
  }
  const before = loom.parsePhasemapText(text, mapName);
  const target = before.find(p => p.id === phaseId);
  if (!target) throw new RoadmapError('NOT_FOUND', `no phase ${phaseId} in ${mapName}`);

  if (status === 'complete' && !force) {
    const rm = buildRoadmap({ projectId: 'x', maps: [{ path: `${mapName}.spec`, text }] });
    const n = rm.phases.find(p => p.phase_key === phaseId);
    const blockers = (n?.blocked_by || []).map(u => rm.phases.find(p => p.uuid === u)?.phase_key);
    if (blockers.length) throw new RoadmapError('DEPS_INCOMPLETE', `${phaseId} depends on ${blockers.join(', ')}, which ${blockers.length > 1 ? 'are' : 'is'} not complete. Send force to mark it complete anyway.`, { blockers });
  }

  const lines = String(text).split('\n');
  const hdr = target.line;
  const newValue = NEW_VALUE[status](date);
  let out;

  if (target.statusLine === -1) {
    // no status key: insert one right under the header
    const ind = ' '.repeat(indentOf(lines[hdr]) + 2);
    out = [...lines.slice(0, hdr + 1), `${ind}# roadmap edit ${date}: (no status) -> ${newValue}`, `${ind}status: "${newValue}"`, ...lines.slice(hdr + 1)];
  } else {
    const s = target.statusLine; const ind = indentOf(lines[s]);
    // the value runs until the next line that is not indented deeper than the key
    let e = s + 1;
    while (e < target.bodyEnd && (lines[e].trim() === '' ? lookaheadDeeper(lines, e, ind) : indentOf(lines[e]) > ind)) e++;
    const oldLines = lines.slice(s, e);
    const oldText = oldLines.map((l, i) => (i === 0 ? l.replace(/^\s*status:\s*[>|]?-?\s*/, '') : l.trim())).join(' ').replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
    const pad = ' '.repeat(ind);
    // status_previous goes ABOVE status:, not below it: loom reads the `status:`
    // line and the three after it, so old text sitting right under the new value
    // (a previous "NOT STARTED") would be read as the phase's status.
    const repl = [`${pad}# roadmap edit ${date}: ${oneLine(oldText) || '(empty)'} -> ${newValue}`, `${pad}status_previous: ${JSON.stringify(oldText)}`, `${pad}status: "${newValue}"`];
    // drop an earlier status_previous in this phase (its text lives on in the comments)
    const body = [...lines.slice(0, s), ...repl, ...lines.slice(e)];
    out = dropOldPrevious(body, hdr, s + 1);
  }
  const newText = out.join('\n');

  // ── prove it ─────────────────────────────────────────────────────────────
  const after = loom.parsePhasemapText(newText, mapName);
  const said = after.find(p => p.id === phaseId);
  if (!said || said.status !== NODE_TO_LOOM[status]) {
    throw new RoadmapError('ROUNDTRIP_FAILED', `loom's parser reads ${phaseId} as '${said && said.status}' after the edit, not '${NODE_TO_LOOM[status]}'. The phase's text near its status: key confuses the status reader; nothing was changed.`);
  }
  const sig = (p) => `${p.id}|${p.status}|${p.dependsOn}`;
  if (after.length !== before.length || JSON.stringify(before.filter(p => p !== target).map(sig)) !== JSON.stringify(after.filter(p => p !== said).map(sig))) {
    throw new RoadmapError('ROUNDTRIP_FAILED', 'the edit changed another phase (or the number of phases) as loom reads them; nothing was changed.');
  }
  if (_yaml) {
    let wasValid = true; try { _yaml.load(String(text)); } catch (_) { wasValid = false; }
    if (wasValid) { try { _yaml.load(newText); } catch (e) { throw new RoadmapError('ROUNDTRIP_FAILED', `the edited file is no longer valid YAML (${e.message.split('\n')[0]}); nothing was changed.`); } }
  }
  return { text: newText, before: { status: LOOM_TO_NODE[target.status], loom: target.status }, after: { status, loom: said.status, value: newValue } };
}

function lookaheadDeeper(lines, i, ind) {
  for (let k = i + 1; k < lines.length; k++) {
    if (lines[k].trim() === '') continue;
    return indentOf(lines[k]) > ind;
  }
  return false;
}

// remove an older `status_previous:` in the same phase (not the one just written)
// §0.39.271 P2 — a list-form entry ("- id: T1") also starts a phase; without it an edit
// in a list-form map would drop every later phase's status_previous.
const PHASE_HDR = /^\s{2,6}[A-Z]{1,3}(?:\d+|-[A-Z0-9]+)_[A-Za-z0-9_]*:|^\s*-\s+id:\s*\S+\s*$/;
function dropOldPrevious(lines, hdrIdx, keepIdx) {
  const out = []; let inPhase = true;
  for (let i = 0; i < lines.length; i++) {
    if (i > hdrIdx && i !== keepIdx && inPhase && /^\s*status_previous:/.test(lines[i])) continue;
    if (i > hdrIdx && PHASE_HDR.test(lines[i])) inPhase = false;
    out.push(lines[i]);
  }
  return out;
}

/**
 * addPhase({ text, mapName, title, does, dependsOn, prefix }) -> { text, id }
 * §0.39.261 — James: "a full idea tab and section for improving/iterating or
 * expanding the project." An iteration taken onto the roadmap becomes a real
 * phase in the repo's phasemap file, in the same shape loom's scanner reads
 * (loom/scanners/phasemap-map.js PHASE_RE: 4-space `ID_slug:`, status,
 * depends_on, does). text null starts a new phasemap file. The id is the next
 * free <prefix><n>. The result is parsed back with loom's own parser before it
 * is returned: a phase that would not read back is an error, never a write.
 */
export function addPhase({ text = null, mapName = 'roadmap-phasemap', title, does = '', dependsOn = [], prefix = 'IT' } = {}) {
  const clean = String(title || '').trim();
  if (!clean) throw new RoadmapError('BAD_TITLE', 'a phase needs a title');
  if (!/^[A-Z]{1,3}$/.test(prefix)) throw new RoadmapError('BAD_PREFIX', 'prefix must be 1-3 capital letters');
  const existing = text ? loom.parsePhasemapText(text, mapName) : [];
  let n = 0;
  for (const p of existing) { const m = p.id.match(new RegExp(`^${prefix}(\\d+)_`)); if (m) n = Math.max(n, Number(m[1])); }
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'phase';
  const id = `${prefix}${n + 1}_${slug}`;
  const deps = (dependsOn || []).filter(d => existing.some(p => p.id === d || p.id.split('_')[0] === d));
  const esc = (s) => String(s).replace(/\s+/g, ' ').trim();
  const block = [
    `    ${id}:`,
    `      status: pending`,
    `      depends_on: [${deps.map(d => d.split('_')[0]).join(', ')}]`,
    `      does: >`,
    `        ${esc(does || clean)}`,
    '',
  ].join('\n');
  let out;
  if (!text) {
    out = [
      'spec:', '  meta:', `    name:    ${mapName}`, '    version: 0.1.0-phasemap',
      `    status:  PHASEMAP ${new Date().toISOString().slice(0, 10)} — started from this repo's Idea tab.`, '',
      '  phases:', '', block,
    ].join('\n');
  } else {
    out = text.replace(/\s*$/, '\n\n') + block;
  }
  const back = loom.parsePhasemapText(out, mapName);
  const hit = back.find(p => p.id === id);
  if (!hit) throw new RoadmapError('ROUNDTRIP_FAILED', `${id} was written but loom's parser does not read it back`);
  if (back.length !== existing.length + 1) throw new RoadmapError('ROUNDTRIP_FAILED', `adding ${id} changed how many phases the file holds (${existing.length} -> ${back.length})`);
  return { text: out, id, status: hit.status };
}
