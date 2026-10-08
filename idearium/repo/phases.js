/**
 * idearium/repo/phases.js — one phases manager for every repo (0.39.271 P2/P3).
 * UUID: nexus-idearium-repo-phases-v1-0000-2026-0927-jamesbrooks-001
 * comp_id: nexus.idearium.repo.phases
 * Map: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (P2, P3)
 *
 * James: "i want the roadmap and phases combined into a fully enterprise grade
 * manager." Before this there were two tabs over two parsers' outputs with two
 * status vocabularies, and nothing could be built from either (see the map's
 * exists: list).
 *
 * §NO SECOND SOURCE OF TRUTH. The phases are the phasemap files'. This module
 * only chooses WHICH files a repo's manager reads, and composes roadmap.js
 * (loom's parser → phase_nodes → layers, blocked, ready) over them:
 *
 *   an ordinary repo  → its own *phasemap*.spec files (roadmap.collectPhasemaps);
 *                       edits write through the repo layer, like the Roadmap tab did.
 *   a nexus repo      → the phasemaps of the immutable Nexus base (every
 *                       *phasemap*.spec in the head snapshot). The parent (all
 *                       of NEXUS) shows every map; a system repo shows the maps
 *                       with at least one phase loom tags as that system's, and
 *                       marks those phases `mine`. Edits go through the apply
 *                       gate (lib/nexus-self/apply.js) — James: "needs to use
 *                       versionium to backup the files, if it doesnt already
 *                       then apply it live."
 *
 * §BUILD (P3). buildRequest() only composes the agent's task from the phase (its
 * map, name, dependencies, what it closes, the files it names, the map's
 * invariants). The API route takes the Versionium snapshot FIRST and refuses to
 * dispatch without one (the map's invariant I2), then hands the task to the
 * repo's own agent (lib/repo-agent.js dispatch). Runs are appended to
 * idearium_phase_runs by the API — this module has no store.
 */

import { createRequire } from 'module';
import { collectPhasemaps, buildRoadmap, isPhasemapPath } from './roadmap.js';
const require = createRequire(import.meta.url);

export const MODULE_ID = 'nexus-idearium-repo-phases-v1-0000-2026-0927-jamesbrooks-001';
export const RUN_TABLE = 'idearium_phase_runs';
const MAX_MAP_BYTES = 2 * 1024 * 1024;

/** which kind of repo this is, for the manager */
export function scopeOf(repo) {
  const ns = repo && repo.nexusSelf;
  if (ns && ns.role === 'parent') return { source: 'nexus', system: null, label: 'all of NEXUS' };
  if (ns && ns.role === 'system') return { source: 'nexus', system: ns.system, label: `nexus/${ns.system}` };
  return { source: 'repo', system: null, label: repo ? repo.name : '' };
}

/**
 * nexusPhasemaps({ system }) -> { maps:[{path,text}], skipped, snapshot }
 * Every phasemap file in the immutable base's head snapshot; with a system, only the
 * maps where loom tags at least one phase as that system's.
 */
export function nexusPhasemaps({ system = null } = {}) {
  const store = require('../../lib/nexus-self/store.js');
  const systems = require('../../lib/nexus-self/systems.js');
  const loom = require('../../loom/scanners/phasemap-map.js');
  const h = store.head();
  const snap = h.hash ? store.loadSnapshot(h.hash) : null;
  if (!snap) return { maps: [], skipped: [{ path: '(nexus)', reason: 'no nexus snapshot yet — sync the nexus repo once' }], snapshot: null };
  const maps = []; const skipped = [];
  for (const [rel, sha, size] of store.filesOf(snap).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!isPhasemapPath(rel)) continue;
    if (/(^|\/)_archive\//.test(rel)) continue;   // superseded maps stay on disk, not in the manager
    if (size > MAX_MAP_BYTES) { skipped.push({ path: rel, reason: `over the ${MAX_MAP_BYTES}-byte limit` }); continue; }
    let text;
    try { text = store.getBlob(sha).toString('utf8'); } catch (e) { skipped.push({ path: rel, reason: e.message }); continue; }
    if (system) {
      const phases = loom.parsePhasemapText(text, rel);
      if (!phases.some(p => (p.systems || []).some(t => systems.systemForLoomTag(t) === system))) continue;
    }
    maps.push({ path: rel, text });
  }
  return { maps, skipped, snapshot: h.hash };
}

/** mapsFor({ repo, repoDir }) -> { maps, skipped, scope, snapshot } */
export function mapsFor({ repo, repoDir }) {
  const scope = scopeOf(repo);
  if (scope.source === 'nexus') {
    const r = nexusPhasemaps({ system: scope.system });
    return { ...r, scope };
  }
  const r = collectPhasemaps(repo, repoDir);
  return { ...r, scope, snapshot: null };
}

/** the meta block of one map — name, date, release, status, origin (first line) */
export function mapMeta(text) {
  const t = String(text || '');
  const pick = (k) => {
    const m = t.match(new RegExp(`^\\s{2,6}${k}:\\s*(?:[>|][-+]?\\s*\\n\\s+)?(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  };
  return { name: pick('name'), date: pick('date'), release: pick('release'), status: pick('status'), origin: (pick('origin') || '').slice(0, 300) || null };
}

/** the text of a top-level block of a map (`  invariants:`, `  missing:`) — up to `max` chars */
function blockOf(text, key, max = 2500) {
  const lines = String(text || '').split('\n');
  const i = lines.findIndex(l => new RegExp(`^\\s{2}${key}:`).test(l));
  if (i === -1) return '';
  const out = [];
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() !== '' && /^\s{0,2}\S/.test(l)) break;
    out.push(l);
  }
  return out.join('\n').trim().slice(0, max);
}

/**
 * managerView({ repo, repoDir, runs }) -> the Phases tab's whole model:
 *   scope, maps (with meta + per-map summary), phases (roadmap phase_nodes + mine,
 *   runs, lastRun), layers, warnings, summary, skipped, snapshot.
 */
export function managerView({ repo, repoDir, runs = [] }) {
  const { maps, skipped, scope, snapshot } = mapsFor({ repo, repoDir });
  const rm = buildRoadmap({ projectId: repo.uuid, maps });
  const systems = scope.system ? require('../../lib/nexus-self/systems.js') : null;
  const runsBy = new Map();
  for (const r of runs) { if (!runsBy.has(r.phaseUuid)) runsBy.set(r.phaseUuid, []); runsBy.get(r.phaseUuid).push(r); }
  for (const list of runsBy.values()) list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  for (const p of rm.phases) {
    p.mine = scope.system ? (p.systems || []).some(t => systems.systemForLoomTag(t) === scope.system) : true;
    const rs = runsBy.get(p.uuid) || [];
    p.runs = rs.length; p.lastRun = rs[0] || null;
  }
  const mapInfo = rm.maps.map(m => {
    const src = maps.find(x => x.path === m.path);
    const ph = rm.phases.filter(p => p.map === m.path);
    const c = (s) => ph.filter(p => p.status === s).length;
    return { ...m, meta: mapMeta(src && src.text), summary: { total: ph.length, complete: c('complete'), active: c('active'), planned: c('planned'), blocked: ph.filter(p => p.status !== 'complete' && p.blocked_by.length).length, ready: ph.filter(p => p.ready).length, mine: ph.filter(p => p.mine).length } };
  });
  return {
    repoUuid: repo.uuid, scope, snapshot, skipped,
    editable: true, editVia: scope.source === 'nexus' ? 'apply-gate' : 'repo-layer',
    maps: mapInfo, phases: rm.phases, layers: rm.layers, warnings: rm.warnings,
    summary: { ...rm.summary, maps: mapInfo.length, mine: rm.phases.filter(p => p.mine).length, runs: runs.length },
  };
}

/**
 * §0.39.361 SB50 — phaseDates(mapText, phaseKey) -> { mapped, statusDate } — the dates the map itself holds for a phase:
 * the map's meta date (when it was mapped) and the first YYYY-MM-DD in the phase's status: value (DONE 2026-10-06., …).
 */
export function phaseDates(mapText, phaseKey) {
  const text = String(mapText || '');
  const meta = mapMeta(text);
  const day = (s) => { const m = String(s || '').match(/\b(20\d\d-\d\d-\d\d)\b/); return m ? m[1] : null; };
  let statusDate = null;
  try {
    const loom = require('../../loom/scanners/phasemap-map.js');
    const raw = loom.parsePhasemapText(text, 'x').find(p => p.id === phaseKey);
    if (raw) {
      const lines = text.split('\n').slice(raw.line, raw.bodyEnd);
      const i = lines.findIndex(l => /^\s+status:/.test(l));
      if (i !== -1) statusDate = day([lines[i], lines[i + 1] || ''].join(' ').replace(/^\s+status:/, ''));
    }
  } catch (_) { /* a map loom cannot read has no dates */ }
  return { mapped: day(meta.date), statusDate };
}

/**
 * buildRequest({ phase, mapText, repo }) -> { message, title }
 * The task a phase build hands the repo's agent. Everything in it is read from the
 * map (§1.1): the phase's own body, the missing items it closes, the invariants.
 */
export function buildRequest({ phase, mapText, repo, depsDone = [] }) {
  const lines = String(mapText || '').split('\n');
  const loom = require('../../loom/scanners/phasemap-map.js');
  const parsed = loom.parsePhasemapText(mapText, phase.map);
  const raw = parsed.find(p => p.id === phase.phase_key);
  const body = raw ? lines.slice(raw.line, raw.bodyEnd).join('\n').trim() : '';
  const missing = blockOf(mapText, 'missing', 4000).split('\n')
    .filter(l => (phase.closes || []).some(c => new RegExp(`\\b${c.replace(/[^A-Za-z0-9-]/g, '')}\\b`).test(l))).join('\n').trim();
  const invariants = blockOf(mapText, 'invariants', 2500);
  const meta = mapMeta(mapText);
  const message = [
    `Build phase ${phase.phase_key} of the phasemap ${phase.map}${meta.name ? ` (${meta.name})` : ''} in ${repo.name}.`,
    '',
    'THE PHASE, as the map writes it:',
    body || `${phase.phase_key}: ${phase.name || phase.title}`,
    missing ? `\nWHAT IT CLOSES (the map's missing list):\n${missing}` : '',
    depsDone.length ? `\nALREADY COMPLETE (its dependencies): ${depsDone.join(', ')}` : '',
    invariants ? `\nTHE MAP'S INVARIANTS — hold every one:\n${invariants}` : '',
    '',
    'Work in this repo only. Reuse what exists before writing anything new. Write each changed file in full as an addressed code block so it can be applied. When it is done, say which files changed and how the phase was checked.',
  ].filter(x => x !== '').join('\n');
  return { message, title: `${phase.phase_key} · ${phase.name || phase.title}` };
}

/**
 * §0.39.361 SB51 — James: "phases need chunked i feel like. at least for small ollama models."
 * A phase is built one file at a time when its ladder starts on a small local model (lib/pipeline-routing shouldChunk):
 * buildRequest hands over the whole phase, and llama3.2:3b's prompt ran 16613 chars at num_ctx 9216 — seven rounds,
 * nothing written. A chunk is one file: the phase in brief, this file, what the earlier chunks already wrote (their
 * exports), the invariants in brief. Each goes in its own fresh session; its shadow expects only its file.
 */

/** phaseFiles(phase) -> the files a phase names, as paths (the same rule the build's shadow uses) */
export function phaseFiles(phase) {
  return [...new Set((phase.files || []).map(f => String(f).split(/[\s(]/)[0]).filter(f => f && /[\w-]\.[\w]+$/.test(f)))];
}

/** exportsOf(code) -> the names a JS file exports (module.exports = { … }, exports.x =, export function/const/class) */
export function exportsOf(code) {
  const s = String(code || ''); const out = new Set();
  for (const m of s.matchAll(/module\.exports\s*=\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const k = part.split(':')[0].trim().replace(/^\.\.\..*/, ''); if (/^[A-Za-z_$][\w$]*$/.test(k)) out.add(k); }
  for (const m of s.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const k = part.split(/\s+as\s+/).pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(k)) out.add(k); }
  return [...out];
}

/** the value of one key of a phase body (`does: >-` and its indented lines, or `proof: "…"`) on one line */
function fieldOf(body, key) {
  const lines = String(body || '').split('\n');
  const i = lines.findIndex(l => new RegExp(`^\\s+${key}:`).test(l));
  if (i === -1) return '';
  const ind = (lines[i].match(/^(\s*)/) || ['', ''])[1].length;
  const out = [lines[i].replace(new RegExp(`^\\s+${key}:\\s*[>|]?-?\\s*`), '')];
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() && (l.match(/^(\s*)/) || ['', ''])[1].length <= ind) break;
    out.push(l.trim());
  }
  return out.join(' ').replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
}
const _cut = (s, n) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);

/**
 * chunkRequest({ phase, mapText, repo, file, index, files, done, depsDone, maxChars }) -> { message, title, file }
 * One file of a phase, as a request a small model can hold: never more than maxChars (default 2400). done is
 * [{ path, exports }] — what the earlier chunks of this run wrote.
 */
export function chunkRequest({ phase, mapText, repo, file, index = 0, files = [file], done = [], depsDone = [], maxChars = 2400 }) {
  const lines = String(mapText || '').split('\n');
  const loom = require('../../loom/scanners/phasemap-map.js');
  const raw = loom.parsePhasemapText(mapText, phase.map).find(p => p.id === phase.phase_key);
  const body = raw ? lines.slice(raw.line, raw.bodyEnd).join('\n') : '';
  const does = fieldOf(body, 'does') || phase.name || phase.title || phase.phase_key;
  const proof = fieldOf(body, 'proof');
  const meta = mapMeta(mapText);
  const inv = blockOf(mapText, 'invariants', 4000).split('\n').map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const doneBy = new Map(done.map(d => [d.path, d]));
  const others = files.filter(f => f !== file).map(f => doneBy.has(f)
    ? `- ${f} — written${(doneBy.get(f).exports || []).length ? `, exports ${doneBy.get(f).exports.slice(0, 12).join(', ')}` : ''}`
    : `- ${f} — a later chunk; do not write it`);
  const head = `Build ONE file: ${file} — chunk ${index + 1} of ${files.length} of phase ${phase.phase_key}${meta.name ? ` (${meta.name})` : ''} in ${repo.name}.`;
  const tail = `Write ${file} in full as one addressed code block so it can be applied. Write no other file. Reuse what exists in this repo before writing anything new.`;
  const parts = (budget) => [
    head, '',
    `THE PHASE, in brief: ${_cut(does, budget.does)}`,
    proof ? `ITS PROOF: ${_cut(proof, 300)}` : null,
    others.length ? `\nTHE PHASE'S OTHER FILES:\n${others.join('\n')}` : null,
    depsDone.length ? `\nALREADY COMPLETE (its dependencies): ${_cut(depsDone.join(', '), 300)}` : null,
    inv.length && budget.inv > 0 ? `\nHOLD THESE: ${_cut(inv.join(' · '), budget.inv)}` : null,
    '', tail,
  ].filter(x => x != null).join('\n');
  let budget = { does: 1100, inv: 500 };
  let message = parts(budget);
  for (let i = 0; message.length > maxChars && i < 8; i++) {
    const over = message.length - maxChars;
    if (budget.inv > 0) budget = { ...budget, inv: budget.inv - over > 120 ? budget.inv - over : 0 };
    else budget = { ...budget, does: Math.max(200, budget.does - over) };
    message = parts(budget);
  }
  if (message.length > maxChars) message = _cut(message.slice(0, maxChars - tail.length - 2), maxChars - tail.length - 2) + '\n\n' + tail;
  return { message, title: `${phase.phase_key} · ${file}`, file };
}
