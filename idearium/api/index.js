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
import { getConfig as getIdeariumConfig, setConfig as setIdeariumConfig, getValue as getIdeariumValue, describe as describeIdeariumConfig, resetConfig as resetIdeariumConfig } from '../lib/config.js';
const _require = createRequire(import.meta.url);
// §0.39.282 — a repo with no provider of its own answers with the person's global choice (config repos.default_provider;
// James: "was supposed to be ollama, set in the settings"). lib/repo-agent.js reads it on every call.
try { _require('../../lib/repo-agent.js').setDefaultProviderSource(() => { try { return getIdeariumValue('repos.default_provider'); } catch (_) { return ''; } }); } catch (_) {}
// §CT1 0.39.347 — the repo agent asks copilot's door with idearium's routing policy (routing.* config)
try { _require('../../lib/repo-agent.js').setRoutingPolicySource(() => _routingPolicy()); } catch (_) {}

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

// §0.39.266 (C2) — James: "warp is the build logic. supposed to reuse components. i wanted a components store for
// all components build in folders with their dependancies." Every FILE chunk the build path completes goes into
// lib/component-store.js (components/<id>/<version>/ + component.json, deps pinned by id + version); a later build
// asks the store first — by contract (path + layer + purpose) and by prompt — before spending a token.
// Imports and nexus syncs never reach here (C-D7): they complete chunks through the spec-engine, not this path.
function _chunkContract(chunk) {
  return chunk.file ? { path: chunk.file.path || chunk.realPath, layer: chunk.file.layer || '', purpose: chunk.file.purpose || '' }
                    : { path: chunk.realPath, layer: '', purpose: chunk.sectionDesc || '' };
}
/**
 * _fileContentFromReply(chunk, text) — §0.39.291. What an agent's reply becomes when the chunk IS a file. Agents answer
 * in fenced blocks ("```js … ```"); the file is the code inside, never the fence. Found by the proof run
 * (tests/modules/test-prove-loop.test.js): a direct Ollama build saved package.json as "```json\n{…}\n```" — not JSON —
 * and test files with the fence in them; only the WARP path with expectCode extracted, and only for code extensions.
 * Prose files (.md, .txt) keep their own fences: only a reply that is ONE fenced block around the whole file loses the
 * wrapper. -> { ok, content } | { ok:false, error } (an unclosed fence is a cut reply, never written as a file).
 */
function _fileContentFromReply(chunk, text) {
  const t = String(text || '');
  if (!chunk || !chunk.realPath || !/```/.test(t)) return { ok: true, content: t };
  const ext = path.extname(chunk.realPath).toLowerCase();
  const whole = t.trim().match(/^```[\w+.-]*[ \t]*\n([\s\S]*?)\n?```$/);
  if (['.md', '.markdown', '.txt', '.mdx', '.rst'].includes(ext)) return { ok: true, content: whole && !/```/.test(whole[1]) ? whole[1] + '\n' : t };
  try {
    const { extractCode } = _require('../../lib/extract-code.js');
    const x = extractCode(t, { allowMultiple: false });
    if (x.ok && typeof x.code === 'string' && x.code.trim()) return { ok: true, content: x.code.endsWith('\n') ? x.code : x.code + '\n' };
    return { ok: false, error: `the reply for ${chunk.realPath} has no usable code block: ${x.error || x.reason || 'empty'}` };
  } catch (e) { return { ok: false, error: `could not read the code out of the reply: ${e.message}` }; }
}

function _storeBuilt(manifest, chunk, content, { prompt = null, agent = null, source = null } = {}) {
  if (!chunk || !chunk.realPath || !content) return null;
  try {
    const CS = _require('../../lib/component-store.js');
    const r = CS.put({
      project: manifest.name, path: chunk.realPath, content, contract: _chunkContract(chunk), prompt,
      builtBy: { specUuid: manifest.uuid, specName: manifest.name, chunkUuid: chunk.uuid, agent: agent || chunk.agent || null, source: source || null },
    });
    if (r.created) console.log(`[idearium/api] component stored ${r.id}@${r.version} (${Object.keys(r.dependencies).length} dep(s), ${r.unresolved.length} unresolved)`);
    return r;
  } catch (e) { console.warn('[idearium/api] component store write failed (chunk is complete regardless):', e.message); return null; }
}
function _storedFor(chunk, { prompt = null } = {}) {
  if (!chunk || !chunk.realPath) return null;
  try {
    const CS = _require('../../lib/component-store.js');
    return prompt ? CS.byPrompt(prompt) : CS.byContract(_chunkContract(chunk));
  } catch (e) { console.warn('[idearium/api] component store read failed, dispatching:', e.message); return null; }
}
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

// §CODER-LINK 0.39.276 — James: "the code tab needs to use the same hat from the original repo ... full agent settings in
// the original repo." The repo the Code button makes (source 'spec.codegen', promotedFromSpec = the original spec) is
// linked to the repo that owns that spec, so it wears that repo's hat and uses its agent settings (lib/repo-hat.js).
// No repo owns the original spec -> nothing to link: the code spec builds as the_builder, as before. Idempotent, and it
// also links code repos made before 0.39.276 (called from the repo list and the build identity).
function _linkCodeRepo(codeRepo) {
  try {
    if (!codeRepo || codeRepo.source !== 'spec.codegen' || !codeRepo.promotedFromSpec) return null;
    const RH = _require('../../lib/repo-hat.js');
    if (RH.originOf(codeRepo.uuid)) return null;
    const rows = (getRepoLayer().repos && getRepoLayer().repos.repos) || [];
    const origin = rows.find(x => x.uuid !== codeRepo.uuid && x.specUuid === codeRepo.promotedFromSpec && x.status !== 'archived' && x.source !== 'spec.codegen');
    if (!origin) return null;
    const r = RH.linkCoder(codeRepo, origin);
    if (r.ok && r.linked) console.log(`[repo-hat] code repo ${codeRepo.uuid.slice(0, 8)} now wears the hat of ${origin.uuid.slice(0, 8)} (${origin.name})`);
    return r;
  } catch (e) { console.warn(`[repo-hat] could not link a code repo to its original: ${e.message}`); return null; }
}

/**
 * _buildIdentity(specUuid, { agent }) — who builds this spec, wearing which hat.
 * §0.39.267 — James: "agents tab in idearium is meant to build chunks, entire code bases. the agent hat is meant
 * to be agnostic, ollama/guardian/copilot." Chunk builds used to go out bare (no hat, a fixed system line) while the
 * repo's Agent tab wore the repo hat. Now a build wears:
 *   - the repo's own hat, when the spec is a repo's content (the same hat its Agent tab wears), else
 *   - the_builder (hat-seed's build hat), else nothing (named in the result, not hidden).
 * and goes to the repo's Agent-tab switch position (copilot | ollama | a guardian agent) unless the caller or a
 * pinned per-chunk choice says otherwise. The Ollama model is the repo's Agent-tab model setting.
 */
// §0.39.280 BS15 — James: "if i delete a code repo, the original needs to know, and i cant remove or click build a
// replacement." A code repo (spec.codegen) going away is told to everything that pointed at it: the document spec it was
// generated from forgets it (codeSpecUuid cleared — Code plans a new one — and the retired one is listed in
// codeRetired, nothing lost), the shared-hat link goes, and a branch's git worktree is removed while its branch (its
// commits) stays. Returns what it did; never throws (the delete itself already happened).
function _codeRepoRetired(repo) {
  if (!repo || repo.source !== 'spec.codegen') return null;
  const out = { of: null, spec: null, hatUnlinked: false, worktree: null };
  try {
    const se = getSpecEngine();
    const docUuid = repo.promotedFromSpec || null;
    if (se && docUuid) {
      const doc = se.loadSpec(docUuid);
      if (doc.codeSpecUuid && doc.codeSpecUuid === repo.specUuid) {
        doc.codeRetired = [...(doc.codeRetired || []), { specUuid: doc.codeSpecUuid, repoUuid: repo.uuid, at: Date.now() }].slice(-50);
        delete doc.codeSpecUuid; doc.updatedAt = Date.now(); se.saveSpec(doc);
        out.spec = { uuid: docUuid, codeSpecCleared: true };
      } else out.spec = { uuid: docUuid, codeSpecCleared: false };
      const rows = (getRepoLayer().repos && getRepoLayer().repos.repos) || [];
      const origin = rows.find(x => x.specUuid === docUuid && x.status !== 'archived' && x.source !== 'spec.codegen');
      if (origin) out.of = { uuid: origin.uuid, name: origin.name };
    }
  } catch (e) { out.specError = e.message; }
  try { out.hatUnlinked = !!_require('../../lib/repo-hat.js').unlinkCoder(repo.uuid).ok; } catch (_) {}
  if (repo.branchOf && repo.materializeDir) {
    try { out.worktree = _require('../../lib/cos-bridge.js').removeBranch({ originDir: _repoDiskDir(repo.branchOf), dir: repo.materializeDir }); }
    catch (e) { out.worktree = { ok: false, error: e.message }; }
  }
  try { getIdeaOS().emit('idearium.repo.code.retired', { repoUuid: repo.uuid, originUuid: out.of ? out.of.uuid : repo.branchOf || null, specUuid: repo.specUuid || null, docSpecUuid: out.spec ? out.spec.uuid : null, worktree: out.worktree ? !!out.worktree.ok : null }); } catch (_) {}
  return out;
}

// §0.39.309 — the repo's 'persona' block, exactly as edited, around the hat's generated persona (lib/repo-prompt-blocks.js)
function _personaAsEdited(repo, generated) {
  try {
    const b = _require('../../lib/repo-prompt-blocks.js').getBlocks(repo ? repo.uuid : null).find(x => x.id === 'persona');
    if (!b) return generated;
    if (!b.enabled) return '';
    return b.text.split('{persona}').join(generated).trim();
  } catch (e) { console.warn(`[idearium/api] persona block unreadable (${e.message}) — the hat's persona as generated`); return generated; }
}
function _buildIdentity(specUuid) {
  let repo = null;
  try { const L = getRepoLayer(); repo = ((L.repos && L.repos.repos) || []).find(x => x.specUuid === specUuid && x.status !== 'archived') || null; } catch (_) {}
  // §0.39.280 BS13 — a code spec whose repo was not made (or not found) builds as its ORIGINAL: the repo that owns the
  // document spec it was generated from (manifest.codeFor). Before this the identity was empty, no provider was chosen,
  // and warp-cascade let RAID pick — James: "why claude? set to chatgpt."
  if (!repo && specUuid) {
    try {
      const doc = getSpecEngine() && getSpecEngine().loadSpec(specUuid);
      const from = doc && (doc.codeFor || doc.promotedFromSpec);
      if (from) { const L = getRepoLayer(); repo = ((L.repos && L.repos.repos) || []).find(x => x.specUuid === from && x.status !== 'archived') || null; }
    } catch (_) {}
  }
  let hat = null, hatSource = null, provider = null, model = null;
  if (repo) {
    _linkCodeRepo(repo);
    try { hat = _require('../../lib/repo-hat.js').getRepoHat(repo.uuid); if (hat) hatSource = _require('../../lib/repo-hat.js').originOf(repo.uuid) ? 'repo (original)' : 'repo'; } catch (_) {}
    try {
      const RA = _require('../../lib/repo-agent.js');
      provider = RA.getProvider(repo.uuid) || null;
      model = RA.getOllamaModel(repo.uuid) || null;
    } catch (_) {}
  }
  if (!hat) { try { hat = _require('../../lib/hat-forge.js').bySeedKey('the_builder') || null; if (hat) hatSource = 'builder'; } catch (_) {} }
  const normalize = (a) => { try { return _require('../../lib/agent-providers.js').normalize(a); } catch (_) { return a; } };
  let agentId = null;
  try { agentId = _require('../../lib/agent-memory.js').agentIdFor({ repoUuid: repo ? repo.uuid : null, specUuid }); } catch (_) { agentId = repo ? `repo-${repo.uuid}` : (specUuid ? `spec-${specUuid}` : null); }
  return {
    repoUuid: repo ? repo.uuid : null,
    agentId,                                              // §0.39.269 — who remembers this build (lib/agent-memory.js)
    compartmentId: repo ? (repo.compartmentId || null) : null,
    // §0.39.309 — the persona a build wears is the repo's 'persona' block as he edited it (Settings → Agents), {persona}
    // filled with the hat's generated persona (atlas facts + what it learned) — off = no persona. His 0.39.258 rule.
    hat: hat ? { name: hat.name, uuid: hat.uuid || null, personaPrompt: _personaAsEdited(repo, (repo ? _require('../../lib/repo-hat.js').wearable(hat, repo) : hat).personaPrompt || '') } : null,
    hatSource,
    // §0.39.280 BS13 — no repo (and no original) → null on purpose: the chunk's own agent, then the manifest's, then
    // chatgpt decide (chunk build, preferAgent chain) — a default here would outrank a per-chunk choice (H-010).
    provider: provider ? normalize(provider) : null,
    model,
  };
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

// ── §0.39.271 P2/P3 — Phases manager helpers ───────────────────────────────
// §0.39.284 W3 — a reply's tool calls, small enough to keep on its run row (same shape as work-surface.js toolsBrief)
function _toolsBrief(r) {
  const T = r && Array.isArray(r.toolCalls) ? r.toolCalls : null;
  if (!T) return null;
  return T.slice(0, 40).map(t => ({ name: String(t.name || '?'), ok: t.ok !== false, error: t.error ? String(t.error).slice(0, 200) : null,
    args: (() => { try { return JSON.stringify(t.arguments || {}).slice(0, 200); } catch (_) { return null; } })() }));
}
// Runs are append-only rows (one per state change) in idearium_phase_runs; the
// latest row of each runId is the run.
function _phaseRuns(repoUuid) {
  const by = new Map();
  for (const r of loadTable('idearium_phase_runs')) {
    if (r.repoUuid !== repoUuid) continue;
    const cur = by.get(r.runId);
    if (!cur || (r.ts || 0) >= (cur.ts || 0)) by.set(r.runId, { ...(cur || {}), ...r, startedAt: cur ? cur.startedAt : r.ts });
  }
  return [...by.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// Write one phasemap's new text: an ordinary repo through its repo layer; a nexus
// repo through the apply gate (the live tree, recorded and reversible), then a sync
// of the owning system so the nexus repos move to the new base.
async function _phaseWrite(repo, scope, mapPath, text, base, reason) {
  if (scope.source !== 'nexus') {
    const w = getRepoLayer().writeTextFile(repo.uuid, mapPath, text);
    return w.error ? { ok: false, status: 500, error: `could not write ${mapPath}: ${w.error}`, code: 'WRITE_FAILED' } : { ok: true, via: w.via || 'repo-layer' };
  }
  const A = _require('../../lib/nexus-self/apply.js');
  const SYS = _require('../../lib/nexus-self/systems.js');
  const system = SYS.ownerOf(mapPath);
  const r = A.apply({ system, base, changes: [{ path: mapPath, content: text }], reason, by: 'idearium.phases' });
  if (!r.ok) {
    const why = [...(r.errors || []), ...(r.conflicts || []).map(c => `${c.path}: ${c.why}`)].join('; ');
    return { ok: false, status: 409, error: `the apply gate refused ${mapPath}: ${why || 'refused'}${(r.conflicts || []).length ? ' — the live file moved since the last nexus sync; sync, then retry' : ''}`, code: 'APPLY_REFUSED' };
  }
  getIdeaOS().emit('idearium.nexus-self.applied', { applyId: r.applyId, system, paths: [mapPath], snapshot: r.snapshot });
  _nexusSelfSync({ only: [system] });
  return { ok: true, via: 'apply-gate', applyId: r.applyId, snapshot: r.snapshot };
}

async function _phaseSetStatus(repo, { map, phase, status, force = false, reason = '' }) {
  const PH = await import('../repo/phases.js');
  const { setPhaseStatus, RoadmapError } = await import('../repo/roadmap.js');
  const { maps, scope, snapshot } = PH.mapsFor({ repo, repoDir: _repoDiskDir(repo.uuid) });
  const found = maps.find(m => m.path === map);
  if (!found) return { ok: false, status: 404, error: `no phasemap ${map} in this repo` };
  let edit;
  try { edit = setPhaseStatus({ text: found.text, mapName: map.split('/').pop().replace(/\.spec$/, ''), phaseId: phase, status, force }); }
  catch (e) {
    if (e instanceof RoadmapError) {
      const code = e.code === 'NOT_FOUND' ? 404 : e.code === 'DEPS_INCOMPLETE' ? 409 : e.code === 'ROUNDTRIP_FAILED' ? 422 : 400;
      return { ok: false, status: code, error: e.message, extra: { code: e.code, blockers: e.blockers || null } };
    }
    throw e;
  }
  const w = await _phaseWrite(repo, scope, map, edit.text, snapshot, reason);
  if (!w.ok) return { ok: false, status: w.status || 500, error: w.error, extra: { code: w.code } };
  getIdeaOS().emit('idearium.repo.roadmap.updated', { repoUuid: repo.uuid, map, phase, status, via: w.via });
  return { ok: true, data: { repoUuid: repo.uuid, change: { map, phase, before: edit.before.status, after: status, via: w.via, applyId: w.applyId || null } } };
}

// Build one phase: (1) a Versionium snapshot of every repo the build can touch —
// refused without one (map invariant I2); (2) the phase goes active; (3) the repo's
// agent gets the phase as its task, in the background; the run is recorded at each step.
async function _phaseBuild(repo, dir, { map, phase, backend = null, agent = null, provider = null, note = '' }) {
  const PH = await import('../repo/phases.js');
  const view = PH.managerView({ repo, repoDir: dir, runs: [] });
  const node = view.phases.find(p => p.map === map && p.phase_key === phase);
  if (!node) return { ok: false, status: 404, error: `no phase ${phase} in ${map}` };
  if (node.status === 'complete') return { ok: false, status: 409, error: `${phase} is already complete`, extra: { code: 'ALREADY_COMPLETE' } };
  const { maps, scope } = PH.mapsFor({ repo, repoDir: dir });
  const mapText = (maps.find(m => m.path === map) || {}).text || '';

  // which repo builds it: this one, or for all of NEXUS the system that owns the files it names
  let target = repo;
  if (scope.source === 'nexus' && !scope.system) {
    const SYS = _require('../../lib/nexus-self/systems.js');
    const owner = (node.files || []).map(f => SYS.ownerOf(String(f).split(/[\s(]/)[0])).find(Boolean) || 'core';
    target = getRepoLayer().list({}).find(r => r.nexusSelf && r.nexusSelf.role === 'system' && r.nexusSelf.system === owner) || null;
    if (!target) return { ok: false, status: 409, error: `nexus/${owner} has no repo yet — sync the nexus repo first` };
  }
  const runId = `phrun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const base = { runId, repoUuid: repo.uuid, targetRepo: target.uuid, map, phase, phaseUuid: node.uuid, title: node.title };

  // (1) snapshot first — never write without one
  const snap = await _commitRepoSnapshotFor(target.uuid, { message: `before phase ${phase} (${map.split('/').pop()})`, causedBy: `idearium.phases.build:${runId}` });
  if (!snap.ok) {
    appendRow('idearium_phase_runs', { uuid: `${runId}-refused`, ...base, state: 'refused', error: `no snapshot: ${snap.error}`, ts: Date.now() });
    return { ok: false, status: snap.status === 409 ? 409 : 502, error: `not built: the Versionium snapshot before it failed — ${snap.error}`, extra: { code: 'NO_SNAPSHOT', snapshotCode: snap.extra?.code || null } };
  }
  const commitId = snap.data.commitId;

  // (2) active (a map that will not take the edit is reported, not fatal)
  let statusNote = null;
  if (node.status !== 'active') {
    const st = await _phaseSetStatus(repo, { map, phase, status: 'active', force: true, reason: `phase ${phase} build started (${runId})` });
    if (!st.ok) statusNote = st.error;
  }
  const depsDone = view.phases.filter(p => node.depends_on.includes(p.uuid) && p.status === 'complete').map(p => p.phase_key);
  const req = PH.buildRequest({ phase: node, mapText, repo: target, depsDone });
  const message = note ? `${req.message}\n\nFROM JAMES: ${note}` : req.message;
  appendRow('idearium_phase_runs', { uuid: `${runId}-started`, ...base, state: 'building', snapshot: commitId, statusNote, promptChars: message.length, ts: Date.now() });
  getIdeaOS().emit('idearium.repo.phase.run', { ...base, state: 'building', snapshot: commitId });

  // (3) the agent, in the background — its reply can take minutes
  const RA = _require('../../lib/repo-agent.js');
  // §0.39.282 N22 — the phase's shadow: every file the phase names must come back (written, staged or proposed). An
  // absence is a gap + a liminal item (lib/shadow.js) and the run reads 'incomplete', naming what never arrived.
  const SH = _require('../../lib/shadow.js');
  const expectFiles = [...new Set((node.files || []).map(f => String(f).split(/[\s(]/)[0]).filter(f => f && /[\w-]\.[\w]+$/.test(f)))];
  const shadow = expectFiles.length ? SH.declare({ step: 'phase.build', expects: { files: expectFiles }, subject: { repoUuid: target.uuid, map, phase, runId }, causedBy: `idearium.phases.build:${runId}` }) : null;
  // §0.39.282 N23 — each phase is its own chunk in its own FRESH chat (session = runId), so a small local model gets its
  // whole window for this phase, not the running history of every phase before it.
  Promise.resolve().then(async () => RA.dispatch({ repo: target, repoDir: await _agentDir(target.uuid), message, backend, agent, provider, layer: getRepoLayer(), session: runId }))
    .then((r) => {
      const inj = r && r.injects ? { injected: (r.injects.injects || []).map(i => i.path || i.file).filter(Boolean).slice(0, 50), refused: (r.injects.refused || []).length, unresolved: (r.injects.unresolved || []).length } : null;
      // §0.39.282 N21 — a reply blocked at its gate is 'blocked', never 'replied'; N22 — one missing a planned file is 'incomplete'
      let state = r && r.ok ? (r.injects && r.injects.blocked ? 'blocked' : 'replied') : 'failed';
      let absent = null;
      if (shadow) {
        if (state !== 'replied') SH.drop(shadow);
        else { const got = SH.settle(shadow, { files: ((r.injects && r.injects.injects) || []).map(i => i.path || i.file).filter(Boolean) }); if (!got.ok) { state = 'incomplete'; absent = got.absent.files; } }
      }
      const row = { uuid: `${runId}-${state}`, ...base, state, snapshot: commitId, ...(absent ? { absent } : {}),
        error: r && !r.ok ? String(r.error || 'agent failed').slice(0, 500) : (state === 'blocked' ? ((r.injects.refused || [])[0] || {}).reason || 'blocked at its gate' : (absent ? `the reply did not bring back ${absent.join(', ')}` : null)),
        provider: r && (r.providerUsed || r.provider) || null,
        reply: r && r.text ? String(r.text).slice(0, 4000) : null, injects: inj, elapsedMs: r && r.elapsedMs || null, ts: Date.now() };
      // §0.39.284 W3 — the tool calls of this run are kept on it, so the work surface can show what the agent used
      try { const tb = _toolsBrief(r); if (tb) row.tools = tb; } catch (_) {}
      appendRow('idearium_phase_runs', row);
      getIdeaOS().emit('idearium.repo.phase.run', { ...base, state: row.state, snapshot: commitId });
      _reviewDraft({ r, state, absent, target, base, commitId, req, note, message })
        .catch(e => { console.warn(`[idearium] draft review for ${runId} failed: ${e.message}`); return null; })
        // §0.39.303 PH1 — then the judge: the phase's own conditions, run; unmet ones feed the next attempt
        .then(() => (['replied', 'incomplete'].includes(state) ? _provePhase({ target, base, commitId, mapText, phase, message, dispatch: { backend, agent, provider } }) : null))
        .catch(e => console.warn(`[idearium] proof of ${runId} failed: ${e.message}`));
    })
    .catch((e) => {
      if (shadow) SH.drop(shadow);
      appendRow('idearium_phase_runs', { uuid: `${runId}-failed`, ...base, state: 'failed', snapshot: commitId, error: e.message, ts: Date.now() });
      getIdeaOS().emit('idearium.repo.phase.run', { ...base, state: 'failed', snapshot: commitId });
    });
  return { ok: true, data: { runId, state: 'building', snapshot: commitId, targetRepo: target.uuid, targetName: target.name, statusNote, title: req.title, promptChars: message.length,
    ...(shadow ? { shadow: { id: shadow.id, expects: shadow.expects } } : {}) } };
}

// §0.39.303 PH1 — James: "It can build it. Piece by piece look at idearium." A phase run ends in a proof run of the
// phase's own conditions (its map's `conditions:`, idearium/repo/proof-run.js). Met → 'proven'. Unmet → the unmet
// promises, their evidence and causes go back to the same agent as the next attempt, up to repos.proof_attempts
// (default 2), then 'unproven' with what is still missing. No conditions declared → 'no-proof', said, never assumed.
async function _provePhase({ target, base, commitId, mapText, phase, message, dispatch }) {
  const PR = await import('../repo/proof-run.js');
  let { conditions, source } = PR.conditionsFromPhase(mapText, phase);
  // no declared conditions → the phase's own files: each exists, each JS file parses (never invented from prose)
  if (!conditions.length) { const d = PR.derivedConditionsFromPhase(mapText, phase); if (d.conditions.length) ({ conditions, source } = d); else source = d.source; }
  const pbase = { ...base, runId: `${base.runId}-proof`, buildRunId: base.runId };
  if (!conditions.length) {
    appendRow('idearium_phase_runs', { uuid: `${pbase.runId}-no-proof`, ...pbase, state: 'no-proof', snapshot: commitId, error: `not proven: ${source} — add conditions: [{ says, check }] to the phase`, ts: Date.now() });
    getIdeaOS().emit('idearium.repo.phase.run', { ...pbase, state: 'no-proof' });
    return { state: 'no-proof' };
  }
  let max = 2; try { const v = Number(getIdeariumValue('repos.proof_attempts')); if (v >= 1 && v <= 10) max = Math.floor(v); } catch (_) {}
  const RA = _require('../../lib/repo-agent.js');
  const writer = (rel, text) => getRepoLayer().writeFile(target.uuid, rel, text, { preserveWhitespace: true });
  let run = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    if (attempt > 1) {
      // the next attempt: the same agent, a fresh chat, the phase's request plus exactly what was not met
      const fb = PR.feedbackMessage(run);
      appendRow('idearium_phase_runs', { uuid: `${pbase.runId}-retry-${attempt}`, ...pbase, state: 'retrying', attempt, snapshot: commitId, error: `${run.total - run.met} condition(s) unmet — attempt ${attempt} of ${max}`, ts: Date.now() });
      getIdeaOS().emit('idearium.phase.attempt.unmet', { ...pbase, attempt: attempt - 1, met: run.met, total: run.total, modes: run.modes });
      let rr; try { rr = await RA.dispatch({ repo: target, repoDir: await _agentDir(target.uuid), message: `${message}

${fb}`, ...dispatch, layer: getRepoLayer(), session: `${base.runId}-a${attempt}` }); }
      catch (e) { rr = { ok: false, error: e.message }; }
      if (!rr || !rr.ok) {
        appendRow('idearium_phase_runs', { uuid: `${pbase.runId}-unproven`, ...pbase, state: 'unproven', attempt, snapshot: commitId, error: `attempt ${attempt} failed before it could be checked: ${String((rr && rr.error) || 'no reply').slice(0, 300)}`, proof: run && { met: run.met, total: run.total, modes: run.modes }, ts: Date.now() });
        getIdeaOS().emit('idearium.repo.phase.run', { ...pbase, state: 'unproven' });
        return { state: 'unproven', run };
      }
    }
    const dir = _repoDiskDir(target.uuid);
    const r = dir ? await PR.runProof({ repoDir: dir, conditions, subject: `${target.name || target.uuid} — ${base.title || phase}`, writer }) : { ok: false, error: 'could not resolve the repo directory' };
    if (!r.ok) {
      appendRow('idearium_phase_runs', { uuid: `${pbase.runId}-unproven`, ...pbase, state: 'unproven', attempt, snapshot: commitId, error: `the proof could not run: ${r.error}`, ts: Date.now() });
      getIdeaOS().emit('idearium.repo.phase.run', { ...pbase, state: 'unproven' });
      return { state: 'unproven' };
    }
    run = r.run;
    if (run.verdict === 'ready') {
      appendRow('idearium_phase_runs', { uuid: `${pbase.runId}-proven`, ...pbase, state: 'proven', attempt, snapshot: commitId, proof: { met: run.met, total: run.total, report: run.files && run.files.report }, ts: Date.now() });
      getIdeaOS().emit('idearium.phase.proven', { ...pbase, attempt, met: run.met, total: run.total, report: run.files && run.files.report });
      getIdeaOS().emit('idearium.repo.phase.run', { ...pbase, state: 'proven' });
      return { state: 'proven', attempt, run };
    }
  }
  const still = run.results.filter(x => !x.met).map(x => x.says);
  appendRow('idearium_phase_runs', { uuid: `${pbase.runId}-unproven`, ...pbase, state: 'unproven', attempt: max, snapshot: commitId, error: `after ${max} attempt(s), still not met: ${still.join(' · ').slice(0, 400)}`, proof: { met: run.met, total: run.total, modes: run.modes, report: run.files && run.files.report }, ts: Date.now() });
  getIdeaOS().emit('idearium.phase.attempt.unmet', { ...pbase, attempt: max, met: run.met, total: run.total, modes: run.modes });
  getIdeaOS().emit('idearium.repo.phase.run', { ...pbase, state: 'unproven' });
  return { state: 'unproven', run };
}

// §0.39.282 N23 — Ollama drafted the phase: a guardian agent reviews the draft (lib/draft-review.js) in one plain
// conversation, then its files apply by the repo's mode. The review is its own run (draftRunId links it to the draft)
// with its own shadow (the phase's files must come back). Settings: repos.draft_then_review, repos.review_provider.
async function _reviewDraft({ r, state, absent, target, base, commitId, req, note, message }) {
  const v = (k) => { try { return getIdeariumValue(k); } catch (_) { return undefined; } };
  if (v('repos.draft_then_review') === false) return null;
  if (!['replied', 'incomplete'].includes(state)) return null;
  const DR = _require('../../lib/draft-review.js');
  if (!DR.wasDraftedLocally(r)) return null;
  const RA = _require('../../lib/repo-agent.js');
  const RI = _require('../../lib/repo-inject.js');
  const files = DR.draftFiles(r, RI);
  if (!files.length) return null;
  const reviewer = DR.reviewerFor(v('repos.review_provider') || '', RA);
  const reviewRunId = `${base.runId}-review`;
  const rbase = { ...base, runId: reviewRunId, draftRunId: base.runId, title: `review of ${base.title || base.phase}` };
  if (!reviewer) {
    appendRow('idearium_phase_runs', { uuid: `${reviewRunId}-skipped`, ...rbase, state: 'skipped', error: 'no guardian agent to review the draft (none connected; set repos.review_provider)', ts: Date.now() });
    return null;
  }
  const text = DR.reviewMessage({ repoName: target.name, title: base.title || base.phase, need: req && req.message ? req.message : message, files, absent: absent || [], note });
  appendRow('idearium_phase_runs', { uuid: `${reviewRunId}-started`, ...rbase, state: 'reviewing', reviewer, draftFiles: files.map(f => f.path), snapshot: commitId, promptChars: text.length, ts: Date.now() });
  getIdeaOS().emit('idearium.repo.phase.run', { ...rbase, state: 'reviewing', reviewer });
  const SH = _require('../../lib/shadow.js');
  const shadow = SH.declare({ step: 'phase.review', expects: { files: [...new Set([...files.map(f => f.path), ...(absent || [])])] }, subject: { repoUuid: target.uuid, map: base.map, phase: base.phase, runId: reviewRunId }, causedBy: `idearium.phases.build:${base.runId}` });
  let rr;
  try { rr = await RA.dispatch({ repo: target, repoDir: await _agentDir(target.uuid), message: text, provider: reviewer, layer: getRepoLayer(), session: reviewRunId }); }
  catch (e) { rr = { ok: false, error: e.message }; }
  let rstate = rr && rr.ok ? (rr.injects && rr.injects.blocked ? 'blocked' : 'reviewed') : 'failed';
  let rabsent = null;
  if (rstate !== 'reviewed') SH.drop(shadow);
  else { const got = SH.settle(shadow, { files: ((rr.injects && rr.injects.injects) || []).map(i => i.path || i.file).filter(Boolean) }); if (!got.ok) { rstate = 'incomplete'; rabsent = got.absent.files; } }
  appendRow('idearium_phase_runs', { uuid: `${reviewRunId}-${rstate}`, ...rbase, state: rstate, reviewer, snapshot: commitId, ...(rabsent ? { absent: rabsent } : {}),
    error: rr && !rr.ok ? String(rr.error || 'review failed').slice(0, 500) : (rabsent ? `the review did not bring back ${rabsent.join(', ')}` : null),
    provider: rr && (rr.providerUsed || rr.provider) || reviewer, reply: rr && rr.text ? String(rr.text).slice(0, 4000) : null,
    injects: rr && rr.injects ? { injected: (rr.injects.injects || []).map(i => i.path || i.file).filter(Boolean).slice(0, 50) } : null, ts: Date.now() });
  getIdeaOS().emit('idearium.repo.phase.run', { ...rbase, state: rstate, reviewer });
  return { state: rstate, reviewer };
}

// §0.39.271 — one repo snapshot, as POST /api/repos/:uuid/snapshot takes it (moved here
// from that route unchanged). Returns { ok, data } or { ok:false, status, error, extra }.
// §0.39.280 — what api/build-surface.js is given: this server's own helpers, nothing new
function _buildSurfaceDeps() {
  return {
    reviewDraft: _reviewDraft,   // §0.39.282 N23 — manage runs hand an Ollama draft to a reviewing agent too
    getRepoLayer, repoDir: _repoDiskDir, versionium: _versionium, loadTable, appendRow, require: _require,
    emit: (t, d) => getIdeaOS().emit(t, d), RI: () => _require('../../lib/repo-inject.js'),
    config: (k) => { try { return getIdeariumValue(k); } catch (_) { return undefined; } },
    snapshot: (uuid, b) => _commitRepoSnapshotFor(uuid, b), phaseBuild: _phaseBuild, phaseRuns: _phaseRuns,
  };
}
// §0.39.280 BS3 — "baseline deviation needs to recaclute each version or major file change"
function _deviationAfter(uuid, kind) {
  import('./build-surface.js').then(BS => (kind === 'version' ? BS.afterVersion(_buildSurfaceDeps(), uuid) : BS.afterFileChange(_buildSurfaceDeps(), uuid))).catch(() => {});
}

async function _commitRepoSnapshotFor(uuid, body = {}) {
  const repo = getRepoLayer().get(uuid);
  if (!repo) return { ok: false, status: 404, error: `repo not found: ${uuid}` };
  const dir = _repoDiskDir(uuid);
  if (!dir) return { ok: false, status: 500, error: 'could not resolve repo directory' };
  const { commitRepoSnapshot, verifyMustRecord } = await import('../repo/snapshot.js');
  const result = await commitRepoSnapshot({
    repo, repoDir: dir, message: body.message || null, causedBy: body.causedBy || null,
    fileLayer: _fileLayers(uuid).fileLayer, snapshotMode: _snapshotMode(),
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
    return { ok: false, status, error: result.error, extra: { code: result.code, commitId: result.commit?.commitId || null } };
  }
  getIdeaOS().emit('idearium.repo.snapshot.committed', {
    repoUuid: uuid, commitId: result.commit.commitId,
    sourceFresh: result.record.mustRecord.sourceHash.fresh ?? null,
  });
  _deviationAfter(uuid, 'version');
  return { ok: true, data: {
    repoUuid: uuid, commitId: result.commit.commitId, branch: result.commit.branch,
    system: result.commit.system, mustRecord: verifyMustRecord(result.record), record: result.record,
    files: result.files ? { treeHash: result.files.treeHash, counts: result.files.counts, bytes: result.files.bytes || null, alreadyRecorded: !!result.files.alreadyRecorded } : null,
  } };
}

// ── §0.39.291 PV1–PV3 — verify and prove ─────────────────────────────────────────────────────────────────────────────
const PROOF_TABLE = 'idearium_proof_runs';
const _proofs = new Map();   // repoUuid -> the live run (one per repo)

function _compactFailure(f) {
  return { file: f.file, kind: f.kind, error: f.error, line: f.line || null, test: f.test || null, suspect: !!f.suspect,
    excerpt: f.excerpt ? String(f.excerpt).slice(0, 600) : null, output: f.output ? String(f.output).slice(-600) : null };
}
function _compartmentOf(repo) {
  try { return repo.compartmentId ? _require('../../lib/cos-bridge.js').getCompartment(repo.compartmentId) : null; } catch (_) { return null; }
}
async function _verifyRepo(repo) {
  const BV = _require('../../lib/build-verify.js');
  const mat = getRepoLayer().materialize(repo.uuid);   // the files as the spec has them now — never a stale copy
  const dir = mat && !mat.error ? mat.dir : _repoDiskDir(repo.uuid);
  const v = await BV.verify({ repo, repoDir: dir, compartment: _compartmentOf(repo) });
  // §0.39.309 SB12 — a code repo built from its registry is also checked against it: every promised file exists and
  // parses. A missing file is a failure the prove loop sends back to be built, like any other.
  try {
    const se = getSpecEngine();
    const m = se && repo.specUuid ? se.loadSpec(repo.specUuid) : null;
    if (m && Array.isArray(m.registry) && m.registry.length) {
      const cl = _require('../../lib/registry-plan.js').checklist(m.registry, dir);
      v.checks.registry = { ran: true, components: cl.components, present: cl.present, missing: cl.missing.length, unparsed: cl.unparsed.length, extra: cl.extra };
      const seen = new Set(v.failures.map(f => `${f.file}|${f.kind}`));
      const add = (f) => { v.failures.push(f); (v.byFile[f.file] = v.byFile[f.file] || []).push(f); };   // byFile is what the prove loop sends back
      for (const f of cl.missing) add({ file: f, kind: 'registry', error: 'the registry promises this file and it does not exist — build it' });
      for (const u of cl.unparsed) if (!seen.has(`${u.file}|syntax`)) add({ file: u.file, kind: 'registry', error: `does not parse: ${u.error}` });
      if (!cl.ok && v.verdict !== 'failed') { v.verdict = 'failed'; v.why = `the registry promises ${cl.missing.length + cl.unparsed.length} file(s) that are missing or do not parse`; }
    }
  } catch (e) { v.checks.registry = { ran: false, why: e.message }; }
  return v;
}
function _recordVerify(repo, v, how, extra = {}) {
  try {
    appendRow('idearium_repo_runs', { uuid: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, repoUuid: repo.uuid, option: `verify:${how}`, label: `verify — ${v.verdict}`,
      passed: v.verdict === 'failed' ? 0 : 1, failed: v.failures.length, allPassed: v.verdict === 'proven', verdict: v.verdict, why: v.why, durationMs: v.ms, ts: Date.now(),
      failures: v.failures.slice(0, 10).map(_compactFailure), checks: v.checks, ...extra });
  } catch (_) { /* the verification's own result stands regardless */ }
}
function _proofView(run) {
  const { cancel, ...rest } = run;
  return { ...rest, cancelling: !!cancel };
}
function _saveProof(run) {
  try { syncTable(PROOF_TABLE, [_proofView(run)]); } catch (e) { console.warn(`[idearium/prove] could not record the run (it continues): ${e.message}`); }
}
// one route, called in-process — the proof run builds through exactly what the UI and the queue call (routing, gates,
// continuation, provenance), never a second build path
async function _callRoute(action, params = {}, body = {}, query = {}) {
  let status = 200, out = null;
  const res = { writeHead(c) { status = c; return this; }, setHeader() {}, end(b) { try { out = JSON.parse(b); } catch (_) { out = { ok: false, error: String(b || '').slice(0, 300) }; } } };
  try { await handle({ method: 'POST', headers: {}, url: '', on() {} }, res, { action, params }, query, body); }
  catch (e) { return { status: 500, ok: false, error: e.message }; }
  return { status, ...(out || { ok: false, error: 'no response' }) };
}

function _startProof(repo, { rounds = 3, maxBuildsPerRound = 400 } = {}) {
  const run = { uuid: `proof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, repoUuid: repo.uuid, repoName: repo.name, specUuid: repo.specUuid,
    state: 'running', verdict: null, why: null, maxRounds: rounds, rounds: [], startedAt: Date.now(), endedAt: null, cancel: false };
  _proofs.set(repo.uuid, run);
  _buildingSpecs.add(repo.specUuid);   // the queue never builds a spec a proof run is building (one writer)
  _saveProof(run);
  const os = getIdeaOS();
  os.emit('idearium.repo.prove.started', { repoUuid: repo.uuid, run: run.uuid, rounds });
  _proveLoop(run, { maxBuildsPerRound }).catch(e => {
    run.state = 'error'; run.why = `the proof run stopped on an error: ${e.message}`; console.error(`[idearium/prove] ${repo.uuid}: ${e.stack || e.message}`);
  }).finally(() => {
    run.endedAt = Date.now();
    _buildingSpecs.delete(repo.specUuid);
    _saveProof(run);
    try { os.emit('idearium.repo.prove.done', { repoUuid: repo.uuid, run: run.uuid, state: run.state, verdict: run.verdict, rounds: run.rounds.length }); } catch (_) {}
  });
  return run;
}

const PROOF_CHUNK_WAIT_MS = parseInt(process.env.IDEARIUM_PROVE_CHUNK_WAIT_MS || '', 10) || 20 * 60 * 1000;
// one file's build, waited for: until it leaves building/verifying, the run is cancelled, or the wait runs out
async function _waitChunk(run, chunkUuid, { pollMs = 1000 } = {}) {
  const se = getSpecEngine();
  const until = Date.now() + PROOF_CHUNK_WAIT_MS;
  while (Date.now() < until) {
    if (run.cancel) return { cancelled: true };
    let c = null;
    try { c = (se.loadSpecMeta(run.specUuid).chunks || []).find(x => x.uuid === chunkUuid); } catch (_) {}
    if (!c) return { status: 'missing' };
    if (c.status !== 'building' && c.status !== 'verifying') return { status: c.status, failureMode: c.failureMode || null };
    await new Promise(r => setTimeout(r, pollMs));
  }
  return { timedOut: true };
}

async function _proveLoop(run, { maxBuildsPerRound }) {
  const se = getSpecEngine();
  const os = getIdeaOS();
  const BV = _require('../../lib/build-verify.js');
  for (let round = 1; round <= run.maxRounds; round++) {
    const rr = { round, startedAt: Date.now(), built: 0, reused: 0, stalled: null, verdict: null, why: null, failures: [], repaired: [], notBuiltBySpec: [] };
    run.rounds.push(rr);
    // 1 — build every pending file, ONE AT A TIME: speceng.build starts a dispatch and returns, so each file is waited
    // for before the next — in layer order, so every file's prompt carries the files already built beneath it
    for (let i = 0; i < maxBuildsPerRound; i++) {
      if (run.cancel) { run.state = 'cancelled'; run.why = `cancelled in round ${round}`; rr.endedAt = Date.now(); return; }
      const r = await _callRoute('speceng.build', { uuid: run.specUuid }, {});
      if (r.done) break;
      if (r.ok === false) { rr.stalled = r.error || `build returned ${r.status}`; break; }
      if (r.reused) { rr.reused++; continue; }
      rr.current = r.sectionTitle || r.sectionId || null;
      _saveProof(run);
      const w = await _waitChunk(run, r.chunkUuid);
      if (w.cancelled) { run.state = 'cancelled'; run.why = `cancelled in round ${round} while ${rr.current} was building`; rr.endedAt = Date.now(); return; }
      if (w.timedOut) { rr.stalled = `${rr.current} was still building after ${Math.round(PROOF_CHUNK_WAIT_MS / 60000)} min — its agent did not answer`; break; }
      rr.built++;
      if (w.status !== 'complete') (rr.buildFailures = rr.buildFailures || []).push({ file: rr.current, status: w.status, why: w.failureMode || null });
    }
    rr.current = null;
    if (rr.stalled) {
      rr.verdict = 'stalled'; rr.endedAt = Date.now();
      run.state = 'stalled'; run.verdict = 'failed';
      run.why = `round ${round}: the build stalled — ${rr.stalled}`;
      return;
    }
    // 2 — verify the files as built
    const repo = getRepoLayer().get(run.repoUuid);
    const v = await _verifyRepo(repo);
    rr.verdict = v.verdict; rr.why = v.why; rr.checks = v.checks; rr.ms = v.ms;
    rr.failures = v.failures.slice(0, 50).map(_compactFailure);
    _recordVerify(repo, v, 'prove', { proofRun: run.uuid, round });
    os.emit('idearium.repo.prove.round', { repoUuid: run.repoUuid, run: run.uuid, round, verdict: v.verdict, failures: v.failures.length, built: rr.built });
    if (v.verdict !== 'failed') {
      rr.endedAt = Date.now();
      run.state = 'done'; run.verdict = v.verdict;
      run.why = v.verdict === 'proven' ? `proven in ${round} round(s) — ${v.why}` : `every file parses and resolves (round ${round}), not proven: ${v.checks.tests ? v.checks.tests.why : 'no tests'}`;
      // §CT2 — proven: every model that built a file of it did the job
      if (v.verdict === 'proven') { try { const PRx = _require('../../lib/pipeline-routing.js'); const m2 = se.loadSpec(run.specUuid); for (const c of (m2.chunks || [])) { const by = _builtBy(c); if (by && c.realPath) _verdict(by, PRx.jobTypeOf(c), true); } } catch (_) {} }
      return;
    }
    if (round === run.maxRounds) {
      rr.endedAt = Date.now();
      run.state = 'done'; run.verdict = 'failed';
      run.why = `still failing after ${round} round(s): ${v.why}`;
      return;
    }
    // 3 — send each failing file back with its exact failures; the version that failed is never reused
    const manifest = se.loadSpec(run.specUuid);
    const items = Object.entries(v.byFile).filter(([f]) => f !== '(project)').map(([f, list]) => ({ realPath: f, failures: BV.repairText(list), round: round + 1 }));
    // §CT2 — whoever built a failing file was not up to it: the verdict goes to the door before the file goes back
    try { const PRx = _require('../../lib/pipeline-routing.js'); for (const it of items) { const c = manifest.chunks.find(x => x.realPath === it.realPath); const by = _builtBy(c); if (by) _verdict(by, PRx.jobTypeOf(c), false, 'test-failed', String(it.failures || '').slice(0, 300)); } } catch (_) {}
    const mr = se.markForRepair(run.specUuid, items);
    rr.repaired = mr.marked; rr.notBuiltBySpec = mr.unknown;
    try {
      const CS = _require('../../lib/component-store.js');
      for (const f of mr.marked) {
        const c = manifest.chunks.find(x => x.realPath === f);
        if (c && c.content) CS.markFailed({ project: manifest.name, path: f, content: c.content, reason: (items.find(i => i.realPath === f) || {}).failures || 'failed verification' });
      }
    } catch (e) { console.warn(`[idearium/prove] component store not told (reuse is still skipped for repairs): ${e.message}`); }
    rr.endedAt = Date.now();
    _saveProof(run);
    if (!mr.marked.length) {
      run.state = 'done'; run.verdict = 'failed';
      run.why = `round ${round}: every failure is in a file the spec does not build (${mr.unknown.slice(0, 5).join(', ')}${v.byFile['(project)'] ? ', or the project as a whole' : ''}) — nothing to send back`;
      return;
    }
  }
}

function _repoDiskDir(repoUuid) {
  const repo = getRepoLayer().get(repoUuid);
  if (!repo) return null;
  if (repo.materializeDir) return repo.materializeDir;
  const mat = getRepoLayer().materialize(repoUuid);
  return mat.error ? null : mat.dir;
}

// §0.39.335 SB35 — James: "why are the agents still not using the context. fix it. actualy fix it." The retrieval
// (lib/repo-agent.js contextFor) was right and read an index that was not there: his question reached core's agent
// while nexus-self was still writing its sources, and a repo row that lost materializeDir points at
// data/projects/<uuid> while its index is in nexus-self/repos/<uuid>. Before every agent send:
//   1. a nexus-self sync running for this repo is waited for (bounded);
//   2. the directory used is the one that HOLDS indexes/cards.json, of every place this repo's files can be;
//   3. none does but the sources are on disk → the import pipeline runs there (the same runImportPipeline as
//      POST /reindex) and the persona is re-grounded on it. Concurrent sends share the one run.
// -> { dir, indexed, waited, built, error? }. Never throws; a failure is stated (§1.2), the send still goes.
const _indexing = new Map();
const _hasIndex = (d) => { try { return !!d && fs.statSync(path.join(d, 'indexes', 'cards.json')).size > 0; } catch (_) { return false; } };
const _hasSources = (d) => { if (!d) return false; try { return fs.existsSync(path.join(d, '.idearium-sources.json')) || fs.readdirSync(d).some(f => !f.startsWith('.') && !['indexes', 'chunks', 'atlas.json'].includes(f)); } catch (_) { return false; } };
async function _ensureIndexed(repoUuid, { waitMs = parseInt(process.env.IDEARIUM_AGENT_INDEX_WAIT_MS || '120000', 10) } = {}) {
  const L = getRepoLayer();
  const repo = L.get(repoUuid);
  if (!repo) return { dir: null, indexed: false, error: 'repo not found' };
  const out = { dir: null, indexed: false, waited: 0, built: false };
  try {
    const NS = await import('../repo/nexus-self.js');
    const p = typeof NS.syncing === 'function' ? NS.syncing(repoUuid) : null;
    if (p) { const t = Date.now(); await Promise.race([p, new Promise(r => setTimeout(r, waitMs))]); out.waited = Date.now() - t; }
  } catch (_) { /* no nexus-self — nothing to wait for */ }
  if (_indexing.has(repoUuid)) { const t = Date.now(); await _indexing.get(repoUuid); out.waited += Date.now() - t; }
  const r = L.get(repoUuid) || repo;
  let selfDir = null;
  try { selfDir = path.join(_require('../../lib/nexus-self/store.js').storeRoot(), 'repos', repoUuid); } catch (_) { selfDir = null; }
  const candidates = [...new Set([r.materializeDir, selfDir, path.join(L.dataDir, 'projects', repoUuid)].filter(Boolean))];
  const found = candidates.find(_hasIndex);
  if (found) return { ...out, dir: found, indexed: true };
  const src = candidates.find(_hasSources) || _repoDiskDir(repoUuid);
  if (!src) return { ...out, error: 'no directory holds this repo\'s files' };
  const run = (async () => {
    await new Promise(res => setImmediate(res));
    const pipeline = runImportPipeline(r, src);
    try { const RH = _require('../../lib/repo-hat.js'); if (RH.getRepoHat(repoUuid)) RH.refreshRepoHatPersona({ repo: r, repoDir: src }); } catch (e) { console.warn(`[api] SB35 persona refresh after indexing ${repoUuid}: ${e.message}`); }
    return pipeline;
  })();
  _indexing.set(repoUuid, run);
  try {
    const pipeline = await run;
    console.log(`[api] SB35 ${r.name || repoUuid}: had no index when its agent was asked — pipeline ran in ${src} → ${pipeline && pipeline.state}`);
    return { ...out, dir: src, indexed: _hasIndex(src), built: true, pipeline: pipeline && pipeline.state };
  } catch (e) {
    console.warn(`[api] SB35 ${r.name || repoUuid}: indexing for the agent failed — ${e.message}`);
    return { ...out, dir: src, error: `indexing failed: ${e.message}` };
  } finally { _indexing.delete(repoUuid); }
}
// the directory an agent of this repo reads its context from, its index made sure of first (SB35)
async function _agentDir(repoUuid) {
  const e = await _ensureIndexed(repoUuid);
  if (e.error) console.warn(`[api] SB35 ${repoUuid}: ${e.error} — the agent is sent what the repo has`);
  return e.dir || _repoDiskDir(repoUuid);
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
// §0.39.265 — a folder on disk (a git clone, or the project part of a pulled
// compartment) becomes a new Idearium repo, by the same rules as "Import
// project" (lib/zip-ingest.js over the folder's files), its .git carried over so
// history, pull and push survive. Chunking is deferred like a zip import.
async function _importFolderAsRepo({ dir, name, source, compartmentId = null }) {
  const G = _require('../../lib/repo-git.js');
  const cfg = _require('../../lib/project-import.config.js');
  const { extractZipToFiles } = _require('../../lib/zip-ingest.js');
  const extraction = extractZipToFiles({
    entries: G.readTree(dir), maxFiles: cfg.ZIP.maxFiles, maxBytesPerFile: cfg.ZIP.maxBytesPerFile, maxTotalBytes: cfg.ZIP.maxTotalBytes,
    maxRealFileBytes: cfg.ZIP.maxRealFileBytes, realFiles: cfg.ZIP.realFiles, includeBinary: cfg.ZIP.includeBinary,
    verifyHashes: cfg.ZIP.verifyHashes, skipDirs: cfg.ZIP.skipDirs, textExt: cfg.ZIP.textExt,
  });
  if (!extraction.ok) return { error: extraction.error };
  const { included, realFiles, omitted } = extraction;
  if (!included.length && !realFiles.length) return { error: 'no files pass the import bounds' };
  const ingest = getRepoLayer().ingest({ name, files: included, source, compartmentId, materializeBaseDir: cfg.REPO_STORAGE.dir });
  if (ingest.error) return { error: ingest.error };
  const repoUuid = ingest.repo.uuid;
  let sources = null;
  if (realFiles.length) {
    sources = getRepoLayer().writeSourcesAsync ? await getRepoLayer().writeSourcesAsync(repoUuid, realFiles) : getRepoLayer().writeSources(repoUuid, realFiles);
    if (!sources.ok) return { error: `source-file write failed: ${sources.error}`, status: 500 };
  }
  const mat = getRepoLayer().materialize(repoUuid);
  if (mat.error) return { error: `materialize after import failed: ${mat.error}`, status: 500 };
  if (fs.existsSync(path.join(dir, '.git'))) {
    fs.cpSync(path.join(dir, '.git'), path.join(mat.dir, '.git'), { recursive: true });
    await G.ensureRepo(mat.dir);   // Idearium's own files excluded from git status
  }
  return { repoUuid, matDir: mat.dir, fileCount: sources ? sources.written : included.length, chunkCount: included.length, omitted };
}

// §0.39.265 — files changed on disk in a repo's folder (a git pull, a
// compartment pull) brought into the repo itself: its content is the spec, so a
// file changed only on disk would be rewritten from its chunk by the next
// materialize. Text files update (or add) their chunk, deletions remove it;
// binaries stay on disk and are listed, since only an import writes the source layer.
function _applyChangedFilesToRepo(repoUuid, dir, changed) {
  const G = _require('../../lib/repo-git.js');
  const { _isProbablyText } = _require('../../lib/zip-ingest.js');
  const applied = [], removed = [], binary = [], failed = [];
  for (const c of changed || []) {
    if (c.path === '.git' || c.path.startsWith('.git/')) continue;
    if (G.isInternal(dir, c.path)) continue;
    if (c.status === 'D') {
      const d = getRepoLayer().deleteFile(repoUuid, c.path, { defer: true });
      if (d.error && !/not found/.test(d.error)) failed.push({ path: c.path, error: d.error }); else removed.push(c.path);
      continue;
    }
    let buf; try { buf = fs.readFileSync(path.join(dir, c.path)); } catch (e) { failed.push({ path: c.path, error: e.message }); continue; }
    if (!_isProbablyText(buf)) { binary.push(c.path); continue; }
    const w = getRepoLayer().writeFile(repoUuid, c.path, buf.toString('utf8'), { defer: true, preserveWhitespace: true });
    if (w.error) failed.push({ path: c.path, error: w.error }); else applied.push(c.path);
  }
  if (applied.length || removed.length) getRepoLayer().refresh(repoUuid);
  return { applied, removed, binary, failed };
}

// §0.39.294 SW1 — the spec workshop's helpers (idearium/lib/workshop.js holds the model; these hold the store and repos)
let _wsMod = null;
async function _workshop() {
  if (_wsMod) return _wsMod;
  const WS = await import('../lib/workshop.js');
  // the agent: copilot's /api/prompt, the same route and default provider a repo agent uses (lib/repo-agent.js)
  WS.setAsk((prompt, { sessionUuid } = {}) => _agentAsk(prompt, { channel: 'idearium-workshop', sessionId: `workshop-${sessionUuid || 'x'}` }));
  _wsMod = WS;
  return WS;
}
/** the spec engine loads lazily (getSpecEngine); the workshop waits for it briefly rather than failing on a fresh start */
async function _specEngineReady(ms = 5000) {
  for (const until = Date.now() + ms; ; ) { const se = getSpecEngine(); if (se || Date.now() > until) return se; await new Promise(r => setTimeout(r, 100)); }
}
/** §0.39.294/0.39.295 — one way idearium's own pages ask an agent: copilot's /api/prompt with the person's default
 *  provider (lib/repo-agent.js defaultProvider / routeFor), the same route a repo agent uses. Tests swap it (_setAgentAsk). */
let _agentAskOverride = null;
export function _setAgentAsk(fn) { _agentAskOverride = typeof fn === 'function' ? fn : null; }
export function _agentAskForTest(prompt, opts) { return _agentAsk(prompt, opts); }   // §CT1 — its test drives the real route walk
export function _verdictForTest(chunk, kind, ok, cls, why) { const by = _builtBy(chunk); _verdict(by, kind, ok, cls, why); return by; }   // §CT2
async function _agentAsk(prompt, { channel = 'idearium', sessionId = 'idearium', kind = null } = {}) {
  if (_agentAskOverride) { try { return await _agentAskOverride(prompt, { channel, sessionId }); } catch (e) { return { ok: false, error: e.message }; } }
  // §CT1 0.39.346 — James: "it should use copilot regardless, have copilot figure it, and learn from it". The pages
  // (workshop, architect, void, deliver) ask copilot's door which model answers this kind of job (POST /api/route,
  // lib/pipeline-routing's learned policy); each hop's outcome goes back (POST /api/route/outcome) so it learns; a hop
  // that fails in a class the policy falls back on moves to the next model. Before, they followed the global default
  // provider and never passed a model — an Ollama page got the bridge's default model, or no Ollama at all.
  const RA = _require('../../lib/repo-agent.js');
  const PR = _require('../../lib/pipeline-routing.js');
  const jobType = kind || `page:${String(channel).replace(/^idearium-/, '')}`;
  const policy = _routingPolicy();
  let route = null, routeNote = null;
  const rr = await _postJson(`${RA.COPILOT_URL}/api/route`, { kind: jobType, preferAgent: RA.defaultProvider(), policy }, 5000);
  if (rr.status === 200 && rr.json && rr.json.ok && Array.isArray(rr.json.route) && rr.json.route.length) route = rr.json.route;
  else {
    const prov = RA.defaultProvider(), r = RA.routeFor(prov);
    route = [{ provider: prov, backend: r.backend, agent: r.agent || null, model: null, why: 'the default provider' }];
    routeNote = `copilot could not route (${(rr.json && rr.json.error) || `status ${rr.status}`}) — sent to the default provider`;
  }
  const tried = [];
  for (const h of route) {
    const payload = { prompt, channel, sessionId, ...(h.backend ? { backend: h.backend } : {}), ...(h.agent ? { agent: h.agent } : {}), ...(h.model ? { model: h.model } : {}) };
    if (h.backend === 'guardian') payload.timeoutMs = 300000;
    const t0 = Date.now();
    const r = await _postJson(`${RA.COPILOT_URL}/api/prompt`, payload, 310000);
    const j = r.json || {};
    const ok = !(r.status >= 400 || r.status === 0 || j.ok === false || typeof j.text !== 'string' || !j.text.trim());
    const error = ok ? null : (j.error || (r.status ? `copilot answered ${r.status}` : 'no answer'));
    const cls = ok ? null : PR.classify({ ok: false, error, text: j.text });
    tried.push({ provider: h.provider, model: h.model || null, ok, class: cls, ms: Date.now() - t0 });
    _postJson(`${RA.COPILOT_URL}/api/route/outcome`, { provider: h.provider, kind: jobType, ok, class: cls, ms: Date.now() - t0, error, policy }, 5000).catch(() => {});
    if (ok) return { ok: true, text: j.text, by: h.provider, model: h.model || null, route: tried, why: h.why, ...(routeNote ? { note: routeNote } : {}) };
    if (!PR.shouldFallback(cls, policy)) break;
  }
  const last = tried[tried.length - 1];
  return { ok: false, error: `no model answered (${tried.map(t => `${t.provider}${t.class ? `: ${t.class}` : ''}`).join(' → ')})`, route: tried, ...(routeNote ? { note: routeNote } : {}), lastClass: last && last.class };
}
/** §CT2 0.39.348 — a later verdict on a model's work (its test failed or passed, its draft dismissed or accepted) goes to
 *  copilot's door, so the learned order learns what a model is up to, not only when it crashes. Fire and forget. */
function _verdict(provider, kind, ok, cls = null, why = null) {
  if (!provider || !kind) return;
  try { const RAx = _require('../../lib/repo-agent.js'); _postJson(`${RAx.COPILOT_URL}/api/route/outcome`, { provider, kind, ok: !!ok, class: ok ? null : cls, error: why, verdict: true, policy: _routingPolicy() }, 5000).catch(() => {}); } catch (_) {}
}
/** _builtBy(chunk) — the provider (with its model) whose answer built this chunk: the last ok hop of its route */
function _builtBy(c) { if (!c) return null; const ok = (c.route || []).filter(h => h.outcome === 'ok').pop(); return (ok && ok.provider) || null; }
function _workshopGet(WS, id) { return loadTable(WS.TABLE).find(r => r.uuid === id) || null; }

// §0.39.298 AR2 — ARCHITECT's helpers (idearium/lib/architect.js holds the model; these hold loom, the store and repos)
let _arMod = null;
async function _architect() {
  if (_arMod) return _arMod;
  const AR = await import('../lib/architect.js');
  AR.setAsk((prompt, { sessionUuid } = {}) => _agentAsk(prompt, { channel: 'idearium-architect', sessionId: `architect-${sessionUuid || 'x'}` }));
  _arMod = AR;
  return AR;
}
/** loom's registry + the component store as one index, rebuilt only when either file changes (the registry is 6 MB) */
let _arIdx = null, _arIdxKey = null;
function _architectIndex(AR) {
  const fs = _require('fs'), path = _require('path');
  const regPath = process.env.NEXUS_LOOM_REGISTRY || path.resolve(path.dirname(_require('url').fileURLToPath(import.meta.url)), '../../loom/data/registry.json');
  const CS = _require('../../lib/component-store.js');
  const storeIdx = path.join(CS.storeDir(), 'index.json');
  const mt = (f) => { try { return fs.statSync(f).mtimeMs; } catch (_) { return 0; } };
  const key = `${regPath}|${mt(regPath)}|${storeIdx}|${mt(storeIdx)}`;
  if (_arIdx && _arIdxKey === key) return _arIdx;
  let registry = [], regError = null;
  try { registry = Object.values(JSON.parse(fs.readFileSync(regPath, 'utf8')).component || {}); }
  catch (e) { regError = `loom's registry did not load (${regPath}): ${e.message}`; }
  const stored = CS.list().map(c => { const m = CS.manifest(c.id) || {}; return { id: c.id, path: c.path, latest: c.latest, purpose: m.purpose || '', failed: !!m.failedVerification }; })
    .filter(c => !c.failed);   // §0.39.291 — a version that failed verification is never reused
  _arIdx = AR.makeIndex({ registry, stored }); _arIdx.regError = regError; _arIdx.regPath = regPath;
  _arIdxKey = key;
  return _arIdx;
}
function _architectGet(AR, id) { return loadTable(AR.TABLE).find(r => r.uuid === id) || null; }
/** an architecture as the page reads it: the record, its analysis against what exists, and the index's size */
function _architectView(AR, a) {
  const idx = _architectIndex(AR);
  return { architecture: a, analysis: AR.analyse(a, idx), index: { ...idx.counts, ...(idx.regError ? { error: idx.regError } : {}) } };
}
/** a repo's spec files: *.spec under spec/ or specs/ (or at its root), phasemaps left out — the Spec tab's set */
function _workshopSpecFiles(repo) {
  try {
    const m = getSpecEngine().loadSpec(repo.specUuid || repo.promotedFromSpec);
    return m.chunks.filter(c => c.status !== 'removed' && c.realPath && /^(?:(?:spec|specs)\/[^/]+|[^/]+)\.spec$/.test(c.realPath) && !/phase-?map/i.test(c.realPath)).map(c => c.realPath);
  } catch (_) { return []; }
}
function _postJson(url, payload, timeoutMs) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch (e) { return resolve({ status: 0, json: { error: `bad url: ${e.message}` } }); }
    const data = JSON.stringify(payload);
    const rq = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (rs) => {
      let b = ''; rs.on('data', c => b += c);
      rs.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) {} resolve({ status: rs.statusCode, json: j || { error: `unparseable answer (${b.slice(0, 120)})` } }); });
    });
    rq.on('error', (e) => resolve({ status: 0, json: { error: `copilot unreachable — ${e.message}` } }));
    rq.on('timeout', () => { rq.destroy(); resolve({ status: 0, json: { error: 'the agent did not answer in time' } }); });
    rq.write(data); rq.end();
  });
}

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
    if (!d || d.ok === false || !Array.isArray(d.models)) return { ok: false, error: (d && d.error) || 'Ollama did not answer (the bridge reached it and got nothing)', models: [], active: d && d.active || null };
    return { ok: true, models: d.models, active: d.active || null };
  } catch (e) { return { ok: false, error: `ollama bridge unreachable: ${e.message}`, models: [], active: null }; }
}

// §0.39.286 RG2 — the routing.* config as a lib/pipeline-routing policy (defaults when the config cannot be read)
function _routingPolicy(overrides = {}) {
  const PR = _require('../../lib/pipeline-routing.js');
  let cfg = {};
  try { cfg = (getIdeariumConfig() || {}).routing || {}; } catch (_) { /* defaults */ }
  return PR.policyFrom(cfg, overrides);
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
          // §0.39.271 V1 — this repo's branch, newest first: without it versionium returned
          // the FIRST 200 repo commits in store order, and past 200 a repo's newer snapshots
          // were never listed (a repo looked unversioned and got a second baseline).
          const h = await _vcall('GET', `/api/versionium/history?system=${encodeURIComponent(SNAPSHOT_SYSTEM)}&branch=${encodeURIComponent('repo-' + repoUuid)}&n=1000`);
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
    // §0.39.265 — a spec-engine manifest is only ALSO an IdeaOS spec when one was made
    // for it; emitting the update for one that was not logged
    // "[IdeaOS][ERROR] op=spec.update reason=spec not found" at the end of every build.
    if (typeof os.spec !== 'function' || os.spec(manifest.uuid)) {
      os.emit('idearium.spec.update', { uuid: manifest.uuid, fields: { phase: 'complete' } });
    }
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
  'cos.testenv.status': CAPS.READ_IDEAS,
  'history.import.status': CAPS.READ_IDEAS,
  'repo.worksurface': CAPS.READ_IDEAS,
  'repo.architecture': CAPS.READ_IDEAS,
  'repo.architecture.write': CAPS.WRITE_IDEAS,
  'history.import.start':  CAPS.ADMIN,    // writes commits and refs into the NEXUS checkout (never its current branch)
  'history.import.upload': CAPS.ADMIN,
  'spec-library.import':  CAPS.WRITE_IDEAS,   // §0.39.290 IL1
  'void.field':       CAPS.READ_IDEAS,   // §0.39.295 the spatial void
  'void.idea.show':   CAPS.READ_IDEAS,
  'void.idea.create': CAPS.WRITE_IDEAS,
  'void.idea.update': CAPS.WRITE_IDEAS,
  'void.echo':        CAPS.WRITE_IDEAS,   // asks the agent; stores an echo beside the idea, never in it
  'void.spec':        CAPS.WRITE_IDEAS,
  'void.collide':     CAPS.WRITE_IDEAS,
  'void.echo.decide': CAPS.WRITE_IDEAS,
  'void.spark.idea':  CAPS.WRITE_IDEAS,
  'workshop.list':    CAPS.READ_IDEAS,   // §0.39.294 SW1
  'workshop.sources': CAPS.READ_IDEAS,
  'workshop.show':    CAPS.READ_IDEAS,
  'workshop.create':  CAPS.WRITE_IDEAS,
  'workshop.update':  CAPS.WRITE_IDEAS,
  'workshop.feed':    CAPS.WRITE_IDEAS,   // asks the agent; stores proposals, never section text
  'workshop.decide':  CAPS.WRITE_IDEAS,
  'workshop.save':    CAPS.WRITE_IDEAS,   // writes spec/<name>.spec into a repo (makes the repo when there is none)
  'architect.list':     CAPS.READ_IDEAS,   // §0.39.298 AR2
  'architect.registry': CAPS.READ_IDEAS,
  'architect.show':     CAPS.READ_IDEAS,
  'architect.create':   CAPS.WRITE_IDEAS,
  'architect.update':   CAPS.WRITE_IDEAS,
  'architect.draft':    CAPS.WRITE_IDEAS,   // asks the agent; stores proposals, never components
  'architect.decide':   CAPS.WRITE_IDEAS,
  'architect.save':     CAPS.WRITE_IDEAS,   // writes spec/<name>.architecture.yaml beside the spec
  'spec-library.to-repo': CAPS.WRITE_IDEAS,  // §0.39.292 IL2 — makes a repo and writes its .spec file
  'spec-library.list':    CAPS.READ_IDEAS,    // writes a dropped zip into the data root's history-import inbox
  'cos.testenv.setup':  CAPS.ADMIN,       // installs software (QEMU via winget) and writes a VM image
  'cos.install.status': CAPS.READ_IDEAS,
  'cos.install':        CAPS.ADMIN,       // installs software on the host (winget / brew / apt), only on a click
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
  'routing.show':     CAPS.READ_IDEAS,
  'routing.plan':     CAPS.READ_IDEAS,
  'routing.learned':  CAPS.READ_IDEAS,
  'ollama.check':     CAPS.READ_IDEAS, 'ollama.check.ask': CAPS.WRITE_IDEAS,   // §CT4
  'repo.agent.route': CAPS.READ_IDEAS,   // §CT3
  'config.set':       CAPS.WRITE_IDEAS,
  'routing.breaker.reset': CAPS.WRITE_IDEAS,
  'config.reset':     CAPS.WRITE_IDEAS,
  'settings.console': CAPS.READ_IDEAS,
  'settings.console.repo': CAPS.READ_IDEAS,
  'economy.get': CAPS.READ_IDEAS, 'economy.set': CAPS.WRITE_IDEAS, 'economy.view': CAPS.READ_IDEAS,   // §0.39.281 EC8
  // §0.39.280 — build surface
  'repo.files.state': CAPS.READ_IDEAS, 'repo.deviation.get': CAPS.READ_IDEAS, 'repo.deviation.recalc': CAPS.WRITE_IDEAS,
  'repo.environment.get': CAPS.READ_IDEAS, 'repo.environment.set': CAPS.WRITE_IDEAS, 'repo.environment.setup': CAPS.ADMIN,
  'repo.spec.plan.get': CAPS.READ_IDEAS, 'repo.spec.plan': CAPS.WRITE_IDEAS, 'repo.spec.build': CAPS.WRITE_IDEAS,
  'repo.plan': CAPS.READ_IDEAS, 'repo.file.manage': CAPS.WRITE_IDEAS,
  // §0.39.302 PR1 — the delivery checker. A check RUNS the repo's own commands and app, so it is ADMIN, as environment setup is.
  'repo.deliver.check': CAPS.ADMIN, 'repo.deliver.last': CAPS.READ_IDEAS, 'repo.deliver.conditions': CAPS.WRITE_IDEAS,
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
    // §0.39.286 RG2 — the pipeline's routing and fallback policy (lib/pipeline-routing.js); set it through POST /api/config routing.*
    ['GET',    ['api','routing'],         'routing.show'],
    ['GET',    ['api','routing','plan'],  'routing.plan'],
    ['GET',    ['api','routing','learned'], 'routing.learned'],   // §0.39.287 what each model/provider has done per chunk type
    ['GET',    ['api','ollama','check'], 'ollama.check'],          // §CT4 0.39.350 — installed models, each caller's route
    ['POST',   ['api','ollama','check','ask'], 'ollama.check.ask'], // §CT4 — one model asked a one-line question through copilot
    ['POST',   ['api','routing','breaker','reset'], 'routing.breaker.reset'],
    // §0.39.279 — the settings console (ui/settings.html): every idearium, compartment and agent setting in one read.
    // Writes go to the routes that already own each setting (config, agent/settings, agent/blocks, desktop).
    ['POST',   ['api','config','reset'],              'config.reset'],
    ['GET',    ['api','settings','console'],          'settings.console'],
    // §0.39.281 EC8 — the provider economy lives in guardian (lib/economy/*, guardian/lib/economy-guard.js); the settings
    // console reaches it through here, same-origin — a proxy, not a second copy (§10.1)
    ['GET',    ['api','economy'],                     'economy.get'],
    ['POST',   ['api','economy'],                     'economy.set'],
    ['GET',    ['api','economy',':what'],             'economy.view'],
    ['GET',    ['api','settings','console',':uuid'],  'settings.console.repo'],
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
    // §0.39.265 — a finished document spec → a code spec (one chunk per real file)
    ['POST',   ['api','spec-engine','specs',':uuid','codegen'],    'speceng.codegen'],
    ['POST',   ['api','spec-engine','specs',':uuid','chunk',':chunkUuid','complete'], 'speceng.chunk.complete'],
    ['POST',   ['api','spec-engine','specs',':uuid','chunk',':chunkUuid','fail'],     'speceng.chunk.fail'],
    // §BUILT 2026-09-03 — per-chunk agent reassignment, PENDING chunks only
    // (spec-engine/index.js's setChunkAgent enforces this, not this route).
    ['POST',   ['api','spec-engine','specs',':uuid','chunk',':chunkUuid','agent'],    'speceng.chunk.setAgent'],
    ['GET',    ['api','agent-providers'],                                               'agent.providers'],   // §0.39.267 — the one list
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
    // §0.39.285 (nexus-14 fork D0) — per-file versions (versionium files layer) for the Files tab's Manage menu
    ['GET',    ['api','repos',    ':uuid','file','versions'], 'repo.file.versions'],
    ['GET',    ['api','repos',    ':uuid','file','version'],  'repo.file.version'],
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
    // §0.39.302 PR1 — the delivery checker (idearium/repo/proof-run.js)
    ['POST',   ['api','repos',    ':uuid','deliver','check'],      'repo.deliver.check'],
    ['GET',    ['api','repos',    ':uuid','deliver','check'],      'repo.deliver.last'],
    ['POST',   ['api','repos',    ':uuid','deliver','conditions'], 'repo.deliver.conditions'],
    ['GET',    ['api','repos',    ':uuid','chunks',':chunkId'], 'repo.chunks.get'],
    ['GET',    ['api','repos',    ':uuid','symbols'],       'repo.symbols'],
    // §24-26 graph (MCO1) — idearium/spec/idearium.repo-graph.spec
    ['GET',    ['api','repos',    ':uuid','graph'],          'repo.graph'],
    // §0.39.279 — the repo's VM as a desktop (cos/workspace via lib/cos-bridge.js) and its branches
    ['GET',    ['api','repos',    ':uuid','desktop'],        'repo.desktop.status'],
    ['POST',   ['api','repos',    ':uuid','desktop'],        'repo.desktop.start'],
    ['DELETE', ['api','repos',    ':uuid','desktop'],        'repo.desktop.stop'],
    ['GET',    ['api','repos',    ':uuid','branches'],       'repo.branches'],
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
    // §0.39.271 P2/P3 — the Phases manager (Roadmap + Phasemap in one): every phasemap
    // form, one status vocabulary, add, and build a phase (Versionium snapshot first).
    // §0.39.271 S1 — the living model: the repo's spec/ .spec files, parsed (?path= one file)
    ['GET',    ['api','repos',    ':uuid','living-spec'],           'repo.living-spec'],
    ['GET',    ['api','repos',    ':uuid','phases'],                'repo.phases.get'],
    ['GET',    ['api','repos',    ':uuid','phases','runs'],         'repo.phases.runs'],
    ['POST',   ['api','repos',    ':uuid','phases','status'],       'repo.phases.status'],
    ['POST',   ['api','repos',    ':uuid','phases','add'],          'repo.phases.add'],
    ['POST',   ['api','repos',    ':uuid','phases','build'],        'repo.phases.build'],
    // §0.39.280 — the build surface (docs/2026-09-29-build-surface-phasemap.spec BS7; logic in api/build-surface.js)
    ['GET',    ['api','repos',    ':uuid','files','state'],         'repo.files.state'],
    ['GET',    ['api','repos',    ':uuid','deviation'],             'repo.deviation.get'],
    ['POST',   ['api','repos',    ':uuid','deviation'],             'repo.deviation.recalc'],
    ['GET',    ['api','repos',    ':uuid','environment'],           'repo.environment.get'],
    ['POST',   ['api','repos',    ':uuid','environment'],           'repo.environment.set'],
    ['POST',   ['api','repos',    ':uuid','environment','setup'],   'repo.environment.setup'],
    ['GET',    ['api','repos',    ':uuid','spec','plan'],           'repo.spec.plan.get'],
    ['POST',   ['api','repos',    ':uuid','spec','plan'],           'repo.spec.plan'],
    ['POST',   ['api','repos',    ':uuid','spec','build'],          'repo.spec.build'],
    ['GET',    ['api','repos',    ':uuid','plan'],                  'repo.plan'],
    ['POST',   ['api','repos',    ':uuid','manage'],                'repo.file.manage'],
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
    ['GET',    ['api','repos',    ':uuid','agent','route'],   'repo.agent.route'],   // §CT3 — which model copilot's door would choose
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
    ['GET',    ['api','repos',    ':uuid','worksurface'],           'repo.worksurface'],
    ['GET',    ['api','repos',    ':uuid','architecture'],          'repo.architecture'],         // §0.39.284 W7 — the repo's component registry + wiring map
    ['POST',   ['api','repos',    ':uuid','architecture'],          'repo.architecture.write'],   // §0.39.284 W3 — changed files as diffs + tools
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
    // §0.39.271 V2 — all of NEXUS in versionium: every system repo's versions, and one
    // snapshot of every system (the nexus repo's own Versionium tab).
    ['GET',    ['api','nexus-self','versions'],                       'nexus-self.versions'],
    ['POST',   ['api','nexus-self','snapshot'],                       'nexus-self.snapshot'],
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
    // §0.39.291 PV1/PV3 — does the code work? one verification; and the proof run (build → verify → repair, N rounds)
    ['POST',   ['api','repos',    ':uuid','verify'],                'repo.verify'],
    ['POST',   ['api','repos',    ':uuid','prove'],                 'repo.prove'],
    ['GET',    ['api','repos',    ':uuid','prove'],                 'repo.prove.status'],
    ['POST',   ['api','repos',    ':uuid','prove','cancel'],        'repo.prove.cancel'],
    // §0.39.266 — the registry harness (lib/registry-harness.js): what a repo agent navigates instead of injected code
    // §0.39.266 (C1) — the component store (lib/component-store.js)
    ['GET',    ['api','components'],                                 'components.list'],
    ['GET',    ['api','components',':id'],                           'components.get'],
    ['POST',   ['api','components',':id','invalidate'],              'components.invalidate'],
    // §0.39.273 CB4 — the codebase surface (idearium/repo/code-api.js): overview · tree · search · grep · chunk ·
    // outline · read · definition · changes (GET) and edit · write · delete · move · batch · check (POST). Reads over
    // lib/code-intel's cards + search index; every write an .inject (lib/code-edit.js → lib/repo-inject.js).
    ['GET',    ['api','repos',    ':uuid','code',':op'],            'repo.code'],
    ['POST',   ['api','repos',    ':uuid','code',':op'],            'repo.code'],
    ['GET',    ['api','repos',    ':uuid','harness','find'],        'repo.harness.find'],
    ['GET',    ['api','repos',    ':uuid','harness','card'],        'repo.harness.card'],
    ['GET',    ['api','repos',    ':uuid','harness','read'],        'repo.harness.read'],
    ['POST',   ['api','repos',    ':uuid','harness','write'],       'repo.harness.write'],
    ['POST',   ['api','repos',    ':uuid','harness','test'],        'repo.harness.test'],
    ['GET',    ['api','repos',    ':uuid','run','capabilities'],    'repo.run.capabilities'],
    ['GET',    ['api','repos',    ':uuid','run','options'],         'repo.run.options'],   // §0.39.261 — the COS run menu (lib/cos-run.js)
    // §0.39.264 — the COS test VM: what is there, and setting it up from the run menu (cos/testenv/setup-job.js)
    ['GET',    ['api','cos','testenv'],                          'cos.testenv.status'],
    // §0.39.283 N30 — importing NEXUS history from release zips (lib/history-import-job.js → cli/import-history.js)
    ['GET',    ['api','history','import'],                       'history.import.status'],
    ['POST',   ['api','history','import'],                       'history.import.start'],
    ['PUT',    ['api','history','import','upload'],              'history.import.upload'],
    // §0.39.290 IL1 — James's spec library: PUT the zip's raw bytes (?name=&dryRun=1); each unique document an idea + spec
    ['PUT',    ['api','spec-library','import'],                  'spec-library.import'],
    ['GET',    ['api','spec-library'],                           'spec-library.list'],
    // §0.39.295 — the spatial void (idearium/lib/void.js, ui/void.html): James's ideas, the two dials, the echoes
    ['GET',    ['api','void'],                                   'void.field'],
    ['POST',   ['api','void','idea'],                            'void.idea.create'],
    ['GET',    ['api','void','idea',':uuid'],                    'void.idea.show'],
    ['POST',   ['api','void','idea',':uuid'],                    'void.idea.update'],
    ['POST',   ['api','void','idea',':uuid','echo'],             'void.echo'],
    ['POST',   ['api','void','idea',':uuid','spec'],             'void.spec'],
    ['POST',   ['api','void','collide'],                         'void.collide'],
    ['POST',   ['api','void','echo',':id'],                      'void.echo.decide'],
    ['POST',   ['api','void','spark',':uuid','idea'],            'void.spark.idea'],
    // §0.39.294 SW1 — the spec workshop (idearium/lib/workshop.js): a spec made by hand or with the agent, saved into
    // the repo's spec folder (the Spec tab's living model)
    ['GET',    ['api','workshop'],                               'workshop.list'],
    ['POST',   ['api','workshop'],                               'workshop.create'],
    ['GET',    ['api','workshop','sources'],                     'workshop.sources'],
    ['GET',    ['api','workshop',':id'],                         'workshop.show'],
    ['POST',   ['api','workshop',':id'],                         'workshop.update'],
    ['POST',   ['api','workshop',':id','feed'],                  'workshop.feed'],
    ['POST',   ['api','workshop',':id','proposal',':pid'],       'workshop.decide'],
    ['POST',   ['api','workshop',':id','save'],                  'workshop.save'],
    // §0.39.298 AR2 — ARCHITECT (idearium/lib/architect.js): the spec laid out as components, matched against loom's
    // registry and the component store, saved beside the spec as spec/<name>.architecture.yaml
    ['GET',    ['api','architect'],                              'architect.list'],
    ['POST',   ['api','architect'],                              'architect.create'],
    ['GET',    ['api','architect','registry'],                   'architect.registry'],
    ['GET',    ['api','architect',':id'],                        'architect.show'],
    ['POST',   ['api','architect',':id'],                        'architect.update'],
    ['POST',   ['api','architect',':id','draft'],                'architect.draft'],
    ['POST',   ['api','architect',':id','proposal',':pid'],      'architect.decide'],
    ['POST',   ['api','architect',':id','save'],                 'architect.save'],
    // §0.39.292 IL2 — a library document into the pipeline: its spec becomes a repo with a real spec/<slug>.spec in it
    ['POST',   ['api','spec-library',':key','to-repo'],          'spec-library.to-repo'],
    ['POST',   ['api','cos','testenv','setup'],                  'cos.testenv.setup'],
    ['GET',    ['api','cos','install'],                          'cos.install.status'],   // §0.39.265
    ['POST',   ['api','cos','install'],                          'cos.install'],
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
    // 0.39.272 — the context atlas (lib/context-atlas.js): every memory system and graph, one door. The repo-scoped
    // search adds this repo's import graph and its agent's learned memory.
    ['GET',    ['api','context',  'directory'],                     'context.directory'],
    ['GET',    ['api','context',  'search'],                        'context.search'],
    ['GET',    ['api','context',  'get'],                           'context.get'],
    ['GET',    ['api','repos',    ':uuid','context'],               'repo.context.search'],
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
    // §0.39.265 — James: "what about push pull, cd ci, ssh, and git support?"
    // Real git on the repo's materialized folder (lib/repo-git.js), with the
    // compartment's SSH key aliases (cos/ci/keys.js) and its git_token secret.
    ['GET',    ['api','repos',    ':uuid','git'],               'repo.git.status'],
    ['POST',   ['api','repos',    ':uuid','git','remote'],      'repo.git.remote'],
    ['POST',   ['api','repos',    ':uuid','git','commit'],      'repo.git.commit'],
    ['POST',   ['api','repos',    ':uuid','git','push'],        'repo.git.push'],
    ['POST',   ['api','repos',    ':uuid','git','pull'],        'repo.git.pull'],
    ['POST',   ['api','repos',    ':uuid','git','keygen'],      'repo.git.keygen'],
    ['POST',   ['api','git','clone'],                           'git.clone'],
    // §0.39.265 — James: "push pull for the compartments remotely." A compartment's
    // remotes (a folder / synced drive, or user@host:path over ssh) — lib/cos-remote.js.
    ['GET',    ['api','cos','compartments'],                                'cos.compartments.list'],
    ['GET',    ['api','cos','compartments',':cid','remotes'],               'cos.remote.list'],
    ['POST',   ['api','cos','compartments',':cid','remotes'],               'cos.remote.add'],
    ['DELETE', ['api','cos','compartments',':cid','remotes',':name'],       'cos.remote.remove'],
    ['GET',    ['api','cos','compartments',':cid','remotes',':name','status'], 'cos.remote.status'],
    ['POST',   ['api','cos','compartments',':cid','remotes',':name','push'],   'cos.remote.push'],
    ['POST',   ['api','cos','compartments',':cid','remotes',':name','pull'],   'cos.remote.pull'],
    ['POST',   ['api','cos','remote','browse'],                              'cos.remote.browse'],
    ['POST',   ['api','cos','remote','clone'],                               'cos.remote.clone'],
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
    // §0.39.279 — James: "can you have a full enterprise grade settings menu that encompassed all the idearium compartment
    // and agent settings." One read for the console: idearium's layered config (with where each value came from), and
    // every repo with its agent, prompt blocks, hat, compartment, branch and desktop. Each source is read on its own; one
    // that fails is named in `blind`, never shown as empty.
    case 'settings.console':
    case 'settings.console.repo': {
      const blind = [];
      const safe = (what, fn, fb = null) => { try { return fn(); } catch (e) { blind.push({ source: what, error: e.message }); return fb; } };
      const rows = safe('repos', () => ((getRepoLayer().repos && getRepoLayer().repos.repos) || []).filter(r => r.status !== 'archived'), []);
      const RA = safe('repo-agent', () => _require('../../lib/repo-agent.js'));
      const RH = safe('repo-hat', () => _require('../../lib/repo-hat.js'));
      const RI = safe('repo-inject', () => _require('../../lib/repo-inject.js'));
      const PB = safe('prompt-blocks', () => _require('../../lib/repo-prompt-blocks.js'));
      const cosBridge = safe('cos', () => _require('../../lib/cos-bridge.js'));
      const brief = (r) => ({ uuid: r.uuid, name: r.name, source: r.source || null, nexusSelf: !!r.nexusSelf, immutable: !!r.immutable,
        compartmentId: r.compartmentId || null, branchOf: r.branchOf || null, branch: r.branch || null,
        provider: RA ? safe(`provider:${r.uuid}`, () => RA.getProvider(r.uuid)) : null,
        settingsFrom: RH ? safe(`link:${r.uuid}`, () => RH.originOf(r.uuid)) : null });
      if (action === 'settings.console') {
        const cfg = safe('config', () => describeIdeariumConfig(), { keys: [] });
        return ok(res, { config: cfg, repos: rows.map(brief), providers: RA ? safe('providers', () => RA.providers(), []) : [], toolScopes: RA ? RA.TOOL_SCOPES : [], blind });
      }
      const repo = rows.find(r => r.uuid === params.uuid) || getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const hat = RH ? safe('hat', () => RH.getRepoHat(repo.uuid)) : null;
      const comp = cosBridge && repo.compartmentId ? safe('compartment', () => cosBridge.getCompartment(repo.compartmentId)) : null;
      return ok(res, {
        repo: brief(repo),
        agent: RA ? safe('agent', () => ({ injectMode: RI ? RI.modeFor(repo) : null, modes: repo.nexusSelf ? ['review'] : (RI ? RI.MODES : []), ...RA.settingsView(repo.uuid) })) : null,
        blocks: PB ? safe('blocks', () => ({ list: PB.getBlocks(repo.uuid), placeholders: PB.PLACEHOLDERS, version: PB.VERSION })) : null,
        hat: hat ? { uuid: hat.uuid || null, name: hat.name || null, baseAgent: hat.baseAgent || null, model: hat.model || null, toolScope: hat.toolScope || [], personaChars: String(hat.personaPrompt || '').length, persona: String(hat.personaPrompt || '').slice(0, 4000) } : null,
        compartment: comp ? { id: comp.id, name: comp.name, state: comp.state, purpose: comp.purpose || '', parentId: comp.parentId || null, root: comp.fs && comp.fs.root } : null,
        desktop: cosBridge && repo.compartmentId ? safe('desktop', () => cosBridge.desktop(repo.compartmentId, { action: 'status' })) : null,
        branches: repo.branchOf ? null : rows.filter(r => r.branchOf === repo.uuid).map(r => ({ uuid: r.uuid, name: r.name, branch: r.branch || null })),
        blind,
      });
    }

    case 'config.get':
      try { return ok(res, { config: getIdeariumConfig() }); }
      catch (e) { return err(res, 500, e.message); }

    // §0.39.279 — the console's "back to default / file": drops the runtime override for one key
    case 'config.reset': {
      if (!body || !body.key) return err(res, 400, 'key required');
      try { const event = resetIdeariumConfig(body.key, { actor: body.actor || 'user' }); return ok(res, { event, config: getIdeariumConfig() }); }
      catch (e) { return err(res, 400, e.message); }
    }
    case 'config.set': {
      const { key, value, actor } = body || {};
      if (!key) return err(res, 400, 'key required');
      try {
        const event = setIdeariumConfig(key, value, { actor: actor || 'user' });
        return ok(res, { event, config: getIdeariumConfig() });
      } catch (e) { return err(res, 400, e.message); }
    }

    // §0.39.286 RG2 — what the build pipeline will do: the policy, each provider's breaker, the route per block
    case 'routing.show': case 'routing.plan': {
      const PR = _require('../../lib/pipeline-routing.js');
      const policy = _routingPolicy();
      const se = await import('../spec-engine/index.js');
      if (action === 'routing.plan') {
        const block = query.block ? se.SPEC_SECTIONS.find(b => b.id === query.block) : null;
        if (query.block && !block) return err(res, 404, `no block '${query.block}' — one of: ${se.SPEC_SECTIONS.map(b => b.id).join(', ')}`);
        return ok(res, { policy, ...PR.plan({ preferAgent: query.agent || null, block, policy }) });
      }
      return ok(res, { policy, modes: PR.MODES, classes: PR.CLASSES, breakers: PR.breaker.all(),
        blocks: se.SPEC_SECTIONS.map(b => ({ id: b.id, title: b.title, agent: b.agent, fallback: b.fallback || [], ...PR.plan({ block: b, policy }) })) });
    }
    case 'routing.learned': {
      const PR = _require('../../lib/pipeline-routing.js');
      return ok(res, { policy: _routingPolicy(), learned: PR.learned({ jobType: query.jobType || null }) });
    }
    // §CT4 0.39.350 — James: "make sure ollama is all wired into idearium." (lib/ollama-check.js) The bridge's list of
    // installed models, and every caller's route as copilot's door gives it; a missing bridge or copilot is said.
    case 'ollama.check': {
      const OC = _require('../../lib/ollama-check.js');
      const RA = _require('../../lib/repo-agent.js');
      const policy = _routingPolicy();
      const m = await _ollamaModels();
      const route = async (kind, preferAgent) => {
        const r = await _postJson(`${RA.COPILOT_URL}/api/route`, { kind, preferAgent, policy }, 5000);
        return r.status === 200 && r.json && r.json.ok ? r.json : { ok: false, error: (r.json && r.json.error) || (r.status ? `copilot answered ${r.status}` : `copilot unreachable at ${RA.COPILOT_URL}`) };
      };
      const callers = await OC.routes({ route, installed: m.ok ? m.models : null, defaultProvider: RA.defaultProvider() });
      return ok(res, { bridge: { ok: m.ok, error: m.error || null, active: m.active || null }, models: m.models || [], callers, probe: OC.PROBE,
        copilot: callers.every(c => !c.ok) ? { ok: false, error: callers[0] && callers[0].error } : { ok: true, url: RA.COPILOT_URL } });
    }
    case 'ollama.check.ask': {
      if (!body || !body.model) return err(res, 400, 'model is required');
      const OC = _require('../../lib/ollama-check.js');
      const RA = _require('../../lib/repo-agent.js');
      return ok(res, await OC.ask({ model: String(body.model), post: (payload) => _postJson(`${RA.COPILOT_URL}/api/prompt`, payload, 130000) }));
    }
    case 'routing.breaker.reset': {
      const PR = _require('../../lib/pipeline-routing.js');
      PR.breaker.reset((body && body.provider) || null);
      return ok(res, { reset: (body && body.provider) || 'all', breakers: PR.breaker.all() });
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
      return ok(res, { promoted: true, idea: promotedIdea, compartment: true, eventId: ev.uuid });
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
      return ok(res, { admitted: true, ideaUuid: idea.uuid });
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
      if (snap && snap.error) return err(res, 502, snap.error);   // §0.39.300 VX1 — versionium unreachable, said as such
      if (!snap) return err(res, 404, `snapshot not found: ${params.uuid}`);
      return ok(res, { snapshot: snap });
    }

    case 'snapshot.diff': {
      const diff = await os.diffSnapshots(params.a, params.b);
      if (diff?.error) return err(res, diff.status === 404 ? 404 : 502, diff.error);   // §0.39.300 VX1 — versionium down is a 502, a missing commit a 404
      return ok(res, { diff });
    }

    case 'snapshot.restore': {
      const result = await os.restoreSnapshot(params.uuid, { author: 'api' });
      if (result?.error) return err(res, result.status === 404 ? 404 : result.status ? 502 : 400, result.error);   // §0.39.300 VX1
      return ok(res, { restored: result.commitId, stashCommitId: result.stashCommitId, ideas: result.ideas, specs: result.specs, gaps: result.gaps });
    }

    // ── Repos ──────────────────────────────────────────────────────────────
    // Each idea is a repo, not a single hardcoded "Nexus folder". Nexus
    // itself is just the first ingested repo, not a special case.

    case 'repo.list': {
      try { for (const r of ((getRepoLayer().repos && getRepoLayer().repos.repos) || [])) if (r.source === 'spec.codegen') _linkCodeRepo(r); } catch (_) {}   // §0.39.276 — code repos made before the link existed
      return ok(res, { repos: getRepoLayer().list(query) });
    }

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
      const before = getRepoLayer().get(params.uuid);
      const result = getRepoLayer().archive(params.uuid);
      if (result.error) return err(res, result.code === 'IMMUTABLE' ? 409 : 404, result.error);
      const original = before ? _codeRepoRetired(before) : null;   // §0.39.280 BS15
      return ok(res, { ...result, ...(original ? { original } : {}) });
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
      _deviationAfter(params.uuid, 'files');
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
      _deviationAfter(params.uuid, 'files');
      return ok(res, result);
    }

    // §0.39.285 (nexus-14 fork D0) — James: "per file versioning, add it to the manage button menu." Every repo snapshot already records
    // each file (versionium/lib/files.js); these read one path's history and one version's bytes. Restore = the UI
    // writes the old content back through repo.file.write (one write path, so it is itself versioned next snapshot).
    case 'repo.file.versions': case 'repo.file.version': {
      if (!getRepoLayer().get(params.uuid)) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!query.path) return err(res, 400, 'path required (?path=...)');
      const q = new URLSearchParams({ repository: params.uuid, path: query.path });
      if (action === 'repo.file.versions') {
        q.set('limit', String(Math.min(parseInt(query.limit, 10) || 100, 500)));
        const r = await _versionium('GET', `/api/versionium/files/versions?${q}`);
        if (!r.ok) return err(res, r.status === 400 ? 400 : 502, r.error);
        return ok(res, { repoUuid: params.uuid, path: query.path, versions: r.data.versions || r.data.list || [] });
      }
      if (!query.commitId) return err(res, 400, 'commitId required');
      q.set('commitId', query.commitId);
      const r = await _versionium('GET', `/api/versionium/files/content?${q}`);
      if (!r.ok) return err(res, r.status === 404 || r.status === 400 ? 404 : 502, r.error);
      return ok(res, { repoUuid: params.uuid, path: query.path, commitId: query.commitId, sha256: r.data.sha256, bytes: r.data.bytes, content: Buffer.from(r.data.content_b64, 'base64').toString('utf8') });
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
    // §0.39.279 — James: "once its generated, you can open it like a desktop environment". The repo's compartment
    // boots its VM headless (a branch repo's disk is an overlay of its original's); the viewer (ui/desktop.html, noVNC
    // over QEMU's websocket) is opened in Clear Glass. A repo with no compartment, or no base image, is told why.
    case 'repo.desktop.status':
    case 'repo.desktop.start':
    case 'repo.desktop.stop': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!repo.compartmentId) return err(res, 409, 'this repo has no COS compartment — its desktop lives in one');
      const cosBridge = _require('../../lib/cos-bridge.js');
      const act = action.endsWith('start') ? 'start' : action.endsWith('stop') ? 'stop' : 'status';
      const origin = repo.branchOf ? getRepoLayer().get(repo.branchOf) : null;
      const r = cosBridge.desktop(repo.compartmentId, { action: act, workDir: act === 'start' ? _repoDiskDir(params.uuid) : null, name: repo.name,
        originNameOrId: origin && origin.compartmentId,
        ...(() => { const v = (k) => { try { return getIdeariumValue(k); } catch (_) { return undefined; } };   // settings console → desktop.*
          return { ramMB: body.ramMB || v('desktop.ram_mb'), cpus: body.cpus || v('desktop.cpus'), network: body.network || v('desktop.network'),
            login: { user: v('desktop.user') || 'nexus', password: v('desktop.password') || 'nexus' } }; })() });   // §0.39.282 N20
      if (!r.ok) return err(res, r.code === 'NO_DESKTOP_IN_IMAGE' ? 409 : 502, r.error || 'desktop failed', r);   // §0.39.293 DK1
      const p = r.ports || {};
      return ok(res, { ...r, repoUuid: repo.uuid, branchOf: repo.branchOf || null, branch: repo.branch || null,
        viewer: p.wsPort ? `/desktop.html?port=${p.wsPort}&title=${encodeURIComponent(repo.name)}&repo=${encodeURIComponent(repo.uuid)}` : null });
    }
    case 'repo.branches': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      const all = ((getRepoLayer().repos && getRepoLayer().repos.repos) || []).filter(x => x.branchOf === repo.uuid);
      return ok(res, { repoUuid: repo.uuid, worktrees: dir ? _require('../../lib/cos-bridge.js').listBranches(dir) : [],
        repos: all.map(x => ({ uuid: x.uuid, name: x.name, branch: x.branch || null, dir: x.materializeDir || null })) });
    }
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
    // §0.39.302 PR1 — James: "Yes, then I can use idearium to build anything needed" · "shadow space reasoning for the
    // debugging". Are the end-state conditions met? Run them (shadow declared first), write proof/PROOF-REPORT.md.
    // body: { conditions: [{ says, check }], start?: { command, url, readyMs? } }
    case 'repo.deliver.check': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const PR = await import('../repo/proof-run.js');
      // the report and the run go through the repo layer: a repo's working folder is re-materialised from its store
      const writer = (rel, text) => getRepoLayer().writeFile(params.uuid, rel, text, { preserveWhitespace: true });
      const r = await PR.runProof({ repoDir: dir, conditions: body.conditions, start: body.start || null, subject: repo.name || repo.uuid, writer });
      if (!r.ok) return err(res, 400, r.error);
      try { getIdeaOS().emit('idearium.proof-run.settled', { repoUuid: params.uuid, verdict: r.run.verdict, met: r.run.met, total: r.run.total, modes: r.run.modes, report: r.run.files ? r.run.files.report : null }); } catch (_) {}
      return ok(res, { repoUuid: params.uuid, run: r.run });
    }
    case 'repo.deliver.last': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const PR = await import('../repo/proof-run.js');
      const run = await PR.readLastProof(dir, { reader: (rel) => { const f = getRepoLayer().readFile(params.uuid, rel); return f && !f.error ? (f.content ?? f.text ?? null) : null; } });
      return ok(res, { repoUuid: params.uuid, run, note: run ? undefined : 'no delivery check has run for this repo (POST /api/repos/:uuid/deliver/check)' });
    }
    // The agent PROPOSES conditions from a brief; nothing is run, James accepts them. body: { brief }
    case 'repo.deliver.conditions': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!body.brief || String(body.brief).trim().length < 10) return err(res, 400, 'give the acceptance brief (what was promised)');
      const dir = _repoDiskDir(params.uuid);
      let files = []; try { const idx = JSON.parse(fs.readFileSync(path.join(dir, 'indexes', 'files.json'), 'utf8')); files = idx.map(f => f.path); } catch (_) {}
      const PR = await import('../repo/proof-run.js');
      const a = await _agentAsk(PR.proposeConditionsPrompt(body.brief, { files }), { channel: 'idearium-deliver', sessionId: `deliver-${params.uuid}` });
      if (!a || !a.ok) return err(res, 502, `the agent did not answer: ${(a && a.error) || 'no reply'}`);
      const p = PR.parseProposedConditions(a.text);
      if (!p.ok) return err(res, 422, p.error);
      return ok(res, { repoUuid: params.uuid, proposed: p.conditions, errors: p.errors, by: a.by || null, note: 'proposals only — nothing has run; accept them by sending them to deliver/check' });
    }

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
    // §0.39.271 V2 — the nexus repo's Versionium tab: its one file is the index
    // (NEXUS.md); NEXUS's files are versioned per system repo and in the immutable
    // base. This answers with all of them in one read.
    case 'nexus-self.versions': {
      const NS = await import('../repo/nexus-self.js');
      const st = NS.status(getRepoLayer());
      const { SNAPSHOT_SYSTEM, summarizeRepoSnapshots, snapshotBranch } = await import('../repo/snapshot.js');
      const repos = getRepoLayer().list({}).filter(r => r.nexusSelf && r.nexusSelf.role === 'system');
      const byRepo = {};
      for (const r of repos) {
        const hist = await _versionium('GET', `/api/versionium/history?system=${encodeURIComponent(SNAPSHOT_SYSTEM)}&branch=${encodeURIComponent(snapshotBranch(r.uuid))}&n=1000`);
        if (!hist.ok) return err(res, 502, `versionium unreachable: ${hist.error}`);
        byRepo[r.uuid] = hist.data.commits || [];
      }
      const systems = repos.map(r => {
        const snaps = summarizeRepoSnapshots(byRepo[r.uuid], r.uuid);
        const latest = snaps[0] || null;
        return { system: r.nexusSelf.system, repoUuid: r.uuid, name: r.name, fileCount: r.nexusSelf.fileCount || r.fileCount || 0,
          bytes: r.nexusSelf.bytes || null, versions: snaps.length, latest,
          versionError: r.nexusSelf.versionError || null, syncedAt: r.nexusSelf.syncedAt || null };
      }).sort((a, b) => a.system.localeCompare(b.system));
      const totals = { systems: systems.length, versions: systems.reduce((n, x) => n + x.versions, 0),
        files: systems.reduce((n, x) => n + (x.fileCount || 0), 0), unversioned: systems.filter(x => !x.versions).map(x => x.system) };
      return ok(res, { base: { head: st.head || null, history: (st.history || []).slice(-50) }, systems, totals });
    }
    case 'nexus-self.snapshot': {
      const repos = getRepoLayer().list({}).filter(r => r.nexusSelf && r.nexusSelf.role === 'system');
      const only = Array.isArray(body.only) ? new Set(body.only.map(String)) : null;
      const results = [];
      for (const r of repos) {
        if (only && !only.has(r.nexusSelf.system)) continue;
        const x = await _commitRepoSnapshotFor(r.uuid, { message: body.message || `nexus snapshot — ${r.nexusSelf.system}`, causedBy: body.causedBy || 'idearium.nexus-self.snapshot' });
        results.push(x.ok ? { system: r.nexusSelf.system, ok: true, commitId: x.data.commitId, files: x.data.files }
          : { system: r.nexusSelf.system, ok: false, error: x.error, code: x.extra?.code || null });
      }
      const failed = results.filter(x => !x.ok);
      os.emit('idearium.nexus-self.snapshot', { systems: results.length, failed: failed.length });
      return ok(res, { results, failed: failed.length });
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
    // §0.39.264 — James: "i need help setting the vm up." The run menu's "Set up
    // the test VM" starts cos/testenv/provision.js in the background and polls this.
    // §0.39.283 N30 — James: "give copilot a command … import my archives of nexus. have it pull up a drop box ui and
    // run the command". The drop box (ui/archive-import.html) uploads (or names) zips; the import runs as a child
    // process so idearium never blocks; the page polls the status.
    case 'history.import.status':
      return ok(res, _require('../../lib/history-import-job.js').status());
    case 'history.import.start': {
      const HJ = _require('../../lib/history-import-job.js');
      const st = HJ.start({ paths: Array.isArray(body.paths) ? body.paths : [], folder: body.folder || null, dryRun: !!body.dryRun, rebuild: !!body.rebuild, recursive: !!body.recursive });
      os.emit('idearium.history.import', { state: st.state, dryRun: !!body.dryRun, inputs: st.inputs || 0 });
      return st.state === 'failed' ? err(res, 400, (st.result && st.result.error) || 'could not start', st) : ok(res, st);
    }
    // §0.39.290 IL1 — "need a way to import these and convert them." (lib/spec-library.js + idearium/lib/spec-library-import.js)
    case 'spec-library.import': {
      const chunks = []; let size = 0;
      try {
        for await (const c of req) { size += c.length; if (size > 512 * 1024 * 1024) return err(res, 413, 'zip over 512 MB'); chunks.push(c); }
      } catch (e) { return err(res, 400, `upload failed: ${e.message}`); }
      if (!size) return err(res, 400, 'send the zip as the request body (PUT, raw bytes)');
      const { importLibrary } = await import('../lib/spec-library-import.js');
      const se = getSpecEngine();
      const r = await importLibrary({ buf: Buffer.concat(chunks), name: query.name || 'specs.zip', dryRun: query.dryRun === '1' || query.dryRun === 'true', se, os });
      if (!r.ok) return err(res, 400, r.error);
      os.emit('idearium.spec-library.imported', { dryRun: r.dryRun, ...(r.summary || {}), unique: r.stats.unique });
      // the full rows are large; the listing route serves them — the import answers with the counts and what failed
      return ok(res, { dryRun: r.dryRun, upload: r.upload, stats: r.stats, summary: r.summary, skipped: r.skipped, merged: r.merged, failed: r.failed,
        added: r.added.map(x => ({ title: x.title, family: x.family, kind: x.kind, dialect: x.dialect, sections: x.sections, ideaUuid: x.ideaUuid, specUuid: x.specUuid, path: x.paths[0] })) });
    }
    case 'spec-library.list': {
      const { listLibrary } = await import('../lib/spec-library-import.js');
      const rows = listLibrary({ family: query.family || null, kind: query.kind || null });
      return ok(res, { count: rows.length, library: rows.map(({ files, ...r }) => ({ ...r, fileCount: files ? files.length : null })) });
    }
    // ── §0.39.295 — the spatial void ───────────────────────────────────────────────────────────────────────────────
    // James: "Just have the spacial void, with a slider … normal, creative, outside the box, novel, outlier … stable,
    // shaky, risky, dangerous, unstable. with those linked togethe" · "the ideas come from me though not agents".
    case 'void.field': {
      const V = await import('../lib/void.js');
      const now = Date.now();
      const echoes = loadTable(V.ECHO_TABLE);
      const openBy = new Map(); for (const e of echoes) if (e.status === 'open') openBy.set(e.ideaUuid, (openBy.get(e.ideaUuid) || 0) + 1);
      const ideas = (os.db.ideas || []).filter(i => i.phase !== 'archived').map(i => {
        const place = i.void && i.void.x != null ? { x: i.void.x, y: i.void.y } : V.placeFor(i.uuid);
        return { uuid: i.uuid, text: i.text, phase: i.phase, tags: i.tags || [], source: i.source || null, linkedSpec: i.linkedSpec || null,
          createdAt: i.createdAt, updatedAt: i.updatedAt, void: i.void || null, x: place.x, y: place.y, ...V.glow(i, now), echoes: openBy.get(i.uuid) || 0 };
      });
      const sparks = loadTable('idearium_brainstorms').filter(b => !b.promoted).map(b => ({ uuid: b.uuid, text: b.text, ts: b.ts, ...V.placeFor(b.uuid) }));
      return ok(res, { ideas, sparks, creativity: V.CREATIVITY, stability: V.STABILITY });
    }
    case 'void.idea.show': {
      const V = await import('../lib/void.js');
      const idea = os.idea(params.uuid); if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      const echoes = loadTable(V.ECHO_TABLE).filter(e => e.ideaUuid === idea.uuid || e.otherUuid === idea.uuid).sort((a, b) => b.at - a.at);
      return ok(res, { idea, echoes, voice: idea.void ? V.voiceOf(idea.void.creativity, idea.void.stability).name : null });
    }
    case 'void.idea.create': {
      const V = await import('../lib/void.js');
      const ct = V.checkText(body.text, V.MAX_IDEA, 'the idea'); if (ct.error) return err(res, 400, ct.error);
      const text = ct.text;
      const state = V.shapeVoid(null, { creativity: body.creativity, stability: body.stability, held: body.held, x: body.x, y: body.y });
      os.emit('idearium.idea.create', { text, tags: ['void'], source: 'void', void: state });
      const idea = [...os.db.ideas].reverse().find(i => i.source === 'void' && i.text === text);
      if (!idea) return err(res, 500, 'the idea was not created');
      os.emit('idearium.void.idea', { uuid: idea.uuid, creativity: state.creativity, stability: state.stability, tension: state.tension });
      return ok(res, { idea });
    }
    case 'void.idea.update': {
      const V = await import('../lib/void.js');
      const idea = os.idea(params.uuid); if (!idea) return err(res, 404, `idea not found: ${params.uuid}`);
      const fields = {};
      if (typeof body.text === 'string' && body.text.trim()) { const ct = V.checkText(body.text, V.MAX_IDEA, 'the idea'); if (ct.error) return err(res, 400, ct.error); }
      const textChanged = typeof body.text === 'string' && body.text.trim() && body.text.trim() !== idea.text;
      if (textChanged) fields.text = body.text.trim();
      fields.void = V.shapeVoid(idea.void, { creativity: body.creativity, stability: body.stability, held: body.held, x: body.x, y: body.y, work: textChanged, touch: body.touch !== false });
      os.emit('idearium.idea.update', { uuid: idea.uuid, fields, causedBy: 'void' });
      return ok(res, { idea: os.idea(idea.uuid) });
    }
    case 'void.echo':
    case 'void.spec':
    case 'void.collide': {
      const V = await import('../lib/void.js');
      const idea = os.idea(action === 'void.collide' ? body.a : params.uuid);
      if (!idea) return err(res, 404, `idea not found: ${action === 'void.collide' ? body.a : params.uuid}`);
      const other = action === 'void.collide' ? os.idea(body.b) : null;
      if (action === 'void.collide' && (!other || other.uuid === idea.uuid)) return err(res, 400, 'a collision needs two different ideas');
      const kind = action === 'void.spec' ? 'ground' : action === 'void.collide' ? 'collide' : (body.kind || 'echo');
      const dial = (k) => body[k] !== undefined ? body[k] : (idea.void ? idea.void[k] : 0);
      const { listLibrary } = await import('../lib/spec-library-import.js');
      const context = { repos: getRepoLayer().list().filter(r => r.status !== 'archived' && !r.nexusSelf).map(r => r.name), library: listLibrary().map(r => r.title) };
      const p = V.echoPrompt({ idea, creativity: dial('creativity'), stability: dial('stability'), kind, other, context });
      if (p.error) return err(res, 400, p.error);
      const r = await _agentAsk(p.prompt, { channel: 'idearium-void', sessionId: `void-${idea.uuid}` });
      if (!r.ok) return err(res, 502, `the void did not answer: ${r.error}`);
      const echo = V.makeEcho({ idea, kind, voice: p.voice, meta: p.meta, text: r.text, by: r.by || null });
      if (!echo.lines.length) return err(res, 502, 'the agent answered with nothing usable');
      appendRow(V.ECHO_TABLE, echo);
      // asking about an idea is attention, not work: it touches the idea (it stops drifting) but does not brighten it
      os.emit('idearium.idea.update', { uuid: idea.uuid, fields: { void: V.shapeVoid(idea.void, {}) }, causedBy: 'void' });
      os.emit('idearium.void.echo', { uuid: idea.uuid, kind, voice: p.voice, ...(echo.domain ? { domain: echo.domain } : {}) });
      return ok(res, { echo, ...(action === 'void.spec' ? { next: `/workshop.html?from=${encodeURIComponent('idea:' + idea.uuid)}` } : {}) });
    }
    case 'void.echo.decide': {
      const V = await import('../lib/void.js');
      const rows = loadTable(V.ECHO_TABLE);
      const e = rows.find(x => x.uuid === params.id); if (!e) return err(res, 404, `echo not found: ${params.id}`);
      if (body.action === 'set-aside' || body.action === 'reopen') {
        e.status = body.action === 'set-aside' ? 'set-aside' : 'open'; syncTable(V.ECHO_TABLE, [e]);
        return ok(res, { echo: e });
      }
      if (body.action !== 'take') return err(res, 400, 'action must be take, set-aside or reopen');
      const idea = os.idea(body.ideaUuid || e.ideaUuid); if (!idea) return err(res, 404, 'its idea is gone');
      const t = V.take(idea, e, { words: body.words });
      if (t.error) return err(res, 400, t.error);
      os.emit('idearium.idea.update', { uuid: idea.uuid, fields: { text: t.text, void: V.shapeVoid(idea.void, { work: true }) }, causedBy: 'void.take' });
      e.taken = [...(e.taken || []), { words: String(body.words).trim(), at: Date.now(), into: idea.uuid }]; e.status = 'taken';
      syncTable(V.ECHO_TABLE, [e]);
      return ok(res, { echo: e, idea: os.idea(idea.uuid) });
    }
    case 'void.spark.idea': {
      // a brainstorm spark becomes an idea through brainstorm.promote (one path), then takes its place and dials
      const V = await import('../lib/void.js');
      if (typeof body.text === 'string' && body.text.trim()) { const ct = V.checkText(body.text, V.MAX_IDEA, 'the idea'); if (ct.error) return err(res, 400, ct.error); }
      const r = await _callRoute('brainstorm.promote', { uuid: params.uuid }, typeof body.text === 'string' && body.text.trim() ? { text: body.text } : {});
      if (!r.ok || !r.idea) return err(res, r.status && r.status !== 200 ? r.status : 400, r.error || 'the spark was not made an idea');
      const place = V.placeFor(params.uuid);
      os.emit('idearium.idea.update', { uuid: r.idea.uuid, fields: { void: V.shapeVoid(null, { creativity: body.creativity, stability: body.stability, x: body.x ?? place.x, y: body.y ?? place.y }) }, causedBy: 'void.spark' });
      return ok(res, { idea: os.idea(r.idea.uuid) });
    }

    // ── §0.39.294 SW1 — the spec workshop ─────────────────────────────────────────────────────────────────────────
    // James: "need the spec workshop, completely destroy the spec builder, and build the spec workshop" · "the workshop
    // and maybe it hooks into the spec field". Sessions in the JAA table idearium_workshops; the agent only proposes.
    case 'workshop.list': {
      const WS = await _workshop();
      const rows = loadTable(WS.TABLE).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return ok(res, { count: rows.length, workshops: rows.map(WS.summary) });
    }
    case 'workshop.sources': {
      // what a workshop can start from: an idea, a library document, a repo's spec file — or nothing
      const { listLibrary } = await import('../lib/spec-library-import.js');
      const ideas = (os.db.ideas || []).filter(i => i.phase !== 'archived').slice(-300).reverse().map(i => ({ uuid: i.uuid, text: String(i.text || '').slice(0, 160), phase: i.phase,
        ...(i.void ? { void: { creativity: i.void.creativity, stability: i.void.stability, tension: i.void.tension } } : {}) }));   // 0.39.297 — the Void's dials, shown where the workshop starts
      const library = listLibrary().filter(r => r.specUuid).map(r => ({ sha: r.sha, title: r.title, family: r.family, sections: r.sections, repoUuid: r.repoUuid || null }));
      await _specEngineReady();
      const repos = getRepoLayer().list().filter(r => r.status !== 'archived' && !r.nexusSelf).map(r => ({ uuid: r.uuid, name: r.name, specFiles: _workshopSpecFiles(r) }));
      return ok(res, { ideas, library, repos });
    }
    case 'workshop.create': {
      const WS = await _workshop();
      const se = await _specEngineReady();
      if (!se) return err(res, 503, 'the spec engine is still loading — try again in a moment');
      const from = body.from || { kind: 'blank' };
      let title = body.title || null, sections = [], source = { kind: 'blank' }, repoUuid = null, specPath = null, ideaUuid = null;
      if (from.kind === 'idea') {
        const idea = os.idea(from.id);
        if (!idea) return err(res, 404, `idea not found: ${from.id}`);
        ideaUuid = idea.uuid; source = { kind: 'idea', id: idea.uuid, title: String(idea.text).slice(0, 80) };
        title = title || String(idea.text).split(/[.\n—-]/)[0].trim().slice(0, 80) || 'Untitled';
        sections = [{ id: 'idea', title: 'The idea', body: idea.text, by: 'idea' }, { id: 'purpose', title: 'Purpose', body: '' }];
      } else if (from.kind === 'library') {
        const { findRow } = await import('../lib/spec-library-import.js');
        const f = findRow(from.id); if (f.error) return err(res, 404, f.error);
        if (!f.row.specUuid) return err(res, 400, `"${f.row.title}" has no spec to open`);
        let m; try { m = se.loadSpec(f.row.specUuid); } catch (e) { return err(res, 404, `its spec is missing: ${e.message}`); }
        source = { kind: 'library', id: f.row.sha, title: f.row.title }; title = title || f.row.title;
        // the import keeps a section's id as its title; the document's own heading (its first line) reads better
        const heading = (c) => { const t = String(c.content || '').replace(/^<!--[^>]*-->\s*/, '').match(/^#{1,6}\s+(.+)$/m); return t && t[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === c.sectionId ? t[1].trim() : null; };
        sections = m.chunks.filter(c => c.status !== 'removed' && !c.realPath).map(c => ({ id: c.sectionId, title: (c.sectionTitle && c.sectionTitle !== c.sectionId ? c.sectionTitle : heading(c)) || c.sectionId, body: c.content || '' }));
        ideaUuid = f.row.ideaUuid || null;
        if (f.row.repoUuid && getRepoLayer().get(f.row.repoUuid)) { repoUuid = f.row.repoUuid; specPath = f.row.specFile || null; }
      } else if (from.kind === 'repo') {
        const repo = getRepoLayer().get(from.id);
        if (!repo) return err(res, 404, `repo not found: ${from.id}`);
        if (repo.nexusSelf) return err(res, 400, 'a Nexus system\'s specs change through its own apply gate, not the workshop');
        const files = _workshopSpecFiles(repo);
        specPath = from.path || files[0] || null;
        repoUuid = repo.uuid; ideaUuid = repo.ideaUuid || null; title = title || repo.name;
        source = { kind: 'repo', id: repo.uuid, title: repo.name, path: specPath };
        if (specPath) {
          const f = getRepoLayer().readFile(repo.uuid, specPath);
          if (f.error) return err(res, 404, f.error);
          sections = WS.sectionsFromSpecText(f.content, _require('js-yaml'));
        }
      } else if (from.kind !== 'blank') return err(res, 400, `from.kind must be idea, library, repo or blank`);
      const made = WS.makeSession({ title: title || 'Untitled spec', source, sections, ambition: body.ambition, repoUuid, specPath, ideaUuid });
      if (made.error) return err(res, 400, made.error);
      appendRow(WS.TABLE, made.session);
      os.emit('idearium.workshop.created', { uuid: made.session.uuid, source: source.kind, title: made.session.title });
      return ok(res, { workshop: made.session });
    }
    case 'workshop.show': {
      const WS = await _workshop();
      const w = _workshopGet(WS, params.id); if (!w) return err(res, 404, `workshop not found: ${params.id}`);
      return ok(res, { workshop: w, ambition: WS.AMBITION, feeds: WS.FEEDS });
    }
    case 'workshop.update': {
      const WS = await _workshop();
      const w = _workshopGet(WS, params.id); if (!w) return err(res, 404, `workshop not found: ${params.id}`);
      if (body.title != null && String(body.title).trim()) {
        if (String(body.title).trim().length > WS.MAX_TITLE) return err(res, 400, `the title is ${String(body.title).trim().length} characters — the limit is ${WS.MAX_TITLE}`);
        w.title = String(body.title).trim(); w.updatedAt = Date.now();
      }
      if (body.ambition != null) { const a = WS.clampAmbition(body.ambition); if (a !== w.ambition) { w.ambition = a; w.updatedAt = Date.now(); w.history.push({ at: w.updatedAt, what: `ambition ${a} — ${WS.AMBITION[a].label}` }); } }
      for (const e of Array.isArray(body.sections) ? body.sections : (body.section ? [body.section] : [])) {
        const r = e.restore ? WS.restoreSection(w, e.restore) : WS.editSection(w, e);
        if (r.error) return err(res, 400, r.error);
      }
      syncTable(WS.TABLE, [w]);
      return ok(res, { workshop: w });
    }
    case 'workshop.feed': {
      const WS = await _workshop();
      const w = _workshopGet(WS, params.id); if (!w) return err(res, 404, `workshop not found: ${params.id}`);
      let inspiration = [];
      if (body.kind === 'inspiration') {
        const { listLibrary } = await import('../lib/spec-library-import.js');
        inspiration = [...listLibrary().map(r => ({ title: r.title, summary: r.summary, kind: r.family })),
          ...getRepoLayer().list().filter(r => r.status !== 'archived' && !r.nexusSelf).map(r => ({ title: r.name, kind: 'repo' }))]
          .filter(x => x.title && x.title !== w.title);
      }
      const r = await WS.feed(w, body.kind, { sectionId: body.sectionId || null, inspiration });
      if (r.error) { syncTable(WS.TABLE, [w]); return err(res, r.meta ? 502 : 400, r.error, { meta: r.meta || null, raw: r.raw || null }); }
      syncTable(WS.TABLE, [w]);
      os.emit('idearium.workshop.feed', { uuid: w.uuid, kind: body.kind, proposals: r.added.length, ...(r.meta && r.meta.domain ? { domain: r.meta.domain } : {}) });
      return ok(res, { added: r.added, meta: r.meta, workshop: w });
    }
    case 'workshop.decide': {
      const WS = await _workshop();
      const w = _workshopGet(WS, params.id); if (!w) return err(res, 404, `workshop not found: ${params.id}`);
      const r = WS.decide(w, params.pid, body || {});
      if (r.error) return err(res, 400, r.error);
      syncTable(WS.TABLE, [w]);
      // §CT2 — his accept or dismiss is the verdict on the model that drafted it
      if (r.proposal && r.proposal.by && ['accepted', 'dismissed'].includes(r.proposal.status)) _verdict(r.proposal.by, 'page:workshop', r.proposal.status === 'accepted', 'dismissed', r.proposal.status === 'dismissed' ? 'dismissed by James' : null);
      return ok(res, { proposal: r.proposal, section: r.section || null, workshop: w });
    }
    case 'workshop.save': {
      // the hook into the Spec field: the session becomes the repo's spec/<name>.spec — the Spec tab's living model.
      // A session with no repo gets one (from its library document's pipeline, else a new repo for its idea).
      const WS = await _workshop();
      const w = _workshopGet(WS, params.id); if (!w) return err(res, 404, `workshop not found: ${params.id}`);
      if (!(await _specEngineReady())) return err(res, 503, 'the spec engine is still loading — try again in a moment');
      const RL = getRepoLayer();
      const yaml = _require('js-yaml');
      const LI = await import('../lib/spec-library-import.js');
      let made = null;
      if (!w.repoUuid || !RL.get(w.repoUuid)) {
        if (w.source && w.source.kind === 'library') {
          const se = await _specEngineReady();
          if (!se) return err(res, 503, 'the spec engine is still loading — try again in a moment');
          const p = await LI.toPipeline({ key: w.source.id, se, yaml, promote: (specUuid) => _promoteSpecToRepo(os, se, specUuid, 'manual'),
            writeFile: (u, rel, text) => RL.writeFile(u, rel, text, { preserveWhitespace: true }), repoExists: (u) => !!RL.get(u) });
          if (!p.ok) return err(res, 502, `could not make its repo: ${p.error}`);
          w.repoUuid = p.repoUuid; w.specPath = w.specPath || p.specFile; made = 'library';
        } else {
          // §0.39.305 SB2 — the new repo's spec is described by his own first words, not "bare repo: <title>"
          const firstWords = ((w.sections || []).find(x => x && /^(idea|purpose)/.test(x.id || '') && String(x.body || '').trim()) || {}).body || '';
          const r = RL.ingest({ name: w.title, bare: true, source: 'workshop', ideaUuid: w.ideaUuid || null, description: String(firstWords).trim().slice(0, 500) || null,
            compartmentId: _ensureCompartment(`idearium-repo-${String(w.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`, w.title) });
          if (r.error) return err(res, 502, `could not make its repo: ${r.error}`);
          w.repoUuid = r.repo.uuid; made = 'new';
        }
      }
      const repo = RL.get(w.repoUuid);
      if (repo && repo.nexusSelf) return err(res, 400, 'a Nexus system\'s specs change through its own apply gate, not the workshop');
      w.specPath = w.specPath || `spec/${LI.slugOf(w.title)}.spec`;
      const wr = RL.writeFile(w.repoUuid, w.specPath, WS.specText(w, yaml), { preserveWhitespace: true });
      if (wr.error) return err(res, 502, `the spec was not written: ${wr.error}`, { repoUuid: w.repoUuid });
      // §0.39.305 SB2 (docs/2026-10-05-build-from-the-spec-phasemap.spec) — his sections become the spec's: kept on the
      // manifest for every section's agent, and written into the sections they name (purpose ← idea + purpose). A
      // section an agent already wrote is kept. Every save, so his later words reach it too.
      let authored = null;
      try {
        const se = await _specEngineReady();
        if (se && repo && repo.specUuid && typeof se.setAuthorWords === 'function') authored = se.setAuthorWords(repo.specUuid, w.sections || []);
      } catch (e) { authored = { error: e.message }; console.warn(`[workshop.save] his words did not reach the spec (the file is saved): ${e.message}`); }
      w.savedAt = Date.now(); w.updatedAt = w.savedAt;
      w.history.push({ at: w.savedAt, what: `saved to ${w.specPath}${made ? ` (${made === 'new' ? 'a new repo' : 'its library document\'s repo'})` : ''}` });
      syncTable(WS.TABLE, [w]);
      os.emit('idearium.workshop.saved', { uuid: w.uuid, repoUuid: w.repoUuid, specPath: w.specPath, madeRepo: made });
      return ok(res, { repoUuid: w.repoUuid, specPath: w.specPath, madeRepo: made, created: !!wr.created, authored, workshop: w });
    }
    // ── §0.39.298 AR2 — ARCHITECT ─────────────────────────────────────────────────────────────────────────────────
    // James: "with architect for archiecture using the component registry, components store with dependancies". One
    // architecture per spec (JAA table idearium_architectures); the registry is loom, the store lib/component-store.js
    // (CX0 grows it later — the station does not change). The agent only proposes components.
    case 'architect.list': {
      const AR = await _architect();
      const rows = loadTable(AR.TABLE).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return ok(res, { count: rows.length, architectures: rows.map(AR.summary) });
    }
    case 'architect.registry': {
      // what exists, for picking a reuse by hand: loom's registry and the component store, one search
      const AR = await _architect();
      const idx = _architectIndex(AR);
      const q = String(query.q || '').slice(0, 200);
      return ok(res, { q, results: AR.search(idx, q, { limit: Math.min(40, Number(query.limit) || 12) }), index: { ...idx.counts, ...(idx.regError ? { error: idx.regError } : {}) } });
    }
    case 'architect.create': {
      const AR = await _architect();
      const WS = await _workshop();
      const RL = getRepoLayer();
      const yaml = _require('js-yaml');
      const from = body.from || {};
      let title = null, sections = [], workshopUuid = null, repoUuid = null, specPath = null;
      if (from.kind === 'workshop') {
        const w = _workshopGet(WS, from.id);
        if (!w) return err(res, 404, `workshop not found: ${from.id}`);
        title = w.title; sections = w.sections; workshopUuid = w.uuid; repoUuid = w.repoUuid || null; specPath = w.specPath || null;
      } else if (from.kind === 'repo') {
        await _specEngineReady();
        const repo = RL.get(from.id);
        if (!repo) return err(res, 404, `repo not found: ${from.id}`);
        if (repo.nexusSelf) return err(res, 400, 'a Nexus system\'s architecture changes through its own apply gate, not the architect');
        specPath = from.path || _workshopSpecFiles(repo)[0] || null;
        if (!specPath) return err(res, 400, `${repo.name} has no spec/<name>.spec yet — make one in the spec workshop first`);
        const f = RL.readFile(repo.uuid, specPath);
        if (f.error) return err(res, 404, f.error);
        title = repo.name; sections = WS.sectionsFromSpecText(f.content, yaml); repoUuid = repo.uuid;
      } else return err(res, 400, 'from.kind must be workshop or repo — the architect lays out a spec');
      // one architecture per spec (§10.3): opening the same spec again returns it, with the spec read again
      const same = loadTable(AR.TABLE).find(a => (workshopUuid && a.workshopUuid === workshopUuid) || (!workshopUuid && repoUuid && a.repoUuid === repoUuid && a.specPath === specPath));
      if (same) {
        AR.setSections(same, sections);
        if (repoUuid && !same.repoUuid) { same.repoUuid = repoUuid; same.specPath = specPath; same.archPath = AR.archPathFor(specPath, same.title); }
        syncTable(AR.TABLE, [same]);
        return ok(res, { existing: true, ..._architectView(AR, same) });
      }
      // a saved architecture beside the spec is read back — the decisions made survive a new session
      let components = [];
      if (repoUuid) {
        const f = RL.readFile(repoUuid, AR.archPathFor(specPath, title));
        if (f && !f.error && typeof f.content === 'string') components = AR.fromArchText(f.content, yaml);
      }
      const made = AR.makeSession({ title: body.title || title, sections, workshopUuid, repoUuid, specPath, components });
      if (made.error) return err(res, 400, made.error);
      appendRow(AR.TABLE, made.session);
      os.emit('idearium.architect.created', { uuid: made.session.uuid, source: made.session.source.kind, title: made.session.title, components: components.length });
      return ok(res, { existing: false, ..._architectView(AR, made.session) });
    }
    case 'architect.show': {
      const AR = await _architect();
      const a = _architectGet(AR, params.id); if (!a) return err(res, 404, `architecture not found: ${params.id}`);
      return ok(res, { ..._architectView(AR, a), tiers: AR.TIERS, layers: AR.LAYERS, reuseAt: AR.REUSE_AT });
    }
    case 'architect.update': {
      const AR = await _architect();
      const a = _architectGet(AR, params.id); if (!a) return err(res, 404, `architecture not found: ${params.id}`);
      if (body.refresh) {   // the spec read again from where it lives
        if (a.workshopUuid) { const w = _workshopGet(await _workshop(), a.workshopUuid); if (w) { AR.setSections(a, w.sections); if (w.repoUuid && !a.repoUuid) { a.repoUuid = w.repoUuid; a.specPath = w.specPath; a.archPath = AR.archPathFor(w.specPath, a.title); } } }
        else if (a.repoUuid && a.specPath) { const f = getRepoLayer().readFile(a.repoUuid, a.specPath); if (!f.error) AR.setSections(a, (await _workshop()).sectionsFromSpecText(f.content, _require('js-yaml'))); }
      }
      for (const e of Array.isArray(body.components) ? body.components : (body.component ? [body.component] : [])) {
        const r = e.restore ? AR.restoreComponent(a, e.restore) : AR.editComponent(a, e);
        if (r.error) return err(res, 400, r.error);
      }
      syncTable(AR.TABLE, [a]);
      return ok(res, _architectView(AR, a));
    }
    case 'architect.draft': {
      const AR = await _architect();
      const a = _architectGet(AR, params.id); if (!a) return err(res, 404, `architecture not found: ${params.id}`);
      if (!a.sections.some(s => String(s.body || '').trim())) return err(res, 400, 'the spec is empty — write it in the workshop first');
      const r = await AR.draft(a, { index: _architectIndex(AR), yaml: _require('js-yaml') });
      if (r.error) return err(res, 502, r.error, { raw: r.raw || null });
      syncTable(AR.TABLE, [a]);
      os.emit('idearium.architect.draft', { uuid: a.uuid, proposals: r.added.length });
      return ok(res, { added: r.added, ..._architectView(AR, a) });
    }
    case 'architect.decide': {
      const AR = await _architect();
      const a = _architectGet(AR, params.id); if (!a) return err(res, 404, `architecture not found: ${params.id}`);
      const r = params.pid === 'all' ? AR.decideAll(a, body.action) : AR.decide(a, params.pid, body || {});
      if (r.error) return err(res, 400, r.error);
      syncTable(AR.TABLE, [a]);
      return ok(res, { proposal: r.proposal || null, component: r.component || null, decided: r.decided ?? null, ..._architectView(AR, a) });
    }
    case 'architect.save': {
      // beside the spec it lays out: spec/<name>.spec → spec/<name>.architecture.yaml, in the same repo
      const AR = await _architect();
      const a = _architectGet(AR, params.id); if (!a) return err(res, 404, `architecture not found: ${params.id}`);
      if (!a.repoUuid && a.workshopUuid) {   // the workshop may have saved its spec since this was opened
        const w = _workshopGet(await _workshop(), a.workshopUuid);
        if (w && w.repoUuid) { a.repoUuid = w.repoUuid; a.specPath = w.specPath; a.archPath = AR.archPathFor(w.specPath, a.title); }
      }
      if (!a.repoUuid) return err(res, 409, 'the spec is not in a repo yet — save it from the spec workshop first; the architecture is saved beside it', { code: 'SPEC_NOT_SAVED' });
      const RL = getRepoLayer();
      const repo = RL.get(a.repoUuid);
      if (!repo) return err(res, 404, `its repo is gone: ${a.repoUuid}`);
      if (repo.nexusSelf) return err(res, 400, 'a Nexus system\'s architecture changes through its own apply gate, not the architect');
      a.archPath = a.archPath || AR.archPathFor(a.specPath, a.title);
      const view = _architectView(AR, a);
      const wr = RL.writeFile(a.repoUuid, a.archPath, AR.archText(a, view.analysis, _require('js-yaml')), { preserveWhitespace: true });
      if (wr.error) return err(res, 502, `the architecture was not written: ${wr.error}`, { repoUuid: a.repoUuid });
      a.savedAt = Date.now(); a.updatedAt = a.savedAt;
      a.history.push({ at: a.savedAt, what: `saved to ${a.archPath} — ${view.analysis.stats.reuse} reused, ${view.analysis.stats.new} new, ${view.analysis.stats.gaps} gap(s)` });
      syncTable(AR.TABLE, [a]);
      os.emit('idearium.architect.saved', { uuid: a.uuid, repoUuid: a.repoUuid, archPath: a.archPath, components: view.analysis.stats.components, reuse: view.analysis.stats.reuse, new: view.analysis.stats.new, gaps: view.analysis.stats.gaps });
      // §0.39.300 SY2 — the architect's gaps join intelligence's synthesis (every architecture's, as one push — a push
      // replaces the architect's last set). Fire and forget: intelligence down is said in the log, never fails the save.
      try {
        const all = loadTable(AR.TABLE).flatMap(x => AR.analyse(x, _architectIndex(AR)).gaps.map((g, i) => ({ id: `${x.uuid}:${g.kind}:${g.component}:${g.dep || i}`, kind: `architect-${g.kind}`,
          title: g.say, detail: `${x.title} — ${x.archPath || 'not saved yet'}`, refs: x.repoUuid && x.archPath ? [x.archPath] : [], layer: 'engine' })));
        _nexusClient.post('intelligence', '/api/intelligence/synthesis/ingest', { system: 'architect', gaps: all }, { timeout: 4000 })
          .catch(e => console.warn(`[idearium] the architect's gaps did not reach intelligence's synthesis (non-fatal): ${e.message}`));
      } catch (e) { console.warn(`[idearium] the architect's gaps were not gathered for the synthesis: ${e.message}`); }
      return ok(res, { repoUuid: a.repoUuid, archPath: a.archPath, created: !!wr.created, ...view });
    }
    // §0.39.292 IL2 — James: "how can i import into the pipeline. the specs also need to convert into actual spec files."
    // The same promotion every spec takes (_promoteSpecToRepo), then the document as spec/<slug>.spec in the repo.
    // 'manual' by default: the document is a design, not code — Generate code is the pipeline's step, not this one's;
    // body.mode 'emerge' asks for the guardian extract + compile as well.
    case 'spec-library.to-repo': {
      const { toPipeline } = await import('../lib/spec-library-import.js');
      const se = getSpecEngine();
      const mode = body.mode === 'emerge' ? 'emerge' : 'manual';
      let key = params.key; try { key = decodeURIComponent(params.key); } catch {}
      const r = await toPipeline({
        key, se, yaml: _require('js-yaml'),
        promote: (specUuid) => _promoteSpecToRepo(os, se, specUuid, mode),
        writeFile: (repoUuid, rel, text) => getRepoLayer().writeFile(repoUuid, rel, text, { preserveWhitespace: true }),
        repoExists: (repoUuid) => !!getRepoLayer().get(repoUuid),
      });
      if (!r.ok) return err(res, r.repoUuid ? 500 : 400, r.error, r);
      os.emit('idearium.spec-library.to-repo', { title: r.title, repoUuid: r.repoUuid, specFile: r.specFile, existing: r.existing });
      return ok(res, r);
    }
    case 'history.import.upload': {
      const HJ = _require('../../lib/history-import-job.js');
      const r = await HJ.saveUpload(query.name, req);
      return r.ok ? ok(res, r) : err(res, 400, r.error || 'upload failed');
    }
    case 'cos.testenv.status':
      return ok(res, _require('../../cos/testenv/setup-job.js').status());
    // §0.39.265 — install what a run needs, on the person's click (cos/testenv/installer.js)
    case 'cos.install.status':
      return ok(res, { jobs: _require('../../cos/testenv/installer.js').status() });
    case 'cos.install': {
      const I = _require('../../cos/testenv/installer.js');
      if (!body.tool || !I.TOOLS[body.tool]) return err(res, 400, `tool must be one of: ${Object.keys(I.TOOLS).join(', ')}`);
      const st = I.install(body.tool);
      os.emit('idearium.cos.install', { tool: body.tool, state: st.state });
      return ok(res, st);
    }
    case 'cos.testenv.setup': {
      const SJ = _require('../../cos/testenv/setup-job.js');
      const v = (k) => { try { return getIdeariumValue(k); } catch (_) { return undefined; } };
      const st = SJ.start({ installQemu: !!body.installQemu, extras: Array.isArray(body.extras) ? body.extras : [], node: body.node || null,
        login: { user: v('desktop.user'), password: v('desktop.password') } });   // §0.39.282 N20
      os.emit('idearium.cos.testenv.setup', { state: st.state, args: st.args || null });
      return ok(res, st);
    }

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
      const opts = CR.options(repo, dir);
      return ok(res, { repoUuid: params.uuid, nexusSystem: repo.nexusSelf ? repo.nexusSelf.system || null : null, branches, options: opts, installs: opts.installs || [] });
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

    // §0.39.266 — James: "use the component registry as the wiring harness … so chunks can have minial context …
    // thats way too much to inject when we have tools they can use to get context." find / card / read are pure
    // reads of the registry (loom's for a nexus repo, the repo's own graph otherwise); write proposes an .inject
    // (for a nexus repo: the approval prompt, then the gate); test runs the tests the registry says cover it.
    case 'components.list': case 'components.get': case 'components.invalidate': {
      const CS = _require('../../lib/component-store.js');
      if (action === 'components.list') {
        const q = query.q || query.query;
        return ok(res, { stats: CS.stats(), components: q ? CS.find(q, { limit: Math.min(parseInt(query.limit, 10) || 25, 200) }) : CS.list() });
      }
      const ref = decodeURIComponent(params.id);
      if (action === 'components.invalidate') {
        const n = CS.invalidate(ref);
        if (n) os.emit('idearium.components.invalidated', { ref, keys: n });
        return ok(res, { ref, keysDropped: n });
      }
      const g = CS.get(ref);
      if (!g) return err(res, 404, `no stored component ${ref}`);
      return ok(res, { manifest: g.manifest, closure: CS.closure(g.id, g.version), content: query.content === '1' ? g.content : undefined });
    }

    case 'repo.code': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      // §0.39.336 SB36 — the agents' code tools read here: a read takes the directory that holds the index (built if the
      // sources have none), the same one the agent's context came from (_agentDir, SB35); a write keeps the layer's own dir
      const dir = req.method === 'GET' ? await _agentDir(params.uuid)
        : repo.nexusSelf ? (repo.materializeDir || _repoDiskDir(params.uuid)) : _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const { handleCode } = await import('../repo/code-api.js');
      const r = await handleCode({ method: req.method, op: params.op, layer: getRepoLayer(), repo, uuid: params.uuid, dir, query, body: body || {},
        emit: (type, payload) => { try { os.emit(type, payload); } catch (_) { /* the write already happened */ } }, tool: (body && body._tool) || query._tool || null,
        // §0.39.279 (staging S1) — a staged change is a versionium commit on repo-<uuid>@staging
        record: async (payload) => { const r = await _versionium('POST', '/api/versionium/commit', payload); if (!r.ok) return { error: r.error }; return (r.data && r.data.commit) || { error: (r.data && r.data.error) || 'versionium returned no commit' }; } });
      if (r.status >= 400) return err(res, r.status, r.body.error, Object.fromEntries(Object.entries(r.body).filter(([k]) => k !== 'error')));
      if (req.method === 'POST') _deviationAfter(params.uuid, 'files');   // §0.39.280 BS3 — a code write may be a major change
      return ok(res, r.body);
    }

    case 'repo.harness.find': case 'repo.harness.card': case 'repo.harness.read':
    case 'repo.harness.write': case 'repo.harness.test': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const H = _require('../../lib/registry-harness.js');
      let idx;
      try { idx = H.indexFor(repo, repo.nexusSelf ? null : _repoDiskDir(params.uuid)); }
      catch (e) { return err(res, 409, `no registry for this repo: ${e.message}`); }
      if (action === 'repo.harness.find') {
        const r = H.find(idx, query.q || query.query, { kind: query.kind || 'any', limit: Math.min(parseInt(query.limit, 10) || 15, 50) });
        return r.error ? err(res, 400, r.error) : ok(res, r);
      }
      if (action === 'repo.harness.card') {
        const ref = query.id || query.path || query.event;
        if (!ref) return err(res, 400, 'id (a component id or path) or event is required');
        const r = query.event ? H.eventCard(idx, query.event) : H.card(idx, ref);
        return r.error ? err(res, 404, r.error) : ok(res, r);
      }
      if (action === 'repo.harness.read') {
        const r = H.read(idx, query.id || query.path, { start: query.start, end: query.end });
        return r.error ? err(res, 404, r.error) : ok(res, r);
      }
      if (action === 'repo.harness.write') {
        const RI = _require('../../lib/repo-inject.js');
        const target = body.path || (body.id ? (H.resolve(idx, body.id) || {}).file : null);
        if (!target) return err(res, 400, 'path (or the id of an existing component) is required');
        if (typeof body.content !== 'string') return err(res, 400, 'content (the whole file) is required');
        const hat = _require('../../lib/repo-hat.js').getRepoHat(params.uuid);
        const p = RI.propose({ layer: getRepoLayer(), repo, hat, path: target, content: body.content, source: { kind: 'agent', via: 'loom.write.tool' } });
        if (!p.ok) return err(res, 400, (p.errors || ['propose failed']).join('; '));
        let applied = null;
        if (RI.modeFor(repo) === 'auto') { applied = RI.apply(p.inject.uuid, { layer: getRepoLayer() }); }
        const n = applied && applied.ok ? applied.inject : p.inject;
        os.emit('idearium.repo.inject.proposed', { repoUuid: params.uuid, inject: n.uuid, path: n.path, status: n.status, approval: !!repo.nexusSelf });
        return ok(res, { inject: n.uuid, path: n.path, status: n.status, creates: n.creates,
          next: n.status === 'applied' ? 'written' : repo.nexusSelf ? 'waiting for James to approve it (the approval prompt is open in the Agent tab)' : 'proposed — waiting for review',
          applyError: applied && !applied.ok ? applied.errors.join('; ') : undefined });
      }
      // test — the tests the registry says cover this component, run through the COS run menu (test.file)
      const c = H.card(idx, body.id || body.path, { cap: 50 });
      if (c.error) return err(res, 404, c.error);
      const testFiles = (c.tests || []).filter(t => !String(t).startsWith('…')).map(t => idx.fileOf(t) || t).filter(Boolean).slice(0, Math.min(parseInt(body.max, 10) || 3, 6));
      if (!testFiles.length) return ok(res, { id: c.id, tests: [], note: 'no test in the registry covers this component' });
      const CR = _require('../../lib/cos-run.js');
      const runs = [];
      for (const f of testFiles) {
        let runRepo = repo, compartment = null;
        if (repo.nexusSelf) {
          const sys = _require('../../lib/nexus-self/systems.js').ownerOf(f);
          runRepo = getRepoLayer().list({ includeArchived: true }).find(r => r.nexusSelf && r.nexusSelf.role === 'system' && r.nexusSelf.system === sys) || repo;
          compartment = _require('../../lib/cos-bridge.js').getCompartment(`nexus-self-${sys}`);
        } else if (repo.compartmentId) compartment = _require('../../lib/cos-bridge.js').getCompartment(repo.compartmentId);
        const r = await CR.run({ repo: runRepo, repoDir: runRepo.nexusSelf ? null : _repoDiskDir(runRepo.uuid), compartment, option: 'test.file', file: f, timeoutMs: 120000 });
        const one = (r.runs || [])[0] || {};
        runs.push({ file: f, ok: !!r.ok, passed: r.ok ? !!r.allPassed : false, error: r.ok ? undefined : (r.errors || []).join('; '), exitCode: one.exitCode ?? null, tail: String(one.stderr || one.stdout || '').slice(-800) });
      }
      return ok(res, { id: c.id, tests: runs, allPassed: runs.every(x => x.passed) });
    }

    // §0.39.291 PV1 — James: "Conrinue it first. Make sure it's enterprise grade." One verification of the repo's files
    // as they are on disk: parses · resolves · its own tests in an isolated COS branch (lib/build-verify.js).
    case 'repo.verify': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (repo.nexusSelf) return err(res, 400, 'a Nexus system is verified by its own suite — use Run');
      if (_proofs.get(params.uuid) && _proofs.get(params.uuid).state === 'running') return err(res, 409, 'a proof run is working on this repo — its rounds verify as they go (GET …/prove)');
      const v = await _verifyRepo(repo);
      _recordVerify(repo, v, 'verify');
      os.emit('idearium.repo.verify', { repoUuid: repo.uuid, verdict: v.verdict, failures: v.failures.length });
      return ok(res, { repoUuid: repo.uuid, ...v, failures: v.failures.map(_compactFailure) });
    }
    // §0.39.291 PV3 — the proof run: build every pending file, verify, send each failing file back with its exact
    // failure, again — until proven, the round bound, or a build that stalls. Background; follow it with GET.
    case 'repo.prove': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      if (!repo.specUuid) return err(res, 400, 'this repo has no spec to build from');
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      let m; try { m = se.loadSpecMeta(repo.specUuid); } catch (e) { return err(res, 404, `spec not found: ${repo.specUuid}`); }
      if (!m.fileTree && !(m.chunks || []).some(c => c.realPath)) return err(res, 400, 'this spec builds documents, not files — "Generate code" makes its code spec first');
      const cur = _proofs.get(repo.uuid);
      if (cur && cur.state === 'running') return ok(res, { started: false, alreadyRunning: true, run: _proofView(cur) });
      if (_buildingSpecs.has(repo.specUuid)) return err(res, 409, 'this spec is being built right now — try again when that build returns');
      const rounds = Math.max(1, Math.min(parseInt(body.rounds, 10) || 3, 10));
      const run = _startProof(repo, { rounds, maxBuildsPerRound: Math.max(1, Math.min(parseInt(body.maxBuilds, 10) || 400, 2000)) });
      return ok(res, { started: true, run: _proofView(run) });
    }
    case 'repo.prove.status': {
      const live = _proofs.get(params.uuid);
      const rows = loadTable(PROOF_TABLE).filter(r => r.repoUuid === params.uuid).sort((a, b) => b.startedAt - a.startedAt);
      return ok(res, { run: live ? _proofView(live) : (rows[0] || null), history: rows.slice(0, 20).map(r => ({ uuid: r.uuid, state: r.state, verdict: r.verdict, rounds: (r.rounds || []).length, startedAt: r.startedAt, endedAt: r.endedAt })) });
    }
    case 'repo.prove.cancel': {
      const live = _proofs.get(params.uuid);
      if (!live || live.state !== 'running') return err(res, 404, 'no proof run is working on this repo');
      live.cancel = true;
      return ok(res, { cancelling: true, run: _proofView(live) });
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
        timeoutMs: Math.min(parseInt(body.timeoutMs, 10) || 30000, 300000), keepBranch: !!body.keepBranch, nexusBranch, from: parseInt(body.from, 10) || 0 });
      if (!r.ok) return err(res, 422, (r.errors || ['run failed']).join('; '));
      os.emit('idearium.repo.run', { repoUuid: params.uuid, option: r.option, passed: r.passed, failed: r.failed });
      // kept for the Debug tab: what ran, where, and what failed (the tail of each failing run's stderr)
      try {
        appendRow('idearium_repo_runs', { uuid: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, repoUuid: params.uuid, option: r.option, label: r.label, where: r.where,
          passed: r.passed, failed: r.failed, allPassed: r.allPassed, durationMs: r.durationMs, branch: body.branch || null, ts: Date.now(),
          failures: (r.runs || []).filter(x => !x.passed).slice(0, 10).map(x => ({ file: x.file, exitCode: x.exitCode ?? null, error: x.error || null, stderr: String(x.stderr || '').slice(-600), health: x.health && !x.health.ok ? x.health.error || null : null,
            debug: x.debug ? _require('../../lib/cos-debug-report.js').compact(x.debug) : null })),   // §0.39.271 T3
          tests: r.report && r.report.tests ? { total: r.report.tests.total, ran: r.report.tests.ran, notRun: r.report.tests.notRun, next: r.report.tests.next } : null });
      } catch (_) { /* the run's own result is returned regardless */ }
      return ok(res, { repoUuid: params.uuid, ...r, mode: option === 'test.all' ? 'test' : 'run' });
    }

    // ── §INJECT 2026-09-21 — .inject nodes ─────────────────────────────────
    // §0.39.284 W3 — the work surface (idearium/repo/work-surface.js): every file the agent changed, with its diff, the
    // run that made it, and the tools the agent has and used. A projection — it stores nothing.
    // §0.39.284 W7 — the repo's own component registry and wiring map, in loom's shape (idearium/repo/architecture.js over
    // the repo's code-intel index). POST writes it into the repo as ARCHITECTURE.json — the architecture doc, versioned.
    case 'repo.architecture': case 'repo.architecture.write': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const AR = await import('../repo/architecture.js');
      const intel = _require('../../lib/code-intel/index.js').load(_repoDiskDir(params.uuid));
      const layer = getRepoLayer();
      // §0.39.286 RC2 — each module's text, so its routes, CLI commands and events are read too
      const readFile = (p) => { const r = layer.readTextFile(params.uuid, p); return r && !r.error && typeof r.content === 'string' && r.content.length < 400000 ? r.content : null; };
      const a = AR.architecture(intel, { repoName: repo.name, readFile });
      if (a.error) return err(res, 409, a.error, { code: 'NO_INDEX' });
      if (route.action === 'repo.architecture.write') {
        // §0.39.286 RC2 — the registry as Guardian's nodes: nodes/<type>/<id>.<type> (lib/node-export.js envelope), an
        // unchanged node left alone (fingerprint), a node no longer produced MOVED to nodes/_archive/ (§0.3)
        const NE = _require('../../lib/node-export.js');
        const crypto = _require('crypto');
        const nodes = AR.toNodes(a, { repoName: repo.name, wrap: NE.wrap, hash: (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 32) });
        let prior = [];
        try { const pj = layer.readTextFile(params.uuid, 'ARCHITECTURE.json'); if (pj && !pj.error) prior = JSON.parse(pj.content).nodeFiles || []; } catch (_) { prior = []; }
        const counts = { written: 0, unchanged: 0, archived: 0, failed: [] };
        for (const n of nodes) {
          const cur = layer.readTextFile(params.uuid, n.path);
          if (cur && !cur.error && typeof cur.content === 'string') {
            const m = cur.content.match(/^fingerprint:\s*(\S+)/m);
            if (m && m[1] === n.envelope.fingerprint) { counts.unchanged++; continue; }
            const fs0 = cur.content.match(/^firstSeenAt:\s*(\d+)/m); if (fs0) n.envelope.firstSeenAt = Number(fs0[1]);
          }
          const w = layer.writeTextFile(params.uuid, n.path, NE.toYaml(n.envelope), { defer: true });
          if (w && w.error) counts.failed.push(`${n.path}: ${w.error}`); else counts.written++;
        }
        const now = new Set(nodes.map(n => n.path));
        for (const old of prior) {
          if (now.has(old)) continue;
          const cur = layer.readTextFile(params.uuid, old);
          if (!cur || cur.error) continue;
          const to = old.replace(/^nodes\//, 'nodes/_archive/');
          const w = layer.writeTextFile(params.uuid, to, cur.content, { defer: true });
          if (w && !w.error) { layer.deleteTextFile(params.uuid, old, { defer: true }); counts.archived++; }
        }
        const doc = { schema: 'nexus.architecture/1', repo: { uuid: repo.uuid, name: repo.name }, generatedAt: new Date().toISOString(), generatedBy: 'idearium/repo/architecture.js', ...a, nodeFiles: [...now].sort() };
        const w = layer.writeTextFile(params.uuid, 'ARCHITECTURE.json', JSON.stringify(doc, null, 1) + '\n');
        if (!w || w.error) return err(res, 500, `could not write ARCHITECTURE.json: ${(w && w.error) || 'unknown'}`);
        try { layer.refresh(params.uuid); } catch (_) { /* the writes stand */ }
        getIdeaOS().emit('idearium.repo.architecture.written', { repoUuid: params.uuid, ...a.stats, nodes: counts });
        return ok(res, { repoUuid: params.uuid, written: 'ARCHITECTURE.json', stats: a.stats, nodes: { ...counts, total: nodes.length, dir: 'nodes/' } });
      }
      return ok(res, { repoUuid: params.uuid, ...a });
    }
    case 'repo.worksurface': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const WS = await import('../repo/work-surface.js');
      const RI = _require('../../lib/repo-inject.js');
      const RA = _require('../../lib/repo-agent.js');
      const layer = getRepoLayer();
      const rows = loadTable('idearium_phase_runs').filter(r => r.repoUuid === params.uuid || r.targetRepo === params.uuid);
      let listed = [], scope = null;
      try { scope = RA.getToolScope(params.uuid); listed = RA.listedTools(); } catch (_) {}
      const out = WS.workSurface({ injects: RI.list(params.uuid, { limit: 1000 }), runs: rows, listed, scope,
        readCurrent: (p) => { const r = layer.readTextFile(params.uuid, p); return r && !r.error && typeof r.content === 'string' ? r.content : null; },
        unifiedDiff: _require('../../lib/code-edit.js').unifiedDiff, limit: Math.min(200, parseInt(query.limit || '60', 10) || 60) });
      return ok(res, { repoUuid: params.uuid, ...out });
    }
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
          return ok(res, { repoUuid: params.uuid, mode: RI.modeFor(repo), approval: !!repo.nexusSelf, injects: RI.list(params.uuid, { status: query.status || null }) });
        case 'repo.inject.create': {
          const RH = _require('../../lib/repo-hat.js');
          // body.asAgent:true attributes it to this repo's hat; default is the person.
          const hat = body.asAgent ? RH.getRepoHat(params.uuid) : null;
          const r = RI.propose({ layer, repo, hat, path: body.path, content: body.content, syntax: body.syntax || null, source: { kind: hat ? 'agent' : 'person' } });
          if (r.ok && body.apply) return done(RI.apply(r.inject.uuid, { layer, force: !!body.force }));
          return done(r);
        }
        case 'repo.inject.get': {
          const n = owned();
          if (!n) return err(res, 404, `inject not found in this repo: ${params.id}`);
          // §0.39.266 — a nexus-gate inject compares against the live tree (via a fresh snapshot), and carries
          // what approving would do: the owning system, the diff and the gate's plan.
          if (n.target && n.target.kind === 'nexus-gate') {
            const G = _require('../../lib/nexus-self/inject-gate.js');
            let current = null; try { current = G.current(n.path); } catch (_) {}
            const pv = n.status === 'proposed' ? RI.preview(n.uuid) : { ok: true, gate: null };
            return ok(res, { inject: n, current, gate: pv.ok ? pv.gate : { plan: { ok: false, errors: pv.errors, conflicts: [] } } });
          }
          return ok(res, { inject: n, current: (layer.readFile(params.uuid, n.path) || {}).content ?? null });
        }
        case 'repo.inject.edit':
          if (!owned()) return err(res, 404, `inject not found in this repo: ${params.id}`);
          return done(RI.edit(params.id, body.content));
        case 'repo.inject.apply': {
          if (!owned()) return err(res, 404, `inject not found in this repo: ${params.id}`);
          const r = RI.apply(params.id, { layer, force: !!body.force, approvedBy: body.approvedBy || 'idearium' });
          if (r.ok) os.emit('idearium.repo.inject.applied', { repoUuid: params.uuid, inject: params.id, path: r.inject.path });
          if (r.ok) _deviationAfter(params.uuid, 'files');
          // §0.39.266 — approved into the live Nexus tree: say so, and bring that system's repo to the new snapshot
          if (r.ok && r.gate) {
            os.emit('idearium.nexus-self.apply', { system: r.gate.system, applyId: r.gate.applyId, snapshot: r.gate.snapshot, paths: [r.inject.path], inject: params.id });
            const synced = await _nexusSelfSync({ only: [r.gate.system] });
            return done(r, { synced: synced && synced.systems ? synced.systems : null });
          }
          return done(r);
        }
        case 'repo.inject.reject':
          if (!owned()) return err(res, 404, `inject not found in this repo: ${params.id}`);
          return done(RI.reject(params.id, { reason: body.reason || null }));
        case 'repo.inject.revert': {
          if (!owned()) return err(res, 404, `inject not found in this repo: ${params.id}`);
          const r = RI.revert(params.id, { layer, force: !!body.force });
          if (r.ok) os.emit('idearium.repo.inject.reverted', { repoUuid: params.uuid, inject: params.id, path: r.inject.path });
          if (r.ok && r.gate) {
            os.emit('idearium.nexus-self.rollback', { system: r.gate.system, applyId: r.inject.applyId, snapshot: r.gate.snapshot, inject: params.id });
            await _nexusSelfSync({ only: [r.gate.system] });
          }
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
          const repoDir = await _agentDir(params.uuid);   // §SB35 — the directory the dispatch reads, its index made sure of
          // §0.39.266 — the same context the dispatch uses (harness scope: the registry card, not code)
          try { const c = RA.contextFor({ repo, repoDir, message, bare: true }); context = { kind: c.kind || null, block: c.block }; } catch (_) { /* preview without context, said below */ }
          // 0.39.272 — {memory}, {atlas}, {directory}: the same recall and atlas search the dispatch runs, so the preview is
          // the real first message (before this, the preview left {memory} out even when the dispatch sent it).
          const _blocks = _require('../../lib/repo-prompt-blocks.js').getBlocks(params.uuid);
          let _mem = { text: '' };
          // 0.39.279 — recalled only when the 'memory' block is on, exactly as the dispatch does (off by default)
          if (_blocks.some(b => b.id === 'memory' && b.enabled)) { try { _mem = await _require('../../lib/agent-memory.js').recall({ agentId: RA.agentIdFor(params.uuid), query: message }); } catch (_) { /* preview without memory */ } }
          const mem = await RA.atlasFor({ repo, repoDir, message, blocks: _blocks, backend });
          const _pre = RA.prereqsFor({ repo, repoDir, message });   // §SB38 — the checklist the dispatch sends (not recorded: a preview is not a run)
          let text = RA.fillListedTools(RA.compose({ hat, message, context, repoUuid: params.uuid, backend, memory: _mem.text, atlas: mem.atlas, directory: mem.directory, prereqs: _pre && _pre.text }), params.uuid);
          let toolsFilled = false;
          if (/\{tools\}|\{tool_guide\}/.test(text)) {
            try { const TR = _require('../../copilot/tool-runtime.js'); text = TR.fillToolPlaceholders(text, RA.scopeFor(params.uuid, hat)); toolsFilled = true; } catch (_) { toolsFilled = false; }
          }
          return ok(res, { repoUuid: params.uuid, provider, backend, text, chars: text.length, toolsFilled, context: context.kind || 'none', memory: { chars: (_mem.text || '').length }, atlas: mem.info });
        }
        case 'repo.agent.settings.get': {
          const RA = _require('../../lib/repo-agent.js');
          return ok(res, { repoUuid: params.uuid, injectMode: RI.modeFor(repo), modes: repo.nexusSelf ? ['review'] : RI.MODES,
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
          // §0.39.266 — a Nexus repo's code reaches the live tree only on approval: 'auto' is refused there
          if (body.injectMode !== undefined && repo.nexusSelf && body.injectMode !== 'review') return err(res, 409, 'a nexus repo is always review — agent code waits for your approval, then goes through the apply gate');
          if (body.injectMode !== undefined) { const r = RI.setMode(params.uuid, body.injectMode); if (!r.ok) return done(r); out.injectMode = r.injectMode; }
          if (body.provider !== undefined) {
            const r = RA.setProvider(params.uuid, body.provider); if (!r.ok) return done(r); out.provider = r.provider;
          } else if (body.useGuardian !== undefined || body.guardianAgent !== undefined) {
            const useGuardian = body.useGuardian !== undefined ? !!body.useGuardian : RA.settingsView(params.uuid).useGuardian;
            let target;
            if (!useGuardian) { target = 'ollama'; }
            else if (body.guardianAgent) { target = body.guardianAgent; }
            else {
              // §0.39.307 — James: "i cant click guardian on the agent tab." With no guardian agent chosen yet this fell
              // to RA.defaultProvider(), which is ollama since 0.39.282 — so the click saved ollama and the switch snapped
              // back. Guardian means a guardian agent: the current one, else the default if it is one, else chatgpt or
              // the first guardian agent; none at all is said, never turned into another backend.
              const cur = RA.getProvider(params.uuid), def = RA.defaultProvider();
              const gp = RA.guardianProviders();
              target = RA.isGuardianProvider(cur) ? cur : RA.isGuardianProvider(def) ? def : (gp.includes('chatgpt') ? 'chatgpt' : gp[0]);
              if (!target) return err(res, 409, 'no guardian agents found — guardian lists its agents from the userscripts in guardian/ (lib/agent-providers.js); none answered');
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
        repo, repoDir: await _agentDir(params.uuid),   // §SB35 — never an unindexed tree
        message: body.message,
        backend: body.backend || null,
        agent: body.agent || null,
        provider: body.provider || null,   // §PROVIDER — else this compartment's stored choice
        model: body.model || null,   // §CT3 0.39.349 — a hop he picked in the Code tab (backend, agent and model together)
        noContext: body.noContext === true,
        layer: getRepoLayer(),   // §INJECT — addressed code blocks land in this repo through the one real write path
      });
      // A backend that is down is a real, reportable state, not a server
      // error — 200 with ok:false so the CLI can print it in the transcript
      // instead of api() throwing and losing the text.
      return ok(res, r);
    }

    // §CT3 0.39.349 — James: "the code tab the agent tab, work surface". The docked agent shows the model copilot's door
    // would choose for this repo's agent (or that Settings pins a provider, so the door is not asked), and the other hops.
    case 'repo.agent.route': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const RA = _require('../../lib/repo-agent.js');
      const kind = query.kind === 'agent:build' ? 'agent:build' : 'agent:chat';
      const pinned = RA.getProvider(params.uuid);
      const d = await RA.doorRoute(kind, null);
      return ok(res, { ok: !!d.route, kind, route: d.route || [], error: d.route ? null : (d.error || 'copilot gave no route'), pinned: pinned && pinned !== 'auto' ? pinned : null });
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
        repo, repoDir: await _agentDir(params.uuid), layer: getRepoLayer(),
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
        // emits: idearium.ci.vault.unavailable, idearium.ci.run.started, idearium.ci.stage.started, idearium.ci.stage.passed, idearium.ci.stage.failed, idearium.ci.run.finished
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

    // ── §0.39.265 — git: status / remote / commit / push / pull / keygen / clone ──
    // Each works on the repo's materialized folder (_repoDiskDir — materialize
    // keeps .git). Credentials: an SSH key ALIAS registered to the repo's
    // compartment (resolved to its path at use time), and/or the compartment's
    // `git_token` CI secret for https — neither ever in a response.
    case 'repo.git.status':
    case 'repo.git.remote':
    case 'repo.git.commit':
    case 'repo.git.push':
    case 'repo.git.pull':
    case 'repo.git.keygen': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const G = _require('../../lib/repo-git.js');
      const keys = _require('../../cos/ci/keys.js');
      const compartmentName = repo.compartmentId || null;
      const auth = () => {
        const out = { keyPath: null, token: null };
        if (body.keyAlias) {
          if (!compartmentName) return { error: 'this repo has no compartment, so it has no SSH keys' };
          const k = keys.resolveSshKey({ compartmentName, alias: body.keyAlias });
          if (!k.ok) return { error: k.error };
          out.keyPath = k.keyPath;
        }
        out.token = keys.gitTokenFor({ compartmentName });
        return out;
      };
      if (action === 'repo.git.keygen') {
        if (!compartmentName) return err(res, 400, 'this repo has no compartment — SSH keys are registered to a compartment');
        const g = await G.keygen({ alias: body.alias, comment: `nexus ${repo.name || repo.uuid}`.slice(0, 80) });
        if (!g.ok) return err(res, 400, g.error);
        const reg = keys.registerSshKey({ compartmentName, alias: body.alias, keyPath: g.keyPath });
        if (!reg.ok) return err(res, 400, `key created at ${g.keyPath} but not registered: ${reg.error}`);
        os.emit('idearium.repo.git.keygen', { repoUuid: repo.uuid, alias: body.alias, existed: g.existed });
        // the PUBLIC key only — it is what you paste into GitHub / GitLab
        return ok(res, { repoUuid: repo.uuid, alias: body.alias, keyPath: g.keyPath, publicKey: g.publicKey, existed: g.existed });
      }
      const dir = _repoDiskDir(repo.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      if (action === 'repo.git.status') {
        const st = await G.status(dir);
        let sshKeys = [];
        if (compartmentName) { const l = keys.listSshKeys({ compartmentName }); if (l.ok) sshKeys = l.keys.map(k => k.alias); }
        let hasToken = false;
        if (compartmentName) { const ls = keys.listSecrets({ compartmentName }); hasToken = !!(ls.ok && ls.secrets.some(x => x.name === 'git_token')); }
        return ok(res, { repoUuid: repo.uuid, dir, immutable: !!repo.immutable, compartmentId: compartmentName, sshKeys, hasToken, ...st });
      }
      if (action === 'repo.git.remote') {
        const r = await G.setRemote(dir, body.url, body.name || 'origin');
        if (!r.ok) return err(res, 400, r.error);
        os.emit('idearium.repo.git.remote', { repoUuid: repo.uuid, name: r.name, kind: r.kind });
        return ok(res, { repoUuid: repo.uuid, ...r });
      }
      if (action === 'repo.git.commit') {
        const r = await G.commit(dir, { message: body.message, authorName: body.authorName || null, authorEmail: body.authorEmail || null });
        if (!r.ok) return err(res, 400, r.error);
        if (!r.nothingToCommit) os.emit('idearium.repo.git.commit', { repoUuid: repo.uuid, commit: r.commit, files: r.files });
        return ok(res, { repoUuid: repo.uuid, ...r });
      }
      const a = auth();
      if (a.error) return err(res, 400, a.error);
      if (action === 'repo.git.push') {
        const r = await G.push(dir, { remote: body.remote || 'origin', branch: body.branch || null, keyPath: a.keyPath, token: a.token });
        if (!r.ok) return err(res, 400, r.error, { remote: r.remote, branch: r.branch });
        os.emit('idearium.repo.git.push', { repoUuid: repo.uuid, remote: r.remote, branch: r.branch });
        return ok(res, { repoUuid: repo.uuid, ...r });
      }
      // pull — then bring the changed files into the repo (its content is the
      // spec: a file changed only on disk would be rewritten from its chunk by
      // the next materialize). Text files update their chunks; binaries stay on
      // disk and are listed, since only an import writes the source layer.
      if (repo.immutable) return err(res, 400, 'this repo is immutable (a Nexus system) — pull into a branch instead');
      const r = await G.pull(dir, { remote: body.remote || 'origin', branch: body.branch || null, keyPath: a.keyPath, token: a.token });
      if (!r.ok) return err(res, 400, r.error);
      const { applied, removed, binary, failed } = _applyChangedFilesToRepo(repo.uuid, dir, r.changed);
      os.emit('idearium.repo.git.pull', { repoUuid: repo.uuid, remote: r.remote, branch: r.branch, applied: applied.length, removed: removed.length });
      return ok(res, { repoUuid: repo.uuid, ...r, applied, removed, binary, failed });
    }

    // Clone a git URL into a NEW repo — the same file rules as "Import project"
    // (lib/zip-ingest.js), then the clone's .git moves into the repo folder so
    // push/pull work straight away. Chunking is deferred exactly like a zip
    // import: the UI calls POST /api/repos/:uuid/chunk next.
    case 'git.clone': {
      const G = _require('../../lib/repo-git.js');
      const v = G.validateRemoteUrl(body.url);
      if (!v.ok) return err(res, 400, v.error);
      const name = String(body.name || v.url.replace(/\.git$/i, '').split(/[/:]/).filter(Boolean).pop() || 'repo').slice(0, 200);
      let keyPath = null;
      if (body.keyPath) {
        const chk = _require('../../cos/ci/index.js').checkKeyRef(String(body.keyPath));
        if (!chk.ok) return err(res, 400, chk.error);
        keyPath = String(body.keyPath);
      }
      const tmpRoot = fs.mkdtempSync(path.join(_require('os').tmpdir(), 'nexus-clone-'));
      const dest = path.join(tmpRoot, 'repo');
      try {
        const c = await G.clone(v.url, dest, { keyPath, token: body.token || null, depth: body.full ? 0 : 1 });
        if (!c.ok) return err(res, 400, c.error);
        const im = await _importFolderAsRepo({ dir: dest, name, source: 'git-clone',
          compartmentId: _ensureCompartment(`idearium-git-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, `git clone of ${v.url}`) });
        if (im.error) return err(res, im.status || 400, im.error);
        os.emit('idearium.repo.git.cloned', { repoUuid: im.repoUuid, name, kind: v.kind, fileCount: im.fileCount });
        return ok(res, { repo: getRepoLayer().get(im.repoUuid), repoUuid: im.repoUuid, name, url: v.url,
          fileCount: im.fileCount, chunkCount: im.chunkCount, omittedCount: im.omitted.length, omitted: im.omitted.slice(0, 50),
          pipeline: { state: 'DEFERRED', note: 'call POST /api/repos/:uuid/chunk' } });
      } finally {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
      }
    }

    // ── §0.39.265 — compartment remotes (lib/cos-remote.js) ──────────────
    // Push/pull/status/browse run OUT OF PROCESS (runIsolated): packing a big
    // compartment must not stall this API. An ssh remote signs in with an SSH
    // key ALIAS registered to the compartment (cos/ci/keys.js), resolved here
    // to its path; the key itself never moves. When the compartment belongs to
    // an Idearium repo, the repo's folder travels as the compartment's project
    // part, and a pull that changed it updates the repo.
    case 'cos.compartments.list': {
      const CR = _require('../../lib/cos-remote.js');
      const bridge = _require('../../lib/cos-bridge.js');
      const L = getRepoLayer();
      const repoOf = new Map(((L.repos && L.repos.repos) || []).filter(r => r.compartmentId && r.status !== 'archived').map(r => [r.compartmentId, { uuid: r.uuid, name: r.name }]));
      const list = bridge.listCompartments().map(c => ({ id: c.id, name: c.name, purpose: c.purpose || '', parentId: c.parentId || null, state: c.state || null,
        repo: repoOf.get(c.id) || null, remotes: CR.listRemotes(c.id).map(r => ({ name: r.name, kind: r.kind, location: r.location, lastPush: r.lastPush || null, lastPull: r.lastPull || null })) }));
      return ok(res, { available: bridge.available(), compartments: list });
    }

    case 'cos.remote.list':
    case 'cos.remote.add':
    case 'cos.remote.remove':
    case 'cos.remote.status':
    case 'cos.remote.push':
    case 'cos.remote.pull': {
      const CR = _require('../../lib/cos-remote.js');
      const bridge = _require('../../lib/cos-bridge.js');
      const comp = bridge.getCompartment(params.cid);
      if (!comp) return err(res, 404, `compartment not found: ${params.cid}`);
      const repoRow = (() => { try { const L = getRepoLayer(); return ((L.repos && L.repos.repos) || []).find(r => r.compartmentId === comp.id && r.status !== 'archived') || null; } catch (_) { return null; } })();
      if (action === 'cos.remote.list') return ok(res, { compartmentId: comp.id, name: comp.name, repoUuid: repoRow ? repoRow.uuid : null, remotes: CR.listRemotes(comp.id), parts: CR.partsOf(comp).map(p => p.part) });
      if (action === 'cos.remote.add') {
        const r = CR.addRemote(comp.id, { name: body.name || 'origin', location: body.location, keyAlias: body.keyAlias || null });
        if (!r.ok) return err(res, 400, r.error);
        os.emit('idearium.cos.remote.added', { compartmentId: comp.id, name: r.name, kind: r.kind });
        return ok(res, { compartmentId: comp.id, remote: r });
      }
      if (action === 'cos.remote.remove') {
        const r = CR.removeRemote(comp.id, params.name);
        return r.ok ? ok(res, { compartmentId: comp.id, removed: params.name }) : err(res, 404, r.error);
      }
      const remote = CR.listRemotes(comp.id).find(x => x.name === params.name);
      if (!remote) return err(res, 404, `this compartment has no remote named "${params.name}"`);
      let keyPath = null;
      if (remote.kind === 'ssh' && remote.keyAlias) {
        const k = _require('../../cos/ci/keys.js').resolveSshKey({ compartmentName: comp.id, alias: remote.keyAlias });
        if (!k.ok) return err(res, 400, k.error);
        keyPath = k.keyPath;
      }
      // a repo's folder is the compartment's project part — mount it if it never was (spec-created repos)
      if (repoRow && !CR.partsOf(comp).some(p => p.part === 'project')) {
        const dir = _repoDiskDir(repoRow.uuid);
        if (dir) bridge.mountPath(comp.id, { path: dir, role: 'project' });
      }
      const op = action.split('.').pop();
      const r = await CR.runIsolated(op, { compartment: comp.id, remote: remote.name, keyPath, force: !!body.force });
      if (!r.ok) return err(res, op === 'status' ? 502 : 409, r.error, { state: r.state || null });
      let repoSync = null;
      if (op === 'pull' && repoRow && r.changed && r.changed.project && r.changed.project.length) {
        const pm = CR.partsOf(bridge.getCompartment(comp.id)).find(p => p.part === 'project');
        if (pm) repoSync = _applyChangedFilesToRepo(repoRow.uuid, pm.dir, r.changed.project);
      }
      // emits: idearium.cos.remote.push, idearium.cos.remote.pull
      if (op !== 'status') os.emit(`idearium.cos.remote.${op}`, { compartmentId: comp.id, remote: remote.name, state: r.state, repoUuid: repoRow ? repoRow.uuid : null });
      return ok(res, { compartmentId: comp.id, remote: remote.name, repoUuid: repoRow ? repoRow.uuid : null, ...r, repoSync });
    }

    // What is kept at a location (to pull a compartment this machine does not
    // have), and pulling one. A pulled compartment's project part becomes a
    // new Idearium repo, attached to the compartment so its next push carries it.
    case 'cos.remote.browse':
    case 'cos.remote.clone': {
      const CR = _require('../../lib/cos-remote.js');
      let keyPath = null;
      if (body.keyPath) {
        const chk = _require('../../cos/ci/index.js').checkKeyRef(String(body.keyPath));
        if (!chk.ok) return err(res, 400, chk.error);
        keyPath = String(body.keyPath);
      }
      if (action === 'cos.remote.browse') {
        const r = await CR.runIsolated('browse', { location: body.location, keyPath });
        return r.ok ? ok(res, r) : err(res, 400, r.error);
      }
      if (!body.name) return err(res, 400, 'name (which compartment to pull) is required');
      const r = await CR.runIsolated('pull', { location: body.location, name: body.name, keyPath });
      if (!r.ok) return err(res, 400, r.error);
      let repo = null;
      if (r.project && r.project.dir) {
        try {
          const im = await _importFolderAsRepo({ dir: r.project.dir, name: r.name, source: 'cos-remote', compartmentId: r.compartmentId });
          if (im.error) repo = { error: im.error };
          else {
            _require('../../lib/cos-bridge.js').mountPath(r.compartmentId, { path: im.matDir, role: 'project' });
            repo = { repoUuid: im.repoUuid, fileCount: im.fileCount };
          }
        } finally { try { fs.rmSync(r.project.dir, { recursive: true, force: true }); } catch (_) {} }
      }
      os.emit('idearium.cos.remote.cloned', { compartmentId: r.compartmentId, name: r.name, repoUuid: repo && repo.repoUuid || null });
      return ok(res, { ...r, project: r.project ? { files: r.project.files } : null, repo });
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
      // §0.39.271 — the body moved into _commitRepoSnapshotFor() unchanged, so the
      // nexus "snapshot every system" and a phase build (I2: snapshot before write)
      // take the same snapshot this route takes.
      const r = await _commitRepoSnapshotFor(params.uuid, body);
      if (!r.ok) return err(res, r.status, r.error, r.extra);
      return ok(res, r.data);
    }

    case 'repo.snapshot.list': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const { SNAPSHOT_SYSTEM, summarizeRepoSnapshots, snapshotBranch } = await import('../repo/snapshot.js');
      // §0.39.271 V1 — "get versionium working": versionium's history answered with the
      // FIRST 200 commits of every repo together, in store order. Once all repos had made
      // 200 snapshots between them (15 nexus systems per sync alone), a repo's new
      // snapshots stopped appearing here. Now: this repo's branch only, newest 1000.
      const hist = await _versionium('GET', `/api/versionium/history?system=${encodeURIComponent(SNAPSHOT_SYSTEM)}&branch=${encodeURIComponent(snapshotBranch(params.uuid))}&n=1000`);
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
    // ── §0.39.271 S1 — the living spec ─────────────────────────────────────
    case 'repo.living-spec': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const LS = await import('../repo/living-spec.js');
      const dir = _repoDiskDir(params.uuid);
      const list = await LS.listSpecs({ repo, repoDir: dir });
      const want = query.path || list.primary;
      const open = want ? await LS.readSpec({ repo, repoDir: dir, specPath: want }) : null;
      if (query.path && open && open.error) return err(res, 404, open.error);
      return ok(res, { repoUuid: params.uuid, ...list, open });
    }

    // ── §0.39.271 P2/P3 — the Phases manager ───────────────────────────────
    case 'repo.phases.get': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      if (!dir) return err(res, 500, 'could not resolve repo directory');
      const PH = await import('../repo/phases.js');
      return ok(res, PH.managerView({ repo, repoDir: dir, runs: _phaseRuns(params.uuid) }));
    }
    case 'repo.phases.runs': {
      if (!getRepoLayer().get(params.uuid)) return err(res, 404, `repo not found: ${params.uuid}`);
      const runs = _phaseRuns(params.uuid);
      return ok(res, { repoUuid: params.uuid, runs: query.phase ? runs.filter(r => r.phase === query.phase) : runs });
    }
    case 'repo.phases.status': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const { map, phase, status, force } = body || {};
      if (!map || !phase || !status) return err(res, 400, 'map, phase and status are required');
      const r = await _phaseSetStatus(repo, { map, phase, status, force: force === true, reason: body.reason || `phase ${phase} → ${status}` });
      if (!r.ok) return err(res, r.status, r.error, r.extra);
      return ok(res, r.data);
    }
    case 'repo.phases.add': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      const PH = await import('../repo/phases.js');
      const { addPhase, RoadmapError } = await import('../repo/roadmap.js');
      const { maps, scope, snapshot } = PH.mapsFor({ repo, repoDir: dir });
      const target = body.map ? maps.find(m => m.path === body.map) : null;
      if (body.map && !target) return err(res, 404, `no phasemap ${body.map} in this repo`);
      if (!target && scope.source === 'nexus') return err(res, 400, 'name the phasemap (map) to add to — a nexus phase lives in one of docs/*phasemap*.spec');
      let add;
      try { add = addPhase({ text: target ? target.text : null, mapName: target ? target.path.split('/').pop().replace(/\.spec$/, '') : 'roadmap-phasemap', title: body.title, does: body.does || '', dependsOn: Array.isArray(body.dependsOn) ? body.dependsOn : [], prefix: body.prefix || 'P' }); }
      catch (e) { if (e instanceof RoadmapError) return err(res, 400, e.message, { code: e.code }); throw e; }
      const mapPath = target ? target.path : 'roadmap-phasemap.spec';
      const w = await _phaseWrite(repo, scope, mapPath, add.text, snapshot, `add phase ${add.id}`);
      if (!w.ok) return err(res, w.status || 500, w.error, { code: w.code || 'WRITE_FAILED' });
      getIdeaOS().emit('idearium.repo.roadmap.updated', { repoUuid: params.uuid, map: mapPath, phase: add.id, added: true, via: w.via });
      return ok(res, { repoUuid: params.uuid, map: mapPath, id: add.id, via: w.via, applyId: w.applyId || null });
    }
    // §0.39.281 EC8 — the economy, from guardian (the one owner)
    case 'economy.get': case 'economy.set': case 'economy.view': {
      const what = action === 'economy.view' ? String(params.what || '') : '';
      if (what && !['usage', 'limits', 'routing'].includes(what)) return err(res, 404, `no economy view "${what}" — usage, limits or routing`);
      const qs = what === 'limits' && query.days ? `?days=${encodeURIComponent(query.days)}` : what === 'routing' && query.jobType ? `?jobType=${encodeURIComponent(query.jobType)}` : '';
      try {
        const d = action === 'economy.set'
          ? await _nexusClient.post('guardian', '/api/economy', { policy: (body && body.policy) || body || {}, by: (body && body.by) || 'settings-console' }, { timeout: 10000 })
          : await _nexusClient.get('guardian', `/api/economy${what ? '/' + what : ''}${qs}`, { timeout: 10000 });
        const { ok: _o, ...rest } = d || {};
        return ok(res, rest);
      } catch (e) { return err(res, 502, `guardian (:7820) could not be asked about the economy: ${e.message}`); }
    }

    // §0.39.280 — the build surface (api/build-surface.js); each returns { status, json }
    case 'repo.files.state': case 'repo.deviation.get': case 'repo.deviation.recalc': case 'repo.environment.get':
    case 'repo.environment.set': case 'repo.environment.setup': case 'repo.spec.plan.get': case 'repo.spec.plan':
    case 'repo.spec.build': case 'repo.plan': case 'repo.file.manage': {
      const BS = await import('./build-surface.js');
      const d = _buildSurfaceDeps();
      const u = params.uuid;
      const r = action === 'repo.files.state' ? await BS.filesState(d, u)
        : action === 'repo.deviation.get' ? await BS.deviationGet(d, u)
        : action === 'repo.deviation.recalc' ? await BS.deviationRecalc(d, u)
        : action === 'repo.environment.get' ? await BS.environmentGet(d, u)
        : action === 'repo.environment.set' ? await BS.environmentSet(d, u, body)
        : action === 'repo.environment.setup' ? await BS.environmentSetup(d, u)
        : action === 'repo.spec.plan.get' ? await BS.specPlanGet(d, u, query.path)
        : action === 'repo.spec.plan' ? await BS.specPlan(d, u, body || {})
        : action === 'repo.spec.build' ? await BS.specBuild(d, u, body || {})
        : action === 'repo.plan' ? await BS.plan(d, u, { map: query.map || null })
        : await BS.manage(d, u, body || {});
      if (!r.json.ok) { const { ok: _o, error, ...detail } = r.json; return err(res, r.status, error, Object.keys(detail).length ? detail : null); }
      return ok(res, r.json.data);
    }
    case 'repo.phases.build': {
      const repo = getRepoLayer().get(params.uuid);
      if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
      const dir = _repoDiskDir(params.uuid);
      const { map, phase } = body || {};
      if (!map || !phase) return err(res, 400, 'map and phase are required');
      const r = await _phaseBuild(repo, dir, { map, phase, backend: body.backend || null, agent: body.agent || null, provider: body.provider || null, note: body.note || '' });
      if (!r.ok) return err(res, r.status, r.error, r.extra);
      return ok(res, r.data);
    }

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
      // §SB33 — the agent's persona re-grounded on the index it just got (a stale "not indexed" is a lie on every send)
      let persona = null;
      try { const RH = _require('../../lib/repo-hat.js'); if (RH.getRepoHat(repo.uuid)) persona = RH.refreshRepoHatPersona({ repo, repoDir: dir }).ok; } catch (e) { persona = `not refreshed: ${e.message}`; }
      return ok(res, { pipeline, persona });
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
        // §0.39.267 — James: "the eravos options need to be removed from this prompt." A new spec is a project,
        // not an eravos mod; the mods stay reachable (?include=eravos) and specs already built from one still build.
        const wantEravos = /(^|,)eravos(,|$)/.test(String((query && query.include) || ''));
        if (wantEravos) {
          try { eros = FTP.listEravosMods(); }
          catch (e) { console.warn(`[speceng.templates] eravos mods unavailable: ${e.message}`); }
        }
        return ok(res, { templates: [...se.listTemplates(), ...cos, ...eros] });
      }
      catch (e) { return err(res, 500, e.message); }
    }

    // §0.39.265 — "Generate code": a finished document spec becomes a CODE spec
    // (createFileTreeSpec — one chunk per real file, kernel → engine → runtime →
    // test, built with expectCode and materialised into its repo). The files are
    // planned by the agent from the spec's own content (lib/spec-digest.js), and every
    // file prompt carries it. The two specs link both ways (codeSpecUuid /
    // codeFor), so the document spec offers "open the code" afterwards, and a
    // second click does not plan a second tree unless asked (body.again).
    case 'speceng.codegen': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      let doc;
      try { doc = se.loadSpec(params.uuid); } catch (_) { return err(res, 404, `spec not found: ${params.uuid}`); }
      if (doc.fileTree || doc.type === 'filetree') return err(res, 400, 'this spec is already the code — build its files');
      const live = (doc.chunks || []).filter(c => c.status !== 'removed');
      const pending = live.filter(c => c.status !== 'complete');
      if (pending.length) return err(res, 409, `finish the spec first — ${pending.length} section(s) not built: ${pending.map(c => c.sectionId).join(', ')}`);
      const repoFor = (specUuid) => { try { const L = getRepoLayer(); const r = ((L.repos && L.repos.repos) || []).find(x => x.specUuid === specUuid && x.status !== 'archived'); return r ? r.uuid : null; } catch (_) { return null; } };   // raw rows — list() enriches every repo
      if (doc.codeSpecUuid && !body.again) {
        try {
          const existing = se.loadSpec(doc.codeSpecUuid);
          const _cr = repoFor(existing.uuid);
          if (_cr) _linkCodeRepo({ uuid: _cr, source: 'spec.codegen', promotedFromSpec: doc.uuid });
          return ok(res, { manifest: existing, existing: true, repoUuid: _cr });
        } catch (_) { /* the code spec was deleted — plan a new one */ }
      }
      const digest = _require('../../lib/spec-digest.js').specDigest(doc);   // the spec, condensed for the planner and every file prompt
      if (!digest) return err(res, 409, 'the spec has no written sections to generate code from');
      const description = [
        doc.description || '',
        'Build exactly what this finished spec describes. Where it names a storage layer, tool or service that the project does not have, write a small real adapter for it rather than assuming it exists.',
        digest,
      ].filter(Boolean).join('\n\n');
      const FTP = _require('../../lib/file-tree-plan.js');
      const warpFn = await getWarpChunkDispatch();
      const ask = warpFn ? async (prompt) => {
        const who = _buildIdentity(params.uuid);   // §0.39.267 — the planner wears the same hat the files will be built in
        const r = await warpFn(prompt, { chunkTitle: `plan: ${doc.name}`, expectCode: false, preferAgent: body.agent || who.provider || null, hat: who.hat, model: who.model,
          agentId: who.agentId, compartmentId: who.compartmentId, repoUuid: who.repoUuid });
        if (!r || !r.ok) throw new Error((r && r.error) || 'plan dispatch failed');
        return r.text;
      } : null;
      // §0.39.309 SB12 (docs/2026-10-05-build-from-the-spec-phasemap.spec) — James: "Using the register as a dependancy
      // and file check list." A spec whose registry section carries a valid components list is built FROM it: one file
      // per component, each waiting on the files its wires name. No usable registry → the agent plans as before, and the
      // reason is in the answer (registry.problems), never silently.
      const RP = _require('../../lib/registry-plan.js');
      const regChunk = (doc.chunks || []).find(c => c.sectionId === 'registry' && c.status === 'complete');
      const registry = regChunk ? RP.parseRegistry(regChunk.content) : { components: [], problems: ['the spec has no registry section'] };
      let planned;
      if (registry.components.length && !body.freePlan) planned = RP.toPlan(registry.components);
      else {
        try { planned = await FTP.plan({ name: doc.name, description, ask }); }
        catch (e) { return err(res, 502, `planning the files failed: ${e.message}`); }
      }
      if (!planned.ok) return err(res, 422, (planned.errors || ['the files could not be planned']).join('; '), { agentError: planned.agentError || null, registry: { used: false, problems: registry.problems } });
      let manifest;
      try {
        manifest = se.createFileTreeSpec({ name: `${doc.name} · code`, description, plan: planned, agent: body.agent || null, ideaUuid: doc.ideaUuid || null });
        manifest.codeFor = doc.uuid;
        if (planned.planSource === 'registry') manifest.registry = registry.components;   // the checklist verify reads
        se.saveSpec(manifest);
        const freshDoc = se.loadSpec(doc.uuid);
        freshDoc.codeSpecUuid = manifest.uuid;
        freshDoc.updatedAt = Date.now();
        se.saveSpec(freshDoc);
      } catch (e) { return err(res, 500, `could not create the code spec: ${e.message}`); }
      try { FTP.writeTreeNode(manifest); }
      catch (e) { console.warn(`[speceng.codegen] .filetree node write failed (code spec still created): ${e.message}`); }
      // Its repo, the same way speceng.create makes one — so the files land somewhere real as they build.
      // §0.39.279 — James: "each new repo, if applicable could create a branch of the original, to save resources".
      // When a repo owns the document spec (the original), the code repo is a BRANCH of it: its files a git worktree of
      // the original's directory (branch nexus/<name>), its compartment a CHILD of the original's (so its VM disk is a
      // copy-on-write overlay of the original's — cos/workspace). body.branch === false, or no original, or no git →
      // a separate copy with its own compartment, as before (and the reason is in the response).
      let repoUuid = null, branchInfo = null;
      const _origin = (() => { try { return ((getRepoLayer().repos && getRepoLayer().repos.repos) || []).find(x => x.specUuid === doc.uuid && x.status !== 'archived' && x.source !== 'spec.codegen') || null; } catch (_) { return null; } })();
      const _mode = process.env.IDEARIUM_CODE_REPO_MODE || (() => { try { return getIdeariumValue('repos.code_repo_mode'); } catch (_) { return 'branch'; } })();
      if (_origin && body.branch !== false && _mode !== 'copy') {
        try {
          const cosBridge = _require('../../lib/cos-bridge.js');
          const ws = await cosBridge.branchWorkspaceAsync({ originDir: _repoDiskDir(_origin.uuid), name: manifest.name });   // §0.39.284 W1 — never the sync git in a request
          branchInfo = ws.ok ? { ...ws, originUuid: _origin.uuid } : { ok: false, error: ws.error, originUuid: _origin.uuid };
          if (!ws.ok) console.warn(`[speceng.codegen] branch of ${_origin.uuid.slice(0, 8)} not made (${ws.error}) — a separate copy instead`);
        } catch (e) { branchInfo = { ok: false, error: e.message }; }
      }
      const _branchCompartment = () => {
        const parent = _origin && _origin.compartmentId;
        if (!parent) return _ensureCompartment(`idearium-repo-${manifest.uuid.slice(0, 8)}`, manifest.name);
        try {
          const cosBridge = _require('../../lib/cos-bridge.js');
          const c = cosBridge.createCompartment({ name: cosBridge.uniqueName(`idearium-repo-${manifest.uuid.slice(0, 8)}`), purpose: `${manifest.name} — branch of ${_origin.name}`, networkIsolated: true, parentId: parent });
          return c.ok ? c.compartment.id : _ensureCompartment(`idearium-repo-${manifest.uuid.slice(0, 8)}`, manifest.name);
        } catch (_) { return _ensureCompartment(`idearium-repo-${manifest.uuid.slice(0, 8)}`, manifest.name); }
      };
      try {
        const branched = !!(branchInfo && branchInfo.ok);
        const r = getRepoLayer().ingest({
          name: manifest.name, specUuid: manifest.uuid, source: 'spec.codegen',
          parent: doc.ideaUuid || null, ideaUuid: doc.ideaUuid || null, promotedFromSpec: doc.uuid,
          compartmentId: branched ? _branchCompartment() : _ensureCompartment(`idearium-repo-${manifest.uuid.slice(0, 8)}`, manifest.name),
          ...(branched ? { materializeDir: branchInfo.dir, branchOf: _origin.uuid, branch: branchInfo.branch } : {}),
        });
        if (r.error) console.warn(`[speceng.codegen] repo creation failed, code spec still created: ${r.error}`);
        else { repoUuid = (r.repo && r.repo.uuid) || null; if (r.repo) _linkCodeRepo({ ...r.repo, source: 'spec.codegen', promotedFromSpec: doc.uuid }); }
      } catch (e) { console.warn(`[speceng.codegen] repo creation threw, code spec still created: ${e.message}`); }
      os.emit('idearium.spec-engine.codegen', { specUuid: doc.uuid, codeSpecUuid: manifest.uuid, repoUuid, files: planned.files.length, planSource: planned.planSource });
      console.log(`[speceng.codegen] "${doc.name}" → ${planned.files.length} file(s) planned (${planned.planSource}) · code spec ${manifest.uuid.slice(0, 8)}`);
      return ok(res, { manifest: se.loadSpec(manifest.uuid), repoUuid,
        branch: branchInfo ? (branchInfo.ok ? { of: branchInfo.originUuid, branch: branchInfo.branch, dir: branchInfo.dir } : { made: false, reason: branchInfo.error }) : null,
        plan: { planSource: planned.planSource, files: planned.files.length, rejected: planned.rejected.length, agentError: planned.agentError || null, layers: manifest.fileTree && manifest.fileTree.layers },
        registry: { used: planned.planSource === 'registry', components: registry.components.length, problems: registry.problems } });
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
        // §0.39.286 GN1 — genesis is the default template of a system spec: a `type: 'system'` spec that names no template
        // starts from genesis (its registry/doorway and routing domains with it). Any other spec is as before; naming a
        // template, or templateIds: [], still wins.
        const _named = Array.isArray(templateIds) ? templateIds : (templateId ? [templateId] : null);
        const allIds = _named !== null ? _named : (type === 'system' ? ['genesis'] : []);
        // §BUILT 2026-09-21 — isFileTreeTemplate covers both real catalogs
        // (COS archetypes/blueprints and eravos mods); an id from either
        // takes the file-tree path below, same as a COS-only id always did.
        const fileTreeIds = allIds.filter(id => FTP.isFileTreeTemplate(id));
        const docIds = allIds.filter(id => !FTP.isFileTreeTemplate(id));
        let manifest, planInfo = null;
        if (body.fileTree === true || fileTreeIds.length) {
          const warpFn = await getWarpChunkDispatch();
          const ask = warpFn ? async (prompt) => {
            const who = _buildIdentity(null);   // §0.39.267 — no repo yet: the_builder plans a new codebase
            const r = await warpFn(prompt, { chunkTitle: `plan: ${name}`, expectCode: false, preferAgent: agent || null, hat: who.hat, model: who.model });
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
        // §0.39.291 PV2 — a file under repair (it failed verification) is never answered from a store or a prior section:
        // either would hand back the version that failed. It goes to its agent with the failure (buildChunkPrompt's repair block).
        if (!body.noReuse && !chunk.repair) {
          // §0.39.266 (C2) — a stored component with this exact contract: its bytes, 0 tokens. Unlike
          // findPriorSection below, this survives the spec it was built in being purged.
          const stored = _storedFor(chunk);
          if (stored) {
            se.completeChunk(params.uuid, chunk.uuid, stored.content, { preserveWhitespace: true });
            const um = se.loadSpec(params.uuid);
            _syncPhaseFromManifest(os, um);
            os.emit('idearium.spec-engine.chunk.complete', {
              specUuid: params.uuid, chunkUuid: chunk.uuid, sectionId: chunk.sectionId,
              progress: um.progress, source: 'component-store', component: `${stored.id}@${stored.version}`, cost: 0, cacheHit: true,
            });
            return ok(res, { reused: true, component: `${stored.id}@${stored.version}`, sectionId: chunk.sectionId,
              progress: um.progress, message: `reused component ${stored.id}@${stored.version} — 0 tokens` });
          }
          try {
            const prior = se.findPriorSection(chunk.sectionId, chunk.sectionDesc, params.uuid);
            if (prior && prior.content) {
              se.completeChunk(params.uuid, chunk.uuid, prior.content);
              _storeBuilt(manifest, chunk, prior.content, { source: 'reuse' });   // a file built before the store existed joins it
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
        // §0.39.266 (C2) — the same prompt built before (WARP's exact-cache key), answered from the store: a crystal
        // that outlives warp-crystals.json and the spec it was built in.
        if (!body.noReuse && !chunk.repair && chunk.realPath) {
          const stored = _storedFor(chunk, { prompt: chunkPrompt });
          if (stored) {
            se.completeChunk(params.uuid, chunk.uuid, stored.content, { preserveWhitespace: true });
            _storeBuilt(manifest, chunk, stored.content, { source: 'component-store' });   // records this chunk's contract on it
            const um = se.loadSpec(params.uuid);
            _syncPhaseFromManifest(os, um);
            os.emit('idearium.spec-engine.chunk.complete', {
              specUuid: params.uuid, chunkUuid: chunk.uuid, sectionId: chunk.sectionId,
              progress: um.progress, source: 'component-store', component: `${stored.id}@${stored.version}`, cost: 0, cacheHit: true,
            });
            return ok(res, { reused: true, component: `${stored.id}@${stored.version}`, sectionId: chunk.sectionId,
              progress: um.progress, message: `reused component ${stored.id}@${stored.version} — 0 tokens` });
          }
        }
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
        // §0.39.267 — a repo's spec builds with that repo's Agent-tab switch and hat. Order: this call's body.agent,
        // then a chunk agent someone picked by hand (agentPinned, set by the per-chunk select), then the repo's
        // switch, then the chunk's creation-time agent, the spec's, and chatgpt.
        const who = _buildIdentity(params.uuid);
        const preferAgent   = body.agent || (chunk.agentPinned ? chunk.agent : null) || who.provider || chunk.agent || manifest.agent || 'chatgpt';
        // §0.39.286 RG3 — the route, not one hard-coded hop: lib/pipeline-routing.js plan() over the routing.* config —
        // the chosen agent, this block's own fallback, the global chain (or local-first / economy / fixed), providers
        // whose breaker is open skipped. A call may still name its own: body.route (a list) or body.fallbackAgent.
        const routingPolicy = _routingPolicy(body.routing || {});
        // §CT1 0.39.347 — the route from copilot's door (one place decides, its breakers, what it has learned); the local
        // plan only when copilot cannot be reached, and then it says so (routeVia)
        const _blk = (se.SPEC_SECTIONS || []).find(b => b.id === chunk.sectionId) || null;
        const _PR = _require('../../lib/pipeline-routing.js');
        let routePlan;
        if (Array.isArray(body.route) && body.route.length) routePlan = { mode: 'given', route: body.route.map(p => ({ provider: p, why: 'given by the call' })), skipped: [], routeVia: 'the call' };
        else {
          const RAx = _require('../../lib/repo-agent.js');
          const d = await _postJson(`${RAx.COPILOT_URL}/api/route`, { kind: _PR.jobTypeOf(chunk), preferAgent, block: _blk ? { id: _blk.id, agent: _blk.agent, fallback: _blk.fallback || [] } : null, policy: routingPolicy }, 5000);
          if (d.status === 200 && d.json && d.json.ok && Array.isArray(d.json.route) && d.json.route.length) routePlan = { mode: d.json.mode, route: d.json.route.map(h => ({ provider: h.provider, why: h.why })), skipped: d.json.skipped || [], routeVia: 'copilot' };
          else routePlan = { ..._PR.plan({ preferAgent, block: _blk, chunk, policy: routingPolicy }), routeVia: `local — copilot could not route (${(d.json && d.json.error) || `status ${d.status}`})` };
        }
        if (body.fallbackAgent && !routePlan.route.some(r => r.provider === body.fallbackAgent)) routePlan.route.splice(1, 0, { provider: body.fallbackAgent, why: 'given by the call' });
        const fallbackAgent = null;   // the route carries the fallbacks now (0.39.286); kept so nothing below changes shape

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
            { content: chunkPrompt, file: null, title: chunk.title || chunk.sectionId, forAgent: preferAgent, hat: who.hat ? (who.hat.uuid || who.hat.name) : null },
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
        // §0.39.269 — memory: what this agent built before (the download manager) and the files already finished in
        // this spec (their exports/requires, so the new file wires to them instead of reinventing them). Beside the
        // prompt, not in it: WARP's cache key stays the chunk's own contract.
        // §0.39.309 — James: "They need context. All of it. From the hat/repo." A file build wears the repo's hat (as
        // before) and gets every context source the Agent tab has, through the repo's editable BUILD blocks
        // (lib/repo-prompt-blocks.js when: build — his 0.39.258 rule: nothing he cannot edit): build-memory (its past
        // work + this project's files beside it), build-context (lib/build-context.js: relations, users, primitives,
        // invariants), build-atlas (everything else NEXUS remembers that matches), build-code (this repo's own code that
        // matches). A block switched off costs no search. Beside the prompt: WARP's cache key stays the contract.
        let memory = '', memoryInfo = null, buildCtx = null;
        {
          const PB = _require('../../lib/repo-prompt-blocks.js');
          const on = PB.enabledBuild(PB.getBlocks(who.repoUuid || null));
          let repo = null, repoDir = null;
          try {
            const L = getRepoLayer();
            repo = who.repoUuid ? L.get(who.repoUuid) : null;
            repoDir = repo ? await _agentDir(repo.uuid) : null;   // §SB35 — the same directory the Agent tab reads, indexed
          } catch (e) { console.warn(`[idearium/api] speceng.build: repo ${who.repoUuid} unreadable (${e.message}) — building without its repo context`); }
          const query = [chunk.realPath, (chunk.file && chunk.file.purpose) || chunk.title || chunk.sectionId, chunk.sectionDesc].filter(Boolean).join(' ');
          const data = { memory: '', build: '', atlas: '', code: '' };
          const sources = {}, failed = [];
          if (on.has('build-context') && chunk.realPath) {
            try {
              // buildsOn:false for a file chunk — its prompt already carries every lower file (the most relevant in full, the rest by interface)
              buildCtx = _require('../../lib/build-context.js').pack({ manifest, chunk, repo, repoDir, buildsOn: !chunk.file });
              data.build = buildCtx.text; sources.build = buildCtx.sources;
              for (const [k, v] of Object.entries(buildCtx.sources || {})) if (typeof v === 'string' && /^failed/.test(v)) failed.push(`build-context.${k}: ${v}`);
            } catch (e) { failed.push(`build-context: ${e.message}`); }
          }
          if (on.has('build-memory')) {
            try {
              // a file the prompt already carries (every layer below this one) is not listed again as a sibling
              const LAYER = { kernel: 0, engine: 1, runtime: 2, test: 3 };
              const below = (c) => !!(chunk.file && c.file && (LAYER[c.file.layer] ?? 9) < (LAYER[chunk.file.layer] ?? 2));
              const siblings = (manifest.chunks || []).filter(c => c.uuid !== chunk.uuid && c.status === 'complete' && c.realPath && typeof c.content === 'string' && c.content.trim() && !below(c))
                .map(c => ({ path: c.realPath, content: c.content }));
              const m = await _require('../../lib/agent-memory.js').recall({ agentId: who.agentId, siblings, query });
              data.memory = m.text; sources.memory = m.sources;
            } catch (e) { failed.push(`build-memory: ${e.message}`); }
          }
          if (on.has('build-atlas')) {
            try {
              const a = await _require('../../lib/context-atlas.js').block(query, { repoDir, repoUuid: who.repoUuid || null, excludeAgent: who.agentId || null, budget: 2400 });
              data.atlas = a.text; sources.atlas = { hits: a.hits, reason: a.reason || null };
            } catch (e) { failed.push(`build-atlas: ${e.message}`); }
          }
          if (on.has('build-code') && repoDir && fs.existsSync(repoDir)) {
            try {
              const c = _require('../../lib/repo-context.js').retrieve({ repoDir, message: query, bare: true });
              if (c.kind === 'code' && c.block) data.code = c.block;
              sources.code = { kind: c.kind || null, chars: c.chars || 0, reason: c.reason || null };
            } catch (e) { failed.push(`build-code: ${e.message}`); }
          }
          // §1.2 — a source that failed is said, once, with its reason; the rest still go
          if (failed.length) console.warn(`[idearium/api] speceng.build ${chunk.realPath || chunk.sectionId}: context source(s) failed — ${failed.join(' | ')}`);
          const r = PB.renderBuild(PB.getBlocks(who.repoUuid || null), data);
          memory = r.text;
          memoryInfo = { chars: r.text.length, used: r.used, sources, failed,
            buildContext: buildCtx ? { chars: buildCtx.chars, sections: buildCtx.sections, left: buildCtx.left.length } : null };
        }
        const route = { hat: who.hat, model: who.model, memory, agentId: who.agentId, compartmentId: who.compartmentId, repoUuid: who.repoUuid, fileName: chunk.realPath || null };
        const dispatchFn = warpFn
          ? (prompt, dispatchOpts) => warpFn(prompt, { ...dispatchOpts, chunkTitle: chunk.title || chunk.sectionId, expectCode, ...route, ...(dispatchOpts && dispatchOpts.model ? { model: dispatchOpts.model } : {}) })
          : (prompt, dispatchOpts) => as.buildChunkWithAgent(prompt, { ...dispatchOpts, ...route, ...(dispatchOpts && dispatchOpts.model ? { model: dispatchOpts.model } : {}) });   // §0.39.287 a hop's model (ollama:<model>) wins over the hat's

        dispatchChunkWithVerification(chunkPrompt, chunk, dispatchFn,
          {
            preferAgent,
            fallbackAgent,
            route: routePlan.route.map(r => r.provider), policy: routingPolicy,   // §0.39.286 RG3
            // §CT1 0.39.347 — each hop's outcome goes to copilot's door (its breakers, its learning), not a second set here
            ...(routePlan.routeVia === 'copilot' ? { report: (h) => { const RAx = _require('../../lib/repo-agent.js'); _postJson(`${RAx.COPILOT_URL}/api/route/outcome`, { provider: h.provider, kind: h.jobType, ok: h.ok, class: h.class || null, ms: h.ms, error: h.error || null, policy: routingPolicy }, 5000).catch(() => {}); } } : {}),
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
          try { if (result && result.route && se.recordChunkRoute) se.recordChunkRoute(params.uuid, chunk.uuid, result.route); } catch (_) { /* provenance is best-effort; the build outcome stands */ }
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
          // §0.39.291 — a file chunk is the code inside the reply's fence, not the fence
          const fileOut = result.ok && !result.queued && result.text ? _fileContentFromReply(chunk, result.text) : null;
          if (fileOut && !fileOut.ok) { se.failChunk(params.uuid, chunk.uuid, fileOut.error); return; }
          if (result.ok && !result.queued && result.text) {
            se.completeChunk(params.uuid, chunk.uuid, fileOut.content);
            const stored = _storeBuilt(manifest, chunk, se.loadSpec(params.uuid).chunks.find(c => c.uuid === chunk.uuid)?.content || result.text,
                                       { prompt: chunkPrompt, agent: result.agent || preferAgent, source: result.source || 'agent' });
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
              component: stored ? `${stored.id}@${stored.version}` : null,
              verifiedAttempts: result.attempts, detectionComposite: result.detection?.composite,
              buildContext: memoryInfo ? { chars: memoryInfo.chars, used: memoryInfo.used, sections: buildCtx ? buildCtx.sections : null } : null,   // §0.39.309 — what the build agent was sent, by block
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
          route: routePlan.route, routeSkipped: routePlan.skipped, routeMode: routePlan.mode, routeVia: routePlan.routeVia || null,   // §0.39.286 — what it will try, in order, and why; §CT1 — who decided
          hat: who.hat ? who.hat.name : null, hatSource: who.hatSource, repoUuid: who.repoUuid,   // §0.39.267 — who's wearing what, visible
          agentId: who.agentId, memory: memoryInfo,                                                // §0.39.269 — and what it remembered
        });
      } catch(e) { return err(res, 500, e.message); }
    }

    case 'speceng.chunk.complete': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      const { content } = body;
      if (!content) return err(res, 400, 'content required');
      try {
        // §0.39.291 — the queued (callback) path is a file chunk's reply too: the code inside the fence
        const pre = (se.loadSpecMeta(params.uuid).chunks || []).find(c => c.uuid === params.chunkUuid);
        const fileOut = _fileContentFromReply(pre, content);
        if (!fileOut.ok) { se.failChunk(params.uuid, params.chunkUuid, fileOut.error); return err(res, 422, fileOut.error); }
        const chunk = se.completeChunk(params.uuid, params.chunkUuid, fileOut.content);
        const manifest = se.loadSpec(params.uuid);
        // §0.39.266 (C2) — a queued (browser-agent) build lands here; it is a WARP build like any other.
        _storeBuilt(manifest, manifest.chunks.find(c => c.uuid === params.chunkUuid) || chunk, chunk.content || content, { agent: body.agent || null, source: 'callback' });
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

    case 'agent.providers': {
      // §0.39.267 — who can wear a hat (lib/agent-providers.js): the UI's per-chunk select reads this, not its own list.
      try {
        const P = _require('../../lib/agent-providers.js');
        return ok(res, { providers: P.all(), backends: Object.fromEntries(P.all().map(n => [n, P.backendOf(n)])), aliases: P.ALIASES });
      } catch (e) { return err(res, 500, e.message); }
    }

    case 'speceng.chunk.setAgent': {
      const se = getSpecEngine();
      if (!se) return err(res, 503, 'spec-engine not ready');
      if (body.agent === undefined) return err(res, 400, 'agent required ("" un-pins back to the default)');   // §0.39.267
      try {
        const chunk = se.setChunkAgent(params.uuid, params.chunkUuid, body.agent || '');
        os.emit('idearium.spec-engine.chunk.agent_set', {
          specUuid: params.uuid, chunkUuid: params.chunkUuid, sectionId: chunk.sectionId, agent: chunk.agent, pinned: !!chunk.agentPinned,
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
        // §0.39.266 (D2) — James: "delete old specs, idearium is supposed to do that when removing them from
        // the list." Removing a spec deletes it from disk — unless it is a live repo's CURRENT content: a
        // repo's files ARE its spec, so that one is only stopped (the old soft remove, restorable) and goes
        // when the repo itself is deleted.
        const L = getRepoLayer();
        const user = L && L.repos ? L.repos.repos.find(r => r.status !== 'archived' && r.specUuid === params.uuid) : null;
        if (user) {
          const manifest = se.deleteSpec(params.uuid);
          os.emit('idearium.spec.deleted', { specUuid: params.uuid, name: manifest.name, purged: false });
          return ok(res, { deleted: true, purged: false, uuid: params.uuid, name: manifest.name,
                           note: `stopped, not deleted: it is the content of repo "${user.name}" — delete the repo to remove it` });
        }
        let name = null; try { name = se.loadSpecMeta(params.uuid).name; } catch (_) {}
        const p = se.purgeSpec(params.uuid);
        if (!p.purged) return err(res, 404, `spec ${params.uuid} not found`);
        os.emit('idearium.spec.deleted', { specUuid: params.uuid, name, purged: true });
        return ok(res, { deleted: true, purged: true, uuid: params.uuid, name, chunkNodes: p.chunkNodes, mirrorRows: p.mirrorRows });
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

    // ── 0.39.272 — context atlas ───────────────────────────────────────────
    case 'context.directory':
      return ok(res, _require('../../lib/context-atlas.js').directory({ counts: query.counts !== '0' }));
    case 'context.search': case 'repo.context.search': {
      const q = String(query.q || query.query || '').trim();
      if (!q) return err(res, 400, 'q required');
      const sources = query.sources ? String(query.sources).split(',').map(x => x.trim()).filter(Boolean) : null;
      let repoDir = null, repoUuid = null;
      if (action === 'repo.context.search') {
        const repo = getRepoLayer().get(params.uuid);
        if (!repo) return err(res, 404, `repo not found: ${params.uuid}`);
        repoUuid = params.uuid; repoDir = _repoDiskDir(params.uuid);
      }
      const r = await _require('../../lib/context-atlas.js').search(q, { sources, limit: Math.min(parseInt(query.limit, 10) || 20, 100), repoDir, repoUuid });
      return r.ok ? ok(res, r) : err(res, 400, r.error);
    }
    case 'context.get': {
      const r = _require('../../lib/context-atlas.js').get(query.source, query.id);
      return r.ok ? ok(res, r) : err(res, 404, r.error);
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
      // §0.39.266 (D2) — specs removed before removal meant deletion are still on disk, flagged deleted.
      // Once per process: purge every one no live repo uses as its content.
      try {
        const L = getRepoLayer();
        const live = new Set(L && L.repos ? L.repos.repos.filter(r => r.status !== 'archived').map(r => r.specUuid) : []);
        const gone = se.listSpecs({ includeDeleted: true }).filter(sp => sp.deleted && !live.has(sp.uuid));
        let n = 0; for (const sp of gone) { try { if (se.purgeSpec(sp.uuid).purged) n++; } catch (_) {} }
        if (n) console.log(`[idearium/build-queue] purged ${n} removed spec(s) from disk (D2 — removing a spec deletes it)`);
      } catch (e) { console.warn(`[idearium/build-queue] removed-spec purge skipped: ${e.message}`); }
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
      _nexusSelfLast = { at: Date.now(), ok: r.ok, snapshot: r.snapshot, ms: r.ms, changed: [...r.systems.filter(x => x.status !== 'unchanged').map(x => `${x.system}:${x.status}`), ...(r.restored || []).map(x => `${x.name}:restored`)], understanding: r.understanding };
      // §0.39.266 — any sync over 1 s says where the time went, changed or not
      if (r.ms > 1000 && r.timing) console.log(`[idearium/nexus-self] sync took ${r.ms}ms — ${Object.entries(r.timing).filter(([, v]) => v >= 50).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}ms`).join(' · ')}${r.stats0 ? ` · tree ${r.stats0.files} files, ${r.stats0.hashed} re-hashed` : ''}${r.stats0 && r.stats0.changedCount && r.stats0.changedCount <= 20 ? ` · changed: ${r.stats0.changed.join(', ')}` : r.stats0 && r.stats0.changedCount ? ` · ${r.stats0.changedCount} changed (first: ${r.stats0.changed.slice(0, 5).join(', ')})` : ''}`);
      _nexusSelfLast.timing = r.timing || null;
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

export { _startBuildQueuePoller, _buildingSpecs, _reconcileSpecRepos, getRepoLayer, _ollamaModels, _nexusSelfSync, _buildIdentity, _provePhase }; // getRepoLayer: the real layer, exported so tests exercise the production write path, not a fake

/**
 * _route(method, url, body) — §0.39.279, for tests: one request through the REAL router and handler (matchRoute +
 * handle), without a listening server or startAPI's boot work. -> { status, json }
 */
export async function _route(method, url, body = {}) {
  const r = matchRoute(method, url);
  if (!r) return { status: 404, json: { ok: false, error: `${method} ${url} not found` } };
  let status = 200, raw = '';
  const res = { writeHead(code) { status = code; return this; }, setHeader() {}, end(b) { raw = b == null ? '' : String(b); }, write(b) { raw += String(b); } };
  await handle({ method, url, headers: {} }, res, r, parseQuery(url), body || {});
  let json = null; try { json = raw ? JSON.parse(raw) : null; } catch (_) { json = { raw }; }
  return { status, json };
}

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

    // §0.39.295 V1 — the void's fonts (SIL OFL, idearium/ui/fonts): binary, so not the utf8 branch above; woff2 + licenses
    if (req.method === 'GET' && /^\/fonts\/[a-z0-9-]+\.(woff2|txt)$/.test(cleanUrl)) {
      try {
        const { readFileSync, existsSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', cleanUrl.slice(1));
        if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': cleanUrl.endsWith('.woff2') ? 'font/woff2' : 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=86400' });
        res.end(readFileSync(file));
      } catch (e) { try { res.writeHead(500); res.end('internal error'); } catch (_) {} }
      return;
    }

    // §0.39.279 — the standalone pages beside the app: the repo desktop viewer and the settings console. A fixed list,
    // not a directory listing — nothing else under ui/ is served as a page.
    if (req.method === 'GET' && (cleanUrl === '/desktop.html' || cleanUrl === '/settings.html' || cleanUrl === '/archive-import.html' || cleanUrl === '/spec-library.html' || cleanUrl === '/workshop.html' || cleanUrl === '/void.html' || cleanUrl === '/architect.html')) {   // §0.39.290 IL1 the spec library · §0.39.294 SW1 the spec workshop · §0.39.295 the spatial void · §0.39.298 AR2 the architect
      try {
        const { readFileSync, existsSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const page = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', cleanUrl.slice(1));
        if (!existsSync(page)) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(readFileSync(page, 'utf8'));
      } catch (e) { try { res.writeHead(500); res.end('internal error'); } catch (_) {} }
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
    // §0.39.283 N30 — a dropped zip streams straight to disk; it is not a JSON body
    if (['POST','PATCH','PUT','DELETE'].includes(req.method) && route.action !== 'history.import.upload' && route.action !== 'spec-library.import') {
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
