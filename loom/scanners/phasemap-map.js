'use strict';
/**
 * loom/scanners/phasemap-map.js — the PHASEMAP layer of loom's self-model
 * comp_id: nexus.loom.scanners.phasemap-map
 * UUID: nexus-loom-scanner-phasemap-v1-0000-2026-0808-001
 *
 * James: "consolidate all the phasemaps, split them by system, add it as an
 * entire section in loom."
 *
 * loom already knows what the system IS:
 *   capability-map — what it can do (served routes)
 *   spec-map       — what it's supposed to be (specs)
 * This adds what the system is BECOMING:
 *   phasemap-map   — the roadmap (docs/*phasemap*.spec), split by system.
 *
 * Reads every phasemap spec, extracts each phase (id, title, done/pending,
 * depends_on), and tags it with the SYSTEM it concerns (parsed from the phase
 * body + reuse lines). So "what is cortex becoming / what's left for guardian"
 * is answerable from loom. §8.6 mirrors the spec-map scanner pattern.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
// §TESTABILITY 2026-09-19 — overridable so the status parser can be tested
// against real fixture phasemaps on disk rather than only against the live
// tree, whose contents change every session. The default is unchanged, so
// no real caller is affected.
const DOCS = process.env.NEXUS_PHASEMAP_DIR || path.join(ROOT, 'docs');

// 0.60.244 SV0 — the parser (and the system terms it tags with) is core's now: lib/phasemap-parse.js. Moved verbatim; re-exported below.
const { parsePhasemapText, isPhasemapFile, NS, SYSTEMS, _tagSystem } = require('../../lib/phasemap-parse.js');
// §BUGFIX 2026-08-08 — same investigation as the _tagSystem fix above. The
// prior regex (`[A-Za-z0-9_]*` — zero-or-more, no underscore required)
// matched copilot-awareness-routing-phasemap.spec's drift_watch dict (bare
// `CA5:`, `CA6:`, `CA7:` entries describing what KIND of drift to watch for,
// not phases) as if they were pending phases, alongside the REAL
// `CA5_intent_routing` etc. a few lines below — inflating every roadmap
// query with fake pending entries. Checked across all 16 phasemap files
// before tightening: every genuine phase declaration has an underscore
// suffix; the drift dict was the only bare match anywhere in the corpus.

function _phasemapFiles() {
  let out = [];
  try {
    for (const f of fs.readdirSync(DOCS)) {
      if (isPhasemapFile(f)) out.push(path.join(DOCS, f));
    }
  } catch (_) {}
  return out;
}


/**
 * loadAll() — every phase across every phasemap, tagged + status'd.
 * @returns { phases:[{id,title,map,status,systems,dependsOn}], maps, bySystem }
 */
function loadAll() {
  const phases = [];
  const maps = [];
  for (const file of _phasemapFiles()) {
    const name = path.basename(file, '.spec');
    maps.push(name);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const p of parsePhasemapText(text, name)) {
      phases.push({ id: p.id, map: p.map, title: p.title, status: p.status, systems: p.systems, tags: p.tags, systemsFrom: p.systemsFrom, dependsOn: p.dependsOn,
        ...(p.shelf ? { shelf: true } : {}), ...(p.closedAs ? { closedAs: p.closedAs } : {}), ...(p.foldedInto ? { foldedInto: p.foldedInto } : {}), ...(p.kind ? { kind: p.kind } : {}) });   // §OR1 — were dropped here · §0.60.227 kind (decision, finding)
    }
  }
  // group by system (LP2 — split by system).
  const bySystem = {};
  for (const p of phases) for (const s of p.systems) (bySystem[s] = bySystem[s] || []).push({ id: p.id, map: p.map, status: p.status });
  return { phases, maps, bySystem, total: phases.length };
}

/**
 * forSystem(system) — the roadmap for one system: what's done, what's pending.
 */
function forSystem(system) {
  const all = loadAll();
  // §0.39.314 SY1 — a tag is answered for its system (forSystem('raid') is cortex's roadmap); a name that is neither a
  // system nor a tag of one answers empty rather than core's, so a typo never reads as a roadmap
  const known = NS.names().includes(String(system).toLowerCase()) || NS.SYSTEMS.some(s => (s.loom || []).includes(String(system).toLowerCase()));
  const sys = known ? NS.systemFor(system) : String(system);
  const list = all.bySystem[sys] || [];
  return {
    system: sys, asked: system,
    total: list.length,
    done: list.filter(p => p.status === 'done').length,
    pending: list.filter(p => p.status === 'pending').length,
    phases: list,
  };
}

/**
 * summary() — the whole roadmap at a glance (for the loom section UI/API).
 */
function summary() {
  const all = loadAll();
  const done = all.phases.filter(p => p.status === 'done').length;
  const inprog = all.phases.filter(p => p.status === 'in-progress').length;
  const shelf = all.phases.filter(p => p.shelf).length, closed = all.phases.filter(p => p.closedAs).length;   // §OR1
  return {
    maps: all.maps.length,
    phases: all.total,
    done, inProgress: inprog, pending: all.total - done - inprog, shelf, closed, roadmap: all.total - done - inprog - shelf,
    systems: Object.keys(all.bySystem).length,
    text: `${all.total} phases across ${all.maps.length} phasemaps, ${Object.keys(all.bySystem).length} systems: ${done} done${closed ? ` (${closed} closed by the declutter)` : ''}, ${inprog} in progress, ${all.total - done - inprog - shelf} on the roadmap${shelf ? `, ${shelf} on the shelf` : ''}.`,
  };
}

/**
 * persistHistory(opts) — R0 (docs/repair-contract-and-loom-hub-phasemap.spec).
 * James: "loom should already have a phasemap system? i want all this
 * logged into loom, maybe using cortex to log the phase maps."
 *
 * loadAll() is a live file scan — real, but stateless: no record of WHEN a
 * phase actually flipped pending->done, nothing queryable about what the
 * phasemap said yesterday. This writes a real, append-only row to cortex's
 * phasemap_history table, but ONLY for phases whose status actually
 * CHANGED since the last recorded snapshot — a diff, not a re-dump of
 * everything on every call, same discipline gap-field's dedup already
 * established (reused, not reinvented, per this phase's own gate).
 *
 * Each transition row also carries the version that holds it, where one can
 * be found (James: "utilizes the git commit history?"). §0.39.263 — James:
 * "loom depends on the .git i want versionium to hold the history for each
 * repo." The version is no longer a git commit: it is the VERSIONIUM commit
 * whose copy of the owning .spec file has exactly the bytes on disk now
 * (GET /api/versionium/files/versions — the nexus repos commit every system's
 * files to versionium on each sync). No .git is read. Best-effort: a phase
 * changed by an edit versionium has not recorded yet still gets logged, with
 * versionCommit null and the reason (§1.2 — a missing correlation is stated,
 * not hidden behind a fabricated one).
 *
 * persistHistory() is async (it asks versionium over the API, never by reading
 * versionium's files): await it for { ok, written, total }.
 */
const TABLE = 'phasemap_history';
function _jaa() { try { return require('../../cortex/memory/jaa-db').jaaDB; } catch (_) { return null; } }
// the version of one .spec file: the newest versionium commit whose copy has these exact bytes
async function _versionFor(specFile, { client } = {}) {
  const full = path.join(DOCS, specFile + '.spec');
  let sha;
  try { sha = require('crypto').createHash('sha256').update(fs.readFileSync(full)).digest('hex'); }
  catch (e) { return { versionCommit: null, versionReason: `spec not readable: ${e.code || e.message}` }; }
  const rel = path.relative(ROOT, full).split(path.sep).join('/');
  let r;
  try { r = await (client || require('../../lib/nexus-client')).get('versionium', `/api/versionium/files/versions?path=${encodeURIComponent(rel)}`, { timeout: 4000 }); }
  catch (e) { return { versionCommit: null, versionReason: `versionium unreachable: ${String(e.message).slice(0, 120)}` }; }
  const hit = (r && r.versions || []).find(v => v.sha256 === sha);
  if (!hit) return { versionCommit: null, versionReason: (r && r.versions || []).length ? 'this content is not recorded in versionium yet' : 'versionium holds no version of this file yet' };
  return { versionCommit: hit.commitId, versionRepository: hit.repository, versionAt: hit.wall || null };
}

let _persisting = null;   // single flight: two overlapping calls must not both write the same transition
function persistHistory(opts = {}) {
  if (_persisting) return _persisting;
  _persisting = _persistHistory(opts).finally(() => { _persisting = null; });
  return _persisting;
}
async function _persistHistory(opts = {}) {
  // one versionium question per .spec file per run (a map holds many phases); once
  // versionium is unreachable, every later file gets the same stated reason, not a timeout each
  const vcache = new Map(); let down = null;
  const versionOf = async (map) => {
    if (down) return { versionCommit: null, versionReason: down };
    if (!vcache.has(map)) {
      const v = await _versionFor(map, { client: opts.client });
      if (/^versionium unreachable/.test(v.versionReason || '')) down = v.versionReason;
      vcache.set(map, v);
    }
    return vcache.get(map);
  };
  const jaa = opts.jaa || _jaa();
  if (!jaa) return { ok: false, reason: 'cortex unavailable' };

  const current = loadAll();
  const currentByKey = new Map(current.phases.map(p => [`${p.map}::${p.id}`, p]));

  let lastByKey = new Map();
  try {
    const rows = jaa.query(TABLE, () => true, 100000) || [];
    // most recent row per (map,phaseId) — the last known status before this scan
    const sorted = rows.slice().sort((a, b) => (a.recordedAt || 0) - (b.recordedAt || 0));
    for (const r of sorted) lastByKey.set(`${r.map}::${r.phaseId}`, r.status);
  } catch (_) { /* first run — nothing to diff against, every phase is a new record */ }

  let written = 0;
  for (const [key, p] of currentByKey) {
    const priorStatus = lastByKey.get(key);
    if (priorStatus === p.status) continue;   // no change — nothing to log
    try {
      // §BUGFIX 2026-08-12 — `id` was the row's field name for the phase's
      // own identifier, but jaaDB's store treats `id` as ITS OWN reserved
      // primary key (seen elsewhere tonight: a settings row's `id` becomes
      // its own dedup key). Many phasemaps reuse generic phase-ids like
      // P5/P6 across DIFFERENT files (raid-warp-verification-phasemap and
      // raid-verification-spine-phasemap both have a P6) — every insert
      // was silently colliding on bare `id` and overwriting a DIFFERENT
      // phase's row, regardless of `map`. Found live: two real phases kept
      // re-appearing as "changed" on every call because their writes never
      // actually landed. Renamed to `phaseId`, verified fixed below before
      // this shipped, not assumed fixed from reading the diff.
      jaa.insert(TABLE, {
        map: p.map, phaseId: p.id, title: p.title,
        status: p.status, priorStatus: priorStatus || null,
        systems: p.systems, dependsOn: p.dependsOn || null,
        ...(await versionOf(p.map)),   // 0.39.263 — versionium, not git
        recordedAt: Date.now(),
      });
      written++;
    } catch (_) { /* §1.2 — one bad row must not stop the rest of the diff */ }
  }
  return { ok: true, checked: currentByKey.size, changed: written };
}

/** historyFor(map, id, opts) — every recorded transition for one phase, oldest first. */
function historyFor(map, id, opts = {}) {
  const jaa = opts.jaa || _jaa();
  if (!jaa) return [];
  try {
    return (jaa.query(TABLE, r => r.map === map && r.phaseId === id, 1000) || [])
      .sort((a, b) => (a.recordedAt || 0) - (b.recordedAt || 0));
  } catch (_) { return []; }
}

module.exports = { loadAll, parsePhasemapText, isPhasemapFile, forSystem, summary, persistHistory, _versionFor, historyFor, TABLE, MODULE_ID: 'loom-phasemap-map', VERSION: '1.0.0' };
