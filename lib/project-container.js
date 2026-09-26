'use strict';
/**
 * lib/project-container.js — the "Upload Project" pipeline.
 *
 * James: "add an 'upload project'... asking about the name, what your
 * goals are, lists some example intents, to set as the compartment's
 * end state, creates a temporary compartment (just in case the user
 * cancels)... a dropzone... 'import repository'... generates the
 * manifest, project.json, .git... fully configurable in a config
 * file... creates the project container, then imports the compartment
 * fully as a repo, using the manifest, and project files, and a .git."
 *
 * §ARCHITECTURE — this file is deliberately CommonJS, sitting next to
 * (and calling directly into) lib/compartment-engine.js, lib/end-state.js,
 * lib/intent-classifier.js, lib/zip-ingest.js, and cortex/memory/jaa-db.js —
 * all CJS. It does NOT call idearium/repo/index.js's RepoLayer directly:
 * RepoLayer is an ESM class (idearium/package.json declares "type":
 * "module"), and Node's CJS require() cannot load an ESM module. The
 * real bridge point is idearium/api/index.js, which already does this
 * exact ESM<->CJS crossing for every other lib/ module it calls via
 * createRequire (see its own `_require`). So the flow splits cleanly:
 *
 *   1. startContainer()   — pure CJS. Classifies the intent, declares
 *      the end-state, spawns the compartment, persists the container
 *      row. Called directly from idearium/api/index.js via _require.
 *   2. idearium/api/index.js calls RepoLayer.ingest() itself (the one
 *      step only the ESM side can do) once a zip has been extracted
 *      (via lib/zip-ingest.js, also CJS, called from the ESM side the
 *      same way).
 *   3. finalizeContainer() — pure CJS again. Given the repo RepoLayer
 *      already created (uuid + its real, physical, materialized
 *      directory), writes manifest.json/project.json, runs real `git
 *      init`+commit, evaluates the end-state against what's actually
 *      on disk, and resolves the compartment through its real
 *      execute()/resolve() lifecycle — never force-PASSed.
 *   4. cancelContainer() — abandon()s the compartment if the user
 *      walks away before finalize.
 *
 * §HONESTY — finalize()'s end-state conditions check REAL artifact
 * state (files on disk, manifest present, .git present) — never a
 * fabricated "looks done" guess. If a condition genuinely isn't met,
 * the container's real COS compartment is destroyed+wiped (see
 * finalizeContainer below) rather than a swallowed error.
 *
 * §COS 2026-09-16 — James: "it should always have backend, and all
 * compartments use cos." This file used to spawn its "temporary
 * compartment (just in case the user cancels)" via
 * lib/compartment-engine.js — RAID's constraint-frame object, kept
 * ONLY in the in-memory `_live` Map below, explicitly documented as
 * lost on a process restart (see that comment, kept, still true of
 * `_live` itself — a genuinely different, unavoidable limit: which
 * upload is "in flight" is inherently this process's own state).
 * What compartment-engine.js is for — RAID's PASS/FAIL constraint-
 * frame tracking of an AI action — was never really what an upload-
 * in-progress needed; it borrowed the primitive because it was the
 * only "compartment" in the codebase at the time. cos/ (Compartment
 * OS) is the real one: creating a compartment here now goes through
 * the exact same real, gate-dispatched, store.flushSync()'d-to-disk
 * path lib/agent-tools/tools/sandbox/cos-compartment.js already uses
 * for copilot — same createHost()-per-call pattern (that file's own
 * header explains why: each real `cos <cmd>` invocation boots its own
 * host reading/writing the one shared on-disk state file, so this
 * matches actual usage, not a shortcut). That compartment's real
 * fs.root (COS-5: immutable per-compartment path, under COS's own
 * data dir — not idearium's) is where the uploaded zip's files land
 * FIRST (ingestFilesIntoContainer, called by idearium/api/index.js's
 * project-import.finalize handler, between extraction and
 * RepoLayer.ingest) — the real "container" holding the real import
 * before RepoLayer separately materializes the actual repo inside
 * idearium's own repo/repos/<uuid> (unchanged below; that's what
 * "gets added as a repo" already meant). Two real directories, two
 * real jobs: COS holds the container, idearium's repo/ folder holds
 * the repo it became — not the same directory pretending to be both.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const cfg              = require('./project-import.config.js');
const endState          = require('./end-state.js');
const intentClassifier  = require('./intent-classifier.js');

const MODULE_ID = 'project-container';
const VERSION   = '1.0.0';
const TABLE     = 'idearium_project_containers';

// Fresh createHost() per call — same real pattern
// lib/agent-tools/tools/sandbox/cos-compartment.js already uses (see its
// own header comment for why this is correct, not wasteful).
function _host() {
  const { createHost } = require('../cos/host/index.js');
  return createHost();
}

let _jaa;
function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa } = require('../cortex/memory/jaa-db')); } catch (e) {
    console.warn(`[${MODULE_ID}] jaa-db unavailable — container state will not persist: ${e.message}`);
  }
  return _jaa;
}

// In-memory table of LIVE compartment objects, keyed by container uuid.
// compartment-engine's compartment is a real, richer-than-JSON object
// (frozen constraint_frame, trace_log array) — the jaa row is the
// durable audit trail (per compartment-engine's own convention), this
// map is what a same-process finalize()/cancel() call actually acts on.
// A process restart between start() and finalize()/cancel() genuinely
// loses the in-flight compartment — honestly surfaced as an error
// below (§SCOPE), not silently reconstructed from the JSON row, which
// would fabricate a frozen constraint_frame that was never really
// re-assembled.
const _live = new Map();

// ── start ────────────────────────────────────────────────────────────────
/**
 * startContainer({ name, goal, intentText }) — the "Upload Project"
 * prompt's submit action. Classifies intentText (or goal, if no
 * separate intent phrase was given) into a real intent, declares an
 * end-state around it, spawns a temporary compartment, and persists a
 * container row in AWAITING_UPLOAD status.
 *
 * Returns { ok:true, containerUuid, compartmentId, endStateId, intent }
 * or { ok:false, error }.
 */
async function startContainer({ name, goal, intentText } = {}) {
  if (!name || !String(name).trim())  return { ok: false, error: 'name is required' };
  if (!goal || !String(goal).trim())  return { ok: false, error: 'goal is required' };

  const text = (intentText && String(intentText).trim()) || goal;
  const { intent: rawIntent } = intentClassifier.classify({ text, source: 'USER' });
  const intent = intentClassifier.freeze(rawIntent);

  // §REAL CONDITIONS — each checks actual artifact state at finalize
  // time (see finalizeContainer's `artifact` shape below). No
  // condition here can be satisfied by anything other than a real
  // file existing with real content — see lib/end-state.js's own
  // §1.1 ("a condition nothing can check is decoration").
  const declaredEndState = endState.declare({
    goal,
    owner: 'user',
    conditions: [
      {
        id: 'files-imported',
        describe: 'at least one source file was imported into the repo',
        evaluate: (artifact) => ({ met: (artifact?.fileCount || 0) > 0, progress: (artifact?.fileCount || 0) > 0 ? 1 : 0,
          detail: `${artifact?.fileCount || 0} file(s)` }),
      },
      {
        id: 'manifest-present',
        describe: 'manifest.json exists in the repo\'s real, physical directory',
        evaluate: (artifact) => ({ met: !!artifact?.manifestPath && fs.existsSync(artifact.manifestPath),
          detail: artifact?.manifestPath || null }),
      },
      {
        id: 'project-json-present',
        describe: 'project.json exists in the repo\'s real, physical directory',
        evaluate: (artifact) => ({ met: !!artifact?.projectJsonPath && fs.existsSync(artifact.projectJsonPath),
          detail: artifact?.projectJsonPath || null }),
      },
      {
        id: 'git-present',
        describe: 'a real .git directory with at least one commit exists',
        evaluate: (artifact) => ({ met: !!artifact?.git?.committed === true,
          detail: artifact?.git ? `${artifact.git.branch}@${artifact.git.commit || 'none'}` : null }),
      },
    ],
  });

  // §COS — containerUuid generated before the compartment now (used to
  // build a guaranteed-unique real COS compartment name; createCompartment
  // throws if a compartment by that name already exists — see
  // cos/cli/commands/create.js — so a name collision on a common project
  // name like "notes" must be impossible, not just unlikely).
  const containerUuid = crypto.randomUUID();
  const compName = `idearium-import-${containerUuid.slice(0, 8)}`;
  let compartment;
  try {
    const { createCompartment } = require('../cos/cli/commands/create.js');
    compartment = createCompartment(_host(), { name: compName, purpose: goal, networkIsolated: true });
  } catch (e) {
    return { ok: false, error: `compartment create failed: ${e.message}` };
  }

  const row = {
    uuid: containerUuid,
    name: String(name).slice(0, 200),
    goal: String(goal).slice(0, 2000),
    intentUuid: intent.uuid,
    compartmentId: compartment.id,
    compartmentName: compartment.name,
    compartmentRoot: compartment.fs.root,
    endStateId: declaredEndState.id,
    status: 'AWAITING_UPLOAD',
    repoUuid: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const jaa = _getJAA();
  if (jaa) { try { jaa.insert(TABLE, row); } catch (e) { console.warn(`[${MODULE_ID}] container row insert failed: ${e.message}`); } }

  _live.set(containerUuid, { compartment, endState: declaredEndState, row });

  return {
    ok: true,
    containerUuid,
    compartmentId: compartment.id,
    compartmentName: compartment.name,
    endStateId: declaredEndState.id,
    intent: { uuid: intent.uuid, domain: intent.domain, verb: intent.verb, confidence: intent.confidence },
  };
}

// ── ingest ───────────────────────────────────────────────────────────────
/**
 * ingestFilesIntoContainer(containerUuid, files) — James: "also needs to
 * import files, unzip into container, then chunk." Called by
 * idearium/api/index.js's project-import.finalize handler right after
 * lib/zip-ingest.js's extractZipToFiles() (files: [{path, content}]),
 * BEFORE RepoLayer.ingest()/materialize() — so the real COS compartment
 * holds the raw import first, exactly as asked, and the repo (chunked
 * afterward, unchanged below) is a second, separate real write, not a
 * relocation of the first.
 *
 * Real containment check (same shape as
 * lib/agent-tools/tools/sandbox/cos-compartment.js's _compartmentSafePath)
 * — a zip entry can't path-traverse out of the compartment's own real root.
 *
 * Returns { ok:true, root, fileCount } or { ok:false, error }.
 */
function ingestFilesIntoContainer(containerUuid, files) {
  const live = _live.get(containerUuid);
  if (!live) return { ok: false, error: `no live container "${containerUuid}" (already finalized, cancelled, or from a prior process)` };
  if (live.row.status !== 'AWAITING_UPLOAD') return { ok: false, error: `container is ${live.row.status}, not AWAITING_UPLOAD` };
  const root = live.compartment.fs.root;
  if (!root) return { ok: false, error: `container "${containerUuid}" has no real compartment fs.root` };

  let written = 0;
  for (const f of (files || [])) {
    const rel = String(f?.path || '').replace(/^[/\\]+/, '');
    if (!rel) continue;
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) continue; // real containment check — never escape this compartment's own root
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content ?? '', 'utf8');
    written++;
  }
  return { ok: true, root, fileCount: written, compartmentId: live.compartment.id };
}

// ── cancel ───────────────────────────────────────────────────────────────
/** cancelContainer(containerUuid) — user walked away before finalize. */
async function cancelContainer(containerUuid) {
  const live = _live.get(containerUuid);
  if (!live) return { ok: false, error: `no live container "${containerUuid}" (already finalized, cancelled, or from a prior process)` };
  if (live.row.status !== 'AWAITING_UPLOAD') return { ok: false, error: `container is ${live.row.status}, not AWAITING_UPLOAD — cannot cancel` };

  // §COS — real cleanup: destroy the real COS compartment (force: it's
  // always still in 'created' state at this point, never actually
  // started/running, so force is defensive, not load-bearing; wipe:true
  // removes its real fs.root, matching "user walked away" meaning the
  // partial upload genuinely shouldn't be kept around).
  try {
    const { destroyCompartment } = require('../cos/cli/commands/destroy.js');
    destroyCompartment(_host(), live.compartment.name, { force: true, wipe: true });
  } catch (e) {
    return { ok: false, error: `compartment destroy (cancel) failed: ${e.message}` };
  }

  live.row.status = 'CANCELLED';
  live.row.updatedAt = Date.now();
  const jaa = _getJAA();
  if (jaa) { try { jaa.update(TABLE, containerUuid, { status: 'CANCELLED', updatedAt: live.row.updatedAt }); } catch (_) {} }
  _live.delete(containerUuid);

  return { ok: true, containerUuid, compartmentStatus: 'destroyed' };
}

// ── finalize ─────────────────────────────────────────────────────────────
/**
 * finalizeContainer({ containerUuid, repoUuid, repoDir, fileCount }) —
 * called AFTER idearium/api/index.js has already: extracted the zip
 * (lib/zip-ingest.js), called RepoLayer.ingest({..., compartmentId}),
 * and confirmed RepoLayer.materialize() wrote the real files to
 * repoDir. This function does everything downstream of that:
 *   - writes manifest.json + project.json into repoDir
 *   - git init + add + commit, real, via the system git binary
 *   - evaluates the end-state against the real resulting artifact
 *   - resolves the compartment (execute() -> real PASS or real FAIL)
 *
 * Returns { ok:true, manifest, projectJson, git, endState, compartmentStatus }
 * or { ok:false, error }.
 */
async function finalizeContainer({ containerUuid, repoUuid, repoDir, fileCount } = {}) {
  const live = _live.get(containerUuid);
  if (!live) return { ok: false, error: `no live container "${containerUuid}" (already finalized, cancelled, or from a prior process)` };
  if (live.row.status !== 'AWAITING_UPLOAD') return { ok: false, error: `container is ${live.row.status}, not AWAITING_UPLOAD` };
  if (!repoUuid || !repoDir) return { ok: false, error: 'repoUuid and repoDir are required — call RepoLayer.ingest()/materialize() first' };
  if (!fs.existsSync(repoDir)) return { ok: false, error: `repoDir does not exist on disk: ${repoDir}` };

  const manifest = _writeManifest({ repoDir, repoUuid, containerUuid, live });
  const projectJson = _writeProjectJson({ repoDir, repoUuid, live, fileCount });
  const git = _gitInit({ repoDir, name: live.row.name });

  const artifact = {
    fileCount: fileCount || 0,
    manifestPath: manifest.path,
    projectJsonPath: projectJson.path,
    git,
    repoUuid, repoDir,
  };

  const evaluation = endState.evaluate(live.endState, artifact, {});

  // §HONEST FAIL, §COS — end-state not reached means real cleanup, not a
  // fabricated PASS: destroy+wipe the real COS compartment, same as
  // cancelContainer. Reached means the compartment's own real files
  // (written earlier by ingestFilesIntoContainer) stand as the durable
  // import record — left as-is, real 'created' state, nothing more to do.
  let compartmentStatus;
  if (evaluation.reached) {
    compartmentStatus = live.compartment.state;
  } else {
    try {
      const { destroyCompartment } = require('../cos/cli/commands/destroy.js');
      destroyCompartment(_host(), live.compartment.name, { force: true, wipe: true });
      compartmentStatus = 'destroyed';
    } catch (e) {
      compartmentStatus = 'error';
      console.warn(`[${MODULE_ID}] compartment destroy (fail path) threw for ${live.compartment.name}: ${e.message}`);
    }
  }

  live.row.status = evaluation.reached ? 'COMPLETE' : 'FAILED';
  live.row.repoUuid = repoUuid;
  live.row.updatedAt = Date.now();
  const jaa = _getJAA();
  if (jaa) {
    try { jaa.update(TABLE, containerUuid, { status: live.row.status, repoUuid, updatedAt: live.row.updatedAt }); }
    catch (_) {}
  }
  _live.delete(containerUuid);

  return {
    ok: evaluation.reached,
    error: evaluation.reached ? null : `end-state not reached: ${evaluation.unmet.map(u => u.id).join(', ')}`,
    manifest: manifest.content, projectJson: projectJson.content, git,
    endState: evaluation, compartmentStatus,
  };
}

// ── manifest.json ────────────────────────────────────────────────────────
function _writeManifest({ repoDir, repoUuid, containerUuid, live }) {
  const content = {
    name: live.row.name,
    version: cfg.MANIFEST.version,
    uuid: `nexus-project-container-${containerUuid.slice(0, 8)}`,
    hookId: `idearium.project-container:v1:${containerUuid.slice(0, 8)}`,
    description: live.row.goal,
    layer: cfg.MANIFEST.layer,
    repoUuid,
    containerUuid,
    compartmentId: live.row.compartmentId,
    intentUuid: live.row.intentUuid,
    endStateId: live.row.endStateId,
    importedAt: Date.now(),
  };
  const p = path.join(repoDir, 'manifest.json');
  fs.writeFileSync(p, JSON.stringify(content, null, 2), 'utf8');
  return { path: p, content };
}

// ── project.json ─────────────────────────────────────────────────────────
function _writeProjectJson({ repoDir, repoUuid, live, fileCount }) {
  const content = {
    name: live.row.name,
    version: cfg.PROJECT_JSON.version,
    uuid: repoUuid,
    goal: live.row.goal,
    fileCount: fileCount || 0,
    createdAt: Date.now(),
  };
  const p = path.join(repoDir, 'project.json');
  fs.writeFileSync(p, JSON.stringify(content, null, 2), 'utf8');
  return { path: p, content };
}

// ── real git init ────────────────────────────────────────────────────────
// Shells out to the system `git` binary — matches lib/intake.js's
// expandArchive() shelling out to `unzip` (see that file's own
// §STATED LIMIT). Never throws — a git failure (binary missing, repo
// dir not writable) degrades to { committed:false, error } and lets
// finalizeContainer's end-state evaluation honestly fail the
// 'git-present' condition rather than crashing the whole import.
function _gitInit({ repoDir, name }) {
  const { binary, defaultBranch, authorName, authorEmail, commitMessage } = cfg.GIT;
  const run = (args) => execFileSync(binary, args, {
    cwd: repoDir, stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: authorName, GIT_AUTHOR_EMAIL: authorEmail,
           GIT_COMMITTER_NAME: authorName, GIT_COMMITTER_EMAIL: authorEmail },
  });

  try {
    if (fs.existsSync(path.join(repoDir, '.git'))) {
      return { committed: false, error: '.git already exists in this directory — not overwritten', branch: null, commit: null };
    }
    run(['init', '-b', defaultBranch]);
    run(['add', '-A']);
    run(['commit', '-m', commitMessage(name), '--no-gpg-sign']);
    const commit = run(['rev-parse', '--short', 'HEAD']).toString('utf8').trim();
    return { committed: true, branch: defaultBranch, commit };
  } catch (e) {
    return { committed: false, error: e.message, branch: null, commit: null };
  }
}

// ── sweep ────────────────────────────────────────────────────────────────
/**
 * sweepStale() — a container left AWAITING_UPLOAD past
 * cfg.COMPARTMENT.staleAfterMs auto-abandons. Real safety net for a
 * browser tab closed mid-flow; intended to be called on an interval by
 * whichever process hosts this module (guardian/idearium boot,
 * matching compartment-engine's own "call this periodically" pattern
 * for other sweeps in this codebase) — not wired to a timer here, so a
 * caller can choose its own cadence.
 */
async function sweepStale() {
  const now = Date.now();
  const swept = [];
  for (const [containerUuid, live] of _live) {
    if (live.row.status !== 'AWAITING_UPLOAD') continue;
    if (now - live.row.createdAt < cfg.COMPARTMENT.staleAfterMs) continue;
    const result = await cancelContainer(containerUuid);
    swept.push({ containerUuid, result });
  }
  return swept;
}

module.exports = { startContainer, cancelContainer, finalizeContainer, ingestFilesIntoContainer, sweepStale, MODULE_ID, VERSION, TABLE };
