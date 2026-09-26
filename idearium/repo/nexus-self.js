// idearium/repo/nexus-self.js — Nexus, as repos inside Nexus.
// comp_id: nexus.idearium.repo.nexus-self
//
// §0.39.261 — James: "i want a nexus repo in idearium, that immutable with nested
// compartments per system so i can manage nexus from inside nexus."
//
//   COS                                   Idearium
//   nexus-self            (parent)  <->   repo "nexus"            (index of the systems)
//     nexus-self-guardian (child)   <->   repo "nexus/guardian"   (guardian's files)
//     nexus-self-cortex   (child)   <->   repo "nexus/cortex"
//     …one per autopilot kernel, plus nexus-self-core for everything they share
//
// Content comes from the immutable store (lib/nexus-self/store.js), never from
// the live tree directly: sync() snapshots the tree, then gives each system
// whose slice changed a NEW spec version (RepoLayer.replaceSpec), so every
// version of every system stays readable. The repos are immutable:true —
// RepoLayer refuses edits on them; changes go COS branch -> apply gate.
//
// Each system repo goes through the same import pipeline an uploaded project
// does (parse -> atlas -> chunks -> verify -> code graph + spec graph), so the
// Home, Phasemap, Intelligence and graph views work on Nexus exactly as they do
// on any other repo. runtimeProof is off here: one system's slice cannot run its
// tests alone (tests/ requires across systems) — execution evidence for Nexus
// comes from the COS run menu's full-tree runs instead.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { runImportPipeline } from './import-pipeline.js';

const require = createRequire(import.meta.url);
const store = require('../../lib/nexus-self/store.js');
const systems = require('../../lib/nexus-self/systems.js');

export const MODULE_ID = 'idearium-nexus-self';
export const PARENT_COMPARTMENT = 'nexus-self';
export const PARENT_REPO = 'nexus';
const MAX_TEXT_BYTES = 200 * 1024;       // idearium.config.json chunking.max_chunk_bytes — bigger files live in the source layer only
const TEXT_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt', '.py', '.html', '.css', '.yml', '.yaml', '.spec', '.sh', '.ps1', '.bat', '.cmd', '.toml', '.ini', '.xml', '.svg', '.sql', '.php', '.rb', '.gitignore', '']);

const tick = () => new Promise(r => setImmediate(r));
const compName = (system) => `${PARENT_COMPARTMENT}-${system}`;
const repoName = (system) => `${PARENT_REPO}/${system}`;

function _isText(rel, buf) {
  const ext = path.extname(rel).toLowerCase();
  if (!TEXT_EXT.has(ext)) return false;
  if (buf.length > MAX_TEXT_BYTES) return false;
  const { _isProbablyText } = require('../../lib/zip-ingest.js');
  return _isProbablyText(buf) && buf.toString('utf8').trim().length > 0;
}

function _bridge() { try { return require('../../lib/cos-bridge.js'); } catch (_) { return null; } }

/** ensureCompartments() -> { parent, children:{ system: compartment }, errors } */
export function ensureCompartments() {
  const cb = _bridge();
  const errors = [];
  if (!cb) return { parent: null, children: {}, errors: ['COS bridge unavailable'] };
  let parent = cb.getCompartment(PARENT_COMPARTMENT);
  if (!parent) {
    const r = cb.createCompartment({ name: PARENT_COMPARTMENT, purpose: 'Nexus itself — the immutable base; one child compartment per system', networkIsolated: true });
    if (!r.ok) return { parent: null, children: {}, errors: [`parent compartment: ${r.error}`] };
    parent = r.compartment;
  }
  const children = {};
  for (const s of systems.SYSTEMS) {
    let c = cb.getCompartment(compName(s.name));
    if (!c) {
      const r = cb.createCompartment({ name: compName(s.name), purpose: `Nexus system: ${s.name}`, networkIsolated: true, parentId: parent.id });
      if (!r.ok) { errors.push(`${s.name}: ${r.error}`); continue; }
      c = r.compartment;
    } else if (!c.parentId) {
      errors.push(`${compName(s.name)} exists but is not nested under ${PARENT_COMPARTMENT} (created before nesting existed) — left as is`);
    }
    // the live system dirs, mounted READ-ONLY: the compartment can see Nexus, never write it
    for (const d of s.dirs || []) cb.mountPath(c.id, { path: path.join(systems.ROOT, d), role: 'nexus-live', writable: false });
    children[s.name] = c;
  }
  return { parent: cb.getCompartment(parent.id) || parent, children, errors };
}

function _findRepo(rl, pred) {
  return rl.list({ includeArchived: true }).find(pred) || null;
}

function _parentReadme(snap, repoBySystem) {
  const lines = [
    '# nexus', '',
    'Nexus, as repos inside Nexus. Immutable: this is snapshot', `\`${snap.hash}\`.`, '',
    'Edit a system on a COS branch, run it from the COS run menu, then apply it through the gate.', '',
    '| system | files | MB | repo |', '|---|---:|---:|---|',
  ];
  for (const s of systems.SYSTEMS) {
    const v = snap.systems[s.name] || { fileCount: 0, bytes: 0 };
    lines.push(`| ${s.name} | ${v.fileCount} | ${(v.bytes / 1048576).toFixed(1)} | ${repoBySystem[s.name] || '—'} |`);
  }
  return lines.join('\n') + '\n';
}

/**
 * syncSystem(rl, se, { system, snap, compartment, parentRepoUuid, force })
 * -> { system, status:'unchanged'|'created'|'updated'|'failed', repoUuid, … }
 */
export async function syncSystem(rl, se, { system, snap, compartment = null, parentRepoUuid = null, force = false, onEvent = null } = {}) {
  const sysSnap = snap.systems[system];
  const existing = _findRepo(rl, r => r.nexusSelf && r.nexusSelf.system === system && r.nexusSelf.role === 'system');
  if (existing && !force && existing.nexusSelf.hash === sysSnap.hash) {
    return { system, status: 'unchanged', repoUuid: existing.uuid, hash: sysSnap.hash };
  }
  const entries = store.filesOf(snap, system);
  if (!entries.length) return { system, status: 'failed', error: 'no files for this system in the snapshot' };

  const realFiles = [], textFiles = [];
  for (const [rel, sha, size] of entries) {
    const buf = store.getBlob(sha);
    const text = _isText(rel, buf);
    realFiles.push({ path: rel, buffer: buf, bytes: size, binary: !text, sha256: sha });
    if (text) textFiles.push({ path: rel, content: buf.toString('utf8') });
  }
  if (!textFiles.length) return { system, status: 'failed', error: 'no text files to index' };

  await tick();
  let repoUuid, status;
  const baseDir = path.join(store.storeRoot(), 'repos');
  if (!existing) {
    const r = rl.ingest({ name: repoName(system), files: textFiles, source: 'nexus-self', parent: null, compartmentId: compartment ? compartment.id : null, materializeBaseDir: baseDir });
    if (r.error) return { system, status: 'failed', error: r.error };
    repoUuid = r.repo.uuid; status = 'created';
  } else {
    repoUuid = existing.uuid; status = 'updated';
    let manifest;
    try { manifest = se.ingestFilesAsSpec({ name: repoName(system), files: textFiles, author: 'nexus-self', repoUuid }); }
    catch (e) { return { system, status: 'failed', repoUuid, error: `spec version failed: ${e.message}` }; }
    const rs = rl.replaceSpec(repoUuid, manifest.uuid);
    if (rs.error) return { system, status: 'failed', repoUuid, error: rs.error };
  }

  await tick();
  // Source layer: every real file, binaries included, byte-exact. Files the
  // previous version had and this one does not are removed first.
  const dir = rl._sourceDir(repoUuid);
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(dir, '.idearium-sources.json'), 'utf8'));
    const keep = new Set(realFiles.map(f => f.path));
    for (const f of prev.files || []) if (!keep.has(f.path)) fs.rmSync(path.join(dir, f.path), { force: true });
  } catch (_) { /* first version — nothing to remove */ }
  const ws = rl.writeSources(repoUuid, realFiles);
  if (!ws.ok) return { system, status: 'failed', repoUuid, error: `source write: ${ws.error}` };
  await tick();
  const mat = rl.materialize(repoUuid);
  if (mat.error) return { system, status: 'failed', repoUuid, error: `materialize: ${mat.error}` };
  await tick();

  let pipeline = null;
  try { pipeline = runImportPipeline(rl.get(repoUuid), mat.dir, { runtimeProof: false, lazyTests: false, onEvent }); }
  catch (e) { pipeline = { state: 'FAULT', error: e.message }; }

  const prevVersions = existing?.nexusSelf?.versions || [];
  rl.annotate(repoUuid, {
    immutable: true,
    nexusSelf: {
      role: 'system', system, parentRepo: parentRepoUuid,
      hash: sysSnap.hash, snapshot: snap.hash, syncedAt: Date.now(),
      fileCount: sysSnap.fileCount, bytes: sysSnap.bytes, textFiles: textFiles.length,
      pipeline: pipeline ? pipeline.state : null,
      versions: [...prevVersions, { hash: sysSnap.hash, snapshot: snap.hash, at: Date.now() }].slice(-100),
    },
  });
  return { system, status, repoUuid, hash: sysSnap.hash, files: entries.length, pipeline: pipeline ? pipeline.state : null, pipelineError: pipeline && pipeline.error };
}

/**
 * sync(rl, se, { only, force, log }) — snapshot the live tree, ensure the
 * compartments, bring every changed system repo to the new version.
 * Yields to the event loop between systems so a boot-time sync never holds
 * idearium's /health (the 0.39.260 lesson).
 */
export async function sync(rl, se, { only = null, force = false, log = () => {}, onSystem = null, commitVersion = null, liveRoot = undefined } = {}) {
  const t0 = Date.now();
  const snap0 = store.snapshot(liveRoot ? { liveRoot } : {});   // liveRoot: tests sync a small tree, never the real one
  const snap = store.loadSnapshot(snap0.hash);
  const comps = ensureCompartments();

  // parent repo — an index of the systems (its one file is regenerated per snapshot)
  let parent = _findRepo(rl, r => r.nexusSelf && r.nexusSelf.role === 'parent');
  const results = [];
  const want = only ? systems.names().filter(n => only.includes(n)) : systems.names();
  for (const name of want) {
    await new Promise(r => setImmediate(r));
    let res;
    try { res = await syncSystem(rl, se, { system: name, snap, compartment: comps.children[name], parentRepoUuid: parent ? parent.uuid : null, force }); }
    catch (e) { res = { system: name, status: 'failed', error: e.message }; }
    results.push(res);
    if (onSystem) { try { onSystem(res); } catch (_) {} }
    if (res.status !== 'unchanged') log(`[${MODULE_ID}] ${name}: ${res.status}${res.error ? ` — ${res.error}` : ''}${res.files ? ` · ${res.files} files · pipeline ${res.pipeline}${res.pipelineError ? ` — ${res.pipelineError}` : ''}` : ''}`);
  }

  const repoBySystem = {};
  for (const r of rl.list({ includeArchived: true })) if (r.nexusSelf && r.nexusSelf.role === 'system') repoBySystem[r.nexusSelf.system] = r.uuid;
  const readme = _parentReadme(snap, repoBySystem);
  const parentHash = store.sha256(readme);
  if (!parent || parent.nexusSelf.hash !== parentHash) {
    const files = [{ path: 'NEXUS.md', content: readme }];
    if (!parent) {
      const r = rl.ingest({ name: PARENT_REPO, files, source: 'nexus-self', compartmentId: comps.parent ? comps.parent.id : null });
      if (!r.error) parent = rl.get(r.repo.uuid);
    } else {
      const m = se.ingestFilesAsSpec({ name: PARENT_REPO, files, author: 'nexus-self', repoUuid: parent.uuid });
      rl.replaceSpec(parent.uuid, m.uuid);
    }
    if (parent) {
      const pm = rl.materialize(parent.uuid);
      // indexed like every repo (0.39.263), so it can be a versionium version too
      if (pm && pm.dir) { try { runImportPipeline(rl.get(parent.uuid), pm.dir, { runtimeProof: false, lazyTests: false }); } catch (_) {} }
      rl.annotate(parent.uuid, { immutable: true, nexusSelf: { role: 'parent', hash: parentHash, snapshot: snap.hash, children: repoBySystem, syncedAt: Date.now() } });
    }
  }
  // children point back at the parent
  if (parent) for (const uuid of Object.values(repoBySystem)) {
    const r = rl.get(uuid);
    if (r && r.nexusSelf && r.nexusSelf.parentRepo !== parent.uuid) rl.annotate(uuid, { nexusSelf: { ...r.nexusSelf, parentRepo: parent.uuid } });
  }

  // §0.39.263 — James: "i want versionium to hold the history for each repo." Every
  // repo whose content is not yet a versionium version (a new or changed system, the
  // parent index, or one synced before this existed) gets a repo snapshot WITH its
  // files — its history lives in versionium, branch repo-<uuid>, not in any .git.
  // commitVersion is injected (the API passes versionium's commit + file layer), so
  // this module knows nothing of HTTP. A failure is recorded on the repo, never fatal.
  const versions = [];
  if (commitVersion) {
    const all = [...Object.entries(repoBySystem).filter(([n]) => !only || only.includes(n)).map(([n, u]) => [n, u]), ...(parent ? [['(nexus)', parent.uuid]] : [])];
    for (const [name, uuid] of all) {
      const r = rl.get(uuid);
      if (!r || !r.nexusSelf || (r.nexusSelf.versionCommit && r.nexusSelf.versionOf === r.nexusSelf.hash)) continue;
      await new Promise(res => setImmediate(res));
      let v;
      try { v = await commitVersion({ repo: r, system: name, snapshot: snap.hash }); }
      catch (e) { v = { ok: false, error: e.message }; }
      const fresh = rl.get(uuid);
      const ns = { ...fresh.nexusSelf };
      if (v && v.ok) {
        ns.versionCommit = v.commitId; ns.versionOf = ns.hash; ns.versionError = null;
        if (Array.isArray(ns.versions) && ns.versions.length) ns.versions = [...ns.versions.slice(0, -1), { ...ns.versions[ns.versions.length - 1], versionCommit: v.commitId }];
      } else ns.versionError = (v && v.error) || 'versionium did not answer';
      rl.annotate(uuid, { nexusSelf: ns });
      versions.push({ system: name, repoUuid: uuid, ok: !!(v && v.ok), commitId: v && v.commitId || null, error: v && !v.ok ? v.error : null });
      if (!(v && v.ok)) log(`[${MODULE_ID}] ${name}: versionium commit failed — ${v && v.error}`);
    }
  }

  // Measured after every sync that changed anything (or the first ever) —
  // see recordUnderstanding() below.
  let understanding = null;
  if (results.some(r => r.status === 'created' || r.status === 'updated') || !readUnderstanding({ limit: 1 }).length) {
    let sg = null;
    try { sg = await systemGraph(rl, snap.hash); } catch (e) { log(`[${MODULE_ID}] system graph failed: ${e.message}`); }
    try { understanding = recordUnderstanding(rl, snap.hash, sg); } catch (e) { understanding = { error: e.message }; }
  }

  return {
    ok: results.every(r => r.status !== 'failed'),
    snapshot: snap.hash, snapshotCreated: snap0.created, stats: snap0.stats, understanding: understanding && { improved: understanding.improved, regressed: understanding.regressed, delta: understanding.delta, totals: understanding.totals },
    parentRepo: parent ? parent.uuid : null,
    compartments: { parent: comps.parent ? comps.parent.id : null, children: Object.fromEntries(Object.entries(comps.children).map(([k, v]) => [k, v.id])), errors: comps.errors },
    systems: results, versions, ms: Date.now() - t0,
  };
}

/** status(rl) — what the Nexus repo looks like right now, without syncing. */
export function status(rl) {
  const head = store.head();
  const repos = rl.list({ includeArchived: true }).filter(r => r.nexusSelf);
  const parent = repos.find(r => r.nexusSelf.role === 'parent') || null;
  const cb = _bridge();
  return {
    head: head.hash, history: (head.history || []).slice(-20),
    parent: parent ? { uuid: parent.uuid, name: parent.name } : null,
    systems: systems.SYSTEMS.map(s => {
      const r = repos.find(x => x.nexusSelf.role === 'system' && x.nexusSelf.system === s.name);
      return { system: s.name, repoUuid: r ? r.uuid : null, hash: r ? r.nexusSelf.hash : null, snapshot: r ? r.nexusSelf.snapshot : null,
               fileCount: r ? r.nexusSelf.fileCount : 0, syncedAt: r ? r.nexusSelf.syncedAt : null, versions: r ? (r.nexusSelf.versions || []).length : 0 };
    }),
    compartments: cb ? cb.tree(PARENT_COMPARTMENT) : null,
  };
}

// ── per-system view: what the Home / Spec / Phasemap tabs show ──────────────

function _readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

/** phasesFor(system) — loom's roadmap phases for this system (loom/scanners/phasemap-map.js). */
export function phasesFor(system) {
  const pm = require('../../loom/scanners/phasemap-map.js');
  const all = pm.loadAll();
  const mine = all.phases.filter(p => (p.systems || []).some(tag => systems.systemForLoomTag(tag) === system));
  const by = (st) => mine.filter(p => p.status === st).length;
  const maps = {};
  for (const p of mine) (maps[p.map] = maps[p.map] || []).push({ id: p.id, title: p.title, status: p.status, dependsOn: Array.isArray(p.dependsOn) ? p.dependsOn : (p.dependsOn ? String(p.dependsOn).split(/[\s,]+/).filter(Boolean) : []), systems: p.systems });
  return {
    system, total: mine.length, done: by('done'), inProgress: by('in-progress'), pending: mine.length - by('done') - by('in-progress'),
    tags: systems.get(system)?.loom || [], maps,
  };
}

/** specsFor(system, snapHash) — the system's own .spec files (its spec/ dir; core: docs/ + architecture-spec/), from the immutable base. */
export function specsFor(system, snapHash = null) {
  const snap = store.loadSnapshot(snapHash || store.head().hash);
  if (!snap) return { system, specs: [] };
  const dirs = systems.get(system)?.specDirs || [];
  const specs = store.filesOf(snap, system)
    .filter(([p]) => p.endsWith('.spec') && dirs.some(d => p === d || p.startsWith(d + '/')))
    .map(([p, sha, size]) => {
      let title = null;
      try {
        const head = store.getBlob(sha).toString('utf8', 0, 4000);
        const m = head.match(/^\s*(?:name|title|spec|id)\s*:\s*["']?([^\n"']+)/mi) || head.match(/^#\s+(.+)$/m);
        title = m ? m[1].trim().slice(0, 160) : null;
      } catch (_) {}
      return { path: p, bytes: size, sha, title };
    });
  return { system, dirs, specs };
}

/** specText(system, path) — one spec's text from the immutable base. */
export function specText(system, relPath, snapHash = null) {
  const snap = store.loadSnapshot(snapHash || store.head().hash);
  const hit = store.filesOf(snap, system).find(([p]) => p === relPath && p.endsWith('.spec'));
  if (!hit) return { error: `no spec ${relPath} in ${system}` };
  return { path: relPath, content: store.getBlob(hit[1]).toString('utf8') };
}

/** atlasFor(rl, system) — the system repo's atlas, summarised for Home. */
export function atlasFor(rl, repoUuid) {
  const dir = rl._sourceDir(repoUuid);
  const atlas = dir && _readJson(path.join(dir, 'atlas.json'));
  if (!atlas) return { error: 'no atlas yet — the system has not been through the import pipeline' };
  const byDir = {};
  for (const c of atlas.components || []) {
    const parts = c.path.split('/');
    const key = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    const d = (byDir[key] = byDir[key] || { dir: key, files: 0, symbols: 0, kinds: {} });
    d.files++; d.symbols += c.symbolCount || 0; d.kinds[c.kind] = (d.kinds[c.kind] || 0) + 1;
  }
  const top = (atlas.components || []).slice().sort((a, b) => (b.symbolCount || 0) - (a.symbolCount || 0)).slice(0, 15);
  return {
    fileCount: atlas.fileCount, failedCount: atlas.failedCount, byKind: atlas.byKind, byLanguage: atlas.byLanguage,
    dirs: Object.values(byDir).sort((a, b) => b.files - a.files), topComponents: top, generatedAt: atlas.generatedAt,
  };
}

// ── understanding: what Nexus knows about itself, measured per sync ─────────
//
// James: "make sure the graphs are hooked in, and nexus is improving it's
// understanding." Understanding is measured, not asserted: after each sync,
// every system's graphs and pipeline output are read and reduced to the same
// numbers, appended to understanding.jsonl, and compared with the previous
// record. "Improving" is then a real delta (more imports resolved, fewer parse
// failures, more phases done, more specs wired) — or a stated regression.

function _metricsFor(rl, repoUuid, system, sysGraph = null) {
  const dir = rl._sourceDir(repoUuid);
  const g = _readJson(path.join(dir, 'graph.json')) || {};
  const sg = _readJson(path.join(dir, 'spec-graph.json')) || {};
  const v = _readJson(path.join(dir, 'verification.json')) || {};
  const a = _readJson(path.join(dir, 'atlas.json')) || {};
  const sy = _readJson(path.join(dir, 'indexes', 'symbols.json')) || [];
  const gl = _readJson(path.join(dir, 'indexes', 'glyphs.json'));
  const glyphSummary = gl && gl.summary ? gl.summary : null;
  const ph = phasesFor(system);
  const sp = specsFor(system);
  const edges = g.edgeCount || 0, unresolved = g.unresolvedCount || 0;
  return {
    files: a.fileCount || 0, parseFailures: a.failedCount || 0, symbols: sy.length,
    graphNodes: g.nodeCount || 0, graphEdges: edges, unresolved,
    resolution: edges ? +(1 - unresolved / edges).toFixed(4) : null,
    specs: sp.specs.length, specEntries: sg.summary?.entries || 0, specErrors: sg.summary?.errors || 0, specDisagreements: sg.summary?.disagreements || 0,
    verification: v.level || null,
    phasesTotal: ph.total, phasesDone: ph.done,
    // 0.39.261 — how compactly Nexus can hold this system in mind (chunk chars per glyph char)
    ...(glyphSummary ? { glyphs: glyphSummary.chunks, glyphChars: glyphSummary.glyphChars, sourceChars: glyphSummary.chars } : {}),
    // Nexus-level (systemGraph): what the per-system graph could not resolve, classified
    ...(sysGraph && sysGraph.bySystem[system] ? {
      crossSystemEdges: sysGraph.bySystem[system].crossSystem, builtinImports: sysGraph.bySystem[system].builtin,
      packageImports: sysGraph.bySystem[system].package, missingPackages: sysGraph.bySystem[system].missing,
      brokenImports: sysGraph.bySystem[system].broken, nexusResolution: sysGraph.bySystem[system].nexusResolution,
    } : {}),
  };
}

const HIGHER_IS_BETTER = ['symbols', 'graphEdges', 'resolution', 'nexusResolution', 'crossSystemEdges', 'specEntries', 'phasesDone', 'specs'];
const LOWER_IS_BETTER = ['parseFailures', 'unresolved', 'brokenImports', 'missingPackages', 'specErrors', 'specDisagreements'];

function _understandingFile() { return path.join(store.storeRoot(), 'understanding.jsonl'); }

export function readUnderstanding({ limit = 200 } = {}) {
  let lines = [];
  try { lines = fs.readFileSync(_understandingFile(), 'utf8').trim().split('\n').filter(Boolean); } catch (_) {}
  return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
}

/** recordUnderstanding(rl, snapHash) — measure every system, append, and say what moved. */
export function recordUnderstanding(rl, snapHash, sg = null) {
  const prev = readUnderstanding({ limit: 1 })[0] || null;
  const bySystem = {};
  for (const r of rl.list({ includeArchived: true })) {
    if (!r.nexusSelf || r.nexusSelf.role !== 'system') continue;
    try { bySystem[r.nexusSelf.system] = _metricsFor(rl, r.uuid, r.nexusSelf.system, sg); } catch (_) {}
  }
  const totals = {};
  for (const m of Object.values(bySystem)) for (const [k, v] of Object.entries(m)) if (typeof v === 'number') totals[k] = (totals[k] || 0) + v;
  totals.resolution = totals.graphEdges ? +(1 - totals.unresolved / totals.graphEdges).toFixed(4) : null;
  if (totals.brokenImports !== undefined) totals.nexusResolution = totals.graphEdges ? +(1 - ((totals.brokenImports || 0) + (totals.missingPackages || 0)) / totals.graphEdges).toFixed(4) : null;
  if (sg) totals.systemEdges = sg.edges.length;
  if (totals.glyphChars) totals.glyphRatio = +(totals.sourceChars / totals.glyphChars).toFixed(1);
  const delta = {}, improved = [], regressed = [];
  if (prev) {
    for (const k of [...HIGHER_IS_BETTER, ...LOWER_IS_BETTER]) {
      const d = (totals[k] ?? 0) - (prev.totals?.[k] ?? 0);
      if (!d) continue;
      delta[k] = +d.toFixed(4);
      const better = HIGHER_IS_BETTER.includes(k) ? d > 0 : d < 0;
      (better ? improved : regressed).push(k);
    }
  }
  const rec = { at: Date.now(), snapshot: snapHash, totals, bySystem, delta, improved, regressed, previous: prev ? prev.at : null };
  fs.mkdirSync(path.dirname(_understandingFile()), { recursive: true });
  fs.appendFileSync(_understandingFile(), JSON.stringify(rec) + '\n');
  try {
    const lw = require('../../lib/ledger-writer.js');
    lw.write('nexus-self', 'metrics', { system: 'nexus-self', ...totals });
    lw.write('nexus-self', 'event_log', { type: 'nexus-self.understanding', snapshot: snapHash, improved, regressed, delta });
  } catch (_) {}
  return rec;
}

/** systemView(rl, system) — everything one system repo's tabs need, in one read. */
export function systemView(rl, system) {
  if (!systems.get(system)) return { error: `unknown system: ${system}` };
  const repo = rl.list({ includeArchived: true }).find(r => r.nexusSelf && r.nexusSelf.role === 'system' && r.nexusSelf.system === system) || null;
  const hist = readUnderstanding({ limit: 50 }).map(u => ({ at: u.at, snapshot: u.snapshot, ...(u.bySystem[system] || {}) })).filter(x => x.files !== undefined);
  return {
    system, def: systems.get(system), repo: repo ? { uuid: repo.uuid, name: repo.name, ...repo.nexusSelf } : null,
    atlas: repo ? atlasFor(rl, repo.uuid) : { error: 'not synced yet' },
    atlasDoc: (() => { const snap = _headSnap(); return snap ? _atlasDocFor(_index(snap), systems.get(system)) : null; })(),
    siblings: systems.names(),
    phases: phasesFor(system), specs: specsFor(system),
    understanding: { latest: hist[hist.length - 1] || null, previous: hist[hist.length - 2] || null, history: hist },
  };
}

// ── the Nexus-level graph: resolving what one system's graph cannot ────────
//
// A system repo's code graph only sees that system's files, so every
// require('../lib/x') out of guardian — and every Node builtin and npm package —
// lands as "unresolved". At the Nexus level those are mostly not gaps: they are
// edges BETWEEN systems, or to builtins, or to installed packages. This pass
// resolves each one against the whole snapshot and classifies it:
//   cross-system  a relative path that is a real file of another system
//   builtin       a Node builtin
//   package       installed in Nexus's root node_modules
//   missing       a bare package that is not installed
//   broken        a relative path that is no file of the snapshot at all
// The cross-system edges ARE the system graph (who depends on whom); broken +
// missing are the genuine gaps. Understanding uses the corrected numbers.

const { builtinModules } = require('module');
const _BUILTIN = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);

export async function systemGraph(rl, snapHash = null) {
  const { readGraph } = await import('./graph.js');
  const snap = store.loadSnapshot(snapHash || store.head().hash);
  if (!snap) return { error: 'no snapshot' };
  const paths = new Set(store.filesOf(snap).map(([p]) => p));
  const installed = (name) => fs.existsSync(path.join(systems.ROOT, 'node_modules', name, 'package.json'));
  const resolveRel = (fromFile, spec) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
    for (const c of [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.json`, `${base}.ts`, `${base}/index.js`, `${base}/index.cjs`, `${base}/index.mjs`]) if (paths.has(c)) return c;
    return null;
  };
  const edges = new Map();   // "a->b" -> { from, to, count, examples }
  const bySystem = {};
  const broken = [], missing = new Map();
  for (const r of rl.list({ includeArchived: true })) {
    if (!r.nexusSelf || r.nexusSelf.role !== 'system') continue;
    const sys = r.nexusSelf.system;
    let g; try { g = readGraph(rl._sourceDir(r.uuid)); } catch (_) { g = null; }
    if (!g) continue;
    const m = { edges: g.edgeCount || 0, unresolvedLocal: 0, crossSystem: 0, builtin: 0, package: 0, missing: 0, broken: 0, foreign: 0 };
    for (const e of g.edges || []) {
      if (e.resolution !== 'unresolved' || !e.target) continue;
      m.unresolvedLocal++;
      const from = String(e.from || '').replace(/^file:/, '');
      const spec = String(e.target);
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const hit = resolveRel(from, spec);
        if (hit) {
          const to = systems.ownerOf(hit);
          if (to === sys) { m.broken++; broken.push({ system: sys, from, spec, why: 'resolves inside its own system but the system graph missed it' }); continue; }
          m.crossSystem++;
          const k = `${sys}->${to}`;
          const cur = edges.get(k) || { from: sys, to, count: 0, examples: [] };
          cur.count++; if (cur.examples.length < 5) cur.examples.push(`${from} → ${hit}`);
          edges.set(k, cur);
        } else { m.broken++; if (broken.length < 500) broken.push({ system: sys, from, spec }); }
        continue;
      }
      // a Python/other-language import is not an npm package — its own runtime resolves it
      if (!/\.(?:[cm]?[jt]sx?)$/.test(from)) { m.foreign++; continue; }
      if (_BUILTIN.has(spec) || _BUILTIN.has(spec.split('/')[0])) { m.builtin++; continue; }
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (installed(pkg)) m.package++;
      else { m.missing++; const x = missing.get(pkg) || { name: pkg, systems: new Set(), count: 0 }; x.count++; x.systems.add(sys); missing.set(pkg, x); }
    }
    m.gaps = m.broken + m.missing;
    m.nexusResolution = m.edges ? +(1 - m.gaps / m.edges).toFixed(4) : null;
    bySystem[sys] = m;
  }
  const out = {
    snapshot: snap.hash, generatedAt: Date.now(),
    edges: [...edges.values()].sort((a, b) => b.count - a.count),
    bySystem,
    missing: [...missing.values()].map(x => ({ name: x.name, count: x.count, systems: [...x.systems] })).sort((a, b) => b.count - a.count),
    broken: broken.slice(0, 500),
  };
  try { fs.writeFileSync(path.join(store.storeRoot(), 'system-graph.json'), JSON.stringify(out, null, 2)); } catch (_) {}
  return out;
}

export function readSystemGraph() { return _readJson(path.join(store.storeRoot(), 'system-graph.json')); }

// ── the Nexus atlas: the nexus repo's Home ──────────────────────────────────
//
// §0.39.263 — James: "nexus is the repo, not 15, just nexus, then clicking inside
// of it, shows the rest of them in … the nexus atlas, wire that completely in as
// the homepage of the nexus repo, and everything referenced can be opened in
// idearium, including each system."
//
// The page is docs/atlases/nexus-atlas.md itself, read from the immutable base
// (so it is the atlas of the snapshot the repos show), with live numbers joined
// onto each module, and every reference in it resolvable by resolveRefs().

export const NEXUS_ATLAS = 'docs/atlases/nexus-atlas.md';
const ATLAS_DIR = 'docs/atlases';

let _pathIndexFor = null, _pathIndex = null;   // snapshot hash -> { byPath, byBase, dirs }
function _index(snap) {
  if (snap.hash && _pathIndexFor === snap.hash && _pathIndex) return _pathIndex;
  const byPath = new Map(), byBase = new Map(), dirs = new Set();
  for (const [sys, list] of Object.entries(snap.files)) {
    for (const [p, sha, size] of list) {
      byPath.set(p, { system: sys, sha, size });
      const b = p.split('/').pop();
      if (!byBase.has(b)) byBase.set(b, []);
      byBase.get(b).push(p);
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
  }
  if (!snap.hash) return { byPath, byBase, dirs };
  _pathIndexFor = snap.hash; _pathIndex = { byPath, byBase, dirs };
  return _pathIndex;
}

function _headSnap() { const h = store.head(); return h.hash ? store.loadSnapshot(h.hash) : null; }

/** the system's own hand-written atlas doc, if the snapshot has one */
function _atlasDocFor(idx, s) {
  const names = [s.name, ...(s.dirs || [])];
  for (const n of names) { const p = `${ATLAS_DIR}/${n}-atlas.md`; if (idx.byPath.has(p)) return p; }
  return null;
}

/**
 * fileText(relPath) — any text file of the immutable base, read-only.
 * -> { path, system, content, bytes } | { error }
 */
export function fileText(relPath) {
  const snap = _headSnap();
  if (!snap) return { error: 'no snapshot yet — sync once' };
  const rel = String(relPath || '').replace(/^\/+/, '');
  const hit = _index(snap).byPath.get(rel);
  if (!hit) return { error: `${rel} is not in snapshot ${snap.hash.slice(0, 12)}` };
  const buf = store.getBlob(hit.sha);
  if (!_isText(rel, buf)) return { error: `${rel} is binary` };
  return { path: rel, system: hit.system, content: buf.toString('utf8'), bytes: hit.size, snapshot: snap.hash };
}

/**
 * resolveRefs(rl, refs) — what each reference in an atlas points at, so the page
 * can open it: a system (its repo), a file (in its system repo), a directory, or
 * a doc (rendered in place). Unknown references resolve to null — never guessed.
 * Accepts: a path ('guardian/lib/node-registry.js', 'loom/', 'cortex/intelligence/'),
 * a file name the snapshot has ('loom.spec', 'guardian-atlas.md'), a system name
 * ('guardian', 'ollama-bridge'), an id ('nexus.loom'), a port (':3753').
 */
export function resolveRefs(rl, refs) {
  const snap = _headSnap();
  if (!snap) { const out = {}; for (const r of refs || []) out[r] = null; return out; }
  const repos = rl.list({ includeArchived: true }).filter(r => r.nexusSelf && r.nexusSelf.role === 'system');
  const repoOf = (sys) => { const r = repos.find(x => x.nexusSelf.system === sys); return r ? r.uuid : null; };
  return resolveWith(_index(snap), refs, repoOf);
}

/**
 * indexOf(filesBySystem) — the path index resolveWith() reads, from
 * { system: [[path, sha, size], …] } (a snapshot's .files). §0.39.264: exported
 * so the atlas test resolves every reference against the REAL tree with the
 * exact code the page uses.
 */
export function indexOf(filesBySystem) { return _index({ hash: null, files: filesBySystem }); }

/** resolveWith(idx, refs, repoOf) — resolveRefs' rules, over any index. */
export function resolveWith(idx, refs, repoOf = () => null) {
  const out = {};
  const sysHit = (s) => ({ kind: 'system', system: s.name, repoUuid: repoOf(s.name), path: null });
  const fileHit = (p) => { const h = idx.byPath.get(p); return { kind: /\.md$/i.test(p) ? 'doc' : 'file', system: h.system, repoUuid: repoOf(h.system), path: p }; };
  for (const raw of (refs || []).slice(0, 2000)) {
    let r = String(raw).trim().replace(/^[`'"(]+|[`'",.;:)]+$/g, '').replace(/:\d+(:\d+)?$/, '');
    let hit = null;
    const port = /^:(\d{2,5})$/.exec(String(raw).trim());
    if (port) { const s = systems.SYSTEMS.find(x => x.port === +port[1]); hit = s ? sysHit(s) : null; out[raw] = hit; continue; }
    if (/^nexus\/?$/i.test(r)) { out[raw] = { kind: 'nexus', system: null, repoUuid: null, path: null }; continue; }   // the atlas's own root
    r = r.replace(/^nexus\./, '').replace(/^\.\//, '');
    // §0.39.264 — a glob (docs/*-phasemap.spec, tests/modules/test-*.js) opens the directory it lives in
    if (r.includes('*')) { const dir = r.slice(0, r.indexOf('*')).replace(/\/[^/]*$/, ''); out[raw] = dir && idx.dirs.has(dir) ? { kind: 'dir', system: systems.ownerOf(dir), repoUuid: repoOf(systems.ownerOf(dir)), path: dir, glob: r } : null; continue; }
    const bare = r.replace(/\/+$/, '');
    const sys = systems.get(bare) || systems.SYSTEMS.find(s => (s.dirs || []).includes(bare));
    if (sys && !r.includes('.')) hit = sysHit(sys);
    else if (idx.byPath.has(bare)) hit = fileHit(bare);
    else if (idx.byPath.has(`${ATLAS_DIR}/${bare}`)) hit = fileHit(`${ATLAS_DIR}/${bare}`);
    else if (idx.dirs.has(bare)) { const owner = systems.ownerOf(bare); hit = { kind: 'dir', system: owner, repoUuid: repoOf(owner), path: bare }; }
    else if (!bare.includes('/') && idx.byBase.has(bare)) {
      // loom.spec -> loom/spec/loom.spec before docs/loom.spec: the file inside the system it is named after wins
      const stem = bare.replace(/\.[^.]+$/, '').replace(/-atlas$/, '');
      const own = (p) => (systems.ownerOf(p) === stem || p.split('/')[0] === stem ? 0 : 1);
      const cands = idx.byBase.get(bare).slice().sort((a, b) => own(a) - own(b) || a.split('/').length - b.split('/').length || a.length - b.length);
      hit = { ...fileHit(cands[0]), alternatives: cands.length > 1 ? cands.slice(1, 6) : undefined };
    }
    out[raw] = hit;
  }
  return out;
}

/**
 * nexusAtlas(rl) — the nexus repo's Home: the atlas document plus, per system,
 * what the snapshot and the last measurement say about it, and the whole-Nexus
 * roll-up of every system's atlas.json (architecture-spec's nexus-atlas-aggregate).
 */
export function nexusAtlas(rl) {
  const snap = _headSnap();
  const doc = snap ? fileText(NEXUS_ATLAS) : { error: 'no snapshot yet — sync once' };
  const idx = snap ? _index(snap) : null;
  const repos = rl.list({ includeArchived: true }).filter(r => r.nexusSelf && r.nexusSelf.role === 'system');
  const und = readUnderstanding({ limit: 2 });
  const L = und[und.length - 1] || null, P = und[und.length - 2] || null;
  const perAtlas = {};
  const list = systems.SYSTEMS.map(s => {
    const r = repos.find(x => x.nexusSelf.system === s.name) || null;
    const atlas = r ? _readJson(path.join(rl._sourceDir(r.uuid), 'atlas.json')) : null;
    if (atlas) perAtlas[s.name] = atlas;
    let ph = null; try { const p = phasesFor(s.name); ph = { total: p.total, done: p.done, inProgress: p.inProgress }; } catch (_) {}
    return {
      system: s.name, dirs: s.dirs, port: s.port, entry: s.entry,
      repoUuid: r ? r.uuid : null, fileCount: r ? r.nexusSelf.fileCount : (snap && snap.systems[s.name] ? snap.systems[s.name].fileCount : 0),
      versions: r ? (r.nexusSelf.versions || []).length : 0, syncedAt: r ? r.nexusSelf.syncedAt : null,
      atlasDoc: idx ? _atlasDocFor(idx, s) : null,
      byLanguage: atlas ? atlas.byLanguage : null,
      phases: ph,
      now: L && L.bySystem ? L.bySystem[s.name] || null : null,
      before: P && P.bySystem ? P.bySystem[s.name] || null : null,
    };
  });
  let aggregate = null;
  try { aggregate = require('../../architecture-spec/registry/nexus-atlas-aggregate.js').aggregate(perAtlas); } catch (_) {}
  const otherAtlases = idx ? [...idx.byPath.keys()].filter(p => p.startsWith(ATLAS_DIR + '/') && p.endsWith('-atlas.md') && p !== NEXUS_ATLAS && !list.some(x => x.atlasDoc === p)) : [];
  return {
    snapshot: snap ? snap.hash : null, doc: doc.error ? null : { path: doc.path, content: doc.content }, docError: doc.error || null,
    systems: list, aggregate, otherAtlases, understanding: L ? { at: L.at, totals: L.totals, improved: L.improved, regressed: L.regressed } : null,
  };
}
