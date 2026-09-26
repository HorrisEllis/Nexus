/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Idearium HTTP API — idearium/api/index.js                             ║
 * ║  UUID:    idearium-api-v1-0000-4000-0000-000000000002                  ║
 * ║  Version: pre-release  ·  Port: 4800                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Every endpoint declared in interaction-contract.json is implemented here.
 * The UI talks ONLY to this layer. Never to core directly.
 * SSE on /sse — broadcasts all IdeaOS events.
 *
 * §1.2  Every error is loud, specific, traceable.
 * §5.2  Everything implements the bridge.
 */

import http         from 'http';
import os           from 'os';
import crypto       from 'crypto';
import { createRequire } from 'module';
import { spawnSync, spawn as spawnProc } from 'child_process';
// §WIRED — real, distinct config, not inline constants. See
// idearium/config.js's own header. Matches the established pattern.
import config from '../config.js';
import { getConfig as getIdeariumConfig, setConfig as setIdeariumConfig, getValue as getIdeariumValue } from '../lib/config.js';
const _require = createRequire(import.meta.url);

// §AX-010 2026-07-10 — idearium hardcoded 127.0.0.1:9000 in four places
// (ledger x2, register, heartbeat). Resolve the orchestrator from
// orchestrator.config.json's `ports` block (AX-010 single source of truth) so
// idearium stops being the last system that hardwires the port. Falls back to
// :9000 with a warning only if the config is unreadable.
const _nexusClient = _require('../../lib/nexus-client.js');
function _orchestrator() {
  try { return _nexusClient.resolve('orchestrator'); }
  catch (e) { console.warn('[idearium/api] orchestrator resolve failed, defaulting :9000:', e.message); return { host: '127.0.0.1', port: 9000 }; }
}

// ── Meta: Spatial Lattice — resonance-weighted idea/spec/gap graph ────────────
let _latticeEng = null;
function _getLattice() {
  if (_latticeEng) return _latticeEng;
  try {
    const { LatticeEngine } = _require('../../intelligence/spatial/lattice.js');
    _latticeEng = new LatticeEngine({ threshold: 0.3 });
  } catch(_) {}
  return _latticeEng;
}
function _latticeAdd(id, label, tags=[]) {
  try { const l=_getLattice(); if(l) l.add({id,label:label.slice(0,80),tags}); } catch(_) {}
}
function _latticeLink(a, b, w=0.7, t='associated') {
  try { const l=_getLattice(); if(l) { _latticeAdd(a,a); _latticeAdd(b,b); l.connect(a,b,w,t); } } catch(_) {}
}
import { getIdeaOS, VERSION } from '../core/index.js';
// ── Spec Engine + Agent Suite (Phase 40) ──────────────────────────────────────
let _specEngine = null;
let _agentSuite = null;
let _specEngineFailedAt = 0;
const SPEC_ENGINE_RETRY_COOLDOWN_MS = 60000; // §FOUND & FIXED 2026-09-06 — James, live: "idearium still keeps crashing." getSpecEngine() retried a fresh dynamic import() on EVERY call while failing — the new build-queue poller calls this every 15s, forever, with zero cooldown once it started failing. A real, compounding resource drain, not just noisy logs.
function getSpecEngine() {
  if (!_specEngine && (Date.now() - _specEngineFailedAt > SPEC_ENGINE_RETRY_COOLDOWN_MS)) {
    import('../spec-engine/index.js').then(m => { _specEngine = m.default || m; }).catch(e => {
      _specEngineFailedAt = Date.now();
      console.warn('[idearium/api] spec-engine load failed:', e.message);
    });
  }
  return _specEngine;
}
let _copilotAdapter = null;
let _copilotAdapterFailedAt = 0;
function getCopilotAdapter() {
  if (!_copilotAdapter && (Date.now() - _copilotAdapterFailedAt > SPEC_ENGINE_RETRY_COOLDOWN_MS)) {
    import('../copilot-adapter/index.js').then(m => { _copilotAdapter = m.default || m; }).catch(e => {
      _copilotAdapterFailedAt = Date.now();
      console.warn('[idearium/api] copilot-adapter load failed:', e.message);
    });
  }
  return _copilotAdapter;
}
let _agentSuiteFailedAt = 0;
function getAgentSuite() {
  if (!_agentSuite && (Date.now() - _agentSuiteFailedAt > SPEC_ENGINE_RETRY_COOLDOWN_MS)) {
    import('../agent-suite/index.js').then(m => { _agentSuite = m.default || m; }).catch(e => {
      _agentSuiteFailedAt = Date.now();
      console.warn('[idearium/api] agent-suite load failed:', e.message);
    });
  }
  return _agentSuite;
}

// §PHASE 2 WIRE 2026-07-09 — idearium/spec-engine/warp-build-dispatch.js had
// ZERO consumers. The production build path called as.buildChunkWithAgent()
// directly, so WARP's exact cache was never in it: every chunk paid full
// tokens, every time, forever. That is the whole of the "WARP doesn't
// compound" complaint — the cache was not slow, it was not there.
//
// createWarpChunkDispatch(as) returns a function with the SAME
// (prompt, opts) -> {ok, text} shape as as.buildChunkWithAgent, so it is a
// drop-in for dispatchChunkWithVerification's dispatchFn. It adds: exact-cache
// lookup, population seed, provider cascade, and axiom-gate validation.
//
// Fails soft. If WARP cannot load, builds continue on the direct agent path
// rather than breaking — a caching layer must never be a single point of
// failure for the thing it caches.
let _warpChunkDispatch = null;
let _warpLoadAttempted = false;
let _warpLoadPromise   = null;
let _warpLoadError     = null;

/**
 * §PHASE 2 FIXED 2026-07-09 — two faults, both hidden by "fails soft".
 *
 * (1) This fired the dynamic import and returned null IMMEDIATELY. The import
 *     resolves a tick later, so the FIRST build always took the direct agent
 *     path — the one build most likely to be a cache miss anyway, but also the
 *     one that must WRITE the cache for anything to compound. Now awaitable.
 *
 * (2) warp-build-dispatch.js could not be imported at all: it does
 *     `import { pollGuardianJob }` and chunk-dispatch.js exported no such name
 *     (it had `_pollGuardianJob`, private). Every call rejected, the catch
 *     logged a warning, and every build silently used the direct agent path —
 *     while the comment above speceng.build stated dispatch went through WARP.
 *     Fixed at the source (chunk-dispatch now exports the real poller).
 *
 * Still fails soft: a caching layer must never be a single point of failure for
 * the thing it caches. But the failure is now RECORDED (§1.2) and reported by
 * `warpStatus()`, so "WARP is in the build path" is a checkable claim rather
 * than a comment.
 */
async function getWarpChunkDispatch() {
  const as = getAgentSuite();
  if (!as) return null;
  if (_warpChunkDispatch) return _warpChunkDispatch;
  if (_warpLoadAttempted && !_warpLoadPromise) return null;

  if (!_warpLoadAttempted) {
    _warpLoadAttempted = true;
    _warpLoadPromise = import('../spec-engine/warp-build-dispatch.js')
      .then(m => {
        _warpChunkDispatch = m.createWarpChunkDispatch(as, {});
        console.log('[idearium/api] WARP chunk dispatch active — exact cache in the build path');
        return _warpChunkDispatch;
      })
      .catch(e => {
        _warpLoadError = e.message;
        console.warn('[idearium/api] WARP dispatch unavailable, using direct agent path:', e.message);
        return null;
      })
      .finally(() => { _warpLoadPromise = null; });
  }
  return _warpLoadPromise ? await _warpLoadPromise : _warpChunkDispatch;
}

/** warpStatus() — makes "WARP is in the build path" observable (§2.3). */
function warpStatus() {
  return { active: !!_warpChunkDispatch, attempted: _warpLoadAttempted, error: _warpLoadError };
}
// Pre-warm on startup
// §FIXED 2026-07-09 — getWarpChunkDispatch() returns null until its dynamic
// import resolves, so without pre-warming the FIRST speceng.build always
// bypasses WARP. That is precisely the build whose output most needs to enter
// the cache. Pre-warm after agent-suite, since the dispatch needs it.
getSpecEngine(); getAgentSuite(); getCopilotAdapter();
setTimeout(() => { getWarpChunkDispatch().catch(() => {}); }, 100);  // pre-warm; failure already recorded by warpStatus()
import { RepoLayer } from '../repo/index.js';
import { compileIdeariumSpec } from '../compiler-bridge.js';
import { extractModulesViaGuardian } from '../spec-engine/guardian-extract.js';
import { fileURLToPath as _fileURLToPath, pathToFileURL as _pathToFileURL } from 'url';

// §BUG CAUGHT 2026-07-15 — the legacy spec.build route (below) reads
// `os.dataDir`, but IdeaOS (idearium/index.js) never sets `this.dataDir`
// anywhere — it's always undefined, silently falling back to
// path.join(process.cwd(), 'data'), which only happens to be right if the
// process was launched from inside idearium/. Computed here the same way
// spec-engine/index.js derives SPECS_ROOT — file-relative, not cwd-relative —
// so compileIdeariumSpec's output actually lands next to data/specs/ instead
// of wherever the launcher's cwd happened to be.
// §FIXED 2026-09-06 — James: "need to clear out test data from idearium."
// Real, confirmed cause: this path was hardcoded with no override, so
// every real test file this whole session (idearium-phase-sync,
// idearium-reuse, idearium-warp-cache, idearium-loop, and idearium/
// test/e2e-pipeline.test.js itself) wrote directly into the same real
// data directory that ships in every zip — 63 test-generated specs
// found and removed from idearium/data/specs/ this same pass, alongside
// the 3 genuinely real ones (brainos-real-import x3). IDEARIUM_DATA_DIR
// env var lets a test point this somewhere real-but-disposable instead.
// §SANDBOX 2026-09-25 — idearium/lib/data-dir.cjs decides (test processes get a temp root).
const IDEARIUM_DATA_DIR = _require('../lib/data-dir.cjs').ideariumDataDir();
import { dispatchChunkWithVerification } from '../spec-engine/chunk-dispatch.js';
import { LANG_TO_EXT } from '../../lib/extract-code.js';
// §BUILT 2026-09-19 — real source-code extensions this dispatch path
// will assume "expect exactly one clean fenced code block back" for.
//
// §CORRECTED 2026-09-20 — this was Object.values(LANG_TO_EXT) minus a
// hardcoded ['.json','.yaml','.md']. That was right for the 19-extension
// map it was written against, but it encoded the RULE as a list of three
// exceptions. When lib/languages.js consolidated four drifting language
// tables and the map grew to 62 extensions, .toml/.xml/.txt/.csv/
// .markdown all fell through the filter and would have been treated as
// "one clean fenced block" — precisely what the original comment below
// says is unsafe for a data file or a doc. Caught by checking the filter
// against the grown table rather than by assuming a bigger map was
// strictly better.
//
// Now it asks lib/languages.js for kind==='code' directly, so the rule
// is a real property of each language and a newly-added data format is
// excluded automatically instead of needing this list edited. The
// original reasoning, unchanged and still the reason:
//
//   .json/.yaml/.md are real entries a chunk can legitimately target,
//   but "the agent's whole reply is one clean fenced block" isn't a safe
//   assumption for them the way it is for a source-code file (a data
//   file or doc is far more likely to arrive as plain, unfenced content,
//   or wrapped in prose explaining it).
const CODE_EXTENSIONS = _require('../../lib/languages.js').codeExtensions();
import { COMPONENTS as IDEARIUM_COMPONENTS } from '../registry-components.js';
import path from 'path';
import fs from 'fs';
import { loadTable, appendRow, deleteRow, syncTable } from '../lib/db.js';
import * as WB from '../lib/idea-workbench.js';
import { runImportPipeline } from '../repo/import-pipeline.js';
import { makeBusForwarder } from '../repo/pipeline-events.js';

// §PROJECTS 2026-07-19 — "a place to store projects, easily." A flat
// binary shelf for whole project archives (zips built elsewhere — MASTERMIND
// builds, eravos snapshots, clear-glass-lite, whatever lands in Downloads),
// deliberately NOT run through RepoLayer/spec-engine. Repos are for specs
// with idea/lineage tracking; this is just "keep this zip somewhere I can
// find it again" — one row per file (uuid, name, filename, diskName, size,
// uploadedAt) in idearium_projects, raw bytes on disk under data/projects/.
const PROJECTS_DIR = path.join(IDEARIUM_DATA_DIR, 'projects');
try { fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch (e) { console.warn('[idearium/api] could not create projects dir:', e.message); }

// §HISTORY 2026-07-15 — chunk retry trail + build-artifact list, read back
// out of the append-only tables lib/cortex-listeners.js writes on
// 'idearium.spec-engine.chunk.complete' / 'idearium.spec.build.completed'.
// Attached to speceng.show rather than a new route — the UI already fetches
// this endpoint to render the builder panel, and history belongs to the
// same spec-detail request rather than a second round trip (decided on
// review before wiring the UI). Each table read is independently guarded —
// a jaa-db read failure on one must not blank the manifest the rest of the
// response depends on (§1.2): a broken history comes back empty with a
// loud console warning, never a 500 on the whole endpoint.
const CHUNK_EVENTS_LIMIT = config.CHUNK_EVENTS_LIMIT; // most-recent-first cap — a 58-chunk spec with retries can generate hundreds of rows; the UI needs a trail, not the full audit log on every request
function _specHistory(specUuid) {
  let chunkEvents = [];
  try {
    chunkEvents = loadTable('idearium_spec_chunk_events')
      .filter(r => r.specUuid === specUuid)
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, CHUNK_EVENTS_LIMIT);
  } catch (e) { console.warn('[idearium/api] history: chunk_events read failed:', e.message); }

  let buildArtifacts = [];
  try {
    buildArtifacts = loadTable('idearium_build_artifacts')
      .filter(r => r.specUuid === specUuid)
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)); // [0] = most recent, matches db.js's own "snapshots[0] is most recent" convention
  } catch (e) { console.warn('[idearium/api] history: build_artifacts read failed:', e.message); }

  return { chunkEvents, buildArtifacts };
}

// ── Repo layer singleton — each idea-as-repo lives here, not in a single
//    hardcoded "Nexus folder". Wired in (previously dead code, zero routes
//    called it).
let _repoLayer = null;
function getRepoLayer() {
  if (!_repoLayer) _repoLayer = new RepoLayer({ ideaOS: getIdeaOS(), specEngine: getSpecEngine });
  return _repoLayer;
}

// §NEXUS-REPO-TOOLS 2026-09-15 — resolves a repo's real, physical,
// materialized directory: the same computation RepoLayer.materialize()
// falls back to internally, exposed here for handlers that need the dir
// itself (to read atlas.json/chunks//indexes//verification.json) without
// forcing a full re-materialize on every read. Falls back to a real
// materialize() call only for the rare repo with no materializeDir set
// yet (pre-project-import repos, ingested before that field existed).
// §MCO6 — one real way for idearium to get anything a compartment:
// lib/cos-bridge.js, "the single real entry point from any NEXUS
// subsystem into COMPARTMENT OS" (see that module's own header). It
// dispatches through COS's actual gate pipeline — nothing here builds a
// second compartment object, which is exactly what idea.phase's own
// call site was doing before this (see its §MCO6 note below) and
// exactly what MCO6's gate forbids. Non-fatal: a repo/idea that can't
// get a compartment right now still gets created — compartmentId stays
// null, stated in a warning, never silently retried forever or faked.
function _ensureCompartment(nameBase, purpose) {
  try {
    const cosBridge = _require('../../lib/cos-bridge.js');
    const name = cosBridge.uniqueName(nameBase);
    const created = cosBridge.createCompartment({ name, purpose: String(purpose || '').slice(0, 500), networkIsolated: true });
    if (!created.ok) {
      console.warn(`[api] §MCO6 compartment create failed for "${nameBase}": ${created.error}`);
      return null;
    }
    return created.compartment.id;
  } catch (e) {
    console.warn(`[api] §MCO6 compartment create threw for "${nameBase}": ${e.message}`);
    return null;
  }
}

// §RECONCILE 2026-09-21 — James: "specs are supposed to use the same repo
// compartments." Every spec-engine spec is supposed to BE a repo in a
// compartment (speceng.create and _promoteSpecToRepo both create one), but
// two paths can leave a spec with no repo at all:
//   1. RepoLayer.ingest({files}) calls spec-engine's ingestFilesAsSpec()
//      FIRST — that writes the manifest and every chunk — and only pushes
//      the repo record after it returns. If the process dies inside that
//      call the spec is on disk and no repo ever points at it. That is
//      exactly what happened to "eravos-complete": idearium ran out of
//      heap at chunk ~313 of 369 (the log shows the V8 heap-limit abort),
//      the spec survived the restart, the repo never existed, and the
//      Repos tab said "no repos yet" while the Spec Library listed it.
//   2. Specs created before repo-first landed, or whose auto-repo step
//      failed non-fatally (see speceng.create's own §1.2 note).
// The Spec Library was the only place those specs were reachable. With it
// gone they would be invisible, so boot adopts every repo-less spec into a
// compartment-backed repo through the SAME RepoLayer.ingest() everything
// else uses — no second mechanism, no new record shape.
//
// Idempotent: a spec any repo already points at (specUuid or
// promotedFromSpec) is skipped, and so is one whose content is byte-
// identical to an existing repo (RepoLayer.ingest's own content dedup would
// return that repo anyway; checking first avoids minting a compartment
// nothing will use). Never throws — a failure on one spec is logged and the
// rest still run (§1.2, same rule as the auto-repo step it backstops).
// §0.39.263 — James: "should not be a compartments tab, repos are compartments."
// An idea worked in the lanes (brainstorm · problem solving · expand · improve)
// lives in ITS repo — a repo with its own COS compartment — and the lanes are
// that repo's Idea tab. _ensureIdeaRepo finds the idea's repo or makes one
// (bare, compartment-backed, the idea's phase left as it is). Used by promote,
// admit, POST /api/ideas/:uuid/repo, and the boot reconcile below.
function _ensureIdeaRepo(ideaUuid) {
  const rl = getRepoLayer();
  const have = rl.list({ includeArchived: false }).find(r => r.ideaUuid === ideaUuid);
  if (have) return { repo: have, created: false };
  const idea = getIdeaOS().idea(ideaUuid);
  if (!idea) return { error: `idea not found: ${ideaUuid}` };
  const text = String(idea.text || 'idea').replace(/\s+/g, ' ').trim();
  const name = text.length > 60 ? text.slice(0, 59) + '…' : text;
  const r = rl.ingest({ name, bare: true, source: 'idea.compartment', ideaUuid, keepIdeaPhase: true,
    compartmentId: _ensureCompartment(`idearium-idea-${ideaUuid.slice(0, 8)}`, name) });
  if (r.error) return { error: r.error };
  return { repo: r.repo, created: true };
}

// Boot: every idea already in the old Compartment gets its repo, so nothing that
// was worked there is left without a place to open it. Idempotent.
function _reconcileWorkbenchRepos() {
  let members = [];
  try { members = loadTable(WB.MEMBER_TABLE); } catch (_) { return { created: 0 }; }
  let created = 0;
  for (const m of members) {
    try { const r = _ensureIdeaRepo(m.ideaUuid); if (r.created) created++; if (r.error) console.warn(`[idearium/api] idea→repo: ${m.ideaUuid.slice(0, 8)}: ${r.error}`); }
    catch (e) { console.warn(`[idearium/api] idea→repo threw for ${String(m.ideaUuid).slice(0, 8)}: ${e.message}`); }
  }
  if (created) console.log(`[idearium/api] idea→repo reconcile: ${created} compartment idea(s) given their repo`);
  return { created };
}

async function _reconcileSpecRepos() {
  let se = getSpecEngine();
  // getSpecEngine() kicks off an async import() and returns null until it
  // resolves; give it a moment rather than skipping the whole reconcile.
  for (let i = 0; !se && i < 10; i++) { await new Promise(r => setTimeout(r, 300)); se = getSpecEngine(); }
  if (!se) { console.warn('[idearium/api] spec→repo reconcile skipped: spec-engine not ready'); return { adopted: [], skipped: 0, failed: [] }; }

  const rl = getRepoLayer();
  const repos = rl.list({ includeArchived: true });
  const covered = new Set();
  for (const r of repos) {
    if (r.specUuid) covered.add(r.specUuid);
    if (r.promotedFromSpec) covered.add(r.promotedFromSpec);
    // §0.39.261 — earlier immutable versions of a repo (RepoLayer.replaceSpec,
    // the Nexus self-repos) are that repo's history, not orphans to adopt.
    for (const h of r.specHistory || []) if (h && h.specUuid) covered.add(h.specUuid);
  }
  const liveHashes = new Set(repos.filter(r => r.status !== 'archived' && r.rootHash).map(r => r.rootHash));

  const adopted = [], failed = [];
  let skipped = 0;
  let specs = [];
  try { specs = se.listSpecs() || []; }   // soft-deleted specs are already excluded
  catch (e) { console.warn(`[idearium/api] spec→repo reconcile: listSpecs failed: ${e.message}`); return { adopted, skipped, failed }; }

  for (const s of specs) {
    if (covered.has(s.uuid)) { skipped++; continue; }
    try {
      const manifest = se.loadSpec(s.uuid);
      const hasRealContent = (manifest.chunks || []).some(c => c.status === 'complete' && c.content);
      if (hasRealContent && manifest.rootHash && liveHashes.has(manifest.rootHash)) { skipped++; continue; }

      const result = rl.ingest({
        name: manifest.name,
        specUuid: manifest.uuid,
        source: 'spec.reconcile',
        parent: manifest.ideaUuid || null,
        ideaUuid: manifest.ideaUuid || null,   // §0.39.261 — the idea this spec came from becomes the repo's own idea
        compartmentId: _ensureCompartment(`idearium-repo-${manifest.uuid.slice(0, 8)}`, manifest.name),
      });
      if (result.error) { failed.push({ specUuid: manifest.uuid, name: manifest.name, error: result.error }); continue; }
      adopted.push({ specUuid: manifest.uuid, name: manifest.name, repoUuid: result.repo?.uuid || null });
      if (manifest.rootHash) liveHashes.add(manifest.rootHash);
    } catch (e) {
      failed.push({ specUuid: s.uuid, name: s.name, error: e.message });
    }
  }
  if (adopted.length) console.log(`[idearium/api] spec→repo reconcile: adopted ${adopted.length} repo-less spec(s) into compartments: ${adopted.map(a => `"${a.name}"`).join(', ')}`);
  for (const f of failed) console.warn(`[idearium/api] spec→repo reconcile: could not adopt "${f.name}" (${f.specUuid.slice(0, 8)}): ${f.error}`);
  return { adopted, skipped, failed };
}

function _repoDiskDir(repoUuid) {
  const repo = getRepoLayer().get(repoUuid);
  if (!repo) return null;
  if (repo.materializeDir) return repo.materializeDir;
  const mat = getRepoLayer().materialize(repoUuid);
  return mat.error ? null : mat.dir;
}

// §CHECKLIST 2026-09-20 — James: "when creating a project, we need to
// generate a dependency graph, file list is vital to use as a
// checklist" — inline in the create-project response, one round trip.
// runImportPipeline()'s GRAPHING step (MCO1) already writes both
// artifacts to disk on every project creation (repo.import-archive AND
// project-import.finalize both call it); this reads them back the same
// way repo.graph/repo.symbols/repo.verification already do (path.join(dir,
// ...) + JSON.parse), so the create-project response ships the full file
// list + full graph without the client needing a second GET. Non-fatal
// by the same rule the GRAPHING step itself follows (§NON-FATAL BY
// DESIGN, import-pipeline.js) — a missing/unreadable artifact degrades
// to null with an error string, never throws, never blocks the response
// the repo itself already succeeded on.
function _readPipelineArtifacts(dir) {
  const out = { files: null, graph: null, filesError: null, graphError: null };
  try {
    out.files = JSON.parse(fs.readFileSync(path.join(dir, 'indexes', 'files.json'), 'utf8'));
  } catch (e) {
    out.filesError = e.message;
  }
  try {
    out.graph = JSON.parse(fs.readFileSync(path.join(dir, 'graph.json'), 'utf8'));
  } catch (e) {
    out.graphError = e.message;
  }
  return out;
}

// §SHARED 2026-07-10 — the deterministic chunks-to-repo-files assembly that
// spec.promote does. Pulled out so spec.import can call it directly and
// create the repo as part of import ("repository created automatically"),
// instead of requiring a second manual promote call for a spec that's
// already complete the moment it's imported. Same rules apply: mode:'emerge'
// refuses to promote an unfinished spec rather than shipping a repo that
// claims completeness it doesn't have.
// §SIMPLIFIED 2026-07-11 — RepoLayer no longer needs a rebuilt files[] +
// specText bundle handed to it; it indexes the manifest that already
// exists by specUuid directly (see repo/index.js's redesign — "the spec
// is the metadata, the repo is a thin index over it"). This function's
// job shrinks to exactly one check: is the spec actually complete enough
// to promote. Everything past that is one line.
// §GUARDIAN-COMPILE 2026-07-15 — closes the second half of the gap the
// 2026-07-10 comment above named: "idea -> spec -> chunk -> dispatch ->
// ARTIFACT -> repo" ended at a markdown archive, never at real code.
// repo.ingest() below is UNCHANGED — the archive still always happens when
// chunks are complete, independent of whether compile succeeds. Compile is
// a second, separate outcome recorded on the result, not a precondition
// for the repo existing.
//
// ideaOS is now a required first argument (was previously free-standing —
// this function had no way to os.emit()). Every call site already has an
// IdeaOS instance in scope (both call sites are inside api/index.js's
// `handle()`, which does `const os = getIdeaOS()` at its top).
async function _promoteSpecToRepo(ideaOS, se, specUuid, mode = 'emerge') {
  let manifest;
  try { manifest = se.loadSpec(specUuid); }
  catch (e) { return { error: `spec not found: ${specUuid}` }; }

  const pending = manifest.chunks.filter(c => c.status !== 'complete');
  if (mode === 'emerge' && pending.length > 0) {
    return { error: `cannot auto-promote: ${pending.length} of ${manifest.chunks.length} chunks not built ` +
      `(${pending.map(c => c.sectionId).join(', ')}). Build them, or promote with mode:'manual' to finish in the spec builder.` };
  }

  // §MCO6 2026-09-20 — this path (spec.promote) never attached a
  // compartment at all; compartmentId defaulted to null forever. Every
  // OTHER real ingest() call site either already had one (project
  // upload flows) or was already forwarding one from its request body;
  // this one had no source to forward from — grep-confirmed the actual
  // gap, not the whole file's.
  const result = getRepoLayer().ingest({
    name: manifest.name,
    specUuid: manifest.uuid,
    source: `promote:${mode}`,
    parent: manifest.ideaUuid || null,
    ideaUuid: manifest.ideaUuid || null,   // §0.39.261 — the idea this spec came from becomes the repo's own idea
    promotedFromSpec: specUuid,
    compartmentId: _ensureCompartment(`idearium-repo-${manifest.uuid.slice(0, 8)}`, manifest.name),
  });
  if (result.error) return { error: result.error };

  const repoUuid = result.repo?.uuid || null;
  if (!repoUuid) return { error: 'ingest returned no repo — promotion did not create a repository' };

  // ── Real code, not just archived prose ──────────────────────────────────
  // Only attempted on 'emerge' (fully-built specs) — 'manual' promotions can
  // have TODO-marked pending sections, and extracting/compiling from an
  // admittedly-incomplete spec would be worse than not trying: a compile
  // "succeeding" against placeholder content is a false signal.
  let compiled = { ok: false, attempted: false };
  if (mode === 'emerge') {
    let extraction;
    try {
      extraction = await extractModulesViaGuardian(manifest, { specUuid: manifest.uuid });
    } catch (e) {
      extraction = { ok: false, error: `extraction threw: ${e.message}` };
    }

    if (extraction.ok) {
      const translatedSpec = {
        uuid: manifest.uuid,
        name: manifest.name,
        sections: [
          { id: 'intent', content: manifest.chunks.find(c => c.sectionId === 'purpose')?.content || '' },
          { id: 'module_hooks', content: extraction.yaml },
        ],
      };
      const outputDir = path.join(IDEARIUM_DATA_DIR, 'compiled', manifest.uuid);
      let compileResult;
      try {
        compileResult = await compileIdeariumSpec(translatedSpec, outputDir, { tier: 1 });
      } catch (e) {
        compileResult = { ok: false, error: e.message, step: 'compile-exception' };
      }
      compiled = {
        ok: !!compileResult.ok, attempted: true, outputDir,
        t0: compileResult.t0?.emitted?.length ?? 0,
        t1: compileResult.t1?.emitted?.length ?? 0,
        // Honest provenance label — distinct from compiler-bridge's own
        // 'structured'/'fallback' so a caller can tell "Guardian extracted
        // real modules and they compiled" apart from either of those paths.
        extraction: 'guardian-extracted',
        agent: extraction.agent,
        error: compileResult.ok ? null : (compileResult.error || 'compile did not report ok'),
      };
    } else {
      // §1.2 — no silent fallback into compiler-bridge's placeholder module.
      // A failed extraction is reported as a failed compile, not papered over.
      compiled = { ok: false, attempted: true, extraction: 'guardian-failed', error: extraction.error };
    }

    // Bus event — the ONLY thing that makes cortex-listeners.js persist this
    // into idearium_build_artifacts. Fire regardless of ok/error so failed
    // attempts are queryable too, not just successes. Named as a domain
    // event (build completed), not the implementation (compileIdeariumSpec's
    // internal compile() call) — same name the legacy spec.build route below
    // now emits too, so one listener covers both entry points.
    ideaOS.emit('idearium.spec.build.completed', {
      specUuid: manifest.uuid, outputDir: compiled.outputDir || null,
      t0: compiled.t0 ?? null, t1: compiled.t1 ?? null,
      extraction: compiled.extraction || null, agent: compiled.agent || null,
      ok: compiled.ok, error: compiled.error || null,
    });
  }

  return {
    repoUuid, ideaUuid: result.ideaUuid, specUuid: result.specUuid,
    // §MERGED 2026-07-11 — result.ideaUuid above is RepoLayer.ingest()'s
    // own SYNTHETIC "Repo: <name>" idea it always creates to track the
    // repo — not the idea that originated this spec. manifest.ideaUuid is
    // the real one; exposed separately so callers advancing the
    // ORIGINATING idea's phase don't silently advance the wrong idea.
    originIdeaUuid: manifest.ideaUuid || null,
    mode, chunksBuilt: manifest.chunks.length - pending.length, chunksTotal: manifest.chunks.length,
    compiled, // { ok, attempted, outputDir, t0, t1, extraction, agent, error } — archive vs real code, distinguishable
  };
}

const PORT    = config.PORT;
const BINDING = config.BINDING;
// §MIGRATED 2026-08-29 — real pulse handle, module scope (not local to
// the phase closure) so a real shutdown path has something real to call
// — same naming convention as cortex/boot.js's own real migration
// (_pulseClient), not a third, differently-named variable for the exact
// same real concept.
let _pulseClient = null;

// §CRASH FIX 2026-07-15 — last-resort net. The /sse and static-file branches
// above had their own uncaught-throw paths fixed directly (see their own
// comments for the actual mechanism and why it matters — Node 22 crashes
// the WHOLE process on an unhandled promise rejection by default, not just
// the one request). This is the belt-and-suspenders version: if some other
// branch nobody's found yet does the same thing, log it loudly and keep the
// server alive rather than silently going dark to every poller and the UI.
// §1.2 nothing silently fails — a caught-and-logged error is recoverable;
// an unannounced process death that leaves ':4800 unreachable' with no
// trace of why is exactly the failure mode this exists to prevent.
process.on('unhandledRejection', (reason) => {
  console.error('[API][FATAL-AVOIDED] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[API][FATAL-AVOIDED] uncaughtException:', err.stack || err.message);
});

// Idearium is internal-only — no LAN discovery, no remote tunnel.
// All access goes through the orchestrator (:9000) proxy.

// ─── Body parser ─────────────────────────────────────────────────────────────

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ─── Response helpers ─────────────────────────────────────────────────────────

// §MCO3 2026-09-20 — lib/nexus-client.js REJECTS on any non-2xx and on an
// unreachable system (it never resolves {error}), so a bare await lands in
// the outer catch as a generic 500. Repo snapshot routes need to tell "no
// such commit" (404) from "versionium is down" (502).
// 0.39.253 — Ollama's installed models, through the ollama bridge (GET :3749/api/models → { ok, models, active }).
// { ok:false, error } when the bridge or Ollama did not answer — never a guessed list: the bridge's own route answers
// ok:false with models [] when Ollama is unreachable, and that is passed on as unreachable.
async function _ollamaModels() {
  try {
    const d = await _nexusClient.get('ollama', '/api/models', { timeout: 4000 });
    if (!d || d.ok === false || !Array.isArray(d.models)) return { ok: false, error: 'Ollama did not answer (the bridge reached it and got nothing)', models: [], active: d && d.active || null };
    return { ok: true, models: d.models, active: d.active || null };
  } catch (e) { return { ok: false, error: `ollama bridge unreachable: ${e.message}`, models: [], active: null }; }
}

async function _versionium(method, urlPath, body, timeout) {
  try {
    const opts = timeout ? { timeout } : undefined;
    const data = method === 'GET'
      ? await _nexusClient.get('versionium', urlPath, opts)
      : await _nexusClient.post('versionium', urlPath, body, opts);
    return { ok: true, data };
  } catch (e) {
    const m = /-> HTTP (\d{3})/.exec(e.message);
    return { ok: false, status: m ? parseInt(m[1], 10) : 502, error: e.message };
  }
}

// §MCO-B 2026-09-20 — versionium's per-file layer as the two shapes
// idearium/repo/snapshot.js and snapshot-restore.js take. Both throw the real
// error text on any failure; neither invents a fallback.
async function _vcall(method, urlPath, body, timeout) {
  const r = await _versionium(method, urlPath, body, timeout);
  if (!r.ok) throw new Error(r.error);
  if (r.data && r.data.ok === false) throw new Error(r.data.error || 'versionium refused');
  return r.data;
}
function _fileLayers(repoUuid) {
  const q = (o) => new URLSearchParams(o).toString();
  const limits = () => _vcall('GET', '/api/versionium/files/limits');
  return {
    // for taking a snapshot
    fileLayer: {
      limits,
      plan: (tree) => _vcall('POST', '/api/versionium/files/plan', { repository: repoUuid, tree }, 30000),
      record: ({ commitId, tree, contents, mode }) => _vcall('POST', '/api/versionium/files/record', { repository: repoUuid, commitId, tree, contents, mode }, 120000),
      stage: (contents) => _vcall('POST', '/api/versionium/files/stage', { contents }, 120000),   // 0.39.263 — a first version larger than one request
    },
    // for restoring from one
    layer: {
      limits,
      tree: (commitId) => _vcall('GET', `/api/versionium/files/tree?${q({ repository: repoUuid, commitId })}`, undefined, 30000),
      content: async (commitId, p) => {
        const d = await _vcall('GET', `/api/versionium/files/content?${q({ repository: repoUuid, commitId, path: p })}`, undefined, 30000);
        return { path: d.path, sha256: d.sha256, bytes: Buffer.from(d.content_b64, 'base64') };
      },
    },
  };
}

// pipeline.snapshot_mode ('delta' | 'full') was declared in the idearium config
// from the start and read by nothing; MCO-B is its reader.
function _snapshotMode() {
  try { const m = getIdeariumValue('pipeline.snapshot_mode'); return m === 'full' ? 'full' : 'delta'; }
  catch (_) { return 'delta'; }
}

// §MCO-C 2026-09-20 — the baseline hook. Called after a repo's first index
// (archive import, project import, chunk run). Never awaited by callers and
// never throws: see idearium/repo/import-baseline.js.
function _baselineSnapshot(repoUuid, reason) {
  return (async () => {
    try {
      const repo = getRepoLayer().get(repoUuid);
      const dir = _repoDiskDir(repoUuid);
      if (!repo || !dir) return { status: 'failed', reason, code: 'NO_REPO', error: 'repo or directory not resolvable' };
      const { ensureBaselineSnapshot } = await import('../repo/import-baseline.js');
      const { commitRepoSnapshot, summarizeRepoSnapshots, SNAPSHOT_SYSTEM } = await import('../repo/snapshot.js');
      let enabled = true;
      try { enabled = getIdeariumValue('snapshots.import_baseline') !== false; } catch (_) { enabled = true; }
      const { fileLayer } = _fileLayers(repoUuid);
      const r = await ensureBaselineSnapshot({
        repo, repoDir: dir, enabled, reason,
        listSnapshots: async () => {
          const h = await _vcall('GET', `/api/versionium/history?system=${encodeURIComponent(SNAPSHOT_SYSTEM)}`);
          return summarizeRepoSnapshots(h.commits || [], repoUuid);
        },
        takeSnapshot: ({ message }) => commitRepoSnapshot({
          repo: getRepoLayer().get(repoUuid) || repo, repoDir: dir, message, fileLayer, snapshotMode: _snapshotMode(),
          commit: async (payload) => {
            const c = await _versionium('POST', '/api/versionium/commit', payload);
            if (!c.ok) return { error: c.error };
            return c.data?.commit || { error: c.data?.error || 'versionium returned no commit' };
          },
        }),
      });
      getIdeaOS().emit('idearium.repo.snapshot.baseline', { repoUuid, reason, status: r.status, commitId: r.commitId || null, error: r.error || null, code: r.code || null });
      if (r.status === 'failed') console.warn(`[api] baseline snapshot for ${repoUuid} (${reason}) did not complete: ${r.code}: ${r.error}`);
      return r;
    } catch (e) {
      console.warn(`[api] baseline snapshot for ${repoUuid} (${reason}) threw (non-fatal): ${e.message}`);
      return { status: 'failed', reason, code: 'THREW', error: e.message };
    }
  })();
}

function ok(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ ok: true, ...data }));
}

function err(res, code, message, detail = null) {
  // §1.2 — specific, not generic
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ ok: false, error: message, detail }));
}

// §FIX 2026-09-03 — James, from a real production boot log + UI screenshot:
// an idea ("Daw") and its linked spec both permanently stuck showing phase
// "building" with 0% tension, long after the real build had finished.
// Traced to a real gap: idearium/spec-engine/index.js's completeChunk()
// correctly flips manifest.status to 'complete' once every real chunk is
// done (confirmed by reading that function directly), but NOTHING in this
// file ever read that real status back and told the idea/spec phase
// tracker about it. The exact same class of bug was already found and
// fixed once, in the OLDER legacy `spec.build` -> compileIdeariumSpec()
// path (search this file for "phase was parked at 'building' above and
// nothing ever moved it forward") — but the newer WARP chunk-dispatch path
// (the one the real boot log confirms is actually active: "[idearium/api]
// WARP chunk dispatch active") never got the same fix. This is that fix,
// as one real, shared helper instead of four separate copies (this file
// has four real completeChunk() call sites) so the two paths can't drift
// apart from each other again.
function _syncPhaseFromManifest(os, manifest) {
  if (!manifest) return;
  if (manifest.status === 'complete') {
    os.emit('idearium.spec.update', { uuid: manifest.uuid, fields: { phase: 'complete' } });
    if (manifest.ideaUuid) {
      os.emit('idearium.idea.phase', { uuid: manifest.ideaUuid, phase: 'complete', source: 'spec-engine' });
    }
  }
}

const CORS = config.CORS;

// ── Capability model ──────────────────────────────────────────────────────────
// Every route maps to exactly one capability.
// A key must have that capability to call it.
// §1.2: wrong capability = 403 with the required capability named.
// §5.1: every key has a UUID and an audit trail.

const CAPS = {
  READ_IDEAS:   'read_ideas',    // GET ideas, specs, gaps, snapshots, stats, health
  WRITE_IDEAS:  'write_ideas',   // POST/PATCH ideas, create specs, open gaps
  SEARCH_IDEAS: 'search_ideas',  // GET /api/ideas?search= (subset of read)
  ADMIN:        'admin',         // key management, tunnel control, snapshots, cli.exec
};

// Route → required capability
const ROUTE_CAP = {
  'health':           null,              // public — no auth required
  'contract.get':     null,              // public — contract is always readable
  'stats.get':        null,              // public — non-sensitive, required by boot verify (§1.2 HALT fix)
  'snr.current':      CAPS.READ_IDEAS,
  'snr.history':      CAPS.READ_IDEAS,
  'events.log':       CAPS.READ_IDEAS,
  'idea.list':        CAPS.READ_IDEAS,
  'idea.show':        CAPS.READ_IDEAS,
  'idea.create':      CAPS.WRITE_IDEAS,
  'brainstorm.list':    CAPS.READ_IDEAS,
  'brainstorm.create':  CAPS.WRITE_IDEAS,
  'brainstorm.delete':  CAPS.WRITE_IDEAS,
  'brainstorm.promote': CAPS.WRITE_IDEAS,
  'workbench.index':  CAPS.READ_IDEAS,
  'workbench.show':   CAPS.READ_IDEAS,
  'workbench.admit':  CAPS.WRITE_IDEAS,
  'idea.repo':        CAPS.WRITE_IDEAS,
  'workbench.add':    CAPS.WRITE_IDEAS,
  'workbench.update': CAPS.WRITE_IDEAS,
  'workbench.delete': CAPS.WRITE_IDEAS,
  'workbench.spawn':  CAPS.WRITE_IDEAS,
  'workbench.assist': CAPS.WRITE_IDEAS,
  'idea.update':      CAPS.WRITE_IDEAS,
  'idea.tension':     CAPS.WRITE_IDEAS,
  'idea.link':        CAPS.WRITE_IDEAS,
  'idea.spec':        CAPS.WRITE_IDEAS,
  'idea.phase':       CAPS.WRITE_IDEAS,
  'idea.archive':     CAPS.WRITE_IDEAS,
  'idea.progress':    CAPS.WRITE_IDEAS,
  'spec.list':        CAPS.READ_IDEAS,
  'spec.show':        CAPS.READ_IDEAS,
  'spec.update':      CAPS.WRITE_IDEAS,
  'spec.check':       CAPS.WRITE_IDEAS,
  'spec.build':       CAPS.WRITE_IDEAS,
  'spec.export':      CAPS.READ_IDEAS,
  'spec.archive':     CAPS.WRITE_IDEAS,
  'gap.list':         CAPS.READ_IDEAS,
  'gap.show':         CAPS.READ_IDEAS,
  'gap.open':         CAPS.WRITE_IDEAS,
  'gap.resolve':      CAPS.WRITE_IDEAS,
  'gap.ignore':       CAPS.WRITE_IDEAS,
  'snapshot.list':    CAPS.READ_IDEAS,
  'snapshot.show':    CAPS.READ_IDEAS,
  'snapshot.diff':    CAPS.READ_IDEAS,
  'snapshot.push':    CAPS.ADMIN,
  'queue.show':       CAPS.READ_IDEAS,
  'queue.progress':   CAPS.WRITE_IDEAS,
  'speceng.setWarpPrimitives': CAPS.WRITE_IDEAS,
  'cli.exec':         CAPS.ADMIN,
  'config.get':       CAPS.READ_IDEAS,
  'config.set':       CAPS.WRITE_IDEAS,
};

// Key-based auth removed — Idearium is internal-only, reached solely
// through the orchestrator's proxy. No per-system credentials needed.

// ─── Router ──────────────────────────────────────────────────────────────────

function matchRoute(method, url) {
  const clean = url.split('?')[0].replace(/\/+$/, '') || '/';
  const segs  = clean.split('/').filter(Boolean);

  // Static routes first
  const routes = [
    ['GET',    [],                        'health'],
    ['GET',    ['health'],                 'health'],     // alias: GET /health → same as GET /
    ['GET',    ['api','contract'],        'contract.get'],
    ['GET',    ['api','contract','live'], 'contract.live'],
    // §MCO-F 2026-09-15 — idearium.config.get/.set (chunk_cap et al),
    // idearium/lib/config.js. GET has no body; POST takes {key, value,
    // actor?} — actor defaults to 'user' inside config.js itself.
    ['GET',    ['api','config'],          'config.get'],
    ['POST',   ['api','config'],          'config.set'],
    ['GET',    ['api','stats'],           'stats.get'],
    ['GET',    ['api','snr'],             'snr.current'],
    ['GET',    ['api','snr','history'],   'snr.history'],
    ['GET',    ['api','events'],          'events.log'],
    ['GET',    ['api','ideas'],           'idea.list'],
    ['POST',   ['api','ideas'],           'idea.create'],
    // §BUILT 2026-09-03 — James: "idearium needs to use data folder. no
    // DOM storage." Was localStorage('idearium.brainstorms') in the
    // browser, ui/js/app.js — genuinely the one place in idearium that
    // held real user data outside the JAA-backed data/ folder every other
    // feature already goes through. Same table pattern as everything
    // else (loadTable/appendRow/deleteRow, lib/db.js).
    ['GET',    ['api','brainstorms'],           'brainstorm.list'],
    ['POST',   ['api','brainstorms'],           'brainstorm.create'],
    ['DELETE', ['api','brainstorms',':uuid'],   'brainstorm.delete'],
    ['POST',   ['api','brainstorms',':uuid','promote'], 'brainstorm.promote'],
    // §BUILT 2026-09-26 — the Compartment (lib/idea-workbench.js): promoted
    // ideas land here with four recursive lanes (brainstorm / problem /
    // expand / improve). Entries nest to any depth, cross-link to any
    // entry or idea, and any entry can be spun out into its own idea —
    // which is itself a Compartment member with its own lanes.
    ['GET',    ['api','workbench'],                        'workbench.index'],
    ['GET',    ['api','ideas',':uuid','workbench'],        'workbench.show'],
    ['POST',   ['api','ideas',':uuid','workbench','admit'],'workbench.admit'],
    ['POST',   ['api','ideas',':uuid','repo'],             'idea.repo'],   // 0.39.263 — the idea's repo (its compartment), made if missing
    ['POST',   ['api','ideas',':uuid','workbench'],        'workbench.add'],
    ['PATCH',  ['api','workbench',':uuid'],                'workbench.update'],
    ['DELETE', ['api','workbench',':uuid'],                'workbench.delete'],
    ['POST',   ['api','workbench',':uuid','spawn'],        'workbench.spawn'],
    ['POST',   ['api','workbench',':uuid','assist'],       'workbench.assist'],
    ['GET',    ['api','specs'],           'spec.list'],
    ['POST',   ['api','specs'],           'spec.create'],
    ['GET',    ['api','gaps'],            'gap.list'],
    ['POST',   ['api','gaps'],            'gap.open'],
    ['GET',    ['api','snapshots'],       'snapshot.list'],
    ['POST',   ['api','snapshots'],       'snapshot.push'],
    ['POST',   ['api','cli','exec'],      'cli.exec'],      // unified CLI axiom
    ['GET',    ['api','repos'],           'repo.list'],
    ['POST',   ['api','repos'],           'repo.ingest'],
    // §IMPORT-PROJECT 2026-09-03 — the Import Project screen's zip path.
    // Distinct from POST /api/repos (flat text-file drops, no archive
    // handling) and from POST /api/projects (opaque zip shelf, no
    // RepoLayer/spec-engine — "store this zip, list it, get it back").
    // This one produces a real repo compartment FROM a zip, synchronously,
    // in one request — see handler for why the existing zip-ingest code
    // (idearium/repo/watcher.js) isn't called as-is.
    ['POST',   ['api','repos','import'],  'repo.import-archive'],
    // ── Upload Project (§UPLOAD-PROJECT 2026-09-15) — the full prompt ->
    // temp compartment -> dropzone -> "Import Repository" -> manifest/
    // project.json/.git -> full repo page flow. A distinct namespace
    // from /api/projects (the flat zip shelf above) and from
    // /api/repos/import (the synchronous, no-compartment zip-to-repo
    // path already used by ui/import-project's older screen) — this one
    // is stateful across two requests (start, then finalize-or-cancel)
    // because a real compartment has to exist BEFORE the file is
    // dropped, per James's own ordering ("creates a temporary
    // compartment (just in case the user cancels)... THEN a dropzone").
    ['POST',   ['api','project-import','start'],            'project-import.start'],
    ['POST',   ['api','project-import',':uuid','finalize'], 'project-import.finalize'],
    ['POST',   ['api','project-import',':uuid','cancel'],   'project-import.cancel'],
    ['GET',    ['api','project-import','config'],           'project-import.config'],
    // ── Projects (§PROJECTS 2026-07-19) — flat zip shelf, separate from repos ──
    ['GET',    ['api','projects'],                    'project.list'],
    ['POST',   ['api','projects'],                    'project.upload'],
    ['GET',    ['api','projects', ':uuid','download'],'project.download'],
    ['DELETE', ['api','projects', ':uuid'],            'project.delete'],
    // ── Spec Engine (Phase 40) ─────────────────────────────────────────────
    // §ROUTED 2026-07-09 — the action alone is unreachable; idearium dispatches
    // by (method, segments) -> action. A handler with no route is an orphan.
    ['GET',    ['api','spec-engine','warp-status'],          'speceng.warp.status'],
    ['GET',    ['api','spec-engine','templates'],            'speceng.templates'],
    ['GET',    ['api','spec-engine','specs'],               'speceng.list'],
    ['POST',   ['api','spec-engine','specs'],               'speceng.create'],
    // §ROUTED 2026-07-10 — the promote action that bridges a built spec to a repo.
    ['POST',   ['api','spec-engine','import'],              'spec.import'],
    ['POST',   ['api','spec-engine','specs',':uuid','promote'], 'spec.promote'],
    ['POST',   ['api','spec-engine','wizard'],              'speceng.wizard'],
    ['GET',    ['api','spec-engine','context'],             'speceng.context'],
    // §GATE 2026-07-11 — copilot adapter boundary. See copilot-adapter/index.js.
    ['POST',   ['api','copilot','suggest'],                 'copilot.suggest'],
    ['GET',    ['sse'],                   'sse'],
  ];

  for (const [m, pattern, action] of routes) {
    if (m !== method) continue;
    if (pattern.length !== segs.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = segs[i];
      else if (pattern[i] !== segs[i]) { match = false; break; }
    }
    if (match) return { action, params };
  }

  // Bridge routes

  // Dynamic routes
  const dynRoutes = [
    ['GET',    ['api','ideas',    ':uuid'],               'idea.show'],
    ['PATCH',  ['api','ideas',    ':uuid'],               'idea.update'],
    ['DELETE', ['api','ideas',    ':uuid'],               'idea.archive'],
    ['POST',   ['api','ideas',    ':uuid','tension'],     'idea.tension'],
    ['POST',   ['api','ideas',    ':uuid','link'],        'idea.link'],
    ['POST',   ['api','ideas',    ':uuid','spec'],        'idea.spec'],
    ['POST',   ['api','ideas',    ':uuid','phase'],       'idea.phase'],
    ['GET',    ['api','specs',    ':uuid'],               'spec.show'],
    ['PATCH',  ['api','specs',    ':uuid'],               'spec.update'],
    ['POST',   ['api','specs',    ':uuid','check'],       'spec.check'],
    ['POST',   ['api','ideas',    ':uuid','progress'],  'idea.progress'],
    ['POST',   ['api','queue',    ':queueId','progress'],'queue.progress'],
    ['GET',    ['api','queue',    ':queueId'],           'queue.show'],
    ['POST',   ['api','specs',    ':uuid','build'],       'spec.build'],
    ['GET',    ['api','specs',    ':uuid','export'],      'spec.export'],
    ['DELETE', ['api','specs',    ':uuid'],               'spec.archive'],
    ['GET',    ['api','gaps',     ':uuid'],               'gap.show'],
    ['POST',   ['api','gaps',     ':uuid','resolve'],     'gap.resolve'],
    ['POST',   ['api','gaps',     ':uuid','ignore'],      'gap.ignore'],
    ['GET',    ['api','snapshots',':uuid'],               'snapshot.show'],
    ['GET',    ['api','snapshots',':a','diff',':b'],      'snapshot.diff'],
    ['POST',   ['api','snapshots',':uuid','restore'],     'snapshot.restore'],
    ['GET',    ['api','repos',    ':uuid'],               'repo.show'],
    // ── Spec Engine dynamic routes ──────────────────────────────────────────
    ['GET',    ['api','spec-engine','specs',':uuid'],              'speceng.show'],
    ['POST',   ['api','spec-engine','specs',':uuid','build'],      'speceng.build'],
    ['POST',   ['api','spec-engine','specs',':uuid','chunk',':chunkUuid','complete'], 'speceng.chunk.complete'],
    ['POST',   ['api','spec-engine','specs',':uuid','chunk',':chunkUuid','fail'],     'speceng.chunk.fail'],
    // §BUILT 2026-09-03 — per-chunk agent reassignment, PENDING chunks only
    // (spec-engine/index.js's setChunkAgent enforces this, not this route).
    ['POST',   ['api','spec-engine','specs',':uuid','chunk',':chunkUuid','agent'],    'speceng.chunk.setAgent'],
    // §BUILT 2026-09-03 — WARP primitives, spec-level (not chunk-level,
    // no PENDING guard — this is declared metadata about the component,
    // editable any time).
    ['POST',   ['api','spec-engine','specs',':uuid','warp-primitives'],   'speceng.setWarpPrimitives'],
    ['POST',   ['api','spec-engine','specs',':uuid','archive'],    'speceng.archive'],
    ['DELETE', ['api','spec-engine','specs',':uuid'],              'speceng.delete'],
    ['POST',   ['api','spec-engine','specs',':uuid','restore'],    'speceng.restore'],
    ['POST',   ['api','spec-engine','specs',':uuid','expand'],     'speceng.expand'],
    ['POST',   ['api','repos',    ':uuid','fork'],        'repo.fork'],
    ['DELETE', ['api','repos',    ':uuid'],               'repo.archive'],
    ['GET',    ['api','repos',    ':uuid','lineage'],     'repo.lineage'],
    // §MERGED 2026-07-11 — file read/write/delete against a repo's
    // content, resolved through spec-engine chunks (v2 has no content
    // store of its own — see repo/index.js's file CRUD methods).
    ['GET',    ['api','repos',    ':uuid','file'],         'repo.file.read'],
    // §BUILT 2026-09-16 — nexus://repo/{repoUuid}/chunk/{chunkUuid}
    // (lib/nexus-uri.js's 'repo-chunk' route) needs to resolve a bare
    // chunkUuid to real content, and no existing route did that — the
    // only chunk-scoped routes were spec-engine's own complete/fail/
    // setAgent under specs/:uuid/chunk/:chunkUuid, and repo.file.read
    // needs a path, not a uuid. This is real, minimal glue: repo ->
    // specUuid -> spec-engine's loadSpec -> the one matching chunk ->
    // its real path -> repo.file.read's own readFile(), reusing every
    // piece rather than duplicating the lookup.
    ['GET',    ['api','repos',    ':uuid','chunk',':chunkUuid'], 'repo.chunk.show'],
    ['POST',   ['api','repos',    ':uuid','file'],         'repo.file.write'],
    ['DELETE', ['api','repos',    ':uuid','file'],         'repo.file.delete'],
    ['GET',    ['api','repos',    ':uuid','export'],       'repo.export'],
    // §QUERY-SURFACE 2026-09-17 — reads of import-pipeline.js's own
    // atlas.json/indexes output, added alongside repo.chunk.show rather
    // than as a second storage system. repo.index never returns chunk
    // content (spec §14); repo.search ranks by symbol/file token match.
    ['GET',    ['api','repos',    ':uuid','index'],         'repo.index'],
    ['GET',    ['api','repos',    ':uuid','search'],        'repo.search'],
    // ── §NEXUS-REPO-TOOLS 2026-09-15 — read access to what
    // import-pipeline.js's L2-L5 steps produce, for agent-suite's
    // repository.* tools (NEXUS-001 ALWAYS_MAP_FIRST — an agent maps
    // before it touches anything). All read-only except reindex.
    ['GET',    ['api','repos',    ':uuid','map'],           'repo.map'],
    ['GET',    ['api','repos',    ':uuid','chunks'],        'repo.chunks.list'],
    // §runtime-proof 2026-09-21 — which chunks ran under a PASSING test (V8 coverage, tied to chunk hash)
    ['POST',   ['api','repos',    ':uuid','proof'],         'repo.proof.run'],
    ['GET',    ['api','repos',    ':uuid','proof'],         'repo.proof.get'],
    ['GET',    ['api','repos',    ':uuid','chunks',':chunkId'], 'repo.chunks.get'],
    ['GET',    ['api','repos',    ':uuid','symbols'],       'repo.symbols'],
    // §24-26 graph (MCO1) — idearium/spec/idearium.repo-graph.spec
    ['GET',    ['api','repos',    ':uuid','graph'],          'repo.graph'],
    ['GET',    ['api','repos',    ':uuid','graph','traverse'], 'repo.graph.traverse'],
    ['GET',    ['api','repos',    ':uuid','graph','cone'],   'repo.graph.cone'],
    // 0.39.246 — the other two of the three graphs (code · execution · spec)
    ['GET',    ['api','repos',    ':uuid','graph','spec'],   'repo.graph.spec'],
    ['GET',    ['api','repos',    ':uuid','graphs'],         'repo.graphs'],
    ['GET',    ['api','repos',    ':uuid','verification'],  'repo.verification'],
    // §SCAN 2026-09-20 — the Intelligence subtab's data. Pure read over
    // graph.json/verification.json/verification-lazy.json; computes no
    // new facts of its own. See idearium/repo/scan.js's own header.
    ['GET',    ['api','repos',    ':uuid','scan'],          'repo.scan'],
    // §RESEQUENCED 2026-09-20 — the chunking step, callable on its own so
    // import can navigate you to the repo first and chunk after. Emits
    // idearium.repo.chunk.* over SSE so the UI can toast real progress.
    ['POST',   ['api','repos',    ':uuid','chunk'],         'repo.chunk.run'],
    // §MCO3 2026-09-20 — repository snapshots (§33). idearium/repo/snapshot.js
    // builds the nine-field record and commits it to versionium under its own
    // system ('idearium.repo'), never 'idearium' — see idearium.repo-snapshot.spec.
    ['POST',   ['api','repos',    ':uuid','snapshot'],      'repo.snapshot.commit'],
    ['GET',    ['api','repos',    ':uuid','snapshots'],     'repo.snapshot.list'],
    ['GET',    ['api','repos',    ':uuid','snapshots',':commitId'], 'repo.snapshot.show'],
    ['POST',   ['api','repos',    ':uuid','snapshots',':commitId','restore'], 'repo.snapshot.restore'],
    // §MCO-E 2026-09-20 — the repo's roadmap, from the phasemaps inside it
    // (idearium/repo/roadmap.js; spec idearium/spec/idearium.repo-roadmap.spec).
    ['GET',    ['api','repos',    ':uuid','roadmap'],        'repo.roadmap.get'],
    ['POST',   ['api','repos',    ':uuid','roadmap','phase'], 'repo.roadmap.phase.update'],
    // §CI 2026-09-20 — CI/CD per compartment. cos/ci/index.js owns the
    // pipeline; these are idearium's surface onto it, scoped to a repo
    // (which is what carries the compartmentId).
    // §REPO-HAT 2026-09-20 — the project agent. lib/repo-hat.js on top of
    // lib/hat-forge.js; this is idearium's surface onto it.
    ['GET',    ['api','repos',    ':uuid','hat'],           'repo.hat.show'],
    ['POST',   ['api','repos',    ':uuid','hat'],           'repo.hat.ensure'],
    ['POST',   ['api','repos',    ':uuid','hat','refresh'], 'repo.hat.refresh'],
    ['DELETE', ['api','repos',    ':uuid','hat'],           'repo.hat.revoke'],
    // §REPO-AGENT 2026-09-20 — James: "an agent tab for the agent cli for
    // the agent with the repo hat... each repo compartment in idearium."
    // lib/repo-agent.js composes the hat's own persona and sends one
    // ordinary prompt; it deliberately never calls copilot's
    // /api/agent/switch, which would mutate the HOST's single global
    // current agent and drag every other surface under this repo's hat.
    // See that file's header for the capability-vs-behaviour limit.
    ['GET',    ['api','repos',    ':uuid','agent'],           'repo.agent.status'],
    ['POST',   ['api','repos',    ':uuid','agent','prompt'],  'repo.agent.prompt'],
    ['GET',    ['api','repos',    ':uuid','agent','late'],    'repo.agent.late.find'],
    ['POST',   ['api','repos',    ':uuid','agent','late'],    'repo.agent.late.adopt'],
    ['GET',    ['api','repos',    ':uuid','agent','history'], 'repo.agent.history'],
    ['DELETE', ['api','repos',    ':uuid','agent','history'], 'repo.agent.history.clear'],
    // 0.39.257 — /tools (the catalog, marked with this compartment's scope) and /debug (what is wrong, from the systems)
    ['GET',    ['api','repos',    ':uuid','agent','tools'],   'repo.agent.tools'],
    ['POST',   ['api','repos',    ':uuid','agent','debug'],   'repo.agent.debug'],
    ['GET',    ['api','repos',    ':uuid','agent','graph'],   'repo.agent.graph'],
    ['GET',    ['api','repos',    ':uuid','agent','memory'],  'repo.agent.memory.list'],
    ['POST',   ['api','repos',    ':uuid','agent','memory'],  'repo.agent.memory.record'],
    ['DELETE', ['api','repos',    ':uuid','agent','memory',':obs'], 'repo.agent.memory.forget'],
    // §INJECT 2026-09-21 — .inject nodes: agent code into this compartment (lib/repo-inject.js)
    ['GET',    ['api','repos',    ':uuid','injects'],               'repo.inject.list'],
    ['POST',   ['api','repos',    ':uuid','injects'],               'repo.inject.create'],
    ['GET',    ['api','repos',    ':uuid','injects',':id'],         'repo.inject.get'],
    ['PUT',    ['api','repos',    ':uuid','injects',':id'],         'repo.inject.edit'],
    ['POST',   ['api','repos',    ':uuid','injects',':id','apply'], 'repo.inject.apply'],
    ['POST',   ['api','repos',    ':uuid','injects',':id','reject'],'repo.inject.reject'],
    ['POST',   ['api','repos',    ':uuid','injects',':id','revert'],'repo.inject.revert'],
    // §0.39.261 — Nexus as repos inside Nexus (idearium/repo/nexus-self.js,
    // lib/nexus-self/*). Static paths first so they never match :system.
    ['GET',    ['api','nexus-self'],                                  'nexus-self.status'],
    ['POST',   ['api','nexus-self','sync'],                           'nexus-self.sync'],
    ['GET',    ['api','nexus-self','understanding'],                  'nexus-self.understanding'],
    ['GET',    ['api','nexus-self','applies'],                        'nexus-self.applies'],
    ['GET',    ['api','nexus-self','atlas'],                          'nexus-self.atlas'],     // 0.39.263 — the nexus repo's Home
    ['POST',   ['api','nexus-self','resolve'],                        'nexus-self.resolve'],   // what an atlas reference opens
    ['GET',    ['api','nexus-self','file'],                           'nexus-self.file'],      // any text file of the immutable base
    ['POST',   ['api','nexus-self','applies',':id','rollback'],       'nexus-self.rollback'],
    ['GET',    ['api','nexus-self',':system'],                        'nexus-self.system'],
    ['GET',    ['api','nexus-self',':system','spec'],                 'nexus-self.spec'],
    ['GET',    ['api','nexus-self',':system','branches'],             'nexus-self.branch.list'],
    ['POST',   ['api','nexus-self',':system','branch'],               'nexus-self.branch.create'],
    ['GET',    ['api','nexus-self',':system','branch',':id'],         'nexus-self.branch.get'],
    ['DELETE', ['api','nexus-self',':system','branch',':id'],         'nexus-self.branch.destroy'],
    ['GET',    ['api','nexus-self',':system','branch',':id','file'],  'nexus-self.branch.file.get'],
    ['PUT',    ['api','nexus-self',':system','branch',':id','file'],  'nexus-self.branch.file.put'],
    ['DELETE', ['api','nexus-self',':system','branch',':id','file'],  'nexus-self.branch.file.delete'],
    ['POST',   ['api','nexus-self',':system','branch',':id','plan'],  'nexus-self.branch.plan'],
    ['POST',   ['api','nexus-self',':system','branch',':id','apply'], 'nexus-self.branch.apply'],
    // §RUN 2026-09-21 — run/test the repo in a COS test environment (lib/repo-run.js)
    ['POST',   ['api','repos',    ':uuid','run'],                   'repo.run'],
    ['GET',    ['api','repos',    ':uuid','run','capabilities'],    'repo.run.capabilities'],
    ['GET',    ['api','repos',    ':uuid','run','options'],         'repo.run.options'],   // §0.39.261 — the COS run menu (lib/cos-run.js)
    // §0.39.261 — the repo's own idea (the Idea tab) and one place for what is wrong (the Debug tab)
    ['GET',    ['api','repos',    ':uuid','idea'],                          'repo.idea.get'],
    ['PATCH',  ['api','repos',    ':uuid','idea'],                          'repo.idea.update'],
    ['POST',   ['api','repos',    ':uuid','idea','iterations'],             'repo.idea.iteration.create'],
    ['POST',   ['api','repos',    ':uuid','idea','iterations',':id','status'],  'repo.idea.iteration.status'],
    ['POST',   ['api','repos',    ':uuid','idea','iterations',':id','roadmap'], 'repo.idea.iteration.roadmap'],
    ['GET',    ['api','repos',    ':uuid','debug'],                         'repo.debug'],
    ['GET',    ['api','repos',    ':uuid','agent','settings'],      'repo.agent.settings.get'],
    ['POST',   ['api','repos',    ':uuid','agent','settings'],      'repo.agent.settings.set'],
    // 0.39.258 — the prompt blocks: everything the agent is sent besides its persona, edited here (lib/repo-prompt-blocks.js)
    ['GET',    ['api','repos',    ':uuid','agent','blocks'],        'repo.agent.blocks.get'],
    ['POST',   ['api','repos',    ':uuid','agent','blocks'],        'repo.agent.blocks.set'],
    ['POST',   ['api','repos',    ':uuid','agent','blocks','preview'], 'repo.agent.blocks.preview'],
    // 0.39.253 — Ollama's installed models, for the Agent tab's ollama dropdown
    ['GET',    ['api','ollama',   'models'],                        'ollama.models'],
    // §REPO-AGENT-NODE 2026-09-20 — the agent as portable node files.
    // .hat + .agent (as of 0.39.190 RAID's health snapshot is .health, so .agent is free for this;
    // see lib/repo-agent-node.js's header for the collision).
    ['POST',   ['api','repos',    ':uuid','agent','export'],  'repo.agent.export'],
    ['POST',   ['api','repos',    ':uuid','agent','import'],  'repo.agent.import'],
    // §KEYS 2026-09-20 — compartment key/secret options, on the COS vault.
    // Values are NEVER returned by any of these; listings are names only.
    ['GET',    ['api','repos',    ':uuid','ci','keys'],        'repo.ci.keys.list'],
    ['POST',   ['api','repos',    ':uuid','ci','keys'],        'repo.ci.keys.register'],
    ['DELETE', ['api','repos',    ':uuid','ci','keys',':alias'],'repo.ci.keys.remove'],
    ['GET',    ['api','repos',    ':uuid','ci','secrets'],     'repo.ci.secrets.list'],
    ['POST',   ['api','repos',    ':uuid','ci','secrets'],     'repo.ci.secrets.set'],
    ['DELETE', ['api','repos',    ':uuid','ci','secrets',':name'],'repo.ci.secrets.remove'],
    ['GET',    ['api','repos',    ':uuid','ci'],            'repo.ci.config'],
    ['PUT',    ['api','repos',    ':uuid','ci'],            'repo.ci.setConfig'],
    ['POST',   ['api','repos',    ':uuid','ci','run'],      'repo.ci.run'],
    ['GET',    ['api','repos',    ':uuid','ci','runs'],     'repo.ci.runs'],
    ['GET',    ['api','repos',    ':uuid','ci','runs',':runId'], 'repo.ci.run.show'],
    ['POST',   ['api','repos',    ':uuid','reindex'],       'repo.reindex'],
  ];

  for (const [m, pattern, action] of dynRoutes) {
    if (m !== method) continue;
    if (pattern.length !== segs.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = segs[i];
      else if (pattern[i] !== segs[i]) { match = false; break; }
    }
    if (match) return { action, params };
  }

  return null;
}

function parseQuery(url) {
  const qs = url.split('?')[1] || '';
  const out = {};
  for (const p of qs.split('&')) { const [k,v] = p.split('='); if(k) out[decodeURIComponent(k)] = decodeURIComponent(v||''); }
  return out;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handle(req, res, route, query, body) {
  const os = getIdeaOS();
  const { action, params } = route;

  // ── Auth gate — disabled ──────────────────────────────────────────────────
  // Idearium has no remote/direct access path. The orchestrator (:9000) is the
  // sole entry point to NEXUS; all subsystem traffic is proxied through it.
  // Key-based auth was for a per-system access model that no longer applies here.

  switch (action) {

    case 'health':
      return ok(res, { version: VERSION, snr: os.snr, uptime: process.uptime() });

    case 'contract.get':
      try { return ok(res, { contract: os.contract() }); }
      catch (e) { return err(res, 500, e.message); }

    // §PHASE 3 2026-07-10 — the interaction contract, projected from the REAL
    // route table instead of a static file. The hand-maintained
    // schemas/interaction-contract.json declared 30 endpoints while the router
    // had 55, and named none of the new actions (speceng.templates,
    // spec.promote, ...). A UI reading the static file is blind to half the API
    // and to everything built this session. This reads the route tuples out of
    // this module's own source — the same discipline the hook generator uses:
    // the contract is a projection of the code, so it cannot drift from it.
    case 'contract.live': {
      try {
        const src = _require('fs').readFileSync(_require('url').fileURLToPath(import.meta.url), 'utf8');
        const routes = [];
        // Match: ['GET', ['api','spec-engine','specs',':uuid','promote'], 'spec.promote'],
        const re = /\[\s*'(GET|POST|PUT|DELETE|PATCH)'\s*,\s*\[([^\]]*)\]\s*,\s*'([a-z][a-z0-9.]*)'\s*\]/gi;
        let m;
        while ((m = re.exec(src)) !== null) {
          const method = m[1];
          const segs = m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
          const path = '/' + segs.join('/');
          const action = m[3];
          // dedup: same method+path can appear as an alias
          if (!routes.some(r => r.method === method && r.path === path)) {
            routes.push({ method, path, action });
          }
        }
        return ok(res, {
          system: 'idearium',
          version: VERSION,
          generatedFrom: 'idearium/api/index.js route table (projection, not a static file)',
          endpointCount: routes.length,
          endpoints: routes.sort((a, b) => a.path.localeCompare(b.path)),
        });
      } catch (e) { return err(res, 500, `contract projection failed: ${e.message}`); }
    }

    // §MCO-F 2026-09-15 — James: "limit 500 for chunks needs to change.
    // have that as an option in the configuration file in idearium."
    // GET returns the whole live idearium.config (chunk_cap, zoom_levels,
    // snapshot_mode, auto_phasemap, cicd.*). POST sets one key; a human
    // caller (default actor:'user') can write anything, a copilot/agent
    // actor is rejected on non-copilot_writable keys (ssh_key_path) by
    // config.js itself — same validation either way, only the event's
    // actor field differs.
    case 'config.get':
      try { return ok(res, { config: getIdeariumConfig() }); }
      catch (e) { return err(res, 500, e.message); }

    case 'config.set': {
      const { key, value, actor } = body || {};
      if (!key) return err(res, 400, 'key required');
      try {
        const event = setIdeariumConfig(key, value, { actor: actor || 'user' });
        return ok(res, { event, config: getIdeariumConfig() });
      } catch (e) { return err(res, 400, e.message); }
    }

    case 'stats.get':
      return ok(res, { stats: os.stats() });

    case 'snr.current':
      return ok(res, { snr: os.snr });

    case 'snr.history':
      return ok(res, { samples: os.snrHistory(parseInt(query.n)||50) });

    case 'events.log':
      return ok(res, { events: os.eventLog(parseInt(query.n)||100) });

    // ── Ideas ──────────────────────────────────────────────────────────────

    case 'idea.list':
      return ok(res, { ideas: os.ideas(query) });

    case 'idea.create': {
      const { text, tags, compartment } = body;
      if (!text) return err(res, 400, 'text required');
      const ev = os.emit('idearium.idea.create', { text, tags: tags||[], compartment: compartment||null, source: 'api' });
      const idea = os.db.ideas[os.db.ideas.length - 1];
      // Mirror to orchestrator ledger (fire-and-forget)
      import('http').then(({ default: http }) => {
        const body2 = JSON.stringify({ system:'idearium', type:'idearium.idea.created', payload:{ uuid:idea?.uuid, text:(text||'').slice(0,80), tags } });
        const _o = _orchestrator();
        const r = http.request({ hostname:_o.host, port:_o.port, path:'/api/ledger', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body2)} }, ()=>{});
        r.on('error',()=>{}); r.write(body2); r.end();
      }).catch(()=>{});
      return ok(res, { idea, eventId: ev.uuid });
    }

    // ── Brainstorms (real, data/-backed — see route comment above) ──────────

    case 'brainstorm.list':
      return ok(res, { brainstorms: loadTable('idearium_brainstorms').sort((a, b) => b.ts - a.ts) });

    case 'brainstorm.create': {
      const { text, tags } = body;
      if (!text || !text.trim()) return err(res, 400, 'text required');
      const row = { uuid: `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`, text: text.trim(), tags: tags || [], ts: Date.now(), promoted: false };
      appendRow('idearium_brainstorms', row);
      return ok(res, { brainstorm: row });
    }

    case 'brainstorm.delete': {
      deleteRow('idearium_brainstorms', params.uuid);
      return ok(res, { deleted: true, uuid: params.uuid });
    }

    case 'brainstorm.promote': {
      // §CONVENTION — syncTable, not delete+reinsert, matching how every
      // other real update in this codebase touches a JAA table (repo/
      // index.js's _save, spec-engine's saveSpec) — one row mutated
      // in-memory, whole table synced back, not a delete/insert pair.
      const rows = loadTable('idearium_brainstorms');
      const b = rows.find(r => r.uuid === params.uuid);
      if (!b) return err(res, 404, `brainstorm not found: ${params.uuid}`);
      // §BUILT 2026-09-21 — James: "brainstorm should have full AI
      // assistance." Optional text override, from the AI-refine preview
      // in the UI — if given, the STORED row is updated to match what
      // was actually promoted, not left silently diverging from the
      // idea it became. Whoever calls this without a text still gets
      // the exact original behavior (promotes b.text as stored).
      if (typeof body.text === 'string' && body.text.trim()) b.text = body.text.trim();
      const ev = os.emit('idearium.idea.create', { text: b.text, tags: b.tags || [], compartment: null, source: 'brainstorm' });
      const promotedIdea = os.db.ideas[os.db.ideas.length - 1];
      b.promoted = true;
      b.ideaUuid = promotedIdea?.uuid || null;
      syncTable('idearium_brainstorms', rows, 'uuid');
      // §BUILT 2026-09-26 — a promoted idea moves into the Compartment: it
      // becomes a member, and its brainstorm text seeds the Brainstorm lane
      // so the thread that produced it is the first thing you work from.
      if (promotedIdea) {
        appendRow(WB.MEMBER_TABLE, WB.makeMember({ ideaUuid: promotedIdea.uuid, promotedFrom: b.uuid }));
        const seed = WB.makeEntry({ ideaUuid: promotedIdea.uuid, lane: 'brainstorm', text: b.text });
        if (seed.entry) appendRow(WB.ENTRY_TABLE, seed.entry);
        os._broadcast({ uuid: `wb-${Date.now()}`, type: 'workbench.changed', payload: { ideaUuid: promotedIdea.uuid }, ts: Date.now() });
      }
      const ir = _ensureIdeaRepo(promotedIdea.uuid);   // 0.39.263 — promoted → its own repo (a compartment)
      return ok(res, { promoted: true, idea: promotedIdea, compartment: true, repoUuid: ir.repo ? ir.repo.uuid : null, repoError: ir.error || null, eventId: ev.uuid });
    }

    // ── Compartment (idea workbench) — lib/idea-workbench.js ────────────────

    case 'workbench.index': {
      const members = loadTable(WB.MEMBER_TABLE);
      const entries = loadTable(WB.ENTRY_TABLE);
      const ideasByUuid = new Map(os.db.ideas.map(i => [i.uuid, i]));
      return ok(res, { lanes: WB.LANES, tree: WB.memberTree(members, entries, ideasByUuid), members: members.length, entries: entries.length });
    }

    case 'workbench.show': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      const members = loadTable(WB.MEMBER_TABLE);
      const all = loadTable(WB.ENTRY_TABLE);
      const mine = all.filter(e => e.ideaUuid === idea.uuid);
      const ideaText = (u) => os.idea(u)?.text || null;
      const member = members.find(m => m.ideaUuid === idea.uuid) || null;
      // Interconnection, both directions: what this idea's entries link to,
      // and what elsewhere links in (to this idea or any of its entries).
      const mineIds = new Set([idea.uuid, ...mine.map(e => e.uuid)]);
      const inbound = all.filter(e => e.ideaUuid !== idea.uuid && (e.links || []).some(l => mineIds.has(l)))
        .map(e => ({ uuid: e.uuid, ideaUuid: e.ideaUuid, ideaText: ideaText(e.ideaUuid), lane: e.lane, text: e.text, links: e.links }));
      const resolveRef = (ref) => {
        const e = all.find(x => x.uuid === ref);
        if (e) return { ref, kind: 'entry', ideaUuid: e.ideaUuid, ideaText: ideaText(e.ideaUuid), lane: e.lane, text: e.text };
        const i = os.idea(ref);
        return i ? { ref, kind: 'idea', ideaUuid: i.uuid, text: i.text } : { ref, kind: 'missing' };
      };
      const outbound = [...new Set(mine.flatMap(e => e.links || []))].map(resolveRef);
      const childIdeas = members.filter(m => m.parentIdea === idea.uuid).map(m => ({ ideaUuid: m.ideaUuid, text: ideaText(m.ideaUuid) }));
      const path = WB.ancestry(members, idea.uuid).map(u => ({ ideaUuid: u, text: ideaText(u) }));
      const links = os.db.links.filter(l => l.fromUuid === idea.uuid || l.toUuid === idea.uuid)
        .map(l => { const other = l.fromUuid === idea.uuid ? l.toUuid : l.fromUuid; return { ...l, other, otherText: ideaText(other) }; });
      return ok(res, { idea, member, lanes: WB.LANES, tree: WB.buildTree(mine), count: mine.length, inbound, outbound, childIdeas, path, links });
    }

    case 'idea.repo': {
      const ir = _ensureIdeaRepo(params.uuid);
      if (ir.error) return err(res, /not found/.test(ir.error) ? 404 : 500, ir.error);
      const members = loadTable(WB.MEMBER_TABLE);
      if (!members.some(m => m.ideaUuid === params.uuid)) appendRow(WB.MEMBER_TABLE, WB.makeMember({ ideaUuid: params.uuid }));
      return ok(res, { repoUuid: ir.repo.uuid, created: ir.created });
    }

    case 'workbench.admit': {
      // Bring an existing idea (one not promoted from a brainstorm) into the
      // Compartment. Idempotent: admitting a member twice is a no-op.
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      const members = loadTable(WB.MEMBER_TABLE);
      if (!members.some(m => m.ideaUuid === idea.uuid)) {
        appendRow(WB.MEMBER_TABLE, WB.makeMember({ ideaUuid: idea.uuid, parentIdea: body.parentIdea || null }));
        os._broadcast({ uuid: `wb-${Date.now()}`, type: 'workbench.changed', payload: { ideaUuid: idea.uuid }, ts: Date.now() });
      }
      const ir = _ensureIdeaRepo(idea.uuid);   // 0.39.263 — the lanes live in the idea's repo
      return ok(res, { admitted: true, ideaUuid: idea.uuid, repoUuid: ir.repo ? ir.repo.uuid : null, repoError: ir.error || null });
    }

    case 'workbench.add': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      const all = loadTable(WB.ENTRY_TABLE);
      const made = WB.makeEntry({ ideaUuid: idea.uuid, lane: body.lane, text: body.text, parentUuid: body.parentUuid, links: body.links }, all);
      if (made.error) return err(res, 400, made.error);
      if (!loadTable(WB.MEMBER_TABLE).some(m => m.ideaUuid === idea.uuid)) appendRow(WB.MEMBER_TABLE, WB.makeMember({ ideaUuid: idea.uuid }));
      appendRow(WB.ENTRY_TABLE, made.entry);
      os._broadcast({ uuid: `wb-${Date.now()}`, type: 'workbench.changed', payload: { ideaUuid: idea.uuid, entry: made.entry.uuid }, ts: Date.now() });
      return ok(res, { entry: made.entry });
    }

    case 'workbench.update': {
      const all = loadTable(WB.ENTRY_TABLE);
      const i = all.findIndex(e => e.uuid === params.uuid);
      if (i < 0) return err(res, 404, `entry not found: ${params.uuid}`);
      if (body.addLink && !all.some(e => e.uuid === body.addLink) && !os.idea(body.addLink)) return err(res, 400, `link target not found: ${body.addLink}`);
      if (body.addLink === params.uuid) return err(res, 400, 'an entry cannot link to itself');
      const r = WB.patchEntry(all[i], body);
      if (r.error) return err(res, 400, r.error);
      all[i] = r.entry;
      syncTable(WB.ENTRY_TABLE, all, 'uuid');
      os._broadcast({ uuid: `wb-${Date.now()}`, type: 'workbench.changed', payload: { ideaUuid: r.entry.ideaUuid, entry: r.entry.uuid }, ts: Date.now() });
      return ok(res, { entry: r.entry });
    }

    case 'workbench.delete': {
      const all = loadTable(WB.ENTRY_TABLE);
      const e = all.find(x => x.uuid === params.uuid);
      if (!e) return err(res, 404, `entry not found: ${params.uuid}`);
      const gone = [e.uuid, ...WB.descendants(all, e.uuid)];
      for (const u of gone) deleteRow(WB.ENTRY_TABLE, u);
      os._broadcast({ uuid: `wb-${Date.now()}`, type: 'workbench.changed', payload: { ideaUuid: e.ideaUuid }, ts: Date.now() });
      return ok(res, { deleted: gone });
    }

    case 'workbench.spawn': {
      // Recursion across ideas: an entry becomes its own idea, a child
      // member of this one's Compartment, linked causally, with the entry
      // (and its subtree's text) seeding the child's matching lane.
      const all = loadTable(WB.ENTRY_TABLE);
      const i = all.findIndex(x => x.uuid === params.uuid);
      if (i < 0) return err(res, 404, `entry not found: ${params.uuid}`);
      const e = all[i];
      if (e.spawnedIdea && os.idea(e.spawnedIdea)) return ok(res, { idea: os.idea(e.spawnedIdea), existed: true });
      const parent = os.idea(e.ideaUuid);
      os.emit('idearium.idea.create', { text: e.text, tags: [...(parent?.tags || []), `from:${e.lane}`], compartment: null, source: 'workbench' });
      const child = os.db.ideas[os.db.ideas.length - 1];
      if (!child) return err(res, 500, 'idea create produced no idea');
      os.emit('idearium.idea.link', { fromUuid: e.ideaUuid, toUuid: child.uuid, linkType: 'causal', source: 'workbench' });
      appendRow(WB.MEMBER_TABLE, WB.makeMember({ ideaUuid: child.uuid, parentIdea: e.ideaUuid }));
      const seed = WB.makeEntry({ ideaUuid: child.uuid, lane: e.lane, text: e.text, links: [e.uuid] });
      if (seed.entry) appendRow(WB.ENTRY_TABLE, seed.entry);
      all[i] = { ...e, spawnedIdea: child.uuid, updatedAt: Date.now() };
      syncTable(WB.ENTRY_TABLE, all, 'uuid');
      os._broadcast({ uuid: `wb-${Date.now()}`, type: 'workbench.changed', payload: { ideaUuid: e.ideaUuid, child: child.uuid }, ts: Date.now() });
      return ok(res, { idea: child, parentIdea: e.ideaUuid });
    }

    case 'workbench.assist': {
      // Copilot works an entry in its own lane's terms. Preview-first like
      // every other assist here: returns suggestion lines, stores nothing.
      const all = loadTable(WB.ENTRY_TABLE);
      const e = all.find(x => x.uuid === params.uuid);
      if (!e) return err(res, 404, `entry not found: ${params.uuid}`);
      const lane = body.lane && WB.LANE_IDS.includes(body.lane) ? body.lane : e.lane;
      const pathTexts = [];
      for (let cur = e, n = 0; cur && cur.parentUuid && n < 32; n++) { cur = all.find(x => x.uuid === cur.parentUuid); if (cur) pathTexts.unshift(cur.text); }
      const ca = getCopilotAdapter();
      if (!ca) return err(res, 503, 'copilot-adapter not ready');
      const goal = WB.lanePrompt(lane, os.idea(e.ideaUuid)?.text || '', e.text, pathTexts);
      const result = await ca.suggest({ context: { ideaUuid: e.ideaUuid, lane }, goal, current_gate: `workbench.${lane}` });
      const raw = (result?.suggestions || []).join('\n');
      const lines = raw.split(/\n+/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).slice(0, 8);
      return ok(res, { lane, connected: result?.connected !== false, reason: result?.reason || null, suggestions: lines });
    }

    case 'idea.show': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      const links = os.db.links.filter(l=>l.fromUuid===idea.uuid||l.toUuid===idea.uuid);
      const gaps  = os.gaps({ status:'open' }).filter(g=>(g.between||[]).includes(idea.uuid)||g.ideaUuid===idea.uuid);
      return ok(res, { idea, links, openGaps: gaps });
    }

    case 'idea.update': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.idea.update', { uuid: params.uuid, fields: body, source: 'api' });
      return ok(res, { idea: os.idea(params.uuid) });
    }

    case 'idea.phase': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.phase) return err(res, 400, 'phase required');
      os.emit('idearium.idea.phase', { uuid: params.uuid, phase: body.phase, source: 'api' });

      // §FIX 2026-09-03 — James: "clicking on idearium phase to building
      // does nothing, needs to change for the compartment... we need a
      // compartment specifically made for idearium." Checked directly:
      // IdeaPhaseGate.transform() (idearium/index.js) really does flip
      // idea.phase and persist it — the UI's click was never a no-op at
      // the data layer. But nothing beyond that field flip ever happened:
      // no real compartment gets created, so "building" was cosmetic.
      // §WHY THIS LIVES HERE, NOT IN THE GATE — same real constraint this
      // file's own SnapshotGate removal already documented: siso's
      // Stream.emit() calls gate.transform() synchronously with no await,
      // so an async spawn() call inside IdeaPhaseGate would have its
      // promise silently dropped. This route handler is already async and
      // already awaited by its caller — the same precedent SnapshotGate's
      // removal established (commitSnapshot/restoreSnapshot as direct
      // async methods the API awaits, not async Gates).
      //
      // §MCO6 2026-09-20 — MIGRATED off lib/compartment-engine.js's
      // spawn(). The 2026-09-15 cos-bridge.js build fixed exactly this
      // mistake for project-container.js and said so plainly in its own
      // header: "idearium's 'Upload Project' flow called itself a
      // compartment flow and was not one... compartment-engine: a real
      // module, but a different concept — an in-process constraint
      // frame with no filesystem, no manifest, no process, no system
      // map." This call site was the exact same mistake, one caller
      // over: it also called itself a compartment flow ("we need a
      // compartment specifically made for idearium," the §FIX 2026-09-03
      // note below records James saying so directly) and also was not
      // one — idea.compartment held a compartment-engine constraint-frame
      // id, a completely different id-space than a repo's real
      // compartmentId (idearium/repo/index.js), which IS a real COS id.
      // Two ideas of "compartment" in one system, un-grep-confirmable
      // apart — exactly what MCO6's gate forbids. Fixed the same way
      // project-container.js already was: cos-bridge.js's real
      // createCompartment(), no end-state PASS/FAIL evaluation needed
      // here (this call site never used that half of compartment-engine
      // to begin with), so nothing here needs compartment-engine at all.
      //
      // §FIX 2026-09-03 (superseded above, kept for the record) — James:
      // "clicking on idearium phase to building does nothing, needs to
      // change for the compartment... we need a compartment specifically
      // made for idearium." IdeaPhaseGate.transform() (idearium/index.js)
      // really does flip idea.phase and persist it; nothing beyond that
      // field flip happened before this fix existed.
      // §WHY THIS LIVES HERE, NOT IN THE GATE — siso's Stream.emit()
      // calls gate.transform() synchronously with no await, so an async
      // call inside IdeaPhaseGate would have its promise silently
      // dropped. This route handler is already async and already
      // awaited by its caller.
      let compartmentId = null;
      if (body.phase === 'building' && !idea.compartment) {
        compartmentId = _ensureCompartment(`idearium-idea-${params.uuid.slice(0, 8)}`, idea.text);
        if (compartmentId) {
          os.emit('idearium.idea.update', { uuid: params.uuid, fields: { compartment: compartmentId }, source: 'idea.phase' });
        }
      }

      return ok(res, { idea: os.idea(params.uuid), compartmentId });
    }

    case 'idea.tension': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.idea.tension', { uuid: params.uuid });
      return ok(res, { idea: os.idea(params.uuid), tension: { score: os.idea(params.uuid).tension } });
    }

    case 'idea.link': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.toUuid) return err(res, 400, 'toUuid required');
      os.emit('idearium.idea.link', { fromUuid: params.uuid, toUuid: body.toUuid, linkType: body.linkType||'resonance', source:'api' });
      return ok(res, { linked: true });
    }

    case 'idea.spec': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      os.emit('idearium.spec.create', { name: body.name || `Spec: ${idea.text.slice(0,40)}`, ideaUuid: params.uuid, source:'api' });
      const spec = os.db.specs[os.db.specs.length - 1];
      // §MERGED 2026-07-11 — SpecCreateGate links idea.linkedSpec but never
      // advances idea.phase; only advances forward, never regresses an
      // idea already further along.
      if (['seed','expanding','tensioned'].includes(idea.phase)) {
        os.emit('idearium.idea.phase', { uuid: params.uuid, phase: 'specced', source: 'api' });
      }
      return ok(res, { spec });
    }

    case 'idea.archive': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      if (!body.reason) return err(res, 400, 'reason required (§M1 — nothing deleted)');
      os.emit('idearium.idea.archive', { uuid: params.uuid, reason: body.reason, source:'api' });
      return ok(res, { archived: true });
    }

    case 'spec.archive': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      if (!body.reason) return err(res, 400, 'reason required (§M1 — nothing deleted)');
      os.emit('idearium.spec.archive', { uuid: params.uuid, reason: body.reason, source:'api' });
      return ok(res, { archived: true });
    }

    // ── Specs ──────────────────────────────────────────────────────────────

    // §BUG FIXED 2026-07-10 — "the idearium ui has no specs." The Spec Library
    // panel calls /api/specs (spec.list), which returned ONLY os.specs() — the
    // legacy OS db.specs, which is empty. Meanwhile 16 real specs live in the
    // spec-engine (/api/spec-engine/specs). Two spec stores, and the UI read the
    // empty one. Merge both here so /api/specs shows every spec regardless of
    // which subsystem created it. Legacy first (unchanged for existing readers),
    // then spec-engine manifests, deduped by uuid. A spec-engine failure must
    // not blank the legacy list (§1.2).
    case 'spec.list': {
      // §NEW 2026-07-16 — same reasoning as spec-engine's `deleted` filter
      // in listSpecs(): os.specs(query) never excluded phase:'archived' on
      // its own (specs() only filters by phase when explicitly asked), so
      // archiving a legacy spec via the new SpecArchiveGate did nothing to
      // this list without this. query.includeArchived=1 opts back in.
      let legacy = os.specs(query) || [];
      if (!query.includeArchived) legacy = legacy.filter(s => s.phase !== 'archived');
      let engine = [];
      try {
        const se = getSpecEngine();
        if (se) {
          // Normalize spec-engine manifests to the shape the UI's renderSpecList
          // expects: it reads .sections (chunks), .phase (status), .version. The
          // engine names them chunks/status/version, so without this map specs
          // render with blank section chips and no status. One shape for every
          // consumer; the UI needs no change.
          engine = (se.listSpecs() || []).map(s => ({
            ...s,
            phase: s.status,
            sections: (s.chunks || []).map(c => ({
              id: c.sectionId || c.chunkIdx, title: c.sectionTitle || c.sectionId,
              // The UI marks a chip 'done' when .content is truthy. The list is
              // deliberately content-free (loaded on demand in the detail view),
              // so a complete section gets a non-empty marker keyed on STATUS —
              // the chip lights without shipping the section body into the list.
              content: c.status === 'complete' ? '\u2713' : '', required: true,
            })),
          }));
        }
      } catch (e) { console.warn('[idearium/api] spec-engine list failed, legacy only:', e.message); }
      const seen = new Set(legacy.map(s => s.uuid));
      const merged = [...legacy, ...engine.filter(s => !seen.has(s.uuid))];
      return ok(res, { specs: merged, sources: { legacy: legacy.length, engine: engine.length } });
    }

    case 'spec.create': {
      if (!body.name) return err(res, 400, 'name required');
      os.emit('idearium.spec.create', { name: body.name, ideaUuid: body.ideaUuid || null, source: 'api' });
      const spec = os.db.specs[os.db.specs.length - 1];
      return ok(res, { spec });
    }

    case 'spec.show': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      return ok(res, { spec });
    }

    case 'spec.update': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      os.emit('idearium.spec.update', { uuid: params.uuid, fields: body });
      return ok(res, { spec: os.spec(params.uuid) });
    }

    case 'spec.check': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      os.emit('idearium.spec.check', { uuid: params.uuid });
      return ok(res, { spec: os.spec(params.uuid) });
    }

    case 'spec.build': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);

      // Run spec check first
      os.emit('idearium.spec.check', { uuid: params.uuid });
      const checked = os.spec(params.uuid);

      // Collect all sections with content
      const built = [], missing = [];
      for (const s of checked.sections) {
        if (s.required && !s.complete && !s.content) missing.push(s.id);
        else if (s.content) built.push(s.id);
      }

      if (missing.length > 0 && checked.phase !== 'specced') {
        return ok(res, {
          status: 'incomplete', spec: checked,
          missing, built,
          message: `${missing.length} required sections missing content before build`,
        });
      }

      // Advance phase to building
      os.emit('idearium.spec.update', { uuid: params.uuid, fields: { phase: 'building' } });

      // Fire build event to bus — orchestrator + bridge pick this up
      os.emit('idearium.spec.built', {
        specUuid: params.uuid, name: spec.name,
        sections: built.length, ts: Date.now(),
      });

      // §MCO8 2026-09-13 — track_d (axiom §5.2 compliance, docs/2026-09-13-
      // axiom-5-2-raid-routing-phasemap.spec). This is the LEGACY
      // spec.build route — real, heavy write work (drives
      // compileIdeariumSpec() below) that had zero RAID observability,
      // unlike the newer spec-engine chunk path a few hundred lines
      // above in this same file, which already submits+reports via RAID
      // (§RAID-SOURCE 2026-08-29). Reusing that exact proven, additive
      // pattern and the already-registered 'idearium:build' boundary
      // (cortex/core/raid/contract-boundary.js) rather than inventing a
      // second one for the same real system doing the same kind of
      // work. Never blocks: a submission failure here must not stop a
      // real spec build (§HONEST LIMIT, same as the chunk path's own).
      let _raidQueueId = null;
      try {
        _raidQueueId = _require('../../cortex/core/raid/contract-intake.js').submitContract(
          { content: `spec.build:${params.uuid}`, file: null, title: spec.name || params.uuid },
          { source: 'idearium', intention: 'build' }
        ).queueId;
      } catch (e) {
        console.warn('[idearium/api] could not submit real RAID observability contract for spec.build (build proceeds regardless):', e.message);
      }

      // ── Actually compile — this used to be the gap: spec.build only
      // flipped a phase field and never touched emerge/compiler, which is
      // a real, separate, working Tier 0/1 compiler. compileIdeariumSpec()
      // converts the section-shaped spec into what that compiler expects,
      // runs it (Cortex preflight → T0 structure → T1 scaffold → writeback),
      // and also drops a ui-map.json stub for Architect (Phase 43 isn't
      // built yet — the stub is labeled as such, not presented as real).
      const outputDir = path.join(os.dataDir || path.join(process.cwd(), 'data'), 'compiled', params.uuid);
      let compileResult;
      try {
        compileResult = await compileIdeariumSpec(checked, outputDir, { tier: 1 });
      } catch (e) {
        compileResult = { ok: false, error: e.message, step: 'bridge-call' };
      }

      if (compileResult.ok) {
        // §RENAMED 2026-07-15 — was 'idearium.spec.compiled' (named after the
        // implementation call, compileIdeariumSpec). Renamed to the domain
        // event so this legacy route and the newer guardian-promote path
        // (api/index.js's _promoteSpecToRepo) feed the same cortex listener
        // (lib/cortex-listeners.js) instead of two differently-named events.
        os.emit('idearium.spec.build.completed', {
          specUuid: params.uuid, outputDir,
          t0: compileResult.t0?.emitted?.length ?? 0,
          t1: compileResult.t1?.emitted?.length ?? 0,
          topology: compileResult.topology || null,
          extraction: 'legacy-sections', // honest provenance — this route parses os.spec()'s section shape, not a chunk-manifest
          ok: true,
        });
        // Compile actually finished — phase was parked at 'building' above
        // and nothing ever moved it forward. Advance it now so the UI
        // stops showing "building" for a build that's already done.
        os.emit('idearium.spec.update', { uuid: params.uuid, fields: { phase: 'complete' } });
        // §MCO8 2026-09-13 — report the already-known, real outcome back
        // to RAID (see submission above), same best-effort pattern as
        // the chunk-dispatch path's own reportExternalOutcome call.
        if (_raidQueueId) {
          try {
            const _intake = _require('../../cortex/core/raid/contract-intake.js');
            _intake.reportExternalOutcome(_raidQueueId, { status: _intake.STATUS.PASS });
          } catch (_) { /* best-effort, see above */ }
        }
      } else {
        os.emit('idearium.error', { op: 'spec.build.compile', reason: compileResult.error });
        // Compile failed — don't leave the spec parked on 'building' forever
        // (that reads as "actively building" when it's actually dead).
        // Fall back to 'specced' so the UI reflects reality and a rebuild
        // can be re-attempted.
        os.emit('idearium.spec.update', { uuid: params.uuid, fields: { phase: 'specced' } });
        if (_raidQueueId) {
          try {
            const _intake = _require('../../cortex/core/raid/contract-intake.js');
            _intake.reportExternalOutcome(_raidQueueId, { status: _intake.STATUS.FAIL, verdict: compileResult.error || null });
          } catch (_) { /* best-effort, see above */ }
        }
      }

      // Notify orchestrator
      import('http').then(({ default: http }) => {
        const payload = JSON.stringify({
          system: 'idearium', type: 'idearium.spec.built',
          payload: { specUuid: params.uuid, name: spec.name, sections: built.length, compiled: !!compileResult.ok },
        });
        const _o = _orchestrator();
        const r = http.request({ hostname:_o.host, port:_o.port, path:'/api/ledger',
          method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} }, ()=>{});
        r.on('error',()=>{}); r.write(payload); r.end();
      }).catch(()=>{});

      return ok(res, {
        status: compileResult.ok ? 'built' : 'build_failed', spec: os.spec(params.uuid),
        built, missing,
        message: compileResult.ok
          ? `spec ${params.uuid.slice(0,8)} → complete`
          : `spec ${params.uuid.slice(0,8)} → build failed: ${compileResult.error || 'unknown error'}`,
        compiler: compileResult,
      });
    }

    case 'spec.export': {
      const spec = os.spec(params.uuid);
      if (!spec) return err(res, 404, `spec not found: ${params.uuid}`);
      const md = specToMarkdown(spec);
      res.writeHead(200, { 'Content-Type': 'text/markdown', ...CORS });
      return res.end(md);
    }

    // ── Gaps ───────────────────────────────────────────────────────────────

    case 'gap.list':
      return ok(res, { gaps: os.gaps(query) });

    case 'gap.open': {
      if (!body.description) return err(res, 400, 'description required');
      const ev = os.emit('idearium.gap.open', { ...body, source:'api' });
      const gap = os.db.gaps[os.db.gaps.length - 1];
      return ok(res, { gap, eventId: ev.uuid });
    }

    case 'gap.show': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      return ok(res, { gap });
    }

    case 'gap.resolve': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      os.emit('idearium.gap.resolve', { uuid: params.uuid, resolution: body.resolution||'' });
      return ok(res, { gap: os.gap(params.uuid) });
    }

    case 'gap.ignore': {
      const gap = os.gap(params.uuid);
      if (!gap) return err(res, 404, `gap not found: ${params.uuid}`);
      os.emit('idearium.gap.ignore', { uuid: params.uuid, reason: body.reason||'' });
      return ok(res, { gap: os.gap(params.uuid) });
    }

    // ── Snapshots ──────────────────────────────────────────────────────────

    // §SNAPSHOTGATE MERGE 2026-09-01 — all four now real network calls to
    // cortex/versionium via idearium's commitSnapshot()/snapshots()/
    // snapshot()/diffSnapshots()/restoreSnapshot() (see idearium/index.js).
    // Errors are real now (cortex unreachable, etc.) — reported as 502, not
    // swallowed into an empty result.
    case 'snapshot.list': {
      const snaps = await os.snapshots(50);
      if (snaps?.error) return err(res, 502, snaps.error);
      return ok(res, { snapshots: snaps });
    }

    case 'snapshot.push': {
      const snap = await os.commitSnapshot({ message: body.message||'snapshot', branch: body.branch||'main', author: body.author||'api', causedBy: body.causedBy || null });
      if (snap?.error) return err(res, 502, snap.error);
      return ok(res, { snapshot: snap });
    }

    case 'snapshot.show': {
      const snap = await os.snapshot(params.uuid);
      if (!snap) return err(res, 404, `snapshot not found: ${params.uuid}`);
      return ok(res, { snapshot: snap });
    }

    case 'snapshot.diff': {
      const diff = await os.diffSnapshots(params.a, params.b);
      if (diff?.error) return err(res, 404, diff.error);
      return ok(res, { diff });
    }

    case 'snapshot.restore': {
      const result = await os.restoreSnapshot(params.uuid, { author: 'api' });
      if (result?.error) return err(res, 400, result.error);
      return ok(res, { restored: result.commitId, stashCommitId: result.stashCommitId, ideas: result.ideas, specs: result.specs, gaps: result.gaps });
    }

    // ── Repos ──────────────────────────────────────────────────────────────
    // Each idea is a repo, not a single hardcoded "Nexus folder". Nexus
    // itself is just the first ingested repo, not a special case.

    case 'repo.list':
      return ok(res, { repos: getRepoLayer().list(query) });

    case 'repo.show': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      return ok(res, { repo });
    }

    // §GAP CLOSED 2026-07-10 — "Idearium isn't importing ideas into the
    // repository library. When you click promote idea to a repository, it needs
    // two options, automatic using emerge or manual using the spec builder."
    //
    // Root cause: repo.ingest requires files[] (a drag-and-drop payload). There
    // was NO path from a built SPEC to a repo — promoting an idea produced a
    // spec, and nothing turned that spec into a repo artifact. This is the last
    // link before the loop turns: idea → spec → chunk → dispatch → ARTIFACT → repo.
    //
    // mode:
    //   'emerge' (automatic) — deterministic assembly of the spec's completed
    //       chunks into a single .spec artifact. No agent. Zero tokens. Fails
    //       loudly if chunks are still pending rather than shipping a partial
    //       repo that looks complete.
    //   'manual' (spec builder) — same assembly, but pending chunks are allowed
    //       and marked as TODO sections, so a human finishes them in the builder.
    // §IMPORT 2026-07-10 — "import zip or .spec to build a repo." Accepts raw
    // .spec text, parses its blocks into a manifest with authored sections
    // pre-filled (zero tokens), and returns a spec that is immediately
    // promotable to a repo via spec.promote. The zip path lands the same way:
    // extract, feed each .spec here.
    case 'spec.import': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      const { specText, name } = body;
      if (!specText) return err(res, 400, 'specText required (raw .spec file contents)');
      try {
        const result = se.importSpec({ name, specText });
        os.emit('idearium.spec.imported', {
          specUuid: result.manifest.uuid, name: result.manifest.name,
          blocksFound: result.blocksFound, sectionsFilled: result.sectionsFilled.length,
        });

        // §AUTO-REPO 2026-07-10 — "repository created automatically." Every
        // block the boundary engine found now has a completed chunk (import
        // no longer leaves anything pending — see spec-engine's importSpec),
        // so the spec is promotable the instant it lands. Do it here instead
        // of waiting for a second manual call. Still non-fatal if it fails —
        // the import itself already succeeded and is on disk either way —
        // but the failure is reported, not swallowed.
        let promote = null;
        if (result.manifest.status === 'complete') {
          promote = await _promoteSpecToRepo(os, se, result.manifest.uuid, 'emerge');
          if (promote.error) {
            console.warn(`[idearium/api] auto-promote after import failed: ${promote.error}`);
          } else {
            os.emit('idearium.spec.promoted', {
              specUuid: result.manifest.uuid, repoUuid: promote.repoUuid,
              mode: 'emerge', chunksBuilt: promote.chunksBuilt, chunksTotal: promote.chunksTotal,
              source: 'auto-import',
            });
          }
        }

        return ok(res, {
          manifest: result.manifest,
          blocksFound: result.blocksFound,
          sectionsFilled: result.sectionsFilled,
          unmatched: result.unmatched,
          byteFidelity: result.byteFidelity,
          repoUuid: promote && !promote.error ? promote.repoUuid : null,
          repoError: promote && promote.error ? promote.error : null,
          compiled: promote && !promote.error ? (promote.compiled || { ok: false, attempted: false }) : null,
          promoteUrl: `/api/spec-engine/specs/${result.manifest.uuid}/promote`,
        });
      } catch (e) { return err(res, 400, `import failed: ${e.message}`); }
    }

    case 'spec.promote': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      const specUuid = params.uuid || body.specUuid;
      const mode = body.mode || 'emerge';
      if (!specUuid) return err(res, 400, 'specUuid required');
      if (mode !== 'emerge' && mode !== 'manual') {
        return err(res, 400, `unknown promote mode '${mode}' — use 'emerge' (automatic) or 'manual' (spec builder)`);
      }
      const result = await _promoteSpecToRepo(os, se, specUuid, mode);
      if (result.error) {
        const status = /not found/.test(result.error) ? 404 : /cannot auto-promote/.test(result.error) ? 409 : 400;
        return err(res, status, result.error);
      }

      os.emit('idearium.spec.promoted', {
        specUuid, repoUuid: result.repoUuid,
        mode, chunksBuilt: result.chunksBuilt, chunksTotal: result.chunksTotal,
      });

      // §MERGED 2026-07-11 — advance the ORIGINATING idea's phase (not
      // RepoLayer's synthetic tracking idea) to reflect real end-state:
      // 'complete' for a fully-built promotion, 'building' for a partial
      // one. Never regresses 'archived'.
      if (result.originIdeaUuid) {
        const idea = os.idea(result.originIdeaUuid);
        if (idea && idea.phase !== 'archived') {
          const donePhase = result.chunksBuilt === result.chunksTotal ? 'complete' : 'building';
          os.emit('idearium.idea.phase', { uuid: result.originIdeaUuid, phase: donePhase, source: 'api' });
        }
      }

      return ok(res, {
        repoUuid: result.repoUuid, ideaUuid: result.ideaUuid, specUuid: result.specUuid,
        mode, promotedFrom: specUuid,
        chunksBuilt: result.chunksBuilt, chunksTotal: result.chunksTotal,
        compiled: result.compiled || { ok: false, attempted: false },
      });
    }

    // §GATE 2026-07-11 — the adapter boundary itself. No intelligence lives
    // here — see copilot-adapter/index.js's header for why that's deliberate.
    // Callable today (the wizard's "ask copilot" button hits this), honestly
    // reports connected:false until a real backend is registered.
    case 'copilot.suggest': {
      const ca = getCopilotAdapter();
      if (!ca) return err(res, 503, 'copilot-adapter not ready');
      const { context, goal, current_gate } = body;
      const result = await ca.suggest({ context: context || {}, goal: goal || '', current_gate: current_gate || '' });
      return ok(res, result);
    }

    case 'repo.ingest': {
      // §EXTENDED 2026-09-03 — James: "create a repository, then send each
      // chunk to the respective agent." Was drag-and-drop files[] only.
      // RepoLayer.ingest() itself already had a specUuid path (an existing
      // spec-engine manifest, no new content created) — this endpoint just
      // never exposed it. Now a caller can create the repo the moment a
      // spec exists, before any chunk is built, and the same repo record
      // (resolved live off specUuid every read — RepoLayer._enrich) shows
      // chunks landing as each one completes. files[] path unchanged for
      // every existing drag-and-drop caller.
      // §MCO11 2026-09-13 — James: "raid creates a compartment for the
      // contract to use as a repo." Traced first: RepoLayer.ingest()
      // (idearium/repo/index.js) already accepts and stores compartmentId
      // — SBP1's own real, designed link between a repo and a real COS
      // compartment — but this HTTP layer never forwarded it. Not a naming
      // collision after all; a real, designed connection that was one
      // destructured field short of working end to end.
      // §BUILT 2026-09-20 — bare:true, James: idearium's repo page needs a
      // real "Create repo" button (start empty) distinct from "Import
      // repo" (specUuid or files[], unchanged below). See RepoLayer.ingest()
      // for why this is safe — a bare repo is just a spec with nothing
      // built yet, same dedup-skip behavior as any other new spec.
      const { name, files, source, ideaUuid, specUuid, compartmentId, bare, ensureCompartment } = body;
      if (!name) return err(res, 400, 'name required');
      if (!specUuid && !bare && (!Array.isArray(files) || files.length === 0)) {
        return err(res, 400, 'specUuid, files[], or bare:true required');
      }
      const result = getRepoLayer().ingest({
        name, specUuid: specUuid || undefined, files: files || [], bare: !!bare,
        source: source || (specUuid ? 'repo-first' : (bare ? 'create' : 'drop')),
        ideaUuid: ideaUuid || null,
        // §NEW 2026-09-21 — opt-in: a caller that is making a repo FOR A SPEC
        // (the Spec Builder wizard) has no compartment to pass, and specs are
        // meant to live in repo compartments (see _reconcileSpecRepos). Off by
        // default so every existing caller — Create repo, file drops — behaves
        // exactly as before.
        compartmentId: compartmentId
          || (ensureCompartment ? _ensureCompartment(`idearium-repo-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`, name) : null),
      });
      if (result.error) return err(res, 400, result.error);
      return ok(res, result);
    }

    // §IMPORT-PROJECT 2026-09-03 — zip -> real repo compartment, synchronous.
    //
    // Why not just call idearium/repo/watcher.js's RepoWatcher:
    //   1. It's never instantiated anywhere in this codebase — no live
    //      caller, confirmed by grep before writing this (only referenced
    //      in a test-name string and a comment). Its dropDir
    //      (idearium/data/drop/) doesn't exist on disk either.
    //   2. Its _extractFileList() only reads file CONTENT for .spec files
    //      — every other file gets {path, bytes} with content:undefined.
    //      Calling it as-is would create a repo with a correct file
    //      LISTING and empty files, which defeats the point of importing
    //      a project to build/edit/debug against.
    //   3. Even fixed, fs.watch's queue model (drop a file, wait, hope it
    //      got picked up) is the wrong UX for a screen that should return
    //      the created repo in the same request.
    // So: reuse adm-zip the same way watcher.js does (same library, same
    // fallback-to-system-unzip, same last-resort-opaque-entry safety net —
    // not a second unzip strategy), but read bounded content for every
    // real text file, matching lib/project-compartment.js's already-
    // established, already-reasoned bounds (MAX_FILES/MAX_BYTES_PER_FILE/
    // MAX_TOTAL_BYTES — imported directly, not re-derived; SKIP_DIRS/
    // TEXT_EXT aren't exported by that module, so matched here by value,
    // called out explicitly rather than silently duplicated).
    // §REFACTORED 2026-09-15 — this case used to inline adm-zip
    // extraction + SKIP_DIRS/TEXT_EXT/bounds directly here (see
    // lib/zip-ingest.js's own header for the full account of why that
    // was a second copy of lib/project-compartment.js's already-real
    // bounds). Now calls the shared module — same behavior, same
    // omission reasons, same dedup-relevant included[] shape — plus it
    // now reads bounds from lib/project-import.config.js's ZIP block
    // (the one configurable place for both this route and the
    // project-import.* "Upload Project" flow below) instead of
    // project-compartment.js's private constants.
    case 'repo.import-archive': {
      const { name, filename, contentBase64, ideaUuid } = body;
      if (!filename)       return err(res, 400, 'filename required');
      if (!contentBase64)  return err(res, 400, 'contentBase64 required (base64-encoded zip contents)');
      let buf;
      try { buf = Buffer.from(contentBase64, 'base64'); }
      catch (e) { return err(res, 400, 'invalid base64 content'); }
      if (!buf.length) return err(res, 400, 'empty file');
      if (!/\.zip$/i.test(filename)) return err(res, 400, 'only .zip archives are handled by this endpoint — use POST /api/repos for flat file drops');

      const cfg = _require('../../lib/project-import.config.js');
      const { extractZipToFiles } = _require('../../lib/zip-ingest.js');
      const pc = _require('../../lib/project-container.js');
      // §REAL-FILES 2026-09-15, RESTORED 2026-09-17 — every bound comes
      // from the one idearium config (lib/project-import.config.js's
      // §REWIRED note), and extraction returns two layers: `included`
      // (the chunking input) and `realFiles` (verbatim bytes, binaries
      // included). This handler had regressed to text-only extraction
      // with no realFiles/writeSources/materialize call at all — found
      // while merging forward against the newer .repository-node and
      // COS-container work, restored here rather than left silently
      // dropped.
      const extraction = extractZipToFiles({
        buf,
        maxFiles:         cfg.ZIP.maxFiles,
        maxBytesPerFile:  cfg.ZIP.maxBytesPerFile,
        maxTotalBytes:    cfg.ZIP.maxTotalBytes,
        maxRealFileBytes: cfg.ZIP.maxRealFileBytes,
        realFiles:        cfg.ZIP.realFiles,
        includeBinary:    cfg.ZIP.includeBinary,
        verifyHashes:     cfg.ZIP.verifyHashes,
        skipDirs:         cfg.ZIP.skipDirs,
        textExt:          cfg.ZIP.textExt,
      });
      if (!extraction.ok) return err(res, 400, extraction.error);
      const { included, realFiles, omitted, stats } = extraction;

      // §HONEST EMPTY CHECK — a zip of nothing but binaries is a real,
      // importable project with zero chunks; only a zip yielding neither
      // layer is genuinely empty.
      if (!included.length && !realFiles.length) {
        return err(res, 400, 'nothing to import — no file passed the bounds (see omitted reasons for what was skipped)');
      }

      const repoName = (name || filename.replace(/\.zip$/i, '')).slice(0, 200);

      // §COS-IMPORT-PROJECT 2026-09-17, RE-FIXED — this route (the older,
      // synchronous "Import Project" screen) had regressed back to
      // compartmentId always null, the exact gap fixed once already and
      // lost in a prior merge. Re-fixed here using the NEWER real
      // mechanism project-import.finalize below already established
      // (lib/project-container.js's startContainer/ingestFilesIntoContainer/
      // finalizeContainer) instead of the older classify()+spawn() patch,
      // so this route and the newer "Upload Project" flow now share one
      // real compartment lifecycle rather than two different ones. A
      // container failure must never fail the import itself — the repo
      // content is already real and extracted — so every step here is
      // best-effort and logged, never fatal, same as the newer flow's
      // own non-blocking pipeline-fault handling below.
      let container = null;
      try {
        const started = await pc.startContainer({ name: repoName, goal: repoName, intentText: repoName });
        if (started.ok) {
          const ingestedIntoContainer = pc.ingestFilesIntoContainer(started.containerUuid, included);
          if (!ingestedIntoContainer.ok) console.warn(`[api] repo.import-archive: container file ingest failed for ${started.containerUuid}: ${ingestedIntoContainer.error}`);
          container = started;
        } else {
          console.warn(`[api] repo.import-archive: startContainer failed for "${repoName}": ${started.error}`);
        }
      } catch (e) {
        console.warn(`[api] repo.import-archive: container lifecycle threw for "${repoName}": ${e.message}`);
      }

      const result = getRepoLayer().ingest({ name: repoName, files: included, source: 'import', ideaUuid: ideaUuid || null, compartmentId: container?.compartmentId || null });
      if (result.error) return err(res, 400, result.error);

      // ingest() -> writeSources() -> materialize(), in that order: the
      // source manifest has to exist before the first materialize() or
      // that call sweeps the directory knowing nothing about it. See
      // RepoLayer.writeSources()'s own §ORDER MATTERS note.
      let sources = null;
      if (realFiles.length) {
        sources = getRepoLayer().writeSources(result.repo.uuid, realFiles);
        if (!sources.ok) console.error(`[api] source-file write degraded for ${result.repo.uuid}: ${sources.error}`);
      }
      const mat = getRepoLayer().materialize(result.repo.uuid);
      if (mat.error) console.error(`[api] materialize after import-archive failed for ${result.repo.uuid}: ${mat.error}`);

      // §PIPELINE 2026-09-17 — this route never ran the L2-L5 pipeline
      // (parse/atlas/chunk/verify/index) at all; project-import.finalize
      // was the only caller. Same non-blocking fault handling as that
      // handler: a pipeline FAULT is logged and surfaced, never blocks
      // the import response, since the repo itself already succeeded.
      let pipeline = null;
      if (!mat.error) {
        const enrichedRepo = getRepoLayer().get(result.repo.uuid);
        pipeline = runImportPipeline(enrichedRepo, mat.dir);
        if (pipeline.state === 'FAULT') console.error(`[api] repo.import-archive pipeline FAULT for ${result.repo.uuid}: ${pipeline.error || 'see verification tiers'}`);
      }

      if (container) {
        const finalized = await pc.finalizeContainer({ containerUuid: container.containerUuid, repoUuid: result.repo.uuid, repoDir: mat.dir, fileCount: included.length });
        if (!finalized.ok) console.warn(`[api] repo.import-archive: container finalize failed for ${container.containerUuid}: ${finalized.error}`);
      }
      // §MCO-C — baseline snapshot with the files, after finalize so the repo's
      // own .git (written by finalizeContainer) is there for the record to see.
      if (!mat.error && pipeline && pipeline.state !== 'FAULT') void _baselineSnapshot(result.repo.uuid, 'import-archive');

      // §CHECKLIST — see _readPipelineArtifacts' own header. mat.dir is
      // only valid when materialize() didn't error, matching the guard
      // already used above to decide whether to run the pipeline at all.
      const checklist1 = (!mat.error && pipeline) ? _readPipelineArtifacts(mat.dir) : { files: null, graph: null };

      return ok(res, {
        ...result,
        fileCount: included.length,
        sourceFileCount: sources ? sources.written : 0,
        sourceFailed: sources ? sources.failed : [],
        omittedCount: omitted.length, omitted: omitted.slice(0, 50),
        stats, materialize: mat.error ? { error: mat.error } : mat,
        pipeline: pipeline ? { state: pipeline.state, chunks: pipeline.chunks, indexes: pipeline.indexes } : null,
        files: checklist1.files, graph: checklist1.graph,
      });
    }

    // ── Upload Project pipeline ─────────────────────────────────────────
    // §UPLOAD-PROJECT 2026-09-15 — start() and cancel() are pure CJS,
    // called directly (see lib/project-container.js's own §ARCHITECTURE
    // note for why it never imports RepoLayer itself: RepoLayer is ESM,
    // project-container.js is CJS, and Node's require() cannot load an
    // ESM module — this file, already ESM and already bridging via
    // _require for every other CJS lib/ module, IS the bridge point).
    // finalize() is where the ESM-only step (RepoLayer.ingest()) has to
    // happen, so THIS handler extracts the zip, calls RepoLayer.ingest(),
    // then hands the real repoUuid/repoDir/fileCount to
    // project-container.finalizeContainer() to write manifest.json/
    // project.json/.git and resolve the compartment.
    case 'project-import.config': {
      const cfg = _require('../../lib/project-import.config.js');
      return ok(res, { intentExamples: cfg.INTENT_EXAMPLES, zip: cfg.ZIP, staleAfterMs: cfg.COMPARTMENT.staleAfterMs });
    }

    case 'project-import.start': {
      const { name, goal, intentText } = body;
      const pc = _require('../../lib/project-container.js');
      const result = await pc.startContainer({ name, goal, intentText });
      if (!result.ok) return err(res, 400, result.error);
      return ok(res, result);
    }

    case 'project-import.cancel': {
      const pc = _require('../../lib/project-container.js');
      const result = await pc.cancelContainer(params.uuid);
      if (!result.ok) return err(res, 400, result.error);
      return ok(res, result);
    }

    case 'project-import.finalize': {
      const { filename, contentBase64 } = body;
      if (!filename)      return err(res, 400, 'filename required');
      if (!contentBase64) return err(res, 400, 'contentBase64 required (base64-encoded zip contents)');
      let buf;
      try { buf = Buffer.from(contentBase64, 'base64'); }
      catch (e) { return err(res, 400, 'invalid base64 content'); }
      if (!buf.length) return err(res, 400, 'empty file');
      if (!/\.zip$/i.test(filename)) return err(res, 400, 'only .zip archives are supported — drop a single .zip');

      const cfg = _require('../../lib/project-import.config.js');
      const { extractZipToFiles } = _require('../../lib/zip-ingest.js');
      // §REAL-FILES 2026-09-15, RESTORED 2026-09-17 — see repo.import-archive's
      // matching note; this handler had regressed to the same text-only
      // extraction with no realFiles/writeSources call, found while
      // merging forward.
      const extraction = extractZipToFiles({
        buf,
        maxFiles:         cfg.ZIP.maxFiles,
        maxBytesPerFile:  cfg.ZIP.maxBytesPerFile,
        maxTotalBytes:    cfg.ZIP.maxTotalBytes,
        maxRealFileBytes: cfg.ZIP.maxRealFileBytes,
        realFiles:        cfg.ZIP.realFiles,
        includeBinary:    cfg.ZIP.includeBinary,
        verifyHashes:     cfg.ZIP.verifyHashes,
        skipDirs:         cfg.ZIP.skipDirs,
        textExt:          cfg.ZIP.textExt,
      });
      if (!extraction.ok) return err(res, 400, extraction.error);
      const { included, realFiles, omitted, stats } = extraction;
      if (!included.length && !realFiles.length) {
        return err(res, 400, 'nothing to import — no file passed the bounds (see omitted reasons for what was skipped)');
      }

      const pc = _require('../../lib/project-container.js');

      // §COS 2026-09-16 — James: "needs to import files, unzip into
      // container, then chunk." The real COS compartment (created back
      // in project-import.start) gets the extracted files FIRST — before
      // RepoLayer.ingest()/materialize() below builds the actual repo
      // inside idearium's own repo/ folder. Two real writes, two real
      // jobs (see lib/project-container.js's own §COS header for the
      // full reasoning) — fails loud like every other real step in this
      // handler, not swallowed, since a container the files never
      // actually reached isn't a container that "always has backend."
      const ingested = pc.ingestFilesIntoContainer(params.uuid, included);
      if (!ingested.ok) return err(res, 400, `container ingest failed: ${ingested.error}`);

      // Repo name mirrors repo.import-archive's own fallback: an explicit
      // name always wins, else derive one from the zip's own filename —
      // the container's own `name` (from the start-prompt) is used for
      // the compartment/manifest identity below, kept distinct on purpose
      // (a repo can be renamed later; the container's declared name is
      // what the end-state goal was written against).
      const repoName = (body.name || filename.replace(/\.zip$/i, '')).slice(0, 200);
      const ingestResult = getRepoLayer().ingest({
        // §COS 2026-09-16 — real compartmentId, from the container's own
        // real COS compartment (ingestFilesIntoContainer already looked
        // it up above), not a value the frontend has to remember to
        // resend — "we need repos per repository/container/project" means
        // this link has to actually be real, not merely possible.
        name: repoName, files: included, source: 'import-project', compartmentId: ingested.compartmentId || null,
        materializeBaseDir: cfg.REPO_STORAGE.dir, // idearium/repo/repos/<uuid> — see config's own header
      });
      if (ingestResult.error) return err(res, 400, ingestResult.error);

      const repoUuid = ingestResult.repo.uuid;

      // §RESTORED 2026-09-17 — ingest() -> writeSources() -> materialize(),
      // in that order: the source manifest has to exist before the first
      // materialize() call or that call sweeps the directory with no
      // knowledge of which files are source-owned. See RepoLayer.
      // writeSources()'s own §ORDER MATTERS note. This is distinct from
      // the COS-container ingest above: that puts the uploaded files in
      // COS's own compartment directory as the sovereign audit copy;
      // this puts real, verbatim files (binaries included) into
      // idearium's own materialized repo tree, which the .repository/
      // .chunk node layers and the UI actually read from. Two real jobs,
      // not a duplicate of each other (see lib/project-container.js's
      // own §COS header, and idearium/repo/source-files.js's header, for
      // why each exists).
      let sources = null;
      if (realFiles.length) {
        sources = getRepoLayer().writeSources(repoUuid, realFiles);
        if (!sources.ok) {
          // §1.2 — loud and fatal to the import, not swallowed. Unlike a
          // chunk (regenerable from the manifest), a source file that
          // failed to land is gone: the zip that held it is not kept.
          return err(res, 500, `source-file write failed — import aborted rather than completing with missing real files: ${sources.error}`);
        }
      }

      const mat = getRepoLayer().materialize(repoUuid);
      if (mat.error) return err(res, 500, `materialize after ingest failed: ${mat.error}`);

      // §34 PROJECT_IMPORT — parse -> atlas -> chunks -> verify -> index,
      // BEFORE the compartment resolves to import:ready below. Reads the
      // enriched repo record (has .files, from the manifest ingest()
      // just created) against the real materialized directory. A pipeline
      // fault is surfaced in the response but never blocks finalize —
      // the end-state below only checks files/manifest/project.json/git,
      // unaffected by this — so an import still completes even if, say,
      // a single file's chunk boundaries couldn't be indexed.
      // §RESEQUENCED 2026-09-20 — James: "import -> unzip -> take you to
      // the repo -> chunk -> toast showing the progress." Chunking used to
      // run HERE, inside finalize, so the whole import blocked on it and
      // you only reached the repo once every file was parsed, atlased,
      // chunked, verified and indexed.
      //
      // With deferChunking, finalize stops once the files are really on
      // disk (unzip -> COS container -> materialize) and returns. The repo
      // EXISTS and is navigable at that point; it simply has no index yet,
      // which every reader already handles honestly (repo.scan returns
      // scanned:false; phasemap says "not verified yet"). The UI then
      // calls POST /api/repos/:uuid/chunk, which runs the identical
      // pipeline and emits progress as it goes.
      //
      // Default is UNCHANGED (synchronous) so every existing caller — the
      // older ui/import-project screen, the CLI, the e2e tests — behaves
      // exactly as before. Only a caller that asks gets the new ordering.
      const enrichedRepo = getRepoLayer().get(repoUuid);
      // §FIXED 2026-09-20 — real crash caught from a live boot log:
      // "ReferenceError: Cannot access 'realFileCount' before
      // initialization". This declaration used to sit below, after both
      // branches — the deferChunking branch's staged-event emit (right
      // below) reached it 16 lines before its own `const` ran, a TDZ
      // violation on every deferred import. `sources` (line ~1944) and
      // `included` (destructured at ~1892) are both already real and
      // available up here, well before either branch needs them — moving
      // the declaration up costs nothing and fixes the crash at its root
      // rather than special-casing the deferred branch.
      const realFileCount = sources ? sources.written : included.length;
      let pipeline;
      if (body.deferChunking) {
        pipeline = { state: 'DEFERRED', note: 'chunking not run — call POST /api/repos/:uuid/chunk' };
        os.emit('idearium.repo.import.staged', { repoUuid, name: repoName, fileCount: realFileCount });
      } else {
        pipeline = runImportPipeline(enrichedRepo, mat.dir);
        if (pipeline.state === 'FAULT') {
          console.error(`[api] project-import pipeline FAULT for ${repoUuid}: ${pipeline.error || 'see verification tiers'}`);
        }
      }

      // §RESTORED 2026-09-17 — 'files-imported' end-state condition asks
      // whether source files actually landed in the repo. Chunk count
      // answers that only while chunks are the repo's content; now that
      // real files are (when import.real_files is on), a binary-only
      // project would report 0 files despite a complete, correct import.
      // Falls back to chunk count when the source layer produced nothing
      // (import.real_files off), the one case where chunks are the
      // content. Declaration moved up above (§FIXED 2026-09-20) — see
      // that comment for why.
      const result = await pc.finalizeContainer({
        containerUuid: params.uuid, repoUuid, repoDir: mat.dir, fileCount: realFileCount,
      });
      // §MCO-C — baseline after finalize (so .git exists). A deferred import has
      // no index yet; its baseline is taken when POST /api/repos/:uuid/chunk finishes.
      if (!body.deferChunking && pipeline && pipeline.state !== 'FAULT') void _baselineSnapshot(repoUuid, 'project-import');
      // §CHECKLIST — see _readPipelineArtifacts' own header. mat.dir is
      // guaranteed here (materialize() already err-returned above if it
      // failed), so this only degrades on the artifact read itself.
      const checklist2 = _readPipelineArtifacts(mat.dir);
      return ok(res, {
        ...result, repo: ingestResult.repo, deduped: !!ingestResult.deduped,
        fileCount: realFileCount, chunkCount: included.length,
        sourceFailed: sources ? sources.failed : [],
        files: checklist2.files, graph: checklist2.graph,
        omittedCount: omitted.length, omitted: omitted.slice(0, 50),
        containerFileCount: ingested.fileCount, containerRoot: ingested.root,
        stats, pipeline,
      });
    }

    case 'repo.fork': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const result = getRepoLayer().fork(params.uuid, body.name);
      if (result.error) return err(res, 400, result.error);
      return ok(res, result);
    }

    case 'repo.archive': {
      const result = getRepoLayer().archive(params.uuid);
      if (result.error) return err(res, 404, result.error);
      return ok(res, result);
    }

    case 'repo.lineage':
      return ok(res, { lineage: getRepoLayer().lineage(params.uuid) });

    // §MERGED 2026-07-11 — path travels as a query param (GET/DELETE) or
    // body field (POST), never a URL segment, so nested paths need no
    // wildcard routing.
    case 'repo.file.read': {
      const filePath = query.path;
      if (!filePath) return err(res, 400, 'path required (?path=...)');
      const result = getRepoLayer().readFile(params.uuid, filePath);
      if (result.error) {
        const status = /repo not found/.test(result.error) ? 404
                      : /not found in repo/.test(result.error) ? 404 : 400;
        return err(res, status, result.error);
      }
      return ok(res, result);
    }

    case 'repo.chunk.show': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo || !repo.specUuid) return err(res, 404, `repo not found: ${params.uuid}`);
      const manifest = getRepoLayer().se.loadSpec(repo.specUuid);
      if (!manifest) return err(res, 404, `repo's spec no longer exists: ${repo.specUuid}`);
      const chunk = (manifest.chunks || []).find(c => c.uuid === params.chunkUuid);
      if (!chunk) return err(res, 404, `chunk not found in repo: ${params.chunkUuid}`);
      // realPath is the real, on-disk path (see idearium/lib/config.js's
      // import.real_files); an authored (non-ingested) chunk has none,
      // so fall back to the chunk-store fileName the same way
      // repo/index.js's own readFile() already does elsewhere.
      const filePath = chunk.realPath || chunk.fileName;
      const result = filePath ? getRepoLayer().readFile(params.uuid, filePath) : { error: 'chunk has neither realPath nor fileName — nothing to read' };
      return ok(res, { chunk, filePath, content: result.error ? null : result.content, readError: result.error || null });
    }

    // §QUERY-SURFACE 2026-09-17 — see route-table comment above. Both
    // read straight off import-pipeline.js's own disk output
    // (atlas.json / indexes/*.json) — no second storage system, no
    // content in repo.index's response (spec §14).
    case 'repo.index': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const repoDir = repo.materializeDir || path.join(getRepoLayer().dataDir, 'projects', params.uuid);
      const { readAtlas } = await import('../repo/import-pipeline.js');
      const atlas = readAtlas(repoDir);
      if (atlas.error) return err(res, 404, atlas.error);
      return ok(res, atlas);
    }

    case 'repo.search': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!query.q) return err(res, 400, 'q (query string) required');
      const repoDir = repo.materializeDir || path.join(getRepoLayer().dataDir, 'projects', params.uuid);
      const { searchRepo } = await import('../repo/import-pipeline.js');
      return ok(res, { query: query.q, results: searchRepo(repoDir, query.q) });
    }

    case 'repo.file.write': {
      const filePath = body.path;
      if (!filePath) return err(res, 400, 'path required');
      if (typeof body.content !== 'string') return err(res, 400, 'content (string) required');
      const result = getRepoLayer().writeFile(params.uuid, filePath, body.content);
      if (result.error) {
        const status = /repo not found/.test(result.error) ? 404 : 400;
        return err(res, status, result.error);
      }
      os.emit('idearium.repo.file.write', { repoUuid: params.uuid, path: result.path, created: result.created });
      return ok(res, result);
    }

    case 'repo.file.delete': {
      const filePath = query.path || body.path;
      if (!filePath) return err(res, 400, 'path required');
      const result = getRepoLayer().deleteFile(params.uuid, filePath);
      if (result.error) {
        const status = /repo not found/.test(result.error) ? 404 : /not found in repo/.test(result.error) ? 404 : 400;
        return err(res, status, result.error);
      }
      os.emit('idearium.repo.file.delete', { repoUuid: params.uuid, path: result.path });
      return ok(res, result);
    }

    // §EXPORT 2026-07-18 — "the export, needs to be the .spec file
    // compressed repo." Two things bundled into one real download: the
    // reconstructed .spec (byte-exact for imported specs — see
    // reconstructSpecText's own header for how) at the archive root, and
    // every real repo file underneath a folder named for the repo. One
    // zip, both formats, not a choice you have to make.
    case 'repo.export': {
      const repoLayer = getRepoLayer();
      const repo = repoLayer.get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');

      const safeName = (repo.name || 'repo').replace(/[^a-z0-9-_]+/gi, '_');
      const entries = [];

      try {
        const specText = se.reconstructSpecText(repo.specUuid);
        entries.push({ path: `${safeName}.spec`, content: specText });
      } catch (e) {
        console.error(`[API] repo.export: spec reconstruction failed for ${params.uuid}: ${e.message}`);
        // Non-fatal — still ship the repo files even if the .spec side failed.
      }

      let readErrors = 0;
      for (const f of repo.files) {
        const rf = repoLayer.readFile(params.uuid, f.path);
        if (rf.error) { readErrors++; continue; }
        entries.push({ path: `${safeName}/${f.path}`, content: rf.content });
      }
      if (!entries.length) return err(res, 500, 'export produced no files — repo may be empty or unreadable');

      const { createZip } = _require('../../lib/zip-writer.js');
      const zipBuf = createZip(entries);

      console.log(`[API] repo.export: ${params.uuid} -> ${entries.length} entries (${readErrors} read errors), ${zipBuf.length}b`);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}.zip"`,
        'Content-Length': zipBuf.length,
        ...CORS,
      });
      return res.end(zipBuf);
    }

    // ── §NEXUS-REPO-TOOLS 2026-09-15 — read access to import-pipeline.js's
    // L2-L5 output (atlas/chunks/symbols/verification), plus an explicit
    // reindex trigger. Backs agent-suite's repository.* tools. All read
    // straight from the repo's materialized directory on disk — the same
    // real files a human or Git would see, never a second in-memory copy.
    case 'repo.map': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const p = path.join(dir, 'atlas.json');
      if (!fs.existsSync(p)) return err(res, 404, 'no atlas yet — repo has not been through the import pipeline (see POST .../reindex)');
      return ok(res, JSON.parse(fs.readFileSync(p, 'utf8')));
    }

    // ── §24-26 GRAPH (MCO1) — reads graph.json, the GRAPHING step's own
    //    on-disk output. Contract: idearium/spec/idearium.repo-graph.spec.
    //    Read-only, same shape as repo.map above; never rebuilds on the
    //    fly (POST .../reindex is the one real rebuild path, §10.1).
    case 'repo.graph': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const p = path.join(dir, 'graph.json');
      if (!fs.existsSync(p)) return err(res, 404, 'no graph yet — repo has not been through the import pipeline (see POST .../reindex)');
      const graph = JSON.parse(fs.readFileSync(p, 'utf8'));
      // Default to the summary. A 10k-edge graph is not a useful HTTP
      // response body and the whole point of this layer is that an agent
      // asks a QUESTION (traverse/cone) rather than loading everything —
      // ?full=1 is still available and honest about what it costs.
      if (query.full === '1' || query.full === 'true') return ok(res, graph);
      const { nodes, edges, ...summary } = graph;
      return ok(res, { ...summary, note: 'summary only — add ?full=1 for all nodes and edges, or use /graph/traverse and /graph/cone to ask a question instead' });
    }

    // §0.39.246 — the specification graph: what the repo's catalog .spec
    // files declare, and where that disagrees with the code graph.
    case 'repo.graph.spec': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { readSpecGraph } = await import('../repo/spec-graph.js');
      const sg = readSpecGraph(dir);
      if (!sg) return err(res, 404, 'no spec graph yet — repo has not been through the import pipeline since 0.39.246 (see POST .../reindex)');
      if (query.full === '1' || query.full === 'true') return ok(res, sg);
      const { sources, disagreements, ...rest } = sg;
      return ok(res, { ...rest, sources: sources.map(({ entriesDetail, ...s }) => ({ ...s, violations: s.violations.filter(v => v.severity === 'error') })),
        disagreements: disagreements.slice(0, 50), note: 'add ?full=1 for every entry and every disagreement' });
    }

    // §0.39.246 — all three graphs side by side, each with its own real
    // state: built, pending, not_applicable, missing (never imported), or
    // failed with the reason. One question: "are the three graphs there?"
    case 'repo.graphs': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { return null; } };
      const code = read('graph.json');
      const spec = read('spec-graph.json');
      const lazy = read('verification.lazy.json');
      const proof = read('proof.json');
      return ok(res, { repoUuid: params.uuid, graphs: {
        code: code ? { status: 'built', nodes: code.nodeCount, edges: code.edgeCount, unresolved: code.unresolvedCount } : { status: 'missing' },
        execution: proof ? { status: 'built', summary: proof.summary, generatedAt: proof.generatedAt, ...(lazy && lazy.runtimeProof && lazy.runtimeProof.status !== 'built' ? { rerun: lazy.runtimeProof } : {}) }
                 : (lazy && lazy.runtimeProof) ? lazy.runtimeProof : { status: 'missing' },
        spec: spec ? { status: spec.status, ...spec.summary, ...(spec.reason ? { reason: spec.reason } : {}) } : { status: 'missing' },
      } });
    }

    case 'repo.graph.traverse': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      if (!query.start) return err(res, 400, 'start is required (a node id such as file:src/x.js or chunk:<id>)');
      const { readGraph, traverse } = await import('../repo/graph.js');
      const graph = readGraph(dir);
      if (!graph) return err(res, 404, 'no graph yet — see POST .../reindex');
      try {
        return ok(res, traverse(graph, {
          start: query.start,
          relation: query.relation || 'depends_on',
          direction: query.direction === 'in' ? 'in' : 'out',
          depth: Math.max(1, Math.min(20, parseInt(query.depth || '1', 10) || 1)),
          includeUnresolved: query.includeUnresolved !== '0',
          filters: { kind: query.kind || null, language: query.language || null },
        }));
      } catch (e) { return err(res, 400, e.message); }
    }

    case 'repo.graph.cone': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      if (!query.start) return err(res, 400, 'start is required (a file path, file:<path> or chunk:<id>)');
      const { readGraph, dependencyCone } = await import('../repo/graph.js');
      const graph = readGraph(dir);
      if (!graph) return err(res, 404, 'no graph yet — see POST .../reindex');
      return ok(res, dependencyCone(graph, {
        start: query.start,
        depth: Math.max(1, Math.min(20, parseInt(query.depth || '5', 10) || 5)),
      }));
    }

    // Runs the repo's runnable test files (the same selection and limits as L6) under V8 coverage and
    // stores proof.json. Returns the summary and the tests, not every chunk: GET has those.
    case 'repo.proof.run': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { computeRuntimeProof } = await import('../repo/runtime-proof.js');
      const r = computeRuntimeProof({ repoDir: dir, repository: params.uuid });
      if (!r.ok) return err(res, /not been indexed/.test(r.error) ? 409 : 500, r.error);
      return ok(res, { repoUuid: params.uuid, summary: r.proof.summary, tests: r.proof.tests, generatedAt: r.proof.generatedAt });
    }

    // ?state=passed|failed|none|no_tests|unsupported|test  ?file=  ?chunk=  — each chunk carries `stale`.
    case 'repo.proof.get': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { readRuntimeProof } = await import('../repo/runtime-proof.js');
      const proof = readRuntimeProof(dir);
      if (!proof) return ok(res, { repoUuid: params.uuid, proof: null, note: 'no runtime proof has been computed for this repo (POST /api/repos/:uuid/proof)' });
      let chunks = proof.chunks;
      if (query.state) chunks = chunks.filter(c => c.proof === query.state);
      if (query.file) chunks = chunks.filter(c => c.file === query.file);
      if (query.chunk) chunks = chunks.filter(c => c.chunkId === query.chunk);
      return ok(res, { repoUuid: params.uuid, generatedAt: proof.generatedAt, summary: proof.summary, staleCount: proof.staleCount, tests: proof.tests, chunks, total: chunks.length });
    }

    case 'repo.chunks.list': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const p = path.join(dir, 'chunks', 'index.json');
      if (!fs.existsSync(p)) return err(res, 404, 'no chunk index yet — repo has not been through the import pipeline (see POST .../reindex)');
      let chunks = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (query.file) chunks = chunks.filter(c => c.file === query.file);
      return ok(res, { chunks, total: chunks.length });
    }

    // §MINIMUM-SURFACE — spec §L7 WORK_SURFACE: an agent asks for ONE
    // chunk's real content by id, not the whole file/repo, so a large
    // repo never has to be loaded into model context to edit one function.
    case 'repo.chunks.get': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const idxPath = path.join(dir, 'chunks', 'index.json');
      if (!fs.existsSync(idxPath)) return err(res, 404, 'no chunk index yet');
      const entry = JSON.parse(fs.readFileSync(idxPath, 'utf8')).find(c => c.id === params.chunkId);
      if (!entry) return err(res, 404, `chunk not found: ${params.chunkId}`);
      const full = JSON.parse(fs.readFileSync(path.join(dir, 'chunks', entry._file), 'utf8'));
      return ok(res, full);
    }

    case 'repo.symbols': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const p = path.join(dir, 'indexes', 'symbols.json');
      if (!fs.existsSync(p)) return err(res, 404, 'no symbol index yet — repo has not been through the import pipeline (see POST .../reindex)');
      let symbols = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (query.q) { const q = query.q.toLowerCase(); symbols = symbols.filter(s => s.name.toLowerCase().includes(q)); }
      return ok(res, { symbols, total: symbols.length });
    }

    case 'repo.verification': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const p = path.join(dir, 'verification.json');
      if (!fs.existsSync(p)) return err(res, 404, 'not verified yet — repo has not been through the import pipeline (see POST .../reindex)');
      const verification = JSON.parse(fs.readFileSync(p, 'utf8'));
      // §MCO2 — L6-L8 land in a separate file (verify-lazy.js's own
      // header explains why: async, may still be 'pending' when this is
      // read). Merged in here, never silently omitted: a caller asking
      // "is this repo verified" gets the full L0-L8 picture in one call,
      // with lazy's own status ('pending'/'passed'/'partial'/'error')
      // stated plainly rather than folded into L0-L5's.
      const { readLazyVerification } = await import('../repo/verify-lazy.js');
      const lazy = readLazyVerification(dir);
      return ok(res, { ...verification, lazyVerification: lazy });
    }

    // §RESEQUENCED 2026-09-20 — run (or re-run) the import pipeline for a
    // repo whose files are already on disk. The SAME runImportPipeline
    // every other path uses — not a second chunker — wrapped in real
    // start/done/fault events so a caller can show progress instead of a
    // spinner that means nothing.
    case 'repo.chunk.run': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');

      const fileCount = (repo.files || []).length;
      os.emit('idearium.repo.chunk.started', { repoUuid: params.uuid, name: repo.name, fileCount });

      // §FIXED 2026-09-20 — James: "is it hooked into the graph?" It
      // wasn't, and nothing else from the real pipeline was either.
      // idearium/repo/pipeline-events.js's 12-event catalog (parse/atlas/
      // chunk/verify/index/graph — including graph:build:complete, the
      // actual answer to the question) and makeBusForwarder() (built,
      // tested, for exactly this: "onEvent for ONE pipeline run") already
      // existed — runImportPipeline() was just never called with a 3rd
      // opts.onEvent argument here, so makeEmitter()'s own emit() silently
      // no-op'd on every single stage event ("if (typeof onEvent !==
      // 'function') return"). The only signal reaching the browser was
      // the two coarse, hand-rolled .started/.done events immediately
      // around this call — no parse/atlas/chunk/verify/graph stage ever
      // surfaced anywhere.
      const onPipelineEvent = makeBusForwarder((type, payload) => os.emit(type, payload));
      let pipeline;
      try {
        pipeline = runImportPipeline(repo, dir, { onEvent: onPipelineEvent });
      } catch (e) {
        os.emit('idearium.repo.chunk.fault', { repoUuid: params.uuid, error: e.message });
        return err(res, 500, `chunking failed: ${e.message}`);
      }

      if (pipeline.state === 'FAULT') {
        os.emit('idearium.repo.chunk.fault', { repoUuid: params.uuid, error: pipeline.error || 'see verification tiers' });
      } else {
        // Real counts, read back off what the pipeline actually wrote —
        // not echoed from the request.
        let chunkCount = null;
        try {
          const idx = path.join(dir, 'chunks', 'index.json');
          if (fs.existsSync(idx)) chunkCount = JSON.parse(fs.readFileSync(idx, 'utf8')).length;
        } catch (_) { /* stays null — honestly unknown, not zero */ }
        os.emit('idearium.repo.chunk.done', {
          repoUuid: params.uuid, name: repo.name, state: pipeline.state, fileCount, chunkCount,
        });
        // §MCO-C — a repo's first index gets its baseline snapshot (a no-op if it has one).
        void _baselineSnapshot(params.uuid, 'chunk-run');
        // §REPO-HAT 2026-09-20 — a project agent forged before the pipeline
        // ran carries a persona stating "this project has NOT been indexed
        // yet". That is now false, and a stale persona is a falsehood told
        // to the agent on every dispatch. Re-ground it here, where the
        // index actually changed. Best-effort: a repo with no hat (the
        // common case) is a no-op, and a refresh failure never fails the
        // chunk run that succeeded.
        try {
          const RH = _require('../../lib/repo-hat.js');
          if (RH.getRepoHat(params.uuid)) {
            const rr = RH.refreshRepoHatPersona({ repo, repoDir: dir });
            if (rr.ok) os.emit('idearium.repo.hat.refreshed', { repoUuid: params.uuid, chunkCount });
            else console.warn(`[api] repo-hat persona refresh failed for ${params.uuid}: ${(rr.errors || []).join('; ')}`);
          }
        } catch (e) { console.warn(`[api] repo-hat refresh threw (non-fatal): ${e.message}`); }
      }
      return ok(res, { repoUuid: params.uuid, pipeline });
    }

    // ── §REPO-HAT 2026-09-20 — one project agent per repo ─────────────────
    case 'repo.hat.show': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RH = _require('../../lib/repo-hat.js');
      const hat = RH.getRepoHat(params.uuid);
      return ok(res, {
        repoUuid: params.uuid, compartmentId: repo.compartmentId || null,
        // exists:false is a real, ordinary state — not an error. (ok:false
        // would make api() throw in the UI; see repo.scan's own note.)
        exists: !!hat,
        hat: hat || null,
        toolScope: RH.REPO_TOOL_SCOPE,
      });
    }

    case 'repo.hat.ensure': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      const RH = _require('../../lib/repo-hat.js');
      const r = RH.ensureRepoHat({ repo, repoDir: dir, baseAgent: body.baseAgent || 'copilot' });
      if (!r.ok) return err(res, 400, (r.errors || ['forge failed']).join('; '));
      if (r.created) os.emit('idearium.repo.hat.forged', { repoUuid: params.uuid, name: r.hat.name, compartmentId: repo.compartmentId });
      return ok(res, { repoUuid: params.uuid, created: r.created, hat: r.hat });
    }

    case 'repo.hat.refresh': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      const RH = _require('../../lib/repo-hat.js');
      const r = RH.refreshRepoHatPersona({ repo, repoDir: dir });
      if (!r.ok) return err(res, 400, (r.errors || ['refresh failed']).join('; '));
      return ok(res, { repoUuid: params.uuid, hat: r.hat, index: r.index });
    }

    case 'repo.hat.revoke': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RH = _require('../../lib/repo-hat.js');
      const r = RH.revokeRepoHat(params.uuid);
      if (!r.ok) return err(res, 404, (r.errors || ['revoke failed']).join('; '));
      os.emit('idearium.repo.hat.revoked', { repoUuid: params.uuid, name: r.revoked });
      return ok(res, { repoUuid: params.uuid, revoked: r.revoked });
    }

    // ── §REPO-AGENT 2026-09-20 — the compartment's own agent ──────────────
    // Every handler resolves the repo first: a repo uuid that does not
    // exist must 404 here rather than reach repo-agent and be reported as
    // an agent problem.
    case 'repo.agent.status': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RA = _require('../../lib/repo-agent.js');
      return ok(res, RA.status({ repo, repoDir: _repoDiskDir(params.uuid) }));
    }

    // ── §0.39.261 — the Nexus repo (Nexus, managed from inside Nexus) ────────
    case 'nexus-self.status': {
      const NS = await import('../repo/nexus-self.js');
      const sg = NS.readSystemGraph();
      return ok(res, { ...NS.status(getRepoLayer()), syncing: !!_nexusSelfSyncing, lastSync: _nexusSelfLast,
        systemGraph: sg ? { snapshot: sg.snapshot, edges: sg.edges.map(e => ({ from: e.from, to: e.to, count: e.count, examples: e.examples })), missing: sg.missing, broken: sg.broken.slice(0, 100), bySystem: sg.bySystem } : null });
    }
    case 'nexus-self.sync': {
      const only = Array.isArray(body.only) ? body.only.map(String) : null;
      const p = _nexusSelfSync({ only, force: !!body.force });
      if (body.wait) { const r = await p; return r.error ? err(res, 500, r.error) : ok(res, r); }
      return ok(res, { started: true, alreadyRunning: p !== _nexusSelfStartedNow });
    }
    case 'nexus-self.understanding': {
      const NS = await import('../repo/nexus-self.js');
      const hist = NS.readUnderstanding({ limit: parseInt(query.n, 10) || 50 });
      return ok(res, { latest: hist[hist.length - 1] || null, history: hist.map(h => ({ at: h.at, snapshot: h.snapshot, totals: h.totals, improved: h.improved, regressed: h.regressed })) });
    }
    case 'nexus-self.applies': {
      return ok(res, { applies: _require('../../lib/nexus-self/apply.js').listApplies().slice(0, parseInt(query.n, 10) || 50) });
    }
    case 'nexus-self.rollback': {
      const r = _require('../../lib/nexus-self/apply.js').rollback(params.id, { reason: body.reason || '' });
      if (!r.ok) return err(res, 409, [...(r.errors || []), ...(r.conflicts || []).map(c => `${c.path}: ${c.why}`)].join('; ') || 'rollback refused');
      os.emit('idearium.nexus-self.rollback', { applyId: params.id, snapshot: r.snapshot });
      _nexusSelfSync({});
      return ok(res, r);
    }
    case 'nexus-self.atlas': {
      const NS = await import('../repo/nexus-self.js');
      return ok(res, NS.nexusAtlas(getRepoLayer()));
    }
    case 'nexus-self.resolve': {
      const NS = await import('../repo/nexus-self.js');
      const refs = Array.isArray(body.refs) ? body.refs.map(String) : [];
      return ok(res, { refs: NS.resolveRefs(getRepoLayer(), refs) });
    }
    case 'nexus-self.file': {
      const NS = await import('../repo/nexus-self.js');
      const r = NS.fileText(String(query.path || ''));
      return r.error ? err(res, 404, r.error) : ok(res, r);
    }
    case 'nexus-self.system': {
      const NS = await import('../repo/nexus-self.js');
      const v = NS.systemView(getRepoLayer(), params.system);
      return v.error ? err(res, 404, v.error) : ok(res, v);
    }
    case 'nexus-self.spec': {
      const NS = await import('../repo/nexus-self.js');
      const r = NS.specText(params.system, String(query.path || ''));
      return r.error ? err(res, 404, r.error) : ok(res, r);
    }
    case 'nexus-self.branch.list': case 'nexus-self.branch.create': case 'nexus-self.branch.get':
    case 'nexus-self.branch.destroy': case 'nexus-self.branch.file.get': case 'nexus-self.branch.file.put':
    case 'nexus-self.branch.file.delete': case 'nexus-self.branch.plan': case 'nexus-self.branch.apply': {
      const SYS = _require('../../lib/nexus-self/systems.js');
      if (!SYS.get(params.system)) return err(res, 404, `unknown system: ${params.system}`);
      const NSB = _require('../../lib/nexus-self/branch.js');
      const comp = _require('../../lib/cos-bridge.js').getCompartment(`nexus-self-${params.system}`);
      if (!comp) return err(res, 409, `no compartment for ${params.system} yet — sync the Nexus repo first`);
      if (action === 'nexus-self.branch.list') return ok(res, { branches: NSB.list(comp) });
      if (action === 'nexus-self.branch.create') {
        try { return ok(res, { branch: NSB.create({ system: params.system, compartment: comp, label: body.label || null }) }); }
        catch (e) { return err(res, 409, e.message); }
      }
      const br = NSB.get(comp, params.id);
      if (!br) return err(res, 404, `branch not found: ${params.id}`);
      if (action === 'nexus-self.branch.get') {
        const ch = NSB.changes(br).map(c => ({ path: c.path, op: c.op, bytes: c.content ? c.content.length : 0 }));
        return ok(res, { branch: br, changes: ch });
      }
      if (action === 'nexus-self.branch.destroy') return ok(res, NSB.destroy(comp, br.id));
      if (action === 'nexus-self.branch.file.get') {
        const f = NSB.readFile(br, String(query.path || ''));
        if (f.error) return err(res, 404, f.error);
        return ok(res, { ...f, diff: query.diff ? NSB.diffText(br, f.path) : undefined });
      }
      if (action === 'nexus-self.branch.file.put') {
        const w = NSB.writeFile(br, String(body.path || ''), body.content);
        return w.error ? err(res, 400, w.error) : ok(res, w);
      }
      if (action === 'nexus-self.branch.file.delete') {
        const d = NSB.deleteFile(br, String(query.path || body.path || ''));
        return d.error ? err(res, 400, d.error) : ok(res, d);
      }
      const AP = _require('../../lib/nexus-self/apply.js');
      const changes = NSB.changes(br);
      if (action === 'nexus-self.branch.plan') {
        const p = AP.plan({ system: params.system, base: br.base, changes });
        return ok(res, { ok: p.ok, errors: p.errors, conflicts: p.conflicts, items: p.items.map(({ _buf, ...i }) => i) });
      }
      // apply — the gate. The branch must have been RUN (any COS run option)
      // since its last change unless the caller explicitly waives it.
      const lastRun = (br.runs || []).slice(-1)[0];
      const newest = changes.length ? Math.max(...changes.filter(c => c.op !== 'delete').map(c => { try { return fs.statSync(path.join(br.root, c.path)).mtimeMs; } catch (_) { return 0; } }), 0) : 0;
      if (!body.skipRunCheck && (!lastRun || (lastRun.recordedAt || 0) < newest)) {
        return err(res, 409, 'run the branch first (COS run menu) — it has changed since its last run. Pass skipRunCheck:true to apply without one.');
      }
      if (!body.skipRunCheck && lastRun && lastRun.passed === false) {
        return err(res, 409, `the branch's last run failed (${lastRun.option || lastRun.mode || 'run'}) — fix it, or pass skipRunCheck:true to apply anyway`);
      }
      const r = AP.apply({ system: params.system, base: br.base, changes, reason: body.reason || '', by: 'idearium' });
      if (!r.ok) return err(res, 409, [...(r.errors || []), ...(r.conflicts || []).map(c => `CONFLICT ${c.path}: ${c.why}`)].join('; '));
      os.emit('idearium.nexus-self.apply', { system: params.system, applyId: r.applyId, snapshot: r.snapshot, paths: r.applied.map(i => i.path) });
      if (!body.keepBranch) NSB.destroy(comp, br.id);
      const synced = await _nexusSelfSync({ only: [params.system] });
      return ok(res, { ...r, synced: synced.systems || null, understanding: synced.understanding || null });
    }

    // §RUN 2026-09-21 — James: "use cos for the test environment." Forks the
    // repo's files into a branch of its REAL COS compartment and runs there
    // through COS's SandboxRunner (clean env, timeout, output cap).
    case 'repo.run.capabilities': {
      const TE = _require('../../cos/testenv/index.js');
      return ok(res, { ...TE.capabilities(), runtime: _require('../../cos/runtime/run.js').capabilities() });
    }
    // §0.39.261 — James: "the run button in cos to work fully … like a bunch of
    // options for cos." The menu is computed per repo (lib/cos-run.js): what can
    // run, and for what cannot, why.
    case 'repo.run.options': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const CR = _require('../../lib/cos-run.js');
      const dir = repo.nexusSelf ? null : _repoDiskDir(params.uuid);
      let branches = [];
      if (repo.nexusSelf && repo.nexusSelf.role === 'system') {
        const comp = _require('../../lib/cos-bridge.js').getCompartment(`nexus-self-${repo.nexusSelf.system}`);
        if (comp) branches = _require('../../lib/nexus-self/branch.js').list(comp).map(b => ({ id: b.id, label: b.label, createdAt: b.createdAt, runs: (b.runs || []).length }));
      }
      return ok(res, { repoUuid: params.uuid, nexusSystem: repo.nexusSelf ? repo.nexusSelf.system || null : null, branches, options: CR.options(repo, dir) });
    }
    // ── §0.39.261 — IDEA: the idea a repo was made from, and every way it
    // grows. James: "once a idea is a spec, move the idea section to the repo
    // … a full idea tab and section for improving/iterating or expanding the
    // project." An iteration is a real IdeaOS idea (tags repo:<uuid>,
    // kind:<improve|iterate|expand>), causally linked to the repo's idea, so it
    // lives in the same idea graph, lattice and SNR as every other idea.
    case 'repo.idea.get': case 'repo.idea.update': case 'repo.idea.iteration.create':
    case 'repo.idea.iteration.status': case 'repo.idea.iteration.roadmap': {
      const layer = getRepoLayer();
      const repo = layer.get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      let idea = repo.ideaUuid ? os.idea(repo.ideaUuid) : null;
      if (!idea) {   // older repos minted no idea, or it was lost: give it one, once
        os.emit('idearium.idea.create', { text: `Repo: ${repo.name}`, tags: [`repo:${repo.uuid}`], source: 'repo-ingest' });
        idea = os.db.ideas[os.db.ideas.length - 1];
        if (idea) { os.emit('idearium.idea.phase', { uuid: idea.uuid, phase: 'specced' }); layer.annotate(repo.uuid, { ideaUuid: idea.uuid }); }
      }
      if (!idea) return err(res, 500, 'could not resolve or create this repo\'s idea');
      const KINDS = ['improve', 'iterate', 'expand'];
      const STATUS_TO_PHASE = { open: 'seed', doing: 'building', done: 'complete', dropped: 'archived' };
      const PHASE_TO_STATUS = { seed: 'open', expanding: 'open', tensioned: 'open', specced: 'open', building: 'doing', complete: 'done', archived: 'dropped' };
      const tag = (i, k) => ((i.tags || []).find(t => String(t).startsWith(`${k}:`)) || '').slice(k.length + 1) || null;
      const iterations = () => os.db.ideas.filter(i => (i.tags || []).includes(`repo:${repo.uuid}`) && i.uuid !== idea.uuid)
        .map(i => ({ uuid: i.uuid, text: i.text, kind: tag(i, 'kind'), status: PHASE_TO_STATUS[i.phase] || 'open', phase: i.phase, roadmapPhase: tag(i, 'phase'), tension: i.tension ?? null, createdAt: i.createdAt, updatedAt: i.updatedAt }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (action === 'repo.idea.get') {
        const links = (os.db.links || []).filter(l => l.fromUuid === idea.uuid || l.toUuid === idea.uuid).length;
        return ok(res, { repoUuid: repo.uuid, idea: { uuid: idea.uuid, text: idea.text, phase: idea.phase, tags: idea.tags || [], tension: idea.tension ?? null, createdAt: idea.createdAt, updatedAt: idea.updatedAt, links }, iterations: iterations(), kinds: KINDS, statuses: Object.keys(STATUS_TO_PHASE) });
      }
      if (action === 'repo.idea.update') {
        const text = String(body.text || '').trim();
        if (!text) return err(res, 400, 'text is required');
        os.emit('idearium.idea.update', { uuid: idea.uuid, fields: { text } });
        return ok(res, { idea: os.idea(idea.uuid) });
      }
      if (action === 'repo.idea.iteration.create') {
        const kind = String(body.kind || '');
        const text = String(body.text || '').trim();
        if (!KINDS.includes(kind)) return err(res, 400, `kind must be one of ${KINDS.join(', ')}`);
        if (!text) return err(res, 400, 'text is required');
        os.emit('idearium.idea.create', { text, tags: [`repo:${repo.uuid}`, `kind:${kind}`], source: 'repo-idea' });
        const it = os.db.ideas[os.db.ideas.length - 1];
        if (!it || it.text !== text) return err(res, 500, 'the iteration was not created');
        os.emit('idearium.idea.link', { fromUuid: it.uuid, toUuid: idea.uuid, linkType: 'causal' });
        os.broadcast('idearium.repo.idea', { repoUuid: repo.uuid, iteration: it.uuid, kind });
        return ok(res, { iteration: iterations().find(x => x.uuid === it.uuid) });
      }
      const it = os.idea(params.id);
      if (!it || !(it.tags || []).includes(`repo:${repo.uuid}`)) return err(res, 404, `no iteration ${params.id} on this repo`);
      if (action === 'repo.idea.iteration.status') {
        const phase = STATUS_TO_PHASE[body.status];
        if (!phase) return err(res, 400, `status must be one of ${Object.keys(STATUS_TO_PHASE).join(', ')}`);
        os.emit('idearium.idea.phase', { uuid: it.uuid, phase });
        return ok(res, { iteration: iterations().find(x => x.uuid === it.uuid) });
      }
      // roadmap — the iteration becomes a real phase in the repo's phasemap file
      if (tag(it, 'phase')) return err(res, 409, `already on the roadmap as ${tag(it, 'phase')}`);
      const dir = _repoDiskDir(repo.uuid);
      const { collectPhasemaps, addPhase, RoadmapError } = await import('../repo/roadmap.js');
      const maps = dir ? collectPhasemaps(repo, dir).maps : [];
      const target = maps.find(m => m.path === body.map) || maps[0] || null;
      const mapPath = target ? target.path : 'roadmap-phasemap.spec';
      let added;
      try { added = addPhase({ text: target ? target.text : null, mapName: mapPath.split('/').pop().replace(/\.spec$/, ''), title: it.text.split('\n')[0].slice(0, 80), does: it.text, prefix: ({ improve: 'IM', iterate: 'IT', expand: 'EX' })[tag(it, 'kind')] || 'IT' }); }
      catch (e) { if (e instanceof RoadmapError) return err(res, 400, e.message, { code: e.code }); throw e; }
      const w = layer.writeTextFile(repo.uuid, mapPath, added.text);
      if (w.error) return err(res, w.code === 'IMMUTABLE' ? 409 : 500, `could not write ${mapPath}: ${w.error}`);
      os.emit('idearium.idea.update', { uuid: it.uuid, fields: { tags: [...(it.tags || []), `phase:${added.id}`] } });
      os.emit('idearium.repo.roadmap.updated', { repoUuid: repo.uuid, map: mapPath, phase: added.id, status: 'pending', via: w.via });
      return ok(res, { iteration: iterations().find(x => x.uuid === it.uuid), map: mapPath, phase: added.id });
    }

    // ── §0.39.261 — DEBUG: everything that is wrong with this repo, in one read.
    // James: "a tab for debugging." Each part is read from where it already
    // lives (the pipeline's verification + indexes, the COS run history, the
    // agent's exchange log) or checked live (syntax, dependencies) — nothing
    // here is a second copy of a result that could drift from its source.
    case 'repo.debug': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { return null; } };
      const ver = read('verification.json'), lazy = read('verification.lazy.json');
      const tiers = [...((ver && ver.tiers) || []), ...((lazy && lazy.tiers) || [])];
      const failedTiers = tiers.filter(t => t && t.passed === false && t.status !== 'not_applicable')
        .map(t => ({ level: t.level, name: t.name, failures: (t.failures || t.results || []).filter(x => !x || x.status !== 'passed').slice(0, 20) }));
      const filesIdx = read('indexes/files.json') || [];
      const parseFailures = filesIdx.filter(f => f.status === 'failed').map(f => ({ path: f.path, error: f.error || f.reason || null })).slice(0, 200);
      const runs = loadTable('idearium_repo_runs').filter(r => r.repoUuid === repo.uuid).sort((a, b) => b.ts - a.ts).slice(0, 20);
      let agentErrors = [];
      try { agentErrors = _require('../../lib/repo-agent.js').history(repo.uuid, 200).filter(x => !x.ok).slice(0, 20).map(x => ({ ts: x.ts, message: x.message.slice(0, 300), error: x.error, backend: x.backend })); } catch (_) {}
      const CR = _require('../../lib/cos-run.js'), RT = _require('../../cos/runtime/run.js');
      let files = [];
      try { files = CR.repoFiles(repo, dir); } catch (_) {}
      const js = files.filter(f => RT.JS_EXT.has(path.extname(f)));
      let syntax = null, deps = null;
      if (dir && fs.existsSync(dir)) {
        try { const s = await RT.syntaxCheck(dir, { files: js.filter(f => fs.existsSync(path.join(dir, f))) }); syntax = { checked: s.checked, failed: s.results.filter(r => !r.ok).slice(0, 100) }; } catch (e) { syntax = { error: e.message }; }
        if (repo.nexusSelf && repo.nexusSelf.role === 'system') {
          const sg = (await import('../repo/nexus-self.js')).readSystemGraph();
          const mine = sg ? sg.broken.filter(b => b.system === repo.nexusSelf.system) : [];
          deps = sg ? { summary: sg.bySystem[repo.nexusSelf.system] || null, brokenRelative: mine.map(b => ({ file: b.from, specifier: b.spec })), packages: sg.missing.filter(m => m.systems.includes(repo.nexusSelf.system)).map(m => ({ name: m.name, via: 'missing', usedBy: m.count })) } : null;
        } else {
          try { const d = RT.resolveDeps(dir, { files }); deps = { summary: d.summary, brokenRelative: d.brokenRelative, packages: d.packages.filter(p => p.via === 'missing') }; } catch (e) { deps = { error: e.message }; }
        }
      }
      return ok(res, { repoUuid: repo.uuid, verification: ver ? { status: ver.status, level: ver.level } : null, failedTiers, parseFailures, runs, agentErrors, syntax, deps, checkedAt: Date.now() });
    }

    case 'repo.run': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const CR = _require('../../lib/cos-run.js');
      // pre-0.39.261 callers send { mode: 'run'|'test', entry }
      const option = body.option || (body.mode === 'test' ? 'test.all' : body.entry ? 'run.file' : 'run.entry');
      let compartment = null, nexusBranch = null;
      if (repo.nexusSelf && repo.nexusSelf.role === 'system') {
        compartment = _require('../../lib/cos-bridge.js').getCompartment(`nexus-self-${repo.nexusSelf.system}`);
        if (body.branch) {
          nexusBranch = compartment ? _require('../../lib/nexus-self/branch.js').get(compartment, body.branch) : null;
          if (!nexusBranch) return err(res, 404, `branch not found: ${body.branch}`);
        }
      } else if (repo.compartmentId) compartment = _require('../../lib/cos-bridge.js').getCompartment(repo.compartmentId);
      const r = await CR.run({ repo, repoDir: repo.nexusSelf ? null : _repoDiskDir(params.uuid), compartment, option,
        file: body.file || body.entry || null, script: body.script || null,
        timeoutMs: Math.min(parseInt(body.timeoutMs, 10) || 30000, 300000), keepBranch: !!body.keepBranch, nexusBranch });
      if (!r.ok) return err(res, 422, (r.errors || ['run failed']).join('; '));
      os.emit('idearium.repo.run', { repoUuid: params.uuid, option: r.option, passed: r.passed, failed: r.failed });
      // kept for the Debug tab: what ran, where, and what failed (the tail of each failing run's stderr)
      try {
        appendRow('idearium_repo_runs', { uuid: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, repoUuid: params.uuid, option: r.option, label: r.label, where: r.where,
          passed: r.passed, failed: r.failed, allPassed: r.allPassed, durationMs: r.durationMs, branch: body.branch || null, ts: Date.now(),
          failures: (r.runs || []).filter(x => !x.passed).slice(0, 10).map(x => ({ file: x.file, exitCode: x.exitCode ?? null, error: x.error || null, stderr: String(x.stderr || '').slice(-600), health: x.health && !x.health.ok ? x.health.error || null : null })) });
      } catch (_) { /* the run's own result is returned regardless */ }
      return ok(res, { repoUuid: params.uuid, ...r, mode: option === 'test.all' ? 'test' : 'run' });
    }

    // ── §INJECT 2026-09-21 — .inject nodes ─────────────────────────────────
    case 'repo.inject.list': case 'repo.inject.create': case 'repo.inject.get':
    case 'repo.inject.edit': case 'repo.inject.apply': case 'repo.inject.reject':
    case 'repo.inject.revert': case 'repo.agent.settings.get': case 'repo.agent.settings.set':
    case 'repo.agent.blocks.get': case 'repo.agent.blocks.set': case 'repo.agent.blocks.preview': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RI = _require('../../lib/repo-inject.js');
      const layer = getRepoLayer();
      // An inject id that belongs to another repo is a 404 here, never an
      // action on the wrong compartment.
      const owned = () => { const n = RI.get(params.id); return n && n.repoUuid === params.uuid ? n : null; };
      const done = (r, okExtra = {}) => r.ok ? ok(res, { ...r, ...okExtra })
        : err(res, r.conflict ? 409 : 400, (r.errors || ['failed']).join('; '), { conflict: !!r.conflict });
      switch (action) {
        case 'repo.inject.list':
          return ok(res, { repoUuid: params.uuid, mode: RI.getMode(params.uuid), injects: RI.list(params.uuid, { status: query.status || null }) });
        case 'repo.inject.create': {
          const RH = _require('../../lib/repo-hat.js');
          // body.asAgent:true attributes it to this repo's hat; default is the person.
          const hat = body.asAgent ? RH.getRepoHat(params.uuid) : null;
          const r = RI.propose({ layer, repo, hat, path: body.path, content: body.content, syntax: body.syntax || null, source: { kind: hat ? 'agent' : 'person' } });
          if (r.ok && body.apply) return done(RI.apply(r.inject.uuid, { layer, force: !!body.force }));
          return done(r);
        }
        case 'repo.inject.get':
          return owned() ? ok(res, { inject: owned(), current: (layer.readFile(params.uuid, owned().path) || {}).content ?? null })
                         : err(res, 404, `inject not found in this repo: ${params.id}`);
        case 'repo.inject.edit':
          if (!owned()) return err(res, 404, `inject not found in this repo: ${params.id}`);
          return done(RI.edit(params.id, body.content));
        case 'repo.inject.apply': {
          if (!owned()) return err(res, 404, `inject not found in this repo: ${params.id}`);
          const r = RI.apply(params.id, { layer, force: !!body.force });
          if (r.ok) os.emit('idearium.repo.inject.applied', { repoUuid: params.uuid, inject: params.id, path: r.inject.path });
          return done(r);
        }
        case 'repo.inject.reject':
          if (!owned()) return err(res, 404, `inject not found in this repo: ${params.id}`);
          return done(RI.reject(params.id, { reason: body.reason || null }));
        case 'repo.inject.revert': {
          if (!owned()) return err(res, 404, `inject not found in this repo: ${params.id}`);
          const r = RI.revert(params.id, { layer, force: !!body.force });
          if (r.ok) os.emit('idearium.repo.inject.reverted', { repoUuid: params.uuid, inject: params.id, path: r.inject.path });
          return done(r);
        }
        case 'repo.agent.blocks.get': {
          const PB = _require('../../lib/repo-prompt-blocks.js');
          return ok(res, { repoUuid: params.uuid, blocks: PB.getBlocks(params.uuid), placeholders: PB.PLACEHOLDERS, version: PB.VERSION });
        }
        case 'repo.agent.blocks.set': {
          const PB = _require('../../lib/repo-prompt-blocks.js');
          const r = body.reset ? PB.resetBlocks(params.uuid, Array.isArray(body.reset) ? body.reset : null) : PB.setBlocks(params.uuid, body.blocks);
          if (r.ok) os.emit('idearium.repo.agent.blocks.changed', { repoUuid: params.uuid });
          return done(r.ok ? { ok: true, repoUuid: params.uuid, blocks: r.blocks } : r);
        }
        case 'repo.agent.blocks.preview': {
          // The exact first message this agent would be sent for body.message — persona + enabled blocks, with the real
          // retrieval for that message. {tools}/{tool_guide} are shown filled when copilot can be asked, else as placeholders.
          const RA = _require('../../lib/repo-agent.js');
          const RH = _require('../../lib/repo-hat.js');
          const message = String(body.message || 'hello');
          const hat = RH.getRepoHat(params.uuid);
          const provider = RA.getProvider(params.uuid);
          const backend = RA.routeFor(provider).backend;
          let context = { kind: null, block: '' };
          const repoDir = repo.materializeDir || path.join(layer.dataDir, 'projects', params.uuid);   // same derivation as the atlas routes
          if (repoDir) { try { const c = _require('../../lib/repo-context.js').retrieve({ repoDir, message, bare: true }); context = { kind: c.kind || null, block: c.block }; } catch (_) { /* preview without context, said below */ } }
          let text = RA.compose({ hat, message, context, repoUuid: params.uuid, backend });
          let toolsFilled = false;
          if (/\{tools\}|\{tool_guide\}/.test(text)) {
            try { const TR = _require('../../copilot/tool-runtime.js'); text = TR.fillToolPlaceholders(text, RA.scopeFor(params.uuid, hat)); toolsFilled = true; } catch (_) { toolsFilled = false; }
          }
          return ok(res, { repoUuid: params.uuid, provider, backend, text, chars: text.length, toolsFilled, context: context.kind || 'none' });
        }
        case 'repo.agent.settings.get': {
          const RA = _require('../../lib/repo-agent.js');
          return ok(res, { repoUuid: params.uuid, injectMode: RI.getMode(params.uuid), modes: RI.MODES,
                           ...RA.settingsView(params.uuid) });
        }
        case 'repo.agent.settings.set': {
          // injectMode, and/or the provider — set directly (body.provider,
          // unchanged, for CLI/API power use including 'auto'), or via the
          // switch+dropdown pair the Agent tab sends: useGuardian (bool) +
          // guardianAgent (name, only meaningful when useGuardian is true).
          // §DEFAULT-GUARDIAN 2026-09-21. If both provider and the pair are
          // sent, provider wins — it is the more specific, explicit request.
          if (body.injectMode === undefined && body.provider === undefined && body.toolScope === undefined
              && body.useGuardian === undefined && body.guardianAgent === undefined && body.ollamaModel === undefined) {
            return err(res, 400, 'injectMode, provider, ollamaModel, toolScope, and/or useGuardian/guardianAgent required');
          }
          const RA = _require('../../lib/repo-agent.js');
          let out = { ok: true, repoUuid: params.uuid };
          // 0.39.257 — 'all' (default) or 'project' (the repo hat's own tools); enforced on ollama/guardian dispatches
          if (body.toolScope !== undefined) { const r = RA.setToolScope(params.uuid, body.toolScope); if (!r.ok) return done(r); out.toolScope = r.toolScope; }
          if (body.injectMode !== undefined) { const r = RI.setMode(params.uuid, body.injectMode); if (!r.ok) return done(r); out.injectMode = r.injectMode; }
          if (body.provider !== undefined) {
            const r = RA.setProvider(params.uuid, body.provider); if (!r.ok) return done(r); out.provider = r.provider;
          } else if (body.useGuardian !== undefined || body.guardianAgent !== undefined) {
            const useGuardian = body.useGuardian !== undefined ? !!body.useGuardian : RA.settingsView(params.uuid).useGuardian;
            let target;
            if (!useGuardian) { target = 'ollama'; }
            else if (body.guardianAgent) { target = body.guardianAgent; }
            else {
              const cur = RA.getProvider(params.uuid);
              target = RA.isGuardianProvider(cur) ? cur : RA.defaultProvider();
            }
            const r = RA.setProvider(params.uuid, target); if (!r.ok) return done(r); out.provider = r.provider;
          }
          // 0.39.253 — the Ollama model this compartment uses when ollama wears the hat; null/'' = the bridge's default.
          // A named model is checked against Ollama's real installed list first.
          if (body.ollamaModel !== undefined) {
            const want = typeof body.ollamaModel === 'string' ? body.ollamaModel.trim() : '';
            const list = want ? await _ollamaModels() : null;
            const r = RA.setOllamaModel(params.uuid, want || null, { installed: list && list.ok ? list.models : null });
            if (!r.ok) return err(res, want && list && !list.ok ? 502 : 400, r.errors.join('; '));
            out.ollamaModel = r.ollamaModel;
          }
          return ok(res, out);
        }
      }
      return err(res, 500, `unhandled inject route ${action}`);
    }

    // 0.39.253 — Ollama's installed models for the Agent tab's dropdown. Unreachable is 502 with the reason, never a
    // guessed list.
    case 'ollama.models': {
      const r = await _ollamaModels();
      return r.ok ? ok(res, r) : err(res, 502, r.error, { models: [], active: r.active });
    }

    case 'repo.agent.prompt': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!body.message || !String(body.message).trim()) return err(res, 400, 'message is required');
      const RA = _require('../../lib/repo-agent.js');
      const r = await RA.dispatch({
        repo, repoDir: _repoDiskDir(params.uuid),
        message: body.message,
        backend: body.backend || null,
        agent: body.agent || null,
        provider: body.provider || null,   // §PROVIDER — else this compartment's stored choice
        noContext: body.noContext === true,
        layer: getRepoLayer(),   // §INJECT — addressed code blocks land in this repo through the one real write path
      });
      // A backend that is down is a real, reportable state, not a server
      // error — 200 with ok:false so the CLI can print it in the transcript
      // instead of api() throwing and losing the text.
      return ok(res, r);
    }

    // §LATE 0.39.241 — the Agent tab asks for a reply copilot's wait missed.
    // find is read-only (safe while a dispatch is in flight); adopt runs the
    // reply through the same learn/inject/log path dispatch uses, once.
    case 'repo.agent.late.find': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RA = _require('../../lib/repo-agent.js');
      const r = RA.findLate({ repo, since: parseInt(query.since || '0', 10) || 0, message: query.message || null, jobId: query.jobId || null });
      if (!r.ok) return err(res, 503, r.error);
      return ok(res, r);
    }

    case 'repo.agent.late.adopt': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!body.responseId) return err(res, 400, 'responseId is required');
      if (!body.message || !String(body.message).trim()) return err(res, 400, 'message is required');
      const RA = _require('../../lib/repo-agent.js');
      const r = await RA.adoptLate({
        repo, repoDir: _repoDiskDir(params.uuid), layer: getRepoLayer(),
        responseId: String(body.responseId), message: body.message,
        since: Number(body.since) || 0, noContext: body.noContext === true,
      });
      // Same convention as repo.agent.prompt: a refusal is a reportable state (200, ok:false).
      return ok(res, r);
    }

    case 'repo.agent.history': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RA = _require('../../lib/repo-agent.js');
      const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 500);
      return ok(res, { repoUuid: params.uuid, exchanges: RA.history(params.uuid, limit) });
    }

    // §TOOLS 0.39.257 — lib/repo-agent.js listTools / debugReport.
    case 'repo.agent.tools': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const r = await _require('../../lib/repo-agent.js').listTools({ repo, q: query.q || '' });
      return r.ok ? ok(res, r) : err(res, 502, r.error);
    }
    // 0.39.257 — /graph [file]: the project map, or one file's connections — the same text the agent's context gets.
    case 'repo.agent.graph': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      const RC = _require('../../lib/repo-context.js');
      const g = dir ? RC.readGraph(dir) : null;
      if (!g) return err(res, 404, 'no graph yet — the repo has not been through the import pipeline (Diagnose → reindex)');
      if (query.file) {
        const f = String(query.file).replace(/^\.?\//, '');
        if (!g.files.includes(f)) {
          const near = g.files.filter(x => x.toLowerCase().includes(f.toLowerCase())).slice(0, 8);
          return err(res, 404, `no file "${f}" in the graph${near.length ? ` — did you mean: ${near.join(', ')}` : ''}`);
        }
        return ok(res, { file: f, text: RC.connections(g, [f], 4000) || `${f} has no import links (nothing it imports resolves, nothing imports it)` });
      }
      return ok(res, { files: g.files.length, text: RC.overview(g, 4000).replace(/^\(Your question[^\n]*\n/m, '') });
    }
    case 'repo.agent.debug': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const r = await _require('../../lib/repo-agent.js').debugReport({ repo, repoDir: _repoDiskDir(params.uuid) });
      return r.ok ? ok(res, r) : err(res, 400, r.error);
    }

    case 'repo.agent.history.clear': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RA = _require('../../lib/repo-agent.js');
      const r = RA.clearHistory(params.uuid);
      if (!r.ok) return err(res, 500, (r.errors || ['clear failed']).join('; '));
      return ok(res, { repoUuid: params.uuid, ...r });
    }

    case 'repo.agent.memory.list': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const MEM = _require('../../lib/repo-hat-memory.js');
      return ok(res, {
        repoUuid: params.uuid,
        kinds: MEM.KINDS,
        stats: MEM.stats(params.uuid),
        observations: MEM.list(params.uuid, { limit: Math.min(parseInt(query.limit || '200', 10) || 200, 1000) }),
      });
    }

    // Recording goes through repo-hat's learn(), not repo-hat-memory's
    // record(), on purpose: learn() also re-composes the live hat, so an
    // observation is active on the very next dispatch. record() alone would
    // bank it into a table nothing reads at dispatch time.
    case 'repo.agent.memory.record': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RH = _require('../../lib/repo-hat.js');
      const r = RH.learn({
        repo, repoDir: _repoDiskDir(params.uuid),
        kind: body.kind, text: body.text,
        source: body.source || 'james', evidence: body.evidence || null,
      });
      if (!r.ok) return err(res, 400, (r.errors || ['record failed']).join('; '));
      return ok(res, { repoUuid: params.uuid, ...r });
    }

    case 'repo.agent.memory.forget': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const MEM = _require('../../lib/repo-hat-memory.js');
      const r = MEM.forget(params.obs);
      if (!r.ok) return err(res, 400, (r.errors || ['forget failed']).join('; '));
      // The observation is gone from the store; re-ground the hat so it is
      // gone from the persona too, or the agent keeps being told a thing
      // the person just deleted.
      const RH = _require('../../lib/repo-hat.js');
      const refreshed = RH.refreshRepoHatPersona({ repo, repoDir: _repoDiskDir(params.uuid) });
      return ok(res, { repoUuid: params.uuid, ...r, hatUpdated: !!refreshed.ok, reason: refreshed.ok ? undefined : (refreshed.errors || []).join('; ') });
    }

    case 'repo.agent.export': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RAN = _require('../../lib/repo-agent-node.js');
      const r = RAN.materialise({
        repo, repoDir: _repoDiskDir(params.uuid),
        includeLog: body.includeLog !== false,
      });
      if (!r.ok) return err(res, 400, (r.errors || ['export failed']).join('; '));
      os.emit('idearium.repo.agent.exported', { repoUuid: params.uuid, observations: r.observations });
      return ok(res, { repoUuid: params.uuid, ...r });
    }

    case 'repo.agent.import': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!body.filePath) return err(res, 400, 'filePath is required');
      const RAN = _require('../../lib/repo-agent-node.js');
      const r = RAN.importAgent(body.filePath, {
        repo, repoDir: _repoDiskDir(params.uuid), includeLog: !!body.includeLog,
      });
      if (!r.ok) return err(res, 400, (r.errors || ['import failed']).join('; '));
      os.emit('idearium.repo.agent.imported', { repoUuid: params.uuid, restored: r.restored, merged: r.merged });
      return ok(res, { repoUuid: params.uuid, ...r });
    }

    // ── §KEYS 2026-09-20 — compartment key/secret options ────────────────
    // Every handler here is scoped to the repo's own compartment. A secret
    // VALUE is never in any response: cos/ci/keys.js returns values from
    // exactly one function (secretsEnvFor), which is only ever called by
    // the CI runner when spawning a stage — never from an HTTP path.
    case 'repo.ci.keys.list':
    case 'repo.ci.keys.register':
    case 'repo.ci.keys.remove':
    case 'repo.ci.secrets.list':
    case 'repo.ci.secrets.set':
    case 'repo.ci.secrets.remove': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!repo.compartmentId) {
        return err(res, 400, 'this repo has no compartment — keys and secrets live in a compartment, not on a bare directory.');
      }
      const keys = _require('../../cos/ci/keys.js');
      const compartmentName = repo.compartmentId;
      let r;
      switch (action) {
        case 'repo.ci.keys.list':      r = keys.listSshKeys({ compartmentName }); break;
        case 'repo.ci.keys.register':  r = keys.registerSshKey({ compartmentName, alias: body.alias, keyPath: body.keyPath }); break;
        case 'repo.ci.keys.remove':    r = keys.removeSshKey({ compartmentName, alias: params.alias }); break;
        case 'repo.ci.secrets.list':   r = keys.listSecrets({ compartmentName }); break;
        case 'repo.ci.secrets.set':    r = keys.setSecret({ compartmentName, name: body.name, value: body.value }); break;
        case 'repo.ci.secrets.remove': r = keys.removeSecret({ compartmentName, name: params.name }); break;
      }
      if (!r || !r.ok) return err(res, 400, (r && r.error) || 'key operation failed');
      return ok(res, { repoUuid: params.uuid, compartmentId: repo.compartmentId, ...r });
    }

    // ── §CI 2026-09-20 — CI/CD per compartment ────────────────────────────
    // A repo's compartmentId (MCO6) is what makes this per-compartment
    // rather than per-directory. A repo with no compartment is refused
    // rather than silently run against a bare path: "ci/cd per compartment"
    // means the compartment is the unit, and pretending otherwise would
    // make the scoping a lie.
    case 'repo.ci.config': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const ci = _require('../../cos/ci/index.js');
      const r = ci.readConfig(dir);
      if (!r.ok) return err(res, 400, r.error);
      return ok(res, {
        repoUuid: params.uuid, compartmentId: repo.compartmentId || null,
        exists: r.exists, config: r.config, configFile: ci.CONFIG_FILENAME,
        stageKinds: ci.STAGE_KINDS,
      });
    }

    case 'repo.ci.setConfig': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const ci = _require('../../cos/ci/index.js');
      const w = ci.writeConfig(dir, body.config || body);
      if (!w.ok) return err(res, 400, w.error);
      os.emit('idearium.repo.ci.configured', { repoUuid: params.uuid, compartmentId: repo.compartmentId || null });
      return ok(res, { repoUuid: params.uuid, written: w.path });
    }

    case 'repo.ci.run': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!repo.compartmentId) {
        return err(res, 400, 'this repo has no compartment — CI here is per compartment. Import it through the project-import flow (which creates a real COS compartment) or attach one first.');
      }
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const ci = _require('../../cos/ci/index.js');
      const result = await ci.run({
        compartmentId: repo.compartmentId, rootDir: dir,
        only: Array.isArray(body.only) && body.only.length ? body.only : null,
        // Every stage event becomes a real idearium event, so the UI and
        // the event log see CI progress the same way they see everything else.
        onEvent: (type, payload) => { try { os.emit(`idearium.${type.replace(/:/g, '.')}`, payload); } catch (_) {} },
      });
      if (!result.ok) return err(res, 400, result.error);
      return ok(res, { repoUuid: params.uuid, run: result.run });
    }

    case 'repo.ci.runs': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const ci = _require('../../cos/ci/index.js');
      const limit = Math.max(1, Math.min(50, parseInt(query.limit || '20', 10) || 20));
      // Summaries only — a full run carries every stage's stdout/stderr and
      // is not a useful list payload. Fetch one by id for the logs.
      const runs = ci.listRuns(dir, limit).map(r => ({
        runId: r.runId, status: r.status, startedAt: r.startedAt, durationMs: r.durationMs,
        stages: (r.stages || []).map(s => ({ name: s.name, kind: s.kind, status: s.status, exitCode: s.exitCode, durationMs: s.durationMs })),
      }));
      return ok(res, { repoUuid: params.uuid, count: runs.length, runs });
    }

    case 'repo.ci.run.show': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const ci = _require('../../cos/ci/index.js');
      const run = ci.getRun(dir, params.runId);
      if (!run) return err(res, 404, `no such CI run: ${params.runId}`);
      return ok(res, { repoUuid: params.uuid, run });
    }

    // §SCAN 2026-09-20 — repo intelligence scan: dangling hooks, gaps,
    // tension. Returns 200 with ok:false (not a 4xx) when the repo simply
    // has not been indexed yet: "not scanned" is a real, expected state
    // of a real repo, not a client error, and the UI renders that state
    // honestly rather than as a failed request.
    case 'repo.scan': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { scanRepo } = await import('../repo/scan.js');
      const result = scanRepo(dir);
      return ok(res, { repoUuid: params.uuid, repoName: repo.name, ...result });
    }

    // §MCO3 2026-09-20 — take a §33 snapshot of a repo and commit it to
    // versionium. Refused (409) for a repo the pipeline has never indexed:
    // a snapshot of nothing is not a snapshot. A versionium that is down is
    // a 502 with its real error, same convention as snapshot.push.
    case 'repo.snapshot.commit': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { commitRepoSnapshot, verifyMustRecord } = await import('../repo/snapshot.js');
      const result = await commitRepoSnapshot({
        repo, repoDir: dir, message: body.message || null, causedBy: body.causedBy || null,
        fileLayer: _fileLayers(params.uuid).fileLayer, snapshotMode: _snapshotMode(),
        commit: async (payload) => {
          const r = await _versionium('POST', '/api/versionium/commit', payload);
          if (!r.ok) return { error: r.error };
          if (r.data?.error) return { error: r.data.error };
          return r.data?.commit || { error: 'versionium returned no commit' };
        },
      });
      if (!result.ok) {
        const status = ['NOT_INDEXED', 'FILES_TOO_BIG'].includes(result.code) ? 409
          : ['COMMIT_FAILED', 'FILES_PLAN_FAILED', 'FILES_RECORD_FAILED'].includes(result.code) ? 502 : 500;
        // FILES_RECORD_FAILED leaves a commit behind; say which, so it can be found.
        return err(res, status, result.error, { code: result.code, commitId: result.commit?.commitId || null });
      }
      os.emit('idearium.repo.snapshot.committed', {
        repoUuid: params.uuid, commitId: result.commit.commitId,
        sourceFresh: result.record.mustRecord.sourceHash.fresh ?? null,
      });
      return ok(res, {
        repoUuid: params.uuid, commitId: result.commit.commitId, branch: result.commit.branch,
        system: result.commit.system, mustRecord: verifyMustRecord(result.record), record: result.record,
        files: result.files ? { treeHash: result.files.treeHash, counts: result.files.counts, bytes: result.files.bytes || null, alreadyRecorded: !!result.files.alreadyRecorded } : null,
      });
    }

    case 'repo.snapshot.list': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const { SNAPSHOT_SYSTEM, summarizeRepoSnapshots } = await import('../repo/snapshot.js');
      const hist = await _versionium('GET', `/api/versionium/history?system=${encodeURIComponent(SNAPSHOT_SYSTEM)}`);
      if (!hist.ok) return err(res, 502, hist.error);
      return ok(res, { repoUuid: params.uuid, snapshots: summarizeRepoSnapshots(hist.data.commits || [], params.uuid) });
    }

    case 'repo.snapshot.show': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const { isRepoSnapshotState } = await import('../repo/snapshot.js');
      const got = await _versionium('GET', `/api/versionium/state/${encodeURIComponent(params.commitId)}`);
      if (!got.ok) return err(res, got.status === 404 ? 404 : 502, got.status === 404 ? `no snapshot ${params.commitId} for repo ${params.uuid}` : got.error);
      const st = got.data;
      // A commit id that exists but is an idea snapshot, or another repo's
      // snapshot, is "not found" as far as THIS repo is concerned.
      if (!isRepoSnapshotState(st?.state) || st.state.repository !== params.uuid) {
        return err(res, 404, `no snapshot ${params.commitId} for repo ${params.uuid}`);
      }
      return ok(res, { repoUuid: params.uuid, commitId: params.commitId, ts: st.commit?.wall ?? null, message: st.commit?.message ?? null, record: st.state });
    }

    // §MCO-E 2026-09-20 — GET: the roadmap (phase_node-shaped, dependency-ordered).
    // 200 with maps:[] when the repo has no phasemap: an ordinary state, not an
    // error (api() throws on ok:false and the UI renders the empty state).
    case 'repo.roadmap.get': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { collectPhasemaps, buildRoadmap } = await import('../repo/roadmap.js');
      const { maps, skipped } = collectPhasemaps(repo, dir);
      return ok(res, { repoUuid: params.uuid, skipped, roadmap: buildRoadmap({ projectId: params.uuid, maps }) });
    }

    // POST {map, phase, status, force?} — change one phase's status in the
    // phasemap file, proven by re-parsing with loom before and after the write.
    case 'repo.roadmap.phase.update': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { collectPhasemaps, buildRoadmap, setPhaseStatus, RoadmapError } = await import('../repo/roadmap.js');
      const { map, phase, status, force } = body || {};
      if (!map || !phase || !status) return err(res, 400, 'map (repo-relative path), phase and status are required');
      const found = collectPhasemaps(repo, dir).maps.find(m => m.path === map);
      if (!found) return err(res, 404, `no phasemap ${map} in repo ${params.uuid}`);
      let edit;
      try { edit = setPhaseStatus({ text: found.text, mapName: map.split('/').pop().replace(/\.spec$/, ''), phaseId: phase, status, force: force === true }); }
      catch (e) {
        if (e instanceof RoadmapError) {
          const code = e.code === 'NOT_FOUND' ? 404 : e.code === 'DEPS_INCOMPLETE' ? 409 : e.code === 'ROUNDTRIP_FAILED' ? 422 : 400;
          return err(res, code, e.message, { code: e.code, blockers: e.blockers || null });
        }
        throw e;
      }
      const w = getRepoLayer().writeTextFile(params.uuid, map, edit.text);
      if (w.error) return err(res, 500, `could not write ${map}: ${w.error}`, { code: 'WRITE_FAILED' });
      // read it back from disk and parse it again: the response reports what is
      // there, not what was intended
      const back = collectPhasemaps(getRepoLayer().get(params.uuid) || repo, dir).maps.find(m => m.path === map);
      const fresh = buildRoadmap({ projectId: params.uuid, maps: back ? [back] : [] }).phases.find(p => p.phase_key === phase);
      if (!fresh || fresh.status !== status) {
        return err(res, 500, `wrote ${map} but reading it back shows ${phase} as '${fresh && fresh.status}', not '${status}'`, { code: 'READBACK_MISMATCH' });
      }
      os.emit('idearium.repo.roadmap.updated', { repoUuid: params.uuid, map, phase, status, via: w.via });
      const all = collectPhasemaps(getRepoLayer().get(params.uuid) || repo, dir);
      return ok(res, { repoUuid: params.uuid, change: { map, phase, before: edit.before.status, after: status, via: w.via }, skipped: all.skipped, roadmap: buildRoadmap({ projectId: params.uuid, maps: all.maps }) });
    }

    // §MCO-B 2026-09-20 — restore a repo's files to a snapshot. dryRun defaults
    // to TRUE: a caller must send {"dryRun":false} to change anything. The
    // envelope is ok:true whenever the attempt ran or was refused for a stated
    // reason; the outcome is result.ok / result.verified (api() throws on
    // ok:false, and the UI needs result.mismatches and result.preRestoreCommitId
    // from a restore that ran but did not fully verify).
    case 'repo.snapshot.restore': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { isRepoSnapshotState, commitRepoSnapshot } = await import('../repo/snapshot.js');
      const { restoreRepoSnapshot } = await import('../repo/snapshot-restore.js');
      const got = await _versionium('GET', `/api/versionium/state/${encodeURIComponent(params.commitId)}`);
      if (!got.ok) return err(res, got.status === 404 ? 404 : 502, got.status === 404 ? `no snapshot ${params.commitId} for repo ${params.uuid}` : got.error);
      const st = got.data;
      if (!isRepoSnapshotState(st?.state) || st.state.repository !== params.uuid) {
        return err(res, 404, `no snapshot ${params.commitId} for repo ${params.uuid}`);
      }
      const dryRun = body.dryRun !== false;
      const { fileLayer, layer } = _fileLayers(params.uuid);
      const result = await restoreRepoSnapshot({
        repo, repoDir: dir, commitId: params.commitId, record: st.state, layer, repoLayer: getRepoLayer(), dryRun,
        takeSnapshot: () => commitRepoSnapshot({
          repo: getRepoLayer().get(params.uuid) || repo, repoDir: dir, fileLayer, snapshotMode: _snapshotMode(),
          message: `pre-restore snapshot (before restoring ${params.commitId})`, causedBy: params.commitId,
          commit: async (payload) => {
            const r = await _versionium('POST', '/api/versionium/commit', payload);
            if (!r.ok) return { error: r.error };
            return r.data?.commit || { error: r.data?.error || 'versionium returned no commit' };
          },
        }),
      });
      if (!dryRun && result.changed) {
        os.emit('idearium.repo.snapshot.restored', {
          repoUuid: params.uuid, commitId: params.commitId, verified: !!result.verified,
          preRestoreCommitId: result.preRestoreCommitId || null,
        });
      }
      return ok(res, { repoUuid: params.uuid, commitId: params.commitId, dryRun, result });
    }

    // §INCREMENTAL-REINDEX (§35) — explicit re-run for a repo whose files
    // changed outside idearium's own write path (e.g. edited directly on
    // disk, or after a manual git pull into the materialized dir). Every
    // idearium-native edit (repo.file.write/delete) already triggers this
    // automatically via RepoLayer's _materializeQuiet — see repo/index.js.
    case 'repo.reindex': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const pipeline = runImportPipeline(repo, dir);
      return ok(res, { pipeline });
    }

    // ── Projects: flat zip shelf (§PROJECTS 2026-07-19) ────────────────────────
    // No RepoLayer, no spec-engine, no idea/lineage tracking — just "store this
    // zip, list it, get it back." One row in idearium_projects per file, raw
    // bytes on disk at data/projects/<uuid>-<safeName>. Content travels over
    // this JSON API as base64 (this router has no multipart parser); fine at
    // local, internal-only scale.
    case 'project.list': {
      const rows = loadTable('idearium_projects').slice().sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      return ok(res, { projects: rows });
    }

    case 'project.upload': {
      const { name, filename, contentBase64 } = body;
      if (!filename) return err(res, 400, 'filename required');
      if (!contentBase64) return err(res, 400, 'contentBase64 required (base64-encoded file contents)');
      let buf;
      try { buf = Buffer.from(contentBase64, 'base64'); } catch (e) { return err(res, 400, 'invalid base64 content'); }
      if (!buf.length) return err(res, 400, 'empty file');
      const uuid = crypto.randomUUID();
      const safeName = filename.replace(/[^a-z0-9-_.]+/gi, '_');
      const diskName = `${uuid}-${safeName}`;
      try { fs.writeFileSync(path.join(PROJECTS_DIR, diskName), buf); }
      catch (e) { return err(res, 500, `write failed: ${e.message}`); }
      const row = {
        uuid, name: (name || filename.replace(/\.[^/.]+$/, '')).slice(0, 200),
        filename: safeName, diskName, size: buf.length, uploadedAt: Date.now(),
      };
      appendRow('idearium_projects', row);
      os.emit('idearium.project.uploaded', { uuid, name: row.name, size: row.size });
      return ok(res, { project: row });
    }

    case 'project.download': {
      const row = loadTable('idearium_projects').find(r => r.uuid === params.uuid);
      if (!row) return err(res, 404, `project not found: ${params.uuid}`);
      const filePath = path.join(PROJECTS_DIR, row.diskName);
      if (!fs.existsSync(filePath)) return err(res, 404, 'project file missing on disk');
      const buf = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${row.filename}"`,
        'Content-Length': buf.length,
        ...CORS,
      });
      return res.end(buf);
    }

    case 'project.delete': {
      const row = loadTable('idearium_projects').find(r => r.uuid === params.uuid);
      if (!row) return err(res, 404, `project not found: ${params.uuid}`);
      try { fs.unlinkSync(path.join(PROJECTS_DIR, row.diskName)); } catch (e) { /* non-fatal — row cleanup still proceeds */ }
      deleteRow('idearium_projects', params.uuid);
      os.emit('idearium.project.deleted', { uuid: params.uuid, name: row.name });
      return ok(res, { deleted: true, uuid: params.uuid });
    }

    // ── Spec Engine handlers (Phase 40) ────────────────────────────────────────

    case 'speceng.list': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      return ok(res, { specs: se.listSpecs() });
    }

    // §CONTRACT BEFORE UI 2026-07-09 — the first-page template picker needs a
    // real list to render from. Backend and contract first; the UI reads this,
    // never a hardcoded dropdown that drifts from the registry.
    // §OBSERVABLE 2026-07-09 — until now, "dispatch goes through WARP" was a
    // comment. It was false for months: the import always rejected and the
    // soft-fallback hid it. This makes the claim checkable from outside.
    case 'speceng.warp.status':
      return ok(res, warpStatus());

    case 'speceng.templates': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      // §FILE-TREE-FIRST 2026-09-21 — every COS archetype and blueprint is
      // offered alongside the spec-document templates, read live from cos/.
      // §BUILT 2026-09-21 — eravos mods (real starting files, same shape
      // as a COS archetype) offered the same way, read live from eravos/.
      try {
        const FTP = _require('../../lib/file-tree-plan.js');
        let cos = [], eros = [];
        try { cos = FTP.listCosTemplates(); }
        catch (e) { console.warn(`[speceng.templates] COS templates unavailable: ${e.message}`); }
        try { eros = FTP.listEravosMods(); }
        catch (e) { console.warn(`[speceng.templates] eravos mods unavailable: ${e.message}`); }
        return ok(res, { templates: [...se.listTemplates(), ...cos, ...eros] });
      }
      catch (e) { return err(res, 500, e.message); }
    }

    case 'speceng.create': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      const { name, type, description, agent, sectionAgents, warpPrimitives, templateId, templateIds, buildEngine, ideaUuid, compartmentTemplateName } = body;
      if (!name) return err(res, 400, 'name required');
      if (ideaUuid && !os.idea(ideaUuid)) return err(res, 404, `idea not found: ${ideaUuid}`);
      try {
        // §BUILT 2026-08-17 — GA6. James: "architecture template with
        // maybe a compartment of the template files." Resolved HERE,
        // not inside _buildManifest — this route is already async, and
        // keeping _buildManifest itself synchronous avoids widening an
        // established code path with multiple real callers to async for
        // one new feature. Real compartment content merged additively
        // into the schema section below, not silently discarded if a
        // compartment name is given but not found (honest null, logged).
        let compartmentSeed = null;
        if (compartmentTemplateName) {
          const { readCompartmentTemplate } = await import('../spec-engine/templates.js');
          compartmentSeed = await readCompartmentTemplate(compartmentTemplateName);
        }
        // An unknown templateId/templateIds (or buildEngine) throws inside
        // createSpec (§1.2) and surfaces as a 400 here rather than silently
        // creating an unseeded / mis-configured spec.
        // §FILE-TREE-FIRST 2026-09-21 — James: "the file tree needs to be
        // generated first with the list of files, the kernel, engine and
        // runtime." A COS template, or body.fileTree, makes the spec's
        // chunks the project's FILES, planned before anything is built:
        // the COS template supplies real files, the agent plans the rest
        // through the same WARP dispatch the build uses. Document-section
        // specs are unchanged when neither is asked for.
        const FTP = _require('../../lib/file-tree-plan.js');
        const allIds = Array.isArray(templateIds) ? templateIds : (templateId ? [templateId] : []);
        // §BUILT 2026-09-21 — isFileTreeTemplate covers both real catalogs
        // (COS archetypes/blueprints and eravos mods); an id from either
        // takes the file-tree path below, same as a COS-only id always did.
        const fileTreeIds = allIds.filter(id => FTP.isFileTreeTemplate(id));
        const docIds = allIds.filter(id => !FTP.isFileTreeTemplate(id));
        let manifest, planInfo = null;
        if (body.fileTree === true || fileTreeIds.length) {
          const warpFn = await getWarpChunkDispatch();
          const ask = warpFn ? async (prompt) => {
            const r = await warpFn(prompt, { chunkTitle: `plan: ${name}`, expectCode: false, preferAgent: agent || null });
            if (!r || !r.ok) throw new Error((r && r.error) || 'plan dispatch failed');
            return r.text;
          } : null;
          const planned = await FTP.plan({ name, description, templateIds: fileTreeIds, ask });
          if (!planned.ok) return err(res, 422, (planned.errors || ['file tree could not be planned']).join('; '), { agentError: planned.agentError || null });
          manifest = se.createFileTreeSpec({ name, description, plan: planned, agent: agent || null, ideaUuid: ideaUuid || null, templateId: fileTreeIds.join(',') || null });
          // The plan as a node type (.filetree), not a markdown file.
          try { FTP.writeTreeNode(manifest); }
          catch (e) { console.warn(`[speceng.create] .filetree node write failed (spec still created): ${e.message}`); }
          planInfo = { planSource: planned.planSource, files: planned.files.length, rejected: planned.rejected.length, agentError: planned.agentError || null, layers: manifest.fileTree && manifest.fileTree.layers };
        } else {
          manifest = se.createSpec({ name, type, description, agent, sectionAgents: sectionAgents || {}, warpPrimitives: warpPrimitives || [], templateId, templateIds: docIds.length ? docIds : templateIds, buildEngine: buildEngine || 'auto', ideaUuid: ideaUuid || null });
        }
        if (compartmentSeed) {
          const schemaChunk = (manifest.chunks || []).find(c => c.sectionId === 'schema');
          if (schemaChunk && schemaChunk.status === 'pending') {
            schemaChunk.content = `## Real architecture template: ${compartmentSeed.compartmentName} (${compartmentSeed.fileCount} real files)\n\n${compartmentSeed.content}`;
            schemaChunk.status = 'complete';
            manifest.doneChunks = (manifest.doneChunks || 0) + 1;
            // §FIXED, found by testing before shipping: _buildManifest
            // already wrote manifest.json to disk before this mutation
            // ever runs (fs.writeFileSync happens inside it, confirmed by
            // reading the code directly) — without this real re-save, the
            // schema content only ever existed in the HTTP response, never
            // actually persisted. Same real path convention this whole
            // file already uses elsewhere.
            const { default: fsMod } = await import('fs');
            const { default: pathMod } = await import('path');
            const specDir = pathMod.join(IDEARIUM_DATA_DIR, 'specs', manifest.uuid);
            try { fsMod.writeFileSync(pathMod.join(specDir, 'manifest.json'), JSON.stringify(manifest, null, 2)); }
            catch (e) { console.warn(`[speceng.create] compartment-seed re-save failed: ${e.message}`); }
          }
        }
        os.emit('idearium.spec-engine.created', { specUuid: manifest.uuid, name, type, templateIds: manifest.templateIds, buildEngine: manifest.buildEngine, ideaUuid: manifest.ideaUuid });

        // §FOUND & FIXED 2026-09-06 — James, direct, repeated: "the
        // moment a spec is made the compartment and repo are made...
        // specs build compartments, which are repositories. it is not
        // creating repositories." Confirmed by reading createSpec()'s
        // full body first: it never touched RepoLayer at all — a repo
        // only ever got created later, through the separate, explicit
        // promote path (idearium.spec.promote), gated on chunks being
        // complete. That's backwards from what's wanted: a repo should
        // exist the moment the spec does, chunks pending or not, so
        // there's always a real, physical place for them to build into
        // as they complete — not a repo that only appears once
        // everything is already finished. Calling the same real
        // getRepoLayer().ingest() the explicit promote path already
        // uses, not a second mechanism — this repo starts as an empty
        // shell (0 chunks complete yet) and the same writeFile()/
        // completeChunk() path that already exists fills it in as
        // chunks build, exactly like a promoted repo would.
        // §MCO6 2026-09-20 — this path's own comment above already said
        // the intent plainly ("specs build compartments, which are
        // repositories") but never wired it: no compartmentId was ever
        // passed here, same gap as the explicit promote path (see that
        // one's own §MCO6 note) — this repo was created compartment-less
        // from day one of its existence, not just at promote time.
        let autoRepoUuid = null;
        try {
          const repoResult = getRepoLayer().ingest({
            name: manifest.name,
            specUuid: manifest.uuid,
            source: 'spec.create.auto',
            parent: manifest.ideaUuid || null,
            ideaUuid: manifest.ideaUuid || null,   // §0.39.261 — the idea this spec came from becomes the repo's own idea
            promotedFromSpec: null,
            compartmentId: _ensureCompartment(`idearium-repo-${manifest.uuid.slice(0, 8)}`, manifest.name),
          });
          if (repoResult.error) {
            console.warn(`[speceng.create] auto-repo creation failed, spec still created: ${repoResult.error}`);
          } else {
            autoRepoUuid = repoResult.repo?.uuid || null;
          }
        } catch (e) {
          // §1.2 — a failed auto-repo creation must never block the
          // spec itself from being created; the spec is the real,
          // already-persisted thing here, the repo is additive.
          console.warn(`[speceng.create] auto-repo creation threw, spec still created: ${e.message}`);
        }

        // §MERGED 2026-07-11 — same phase-linkage fix as the legacy
        // idea.spec path above, for spec-engine specs.
        if (ideaUuid) {
          const idea = os.idea(ideaUuid);
          if (idea) {
            os.emit('idearium.idea.update', { uuid: ideaUuid, fields: { linkedSpec: manifest.uuid } });
            if (['seed','expanding','tensioned'].includes(idea.phase)) {
              os.emit('idearium.idea.phase', { uuid: ideaUuid, phase: 'specced', source: 'api' });
            }
          }
        }
        return ok(res, { manifest, repoUuid: autoRepoUuid, plan: planInfo });
      } catch(e) { return err(res, 500, e.message); }
    }

    case 'speceng.show': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      try {
        const manifest = se.loadSpec(params.uuid);
        return ok(res, { manifest, history: _specHistory(params.uuid) });
      } catch(e) { return err(res, 404, e.message); }
    }

    case 'speceng.build': {
      // Trigger building the next pending chunk via agent suite
      const se = getSpecEngine();
      const as = getAgentSuite();
      if (!se) return err(res, 503, 'spec-engine not ready');
      if (!as) return err(res, 503, 'agent-suite not ready');
      try {
        const manifest = se.loadSpec(params.uuid);
        const chunk = se.nextPendingChunk(params.uuid);
        if (!chunk) {
          // §FIX 2026-09-15 — James: "idearium needs to fail when chunks
          // aren't being generated." Real gap: nextPendingChunk() only
          // ever matches PENDING (spec-engine/index.js) — a chunk that
          // failed verification sits at FAILED/ESCALATED forever with no
          // automatic retry path, so this branch used to report the
          // exact same `{ done: true, message: 'all chunks complete or
          // building' }` for a spec that's actually stuck as it does for
          // one that's genuinely finished — a silent lie the build-queue
          // poller (_startBuildQueuePoller below) repeated every 15s,
          // forever, with nothing anywhere ever surfacing the failure.
          // Distinguish the two honestly: only chunks in flight
          // (BUILDING) are still legitimately "in progress"; any
          // FAILED/ESCALATED chunk means the spec did NOT complete, and
          // this must say so loudly — a real error response plus a real
          // bus event — not a quiet success.
          const stuck = manifest.chunks.filter(c => c.status === se.CHUNK_STATES.FAILED || c.status === se.CHUNK_STATES.ESCALATED);
          if (stuck.length) {
            const reason = `${stuck.length} chunk(s) stalled: ${stuck.map(c => `${c.sectionId} (${c.status}: ${c.failureMode || 'no reason recorded'})`).join('; ')}`;
            os.emit('idearium.spec-engine.build.stalled', {
              specUuid: params.uuid, stalledChunks: stuck.map(c => ({ uuid: c.uuid, sectionId: c.sectionId, status: c.status, reason: c.failureMode || null })),
            });
            os.emit('idearium.error', { op: 'spec-engine.build', specUuid: params.uuid, reason });
            return err(res, 422, reason);
          }
          return ok(res, { done: true, message: 'all chunks complete or building' });
        }

        // §PHASE 6 2026-07-10 — cross-spec chunk reuse, before spending a token.
        // The WARP exact cache only hits when the whole PROMPT matches, and the
        // prompt embeds the spec name — so the identical "purpose" section in
        // two differently-named specs never reused. This asks the spec-engine
        // whether this exact section (sectionId + sectionDesc) was already built
        // in some other spec; if so, complete this chunk from that content and
        // never dispatch. Content-addressed on the section contract, not the
        // spec identity. Opt-out via body.noReuse for a deliberate fresh build.
        if (!body.noReuse) {
          try {
            const prior = se.findPriorSection(chunk.sectionId, chunk.sectionDesc, params.uuid);
            if (prior && prior.content) {
              se.completeChunk(params.uuid, chunk.uuid, prior.content);
              const um = se.loadSpec(params.uuid);
              _syncPhaseFromManifest(os, um);
              os.emit('idearium.spec-engine.chunk.complete', {
                specUuid: params.uuid, chunkUuid: chunk.uuid, sectionId: chunk.sectionId,
                progress: um.progress, source: 'reuse', reusedFrom: prior.specUuid, cost: 0, cacheHit: true,
              });
              return ok(res, { reused: true, from: prior.specUuid, sectionId: chunk.sectionId,
                progress: um.progress, message: `reused '${chunk.sectionId}' from prior spec — 0 tokens` });
            }
          } catch (e) { console.warn('[idearium/api] prior-section reuse check failed, dispatching:', e.message); }
        }

        // Get system context for the agent
        const systemContext = await as.getSystemContext().catch(() => '');
        const chunkPrompt   = se.buildChunkPrompt(manifest, chunk, systemContext);
        // §BUILT 2026-09-03 — James: "send each chunk to the respectable
        // agent." Was `body.agent || manifest.agent || 'ollama'` — one
        // agent for every chunk in the spec, `chunk.agent` never read here
        // at all despite being a real per-chunk field (spec-engine/index.js
        // sets it per block from blocks.yaml at creation, or per-chunk via
        // setChunkAgent()). body.agent stays the highest-priority override
        // for a genuine one-off manual dispatch; chunk.agent (this chunk's
        // real, assigned agent) now wins over the spec-wide manifest.agent
        // fallback, which only still matters for a pre-existing spec built
        // before this change (manifest.agent was a real per-spec value
        // then) or a spec built via importSpec/ingestFilesAsSpec (no
        // per-block agent to read — falls through the same as before).
        // §CHANGED 2026-09-03 — tail default 'ollama' → 'chatgpt' (James:
        // "set default to chatgpt"). Real fallback-on-failure to gemini
        // is wired via fallbackAgent below, not here.
        const preferAgent   = body.agent || chunk.agent || manifest.agent || 'chatgpt';
        const fallbackAgent = body.fallbackAgent || (preferAgent === 'chatgpt' ? 'gemini' : null);

        se.markChunkBuilding(params.uuid, chunk.uuid, { agent: preferAgent });

        // §RAID-SOURCE 2026-08-29 — James: "hook idearium... into raid."
        // Real, deliberately SAFE wire, matching self-heal's own pattern
        // (submitted for real observability, alongside the existing,
        // proven dispatch — not replacing it). idearium's own
        // dispatchChunkWithVerification below remains the REAL
        // dispatcher (cache reuse, WARP exact-cache, verification
        // retries — sophisticated, proven, not touched). This just gives
        // RAID's queue a real, visible record of the work, with the
        // real, already-known outcome reported back once idearium's own
        // verification decides it — not left permanently 'queued' with
        // nothing ever calling processNext() on it.
        //
        // §HONEST LIMIT — if this specific submitContract() call throws
        // (e.g., RAID's process isn't reachable), the whole build must
        // not be blocked over an observability call — caught, logged,
        // and raidQueueId stays null, which the completion callback
        // below checks before trying to report anything back.
        let raidQueueId = null;
        try {
          const submitted = _require('../../cortex/core/raid/contract-intake.js').submitContract(
            { content: chunkPrompt, file: null, title: chunk.title || chunk.sectionId, forAgent: preferAgent },
            { source: 'idearium', intention: 'build' }
          );
          raidQueueId = submitted.queueId;
        } catch (e) {
          console.warn('[idearium/api] could not submit real RAID observability contract (build proceeds regardless):', e.message);
        }

        // §GAP CLOSED 2026-07-06 — this used to be a single, unverified
        // call to as.buildChunkWithAgent(): one attempt, no retry, no
        // quality check. A truncated or off-topic response was
        // indistinguishable from a good one until a human noticed.
        // dispatchChunkWithVerification wraps the same dispatch function
        // in a real QueueCompartment (lib/seam/queue.js) — the identical
        // multi-strategy retry ladder and Detector-based verification
        // Guardian already uses for its own chunks. Same promise-based
        // contract as before; the .then/.catch below is unchanged.
        // §PHASE 2 2026-07-09 — dispatch through WARP when it is loaded, so the
        // exact cache sits in the real build path. Same shape, so
        // dispatchChunkWithVerification's retry ladder and Detector
        // verification are unchanged; WARP simply answers instantly when this
        // exact prompt has been built before. Falls back to the direct agent
        // path when WARP is not (yet) loaded — never a hard dependency.
        const warpFn = await getWarpChunkDispatch();   // §awaited: the FIRST build must also populate the cache
        // §BUILT 2026-09-19 — James: "smallest executable code that
        // doesn't remove capability." expectCode is derived from the one
        // real, already-existing field that distinguishes a real target
        // file from a descriptive section: chunk.realPath. All 10 of
        // blocks.yaml's sections (purpose/axioms/schema/api/events/
        // integration/failure_modes/build_order/tests/meta) have
        // realPath: null — completely unaffected, expectCode stays
        // false, identical to every dispatch before this. Only a chunk
        // that IS a real file (addChunk's realPath, e.g. "lib/foo.js")
        // and whose extension is a real source-code extension opts in.
        const expectCode = !!(chunk.realPath && CODE_EXTENSIONS.has(path.extname(chunk.realPath).toLowerCase()));
        const dispatchFn = warpFn
          ? (prompt, dispatchOpts) => warpFn(prompt, { ...dispatchOpts, chunkTitle: chunk.title || chunk.sectionId, expectCode })
          : (prompt, dispatchOpts) => as.buildChunkWithAgent(prompt, dispatchOpts);

        dispatchChunkWithVerification(chunkPrompt, chunk, dispatchFn,
          {
            preferAgent,
            fallbackAgent,
            // §BUILT 2026-09-03 — fires the instant a queued job is
            // confirmed on guardian's side, before the (up to 5-minute)
            // poll for a browser-automated NCP provider — see
            // chunk-dispatch.js's own comment at this call site. Writes
            // the chunk's real return address (this spec's own
            // directory — "the start dir," no RAID compartment spawned)
            // to disk immediately, not after the fact.
            onQueued: (info) => {
              try { se.recordDispatchJob(params.uuid, chunk.uuid, info); }
              catch (e) { console.warn(`[idearium/api] recordDispatchJob failed (dispatch proceeds regardless): ${e.message}`); }
            },
          }
        ).then(async result => {
          // §RAID-SOURCE 2026-08-29 — report idearium's own real,
          // already-decided outcome back to RAID's queue, whichever
          // branch below actually runs. Best-effort — a failure here
          // never affects the real chunk-completion logic that follows.
          //
          // §HONEST LIMIT, found by this wiring's own test before
          // shipping it — result.queued===true means ChatGPT/Claude's
          // real completion arrives LATER via a genuinely separate
          // guardian-job-callback code path, not this .then(). Reporting
          // FAIL here would be a false negative on a contract that may
          // well PASS once that real callback fires — worse than simply
          // not reporting yet. Only PASS/FAIL are reported when this
          // callback actually knows the real, final outcome; the queued
          // case is left genuinely pending (still 'running' in RAID),
          // named honestly rather than silently guessed at.
          if (raidQueueId && !result.queued) {
            try {
              const intake = _require('../../cortex/core/raid/contract-intake.js');
              intake.reportExternalOutcome(raidQueueId, {
                status: result.ok ? intake.STATUS.PASS : intake.STATUS.FAIL,
              });
            } catch (_) { /* best-effort, see above */ }
          }
          if (result.ok && !result.queued && result.text) {
            se.completeChunk(params.uuid, chunk.uuid, result.text);
            const updatedManifest = se.loadSpec(params.uuid);
            _syncPhaseFromManifest(os, updatedManifest);
            os.emit('idearium.spec-engine.chunk.complete', {
              specUuid: params.uuid, chunkUuid: chunk.uuid,
              sectionId: chunk.sectionId, progress: updatedManifest.progress,
              // §MEASURABLE — a zero-token cache hit must be distinguishable
              // from a full generation in the ledger, or the saving is a claim.
              source: result.source || 'agent',
              cacheHit: result.cacheHit === true,
              cost: result.cost ?? null,
              verifiedAttempts: result.attempts, detectionComposite: result.detection?.composite,
            });
          } else if (result.queued) {
            // ChatGPT/Claude — chunk will complete via guardian job callback
            os.emit('idearium.spec-engine.chunk.queued', {
              specUuid: params.uuid, chunkUuid: chunk.uuid, jobId: result.jobId, agent: result.agent,
            });
          } else {
            se.failChunk(params.uuid, chunk.uuid, result.error || 'agent dispatch failed after verification retries');
          }
        }).catch(e => se.failChunk(params.uuid, chunk.uuid, e.message));

        return ok(res, {
          chunkUuid: chunk.uuid, sectionId: chunk.sectionId, sectionTitle: chunk.sectionTitle,
          agent: preferAgent, status: 'building',
        });
      } catch(e) { return err(res, 500, e.message); }
    }

    case 'speceng.chunk.complete': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      const { content } = body;
      if (!content) return err(res, 400, 'content required');
      try {
        const chunk = se.completeChunk(params.uuid, params.chunkUuid, content);
        const manifest = se.loadSpec(params.uuid);
        _syncPhaseFromManifest(os, manifest);
        os.emit('idearium.spec-engine.chunk.complete', {
          specUuid: params.uuid, chunkUuid: params.chunkUuid,
          sectionId: chunk.sectionId, progress: manifest.progress,
        });
        return ok(res, { chunk, progress: manifest.progress });
      } catch(e) { return err(res, 500, e.message); }
    }

    case 'speceng.chunk.fail': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      try {
        const chunk = se.failChunk(params.uuid, params.chunkUuid, body.reason || 'manual fail');
        return ok(res, { chunk });
      } catch(e) { return err(res, 500, e.message); }
    }

    case 'speceng.setWarpPrimitives': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      if (!Array.isArray(body.warpPrimitives)) return err(res, 400, 'warpPrimitives must be an array');
      try {
        const manifest = se.setWarpPrimitives(params.uuid, body.warpPrimitives);
        return ok(res, { warpPrimitives: manifest.warpPrimitives });
      } catch (e) {
        return err(res, /not real WARP primitives/.test(e.message) ? 400 : 500, e.message);
      }
    }

    case 'speceng.chunk.setAgent': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      if (!body.agent) return err(res, 400, 'agent required');
      try {
        const chunk = se.setChunkAgent(params.uuid, params.chunkUuid, body.agent);
        os.emit('idearium.spec-engine.chunk.agent_set', {
          specUuid: params.uuid, chunkUuid: params.chunkUuid, sectionId: chunk.sectionId, agent: chunk.agent,
        });
        return ok(res, { chunk });
      } catch(e) {
        const status = /not found/.test(e.message) ? 404 : /cannot reassign/.test(e.message) ? 409 : 400;
        return err(res, status, e.message);
      }
    }

    case 'speceng.archive': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      try {
        const archivePath = await se.archiveSpec(params.uuid);
        return ok(res, { archivePath });
      } catch(e) { return err(res, 500, e.message); }
    }

    case 'speceng.delete': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      try {
        const manifest = se.deleteSpec(params.uuid);
        os.emit('idearium.spec.deleted', { specUuid: params.uuid, name: manifest.name });
        return ok(res, { deleted: true, uuid: params.uuid, name: manifest.name });
      } catch(e) { return err(res, 404, e.message); }
    }

    case 'speceng.restore': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      try {
        const manifest = se.restoreSpec(params.uuid);
        os.emit('idearium.spec.restored', { specUuid: params.uuid, name: manifest.name });
        return ok(res, { manifest });
      } catch(e) { return err(res, 404, e.message); }
    }

    case 'speceng.expand': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      try {
        const manifest = await se.expandSpec(params.uuid);
        return ok(res, { manifest });
      } catch(e) { return err(res, 500, e.message); }
    }

    case 'speceng.wizard': {
      // Qwen drives the next wizard question
      const as = getAgentSuite();
      if (!as) return err(res, 503, 'agent-suite not ready');
      try {
        const { specMeta = {}, answeredSections = {} } = body;
        const next = await as.getNextWizardQuestion(specMeta, answeredSections);
        return ok(res, { next, done: next === null });
      } catch(e) { return err(res, 500, e.message); }
    }

    case 'speceng.context': {
      const as = getAgentSuite();
      if (!as) return err(res, 503, 'agent-suite not ready');
      try {
        const context = await as.getSystemContext();
        return ok(res, { context });
      } catch(e) { return err(res, 500, e.message); }
    }

    // ── Queue / progress push (from forge queue) ──────────────────────────
    case 'idea.progress': {
      const idea = os.idea(params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      // Update idea phase based on progress if provided
      if (body.state === 'VERIFIED') {
        os.emit('idearium.idea.phase', { uuid: params.uuid, phase: 'building', source:'queue' });
      }
      if (body.state === 'COMPLETE' && body.pct === 100) {
        os.emit('idearium.idea.phase', { uuid: params.uuid, phase: 'complete', source:'queue' });
      }
      const record = { ...body, ideaUuid: params.uuid, ts: Date.now() };
      if (!os.db.tensions) os.db.tensions = [];
      // Store as a tension record for timeline
      os.db.tensions.push({ uuid: crypto.randomUUID(), ideaUuid: params.uuid,
        score: (body.pct||0)/100, components: { queue_progress: body.pct||0 }, ts: Date.now() });
      return ok(res, { ok: true, progress: record });
    }

    case 'queue.progress': {
      // Forge queue progress — store in idearium event log
      const ev = os.emit('idearium.queue.progress', body);
      return ok(res, { ok: true, eventId: ev.uuid });
    }

    case 'queue.show': {
      const events = os.db.events.filter(e => e.payload?.queueId === params.queueId);
      return ok(res, { ok: true, queueId: params.queueId, events });
    }

    default:
      return err(res, 404, `no handler for: ${action}`);
  }
}

// ─── Spec → Markdown ─────────────────────────────────────────────────────────

function specToMarkdown(spec) {
  let md = `# ${spec.name}\n\n**Version:** ${spec.version}  **Phase:** ${spec.phase}\n\n`;
  for (const s of spec.sections) {
    md += `## ${s.title}\n\n`;
    if (s.content) md += `${s.content}\n\n`;
    else md += `_not yet written_\n\n`;
  }
  return md;
}

// ─── Server ───────────────────────────────────────────────────────────────────

// §BUILT 2026-09-06 — James: "it needs to start the queue each boot."
// Real, self-contained periodic drainer, not a one-time boot kick — a
// spec with 5 pending chunks needs 5 real build cycles, and nothing
// else in this file auto-chains from one chunk's completion to the
// next (checked, not assumed — see this function's real call site's
// own comment). Calls the exact same real, already-tested HTTP route
// (POST /api/spec-engine/specs/:uuid/build) a real client would —
// self-request, not a second dispatch mechanism, so it goes through
// dispatchChunkWithVerification's real retry ladder, WARP cache, and
// RAID observability exactly like every other real build does.
const BUILD_QUEUE_POLL_MS = 15000;
const _stallReported = new Map(); // specUuid -> { sig, ts } of the chunk-status picture a FAILED build last ran against (see the poller)
const STALL_RETRY_MS = 10 * 60 * 1000;
const _buildingSpecs = new Set(); // real, in-memory guard — never trigger a second build for a spec that's already mid-build

function _startBuildQueuePoller(port) {
  // §FIXED 2026-09-11 — James: "the problem is idearium doesn't retry,
  // if nexus restarts it wont try to build the chunks again." Real root
  // cause traced in spec-engine/index.js's recoverOrphanedChunks() own
  // header: a chunk left BUILDING by a process that died mid-dispatch is
  // invisible to nextPendingChunk() (not PENDING) AND to this poller's
  // own doneChunks-vs-totalChunks skip (not COMPLETE either) —
  // permanently stuck either way, not a retry-cadence problem at all.
  //
  // Recovery runs inside tick() itself, gated by _recoveryDone, rather
  // than as a separate one-shot call before the poller starts: getSpecEngine()
  // can still be mid-import at that exact moment (its own real, honest
  // "not ready yet" case — checked, this is a real, live risk, not
  // theoretical), which would have silently skipped recovery for the
  // whole boot with nothing to retry it. tick() already runs every
  // BUILD_QUEUE_POLL_MS and already has the same honest "if (!se) return"
  // skip — riding that same, already-proven retry mechanism instead of
  // building a second, less robust one.
  let _recoveryDone = false;
  async function tick() {
    const se = getSpecEngine();
    if (!se) return; // spec-engine not ready yet this tick — real, honest skip, not a crash
    if (!_recoveryDone) {
      try {
        const recovered = se.recoverOrphanedChunks();
        if (recovered.length) console.log(`[idearium/build-queue] boot recovery: ${recovered.length} orphaned chunk(s) reset BUILDING -> PENDING`);
      } catch (e) { console.warn(`[idearium/build-queue] orphaned-chunk recovery failed (non-fatal): ${e.message}`); }
      _recoveryDone = true; // once per real process lifetime — recovering an already-recovered (or genuinely, currently building) chunk on tick 2 would be wrong
    }
    let specs;
    try { specs = se.listSpecs(); }
    catch (e) { console.warn(`[idearium/build-queue] listSpecs() failed, will retry next tick: ${e.message}`); return; }

    for (const s of specs) {
      if (s.deleted || s.status === 'archived') continue;
      if (s.doneChunks >= s.totalChunks) continue; // real, genuine "nothing pending" — not guessed from a stale flag
      if (_buildingSpecs.has(s.uuid)) continue; // already mid-build from a previous tick — avoid a real, racing double-dispatch
      // §STABILITY 2026-09-21 — James: "idearium crashes when chunking, its not
      // stable... working with guardian." An ingested project (type 'codebase',
      // built by ingestFilesAsSpec from real files) has nothing an agent can
      // generate: each chunk IS a file that already exists. A chunk of one still
      // PENDING means the import was cut short (or the file had no text), and
      // "building" it meant asking ChatGPT through guardian to invent that file
      // from a section title — 50+ jobs for eravos-complete after its import
      // died. `ingesting` marks an import that never finished. Neither is a
      // build-queue concern; they are repaired by re-importing, and are visible
      // in the Repos tab (see _reconcileSpecRepos) so that can be done.
      if (s.type === 'codebase' || s.ingesting) continue;
      // §2026-09-21 — a spec whose unfinished chunks are ALL terminal (failed/
      // escalated, none pending) cannot progress: the build endpoint does not
      // re-dispatch them, it answers 422 with the same stall. Re-triggering it
      // every 15s printed the identical two lines forever (James's boot log:
      // one stalled spec, ~40 repeats in 10 minutes) and spent a request and a
      // manifest parse each time. Trigger once per distinct stalled state so
      // the reason is still reported loudly, then stay quiet until something
      // changes — a retried chunk goes back to pending and is picked up.
      const chunks = Array.isArray(s.chunks) ? s.chunks : [];
      // §STABILITY 2026-09-21 — the terminal-state check above only fired when NO
      // chunk was pending. A spec with a failed kernel file and 19 pending files
      // that all depend on it (file-tree specs build bottom-up) IS "buildable" by
      // that test yet cannot move: the build answers 422 with the same stall.
      // James's log: one such spec re-triggered every 15s for two hours, ~500
      // identical pairs of ERROR lines, a manifest parse and a self-request each.
      // So key on the WHOLE chunk-status picture: after a build that fails, do not
      // trigger that spec again until a chunk changes state (a retry, a manual
      // reset, a dependency completing) — or 10 minutes pass, so a transient
      // cause (guardian restarting, a tab reconnecting) still gets another try.
      const fullSig = chunks.map(c => `${c.uuid}:${c.status}`).join('|');
      const prior = _stallReported.get(s.uuid);
      if (prior && prior.sig === fullSig && (Date.now() - prior.ts) < STALL_RETRY_MS) continue;
      if (prior && prior.sig !== fullSig) _stallReported.delete(s.uuid);
      // One build trigger in flight at a time. The queue used to fire a
      // self-request per unfinished spec every tick; on a machine already at
      // the memory-pressure line (see the resource-monitor lines in the boot
      // log) that piles concurrent dispatches, guardian jobs and manifest
      // re-parses on top of each other. Specs take turns; nothing is dropped —
      // the next tick picks up the next one.
      if (_buildingSpecs.size >= 1) break;

      _buildingSpecs.add(s.uuid);
      const body = JSON.stringify({});
      const req = http.request({
        hostname: '127.0.0.1', port, method: 'POST',
        path: `/api/spec-engine/specs/${s.uuid}/build`,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 10000,
      }, (res) => {
        // §FIX 2026-09-15 — James: "idearium needs to fail when chunks
        // aren't being generated." This handler used to ignore the
        // response body entirely — a spec stalled on FAILED/ESCALATED
        // chunks (see speceng.build's own fix, same date) would get a
        // real 422 back every 15s and this poller would silently throw
        // it away, no different from a real success. Surface it loud in
        // the one place a person watching this process would see it.
        let respBody = '';
        res.on('data', (d) => { respBody += d; });
        res.on('end', () => {
          _buildingSpecs.delete(s.uuid);
          if (res.statusCode >= 400) {
            let msg = respBody;
            try { msg = JSON.parse(respBody).error || respBody; } catch (_) { /* not JSON — use raw body */ }
            console.error(`[idearium/build-queue] spec ${s.uuid} did NOT complete — ${msg} (will not retry until a chunk changes state, or in ${STALL_RETRY_MS / 60000} min)`);
            _stallReported.set(s.uuid, { sig: fullSig, ts: Date.now() });
          }
        });
      });
      // §1.2 — a failed self-request must never crash the poller or
      // silently wedge this spec out of future ticks forever.
      req.on('error', (e) => { _buildingSpecs.delete(s.uuid); console.warn(`[idearium/build-queue] build trigger for ${s.uuid} failed: ${e.message}`); });
      req.on('timeout', () => { req.destroy(); _buildingSpecs.delete(s.uuid); });
      req.write(body);
      req.end();
    }
  }
  const timer = setInterval(tick, BUILD_QUEUE_POLL_MS);
  if (timer.unref) timer.unref(); // never keeps the process alive on its own
  tick(); // real, immediate first pass — don't wait a full interval before resuming work that was already pending when this boot started
  console.log(`[idearium/build-queue] real, periodic queue drain started — every ${BUILD_QUEUE_POLL_MS}ms`);
  return timer; // real handle — lets a caller (or a test) stop this poller; startAPI() itself never needs to
}

// §0.39.261 — one Nexus-repo sync at a time; later callers share the running one.
let _nexusSelfSyncing = null, _nexusSelfLast = null, _nexusSelfStartedNow = null;
function _nexusSelfSync({ only = null, force = false } = {}) {
  if (_nexusSelfSyncing) { _nexusSelfStartedNow = null; return _nexusSelfSyncing; }
  _nexusSelfSyncing = (async () => {
    try {
      const se = getSpecEngine();
      if (!se) return { error: 'spec-engine not ready' };
      const NS = await import('../repo/nexus-self.js');
      const os = getIdeaOS();
      const r = await NS.sync(getRepoLayer(), se, {
        only, force, log: (m) => console.log(m),
        onSystem: (x) => { try { os.broadcast('idearium.nexus-self.sync', { system: x.system, status: x.status, error: x.error || null }); } catch (_) {} },
        // 0.39.263 — each repo's history lives in versionium (branch repo-<uuid>), not in a .git
        commitVersion: async ({ repo, system, snapshot }) => {
          const dir = _repoDiskDir(repo.uuid);
          if (!dir) return { ok: false, error: 'repo directory not resolvable' };
          const { commitRepoSnapshot } = await import('../repo/snapshot.js');
          const r = await commitRepoSnapshot({
            repo, repoDir: dir, message: `${system === '(nexus)' ? 'nexus index' : 'nexus/' + system} @ snapshot ${String(snapshot).slice(0, 12)}`,
            causedBy: 'idearium.nexus-self.sync', fileLayer: _fileLayers(repo.uuid).fileLayer, snapshotMode: _snapshotMode(),
            commit: async (payload) => {
              const c = await _versionium('POST', '/api/versionium/commit', payload, 60000);
              if (!c.ok) return { error: c.error };
              return c.data?.commit || { error: c.data?.error || 'versionium returned no commit' };
            },
          });
          return r.ok ? { ok: true, commitId: r.commit.commitId } : { ok: false, error: `${r.code}: ${r.error}` };
        },
      });
      _nexusSelfLast = { at: Date.now(), ok: r.ok, snapshot: r.snapshot, ms: r.ms, changed: r.systems.filter(x => x.status !== 'unchanged').map(x => `${x.system}:${x.status}`), understanding: r.understanding };
      if (_nexusSelfLast.changed.length) console.log(`[idearium/nexus-self] synced in ${r.ms}ms — ${_nexusSelfLast.changed.join(', ')}${r.understanding && r.understanding.improved && r.understanding.improved.length ? ` · understanding improved: ${r.understanding.improved.join(', ')}` : ''}${r.understanding && r.understanding.regressed && r.understanding.regressed.length ? ` · regressed: ${r.understanding.regressed.join(', ')}` : ''}`);
      return r;
    } catch (e) {
      console.error(`[idearium/nexus-self] sync failed: ${e.message}`);
      _nexusSelfLast = { at: Date.now(), ok: false, error: e.message };
      return { error: e.message };
    } finally { _nexusSelfSyncing = null; }
  })();
  _nexusSelfStartedNow = _nexusSelfSyncing;
  return _nexusSelfSyncing;
}

export { _startBuildQueuePoller, _buildingSpecs, _reconcileSpecRepos, getRepoLayer, _ollamaModels, _nexusSelfSync }; // getRepoLayer: the real layer, exported so tests exercise the production write path, not a fake

export function startAPI() {
  const os = getIdeaOS();

  const server = http.createServer(async (req, res) => {
    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }

    // SSE
    // §CRASH FIX 2026-07-15 — this branch, and the two static-file branches
    // below it, sat OUTSIDE the try/catch that wraps matchRoute's dispatch —
    // the only safety net this file has. Since the whole handler is
    // `async (req,res) => {...}`, any synchronous throw here (e.g. res.write()
    // on a connection the client already tore down) becomes an unhandled
    // promise rejection, and Node 22's default behavior for that is to crash
    // the ENTIRE process, not just fail the one request. That takes every
    // other in-flight connection down with it — indistinguishable from the
    // outside from "the server vanished," which is exactly what a poller
    // sees as a socket hang up. Caught here the same way the main route
    // dispatch already is.
    if (req.url === '/sse') {
      try {
        res.writeHead(200, {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
          ...CORS,
        });
        res.write(': connected\n\n');
        os.addSSEClient(res);
        // Send current state immediately on connect
        res.write(`data: ${JSON.stringify({ type:'idearium.ready', payload: os.stats(), ts: Date.now() })}\n\n`);
      } catch (e) {
        console.error('[API] /sse handler error (non-fatal, connection dropped):', e.message);
        try { res.destroy(); } catch (_) {}
      }
      return;
    }

    // Serve UI
    const cleanUrl = req.url.split('?')[0];
    // §STACK SPLIT 2026-07-10 — serve UI static assets. The UI was broken out
    // of a 2,335-line monolith into index.html + js/*.js (loaded via
    // <script src>). Without serving js/ those files 404 and the whole UI goes
    // blank. Path-traversal guarded: only files under ui/ are served.
    //
    // §CRASH FIX 2026-07-15 — both this branch and the one below were
    // outside the file's only try/catch (see the /sse fix above for the
    // full mechanism: an uncaught throw here crashes the whole process on
    // Node 22, not just this one request). existsSync-then-readFileSync is
    // also a TOCTOU race on its own (file can vanish between the two calls,
    // e.g. mid-deploy) — another real way this could throw uncaught.
    if (req.method === 'GET' && (cleanUrl.startsWith('/js/') || cleanUrl.startsWith('/css/'))) {
      try {
        const { readFileSync, existsSync } = await import('fs');
        const { join, dirname, normalize } = await import('path');
        const { fileURLToPath } = await import('url');
        const __d = dirname(fileURLToPath(import.meta.url));
        const uiRoot = join(__d, '..', 'ui');
        const asset = normalize(join(uiRoot, cleanUrl));
        if (!asset.startsWith(uiRoot)) { res.writeHead(403); res.end('forbidden'); return; }
        if (existsSync(asset)) {
          const type = asset.endsWith('.js') ? 'application/javascript'
                     : asset.endsWith('.css') ? 'text/css' : 'text/plain';
          res.writeHead(200, { 'Content-Type': type });
          res.end(readFileSync(asset, 'utf8'));
        } else { res.writeHead(404); res.end('not found'); }
      } catch (e) {
        console.error('[API] static asset handler error (non-fatal):', e.message);
        try { res.writeHead(500); res.end('internal error'); } catch (_) {}
      }
      return;
    }

    if (req.method === 'GET' && (cleanUrl === '/' || cleanUrl === '/idearium' || cleanUrl === '/ui')) {
      try {
        const { readFileSync, existsSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const __d = dirname(fileURLToPath(import.meta.url));
        // §DUPLICATE RESOLVED 2026-07-09 — idearium/ui/index.html and
        // ui/idearium/index.html were BYTE-IDENTICAL 2,327-line files. Two
        // copies of one UI drift the moment either is edited. The sovereign
        // location wins: a system owns its own UI. orchestrator already serves
        // the URL /ui/idearium from idearium/ui (orchestrator.js static map),
        // so the second copy was a fallback nobody reached. Removed.
        const uiPath = join(__d, '..', 'ui', 'index.html');
        const uiPath2 = uiPath;
        const finalPath = existsSync(uiPath) ? uiPath : uiPath2;
        if (existsSync(finalPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(readFileSync(finalPath, 'utf8'));
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body style="background:#0a0a0c;color:#e2e2ea;font-family:monospace;padding:40px"><h2>◈ IDEARIUM</h2><p>UI not built yet</p></body></html>');
        }
      } catch (e) {
        console.error('[API] UI-serve handler error (non-fatal):', e.message);
        try { res.writeHead(500); res.end('internal error'); } catch (_) {}
      }
      return;
    }

    const route = matchRoute(req.method, req.url);
    if (!route) {
      // ── CFR-Ω routes — same handleCFRRoute() contract as the other kernels ──
      // §CFR-WIRE-05: checked here, not before matchRoute, so existing
      // idearium routes keep priority and /cfr never shadows anything real.
      if (req.url.startsWith('/cfr')) {
        const ledger = os._evLedger;
        if (ledger && ledger.handleCFRRoute) {
          const cfrUrl = new URL(req.url, `http://localhost:${PORT}`);
          if (ledger.handleCFRRoute(req, res, cfrUrl)) return;
        }
      }
      return err(res, 404, `${req.method} ${req.url.split('?')[0]} not found`);
    }

    const query = parseQuery(req.url);
    let body = {};
    if (['POST','PATCH','PUT','DELETE'].includes(req.method)) {
      try { body = await readBody(req); }
      catch (e) { return err(res, 400, 'body parse failed', e.message); }
    }

    try {
      await handle(req, res, route, query, body);
    } catch (e) {
      console.error('[API] Unhandled error:', e);
      err(res, 500, 'internal error', e.message);
    }
  });

  server.listen(PORT, BINDING, async () => {
    // ESM: use createRequire for CJS modules
    const _require = createRequire(import.meta.url);

    const { BootSequence } = _require('../../lib/boot-sequence');

    const seq = new BootSequence({
      systemId: 'idearium', port: PORT, version: VERSION,
      label: 'Idearium', maxRetries: 1,
    });

    // Phase 0 HARD: server bound
    seq.phase({ name:'server.bound', type:'HARD',
      label:'HTTP API bound :' + PORT,
      fn: async () => { /* in listen callback = bound */ },
    });

    // Phase 1 HARD: IdeaOS runtime verify — use the actual API
    seq.phase({ name:'ideaos.verify', type:'HARD',
      label:'IdeaOS runtime verify via /api/stats',
      fn: async () => {
        await new Promise((resolve, reject) => {
          let d = '';
          const r = _require('http').get(
            'http://127.0.0.1:' + PORT + '/api/stats',
            res => {
              res.on('data', c => { d += c; });
              res.on('end', () => {
                try {
                  const j = JSON.parse(d);
                  if (j.ok !== false) resolve();
                  else reject(new Error('stats returned ok=false'));
                } catch(e) { reject(e); }
              });
            }
          );
          r.setTimeout(2000, () => { r.destroy(); reject(new Error('stats timeout')); });
          r.on('error', reject);
        });
      },
    });

    // Phase 2 HARD: health endpoint verify
    seq.phase({ name:'health.verify', type:'HARD',
      label:'Verify /health returns ok=true',
      fn: async () => {
        await new Promise((resolve, reject) => {
          const r = _require('http').get(
            'http://127.0.0.1:' + PORT + '/health',
            res => { res.statusCode === 200 ? resolve()
              : reject(new Error('health ' + res.statusCode)); }
          );
          r.setTimeout(2000, () => { r.destroy(); reject(new Error('timeout')); });
          r.on('error', reject);
        });
      },
    });

    // Phase 3 HARD: contract verify
    seq.phase({ name:'contract.verify', type:'HARD',
      label:'Verify /api/contract returns id=idearium-v1',
      fn: async () => {
        await new Promise((resolve, reject) => {
          let body = '';
          const r = _require('http').get(
            'http://127.0.0.1:' + PORT + '/api/contract',
            res => {
              res.on('data', c => { body += c; });
              res.on('end', () => {
                try {
                  const j = JSON.parse(body);
                  if (j.contract?.id === 'idearium-v1') resolve();
                  else reject(new Error('contract id=' + j.contract?.id));
                } catch(e) { reject(e); }
              });
            }
          );
          r.setTimeout(2000, () => { r.destroy(); reject(new Error('timeout')); });
          r.on('error', reject);
        });
      },
    });

    // Phase 4 SOFT: orchestrator registration (§AXIOM)
    seq.phase({ name:'orchestrator.register', type:'SOFT',
      label:'Register with orchestrator (§AXIOM)',
      fn: async () => {
        const body = JSON.stringify({ systemId:'idearium', port:PORT,
          meta:{ role:'idea-os', version:VERSION },
          components: IDEARIUM_COMPONENTS });
        const r = _require('http').request({
          hostname:_orchestrator().host, port:_orchestrator().port, path:'/api/register', method:'POST',
          headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
        });
        r.setTimeout(2000, () => r.destroy()); r.on('error', () => {});
        r.write(body); r.end();
        // §MIGRATED 2026-08-29 — real, shared orchestrator/lib/pulse.js's
        // createPulse(), replacing the hand-rolled setInterval+raw
        // http.request this was before. Same class of duplicate this
        // session already found and removed twice (clear-glass, cortex):
        // a hand-rolled copy of the exact same idea, carrying none of
        // pulse.js's real latency tracking, online/offline transition
        // detection, or missed-beat logging. orchestrator's own real
        // /api/heartbeat handler (confirmed by reading it directly) was
        // ALREADY built to accept pulse.js's richer payload (meta, seq,
        // pulseId) — this was never a compatibility risk, just an unused
        // capability on the receiving end. _pulse stored on module scope
        // (not local to this closure) so a real shutdown path — cortex's
        // own migration found it has none either, a separate, pre-
        // existing gap, not fixed here — has something real to call.
        _pulseClient = _require('../../orchestrator/lib/pulse.js').createPulse({
          systemId: 'idearium', port: PORT,
          onOffline: () => console.warn('[idearium] orchestrator unreachable — pulse will keep retrying'),
          onOnline:  ({ latency }) => console.log(`[idearium] orchestrator back online, latency=${latency}ms`),
        });
      },
    });

    // Phase 5 SOFT: bridge handshake (§5.2)
    seq.phase({ name:'bridge.handshake', type:'SOFT',
      label:'Bridge handshake with orchestrator',
      fn: async () => {
        // §FIX 2026-08-27 — this POST hits the same /api/register route Phase 4
        // uses, and orchestrator's registryUpdate() does {...existing, ...data}:
        // an explicit `port: undefined` key here overwrites Phase 4's correct
        // port (4800) with undefined. Node's http.request then defaults the
        // next contract-verification call to port 80 → ECONNREFUSED, logged as
        // 'contract.unreachable — idearium'. It self-heals within ~10s (the
        // heartbeat interval below re-sends the correct port), but the registry
        // is wrong in the window between. Sending the real port here closes it.
        const bBody = JSON.stringify({ systemId:'idearium', port:PORT, appId:'idearium', secret:'nexus-idearium-internal-v1' });
        const r = _require('http').request({
          hostname:_orchestrator().host, port:_orchestrator().port, path:'/api/register', method:'POST',
          headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bBody)},
        }, res => {
          let d = ''; res.on('data', c => { d += c; });
          res.on('end', () => {
            try { JSON.parse(d); } catch(_) {}
          });
        });
        r.on('error', () => {}); r.write(bBody); r.end();
        // Also post booted to ledger
        const lb = JSON.stringify({ system:'idearium', type:'idearium.booted',
          payload:{ version:VERSION, port:PORT } });
        const _o2 = _orchestrator();
        const r2 = _require('http').request({
          hostname:_o2.host, port:_o2.port, path:'/api/ledger', method:'POST',
          headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(lb)},
        });
        r2.on('error', () => {}); r2.write(lb); r2.end();
      },
    });

    // Phase 6 SOFT: SSE stream verify
    seq.phase({ name:'sse.verify', type:'SOFT',
      label:'Verify /sse stream opens',
      fn: async () => {
        await new Promise((resolve, reject) => {
          const r = _require('http').request({
            hostname:'127.0.0.1', port:PORT, path:'/sse',
            headers:{ Accept:'text/event-stream' },
          }, res => {
            if (res.statusCode === 200) { r.destroy(); resolve(); }
            else { r.destroy(); reject(new Error('SSE ' + res.statusCode)); }
          });
          r.setTimeout(2000, () => { r.destroy(); resolve(); }); // resolve on timeout = SSE streaming
          r.on('error', reject); r.end();
        });
      },
    });

    // Phase 7 SOFT: boot announce — Idearium is local/internal-only
    seq.phase({ name:'boot.announce', type:'SOFT',
      label:'Announce bind — internal API, no auth, no remote surface',
      fn: async () => {
        console.log(`[idearium] bound :${PORT} on ${BINDING}`);
        console.log('[idearium] auth  — disabled (internal-only, reached via orchestrator)');
        if (BINDING !== '127.0.0.1') {
          console.warn(`[idearium] binding=${BINDING} — this system has no auth. Use 127.0.0.1 unless you know what you are doing.`);
        }
      },
    });

    // Phase 7.5 SOFT: guardian job-completion — reconcile any chunks left
    // 'building' by a prior process's restart, then subscribe live.
    // §BUILT 2026-09-03 — see lib/guardian-stream.cjs's own header for the
    // full reasoning (real /events, not copilot's buggy /bus; no new
    // queue table, chunk.jobId/dispatchDir already IS the durable record).
    // SOFT — guardian being down at idearium's own boot must never block
    // idearium itself from coming up; the connector keeps retrying.
    seq.phase({ name:'guardian.reconcile', type:'SOFT',
      label:'Reconcile in-flight chunks + connect guardian job stream',
      fn: async () => {
        const se = getSpecEngine();
        if (!se) console.warn('[idearium] guardian.reconcile: spec-engine not ready, skipping the guardian half');
        else {
          const { reconcileInFlightChunks, connectGuardianStream } = _require('../lib/guardian-stream.cjs');
          await reconcileInFlightChunks(se);
          // §FEED 0.39.244 — a repo agent's guardian job, live, to the Agent tab (SSE only).
          connectGuardianStream(se, { onFeed: (ev) => os.broadcast('idearium.repo.agent.feed', {
            repoUuid: ev.data.agentId.slice('repo-'.length), event: ev.type.slice('guardian.job.'.length), guardianTs: ev.ts, ...ev.data,
          }) });
        }
        // §RECONCILE 2026-09-21 — adopt any spec with no repo into a
        // compartment (see _reconcileSpecRepos). Kept inside this phase, not
        // a new one, so the boot sequence's phase count is unchanged; its own
        // try/catch means a failure here can never fail the guardian half.
        try { await _reconcileSpecRepos(); }
        catch (e) { console.warn(`[idearium/api] spec→repo reconcile threw (non-fatal): ${e.message}`); }
        try { _reconcileWorkbenchRepos(); }
        catch (e) { console.warn(`[idearium/api] idea→repo reconcile threw (non-fatal): ${e.message}`); }
      },
    });

    // Phase 8 removed: Idearium no longer opens its own remote tunnel.
    // Idearium is API-internal only — the orchestrator (:9000) is the sole
    // remote/external surface for NEXUS. Reaching Idearium from outside the
    // host should go through the orchestrator's proxy, not a direct tunnel.

    await seq.run();
    // Idearium never hard-exits — degrades gracefully

    // §BUILT 2026-09-06 — James: "it needs to start the queue each
    // boot. So the chunks in the repo in idearium build." Checked
    // first, not assumed: speceng.build's own real dispatch (above)
    // starts exactly one chunk building and returns — nothing in this
    // whole file auto-chains to the next pending chunk once one
    // completes. Without a real, periodic drainer, a spec created
    // (and, since the auto-repo-creation fix, its real repo) just sits
    // with pending chunks forever unless a human manually triggers
    // each one. This closes that loop: a real, self-contained poller,
    // started once idearium's own boot sequence completes, checking
    // every real spec for pending work and (re)triggering a build the
    // exact same way a real client would — the same
    // dispatchChunkWithVerification path, same WARP cache, same RAID
    // observability contract, same Detector verification. Not a
    // separate build mechanism; the same one, just self-triggered
    // instead of waiting for someone to click a button.
    _startBuildQueuePoller(PORT);

    // §0.39.261 — keep the Nexus repo current: a background sync shortly after
    // boot, then every NEXUS_SELF_SYNC_MS (default 10 min). Unchanged systems
    // cost one hash-cache pass (~0.1 s); the sync yields between systems and
    // stages, so /health keeps answering. Off in test processes (a test must
    // not snapshot the real tree) and with NEXUS_SELF_AUTOSYNC=0.
    if (process.env.NEXUS_SELF_AUTOSYNC !== '0' && !_require('../../lib/test-sandbox.js').isTestProcess()) {
      const every = Math.max(60000, parseInt(process.env.NEXUS_SELF_SYNC_MS, 10) || 600000);
      const first = setTimeout(() => { _nexusSelfSync({}); }, parseInt(process.env.NEXUS_SELF_FIRST_SYNC_MS, 10) || 20000);
      const t = setInterval(() => { _nexusSelfSync({}); }, every);
      if (first.unref) first.unref();
      if (t.unref) t.unref();
      console.log(`[idearium/nexus-self] Nexus repo sync scheduled — first in ${Math.round((parseInt(process.env.NEXUS_SELF_FIRST_SYNC_MS, 10) || 20000) / 1000)}s, then every ${Math.round(every / 60000)} min`);
    }
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Idearium API] Port ${PORT} already in use. Is Idearium already running?`);
      process.exit(1);
    }
    throw e;
  });

  return server;
}

// ── Auto-start when run directly ────────────────────────────────────────────
// §FOUND & FIXED 2026-09-06 — this comment already said "when run
// directly," but the actual code below was unconditional: importing
// this module for its exports (as a real test now needs to, to reach
// _startBuildQueuePoller/_buildingSpecs) ALSO booted a real, live
// idearium server on :4800 as an unavoidable side effect — including,
// after this same session's own build-queue-poller fix, a REAL second
// poller instance that found and tried to dispatch the SAME real specs
// a test had just created, causing real, confusing cross-talk (a test
// mock server seeing more hits than it triggered itself). Checked
// first that nothing else in the codebase imports this file directly
// (only the new test does) before adding this guard — safe.
//
// §FOUND & FIXED 2026-09-11 — real Windows bug in the guard itself:
// `file://${process.argv[1]}` hand-builds the URL by string-pasting a
// raw OS path onto a scheme. On Windows process.argv[1] is a drive
// path like `C:\Users\James\...\index.js` — backslashes, no leading
// slash before the drive letter, unescaped. That produces
// `file://C:\Users\James\...`, which is not a well-formed file: URL
// and can never equal the real import.meta.url Node itself generates
// for this same file (`file:///C:/Users/James/...`, forward slashes,
// triple slash, percent-encoded). So on Windows this guard was always
// false — `node idearium/api/index.js` directly would silently never
// call startAPI(), no error, no log, just a process that loads and
// exits having done nothing. Fixed by letting Node's own
// pathToFileURL() build both sides the same way it built
// import.meta.url, instead of reimplementing URL construction by hand.
if (import.meta.url === _pathToFileURL(process.argv[1]).href) {
  startAPI();
}
