'use strict';
/**
 * lib/cos-bridge.js — the single real entry point from any NEXUS
 * subsystem into COMPARTMENT OS.
 *
 * §BUILT 2026-09-15 — James: "make sure that idearium is using
 * compartmentos" ... "migrate to cos."
 *
 * §THE REAL GAP THIS CLOSES — idearium's "Upload Project" flow called
 * itself a compartment flow and was not one. lib/project-container.js
 * required lib/compartment-engine.js: a real module, but a different
 * concept — an in-process constraint frame (budget/boundary/intent) with
 * a spawn/execute/resolve lifecycle and no filesystem, no manifest, no
 * process, no system map. COS (cos/) is the real compartmentalized
 * execution environment: a created compartment gets a real directory
 * (fs.root), a real .cos-manifest.json, a real entry in the state store
 * and system map, and a real destroy path that can wipe it. Idearium was
 * using the word without the thing.
 *
 * §WHAT MIGRATED, AND WHAT DID NOT — COS now owns the compartment: its
 * identity, its directory, its lifecycle, its manifest. compartment-
 * engine stays for what it alone does, which COS has no equivalent of:
 * evaluating a declared end-state and resolving honestly to PASS or FAIL
 * (lib/end-state.js). Those are two different jobs and this bridge does
 * not pretend otherwise — see project-container.js's own §MIGRATED note
 * for how the two now sit together. Nothing about compartment-engine's
 * other callers is touched.
 *
 * §WHERE COMPARTMENTS LIVE — COS_COMP_DIR (cos/foundation/constants.js:
 * %APPDATA%/CompartmentOS/compartments/<id> on Windows,
 * ~/.compartment-os/compartments/<id> otherwise). That file is marked
 * IMMUTABLE after v1.0.0 (COS-5) and this bridge does not override it.
 * A caller that needs a compartment to know about a directory outside
 * that root — idearium's repo dir is exactly that case — registers it as
 * a real mount via mountPath() below, which is what fs.mounts on the
 * compartment record is for. The compartment stays where COS puts it;
 * what it can see is recorded on the compartment itself.
 *
 * §REVISED 2026-09-17 — this module originally cached a lazy singleton
 * host (created once, reused across calls), reasoning that a second
 * createHost() in the same process risked two StateStore instances
 * writing state.json concurrently. That reasoning missed a REAL,
 * already-established precedent: lib/agent-tools/tools/sandbox/
 * cos-compartment.js — copilot's own COS client — calls createHost()
 * FRESH on every single call, with its own header explaining why: "cos/
 * has zero HTTP surface... CLI-only by design... createHost() is called
 * fresh per execute(), same as the real CLI does per invocation (each
 * `cos <cmd>` process boots its own host reading/writing the same
 * on-disk state file) — matches the real usage pattern, not a
 * shortcut." lib/project-container.js's own COS integration (2026-09-16)
 * independently follows the same fresh-per-call pattern. Three real call
 * sites agreeing is the signal a shared convention exists; this module
 * now matches it instead of being the one caller with a different
 * philosophy — the exact seam-inconsistency this codebase's own
 * "orphaned module" pattern-recognition exists to catch.
 * §WHAT THIS COSTS, STATED PLAINLY — createHost() re-reads state.json
 * and rebuilds the system map on every call, which is real per-call
 * overhead a cached singleton wouldn't pay. That is the correct trade
 * for this codebase's actual usage shape (infrequent, human-triggered
 * compartment operations — create/destroy/mount — not a hot path), and
 * it is the trade every other real COS client here already makes.
 */

const fs   = require('fs');
const path = require('path');

const MODULE_ID = 'cos-bridge';
const VERSION   = '2.0.0';

let _loadError = null;

// ── host ─────────────────────────────────────────────────────────────────
/**
 * getHost() — a fresh COS host for this one call, matching the real,
 * established precedent (see header). Returns null (never throws) when
 * COS can't be loaded; _loadError holds the real reason, surfaced
 * through lastError() below.
 */
// §0.39.282 N28 — one host per process, reused while its state file is unchanged on disk. Every bridge call used to
// build a whole new host: reload the entire COS state file, rebuild the system map, re-upsert every compartment and
// re-register every gate. idearium's nexus-self sync makes one or two calls per system dir, so each sync reloaded the
// full store dozens of times — 17–23 s of blocked event loop on James's machine, idearium OFFLINE every 10 minutes.
// Another process writing the file (mtime/size change) or a different COS_DATA_ROOT means a fresh load, as before.
let _hostCache = null;
function _stamp(file) { try { const st = fs.statSync(file); return `${st.mtimeMs}:${st.size}`; } catch (_) { return 'none'; } }
function getHost() {
  try {
    const envKey = process.env.COS_DATA_ROOT || '';
    if (_hostCache && _hostCache.envKey === envKey && _stamp(_hostCache.file) === _hostCache.stamp) return _hostCache.host;
    const { createHost } = require('../cos/host/index.js');
    const host = createHost({});
    const file = host.store && host.store._file;
    if (file && typeof host.store._writeSync === 'function') {
      const write = host.store._writeSync.bind(host.store);
      // this host's own writes (sync or debounced) keep the cache valid; anyone else's invalidate it
      host.store._writeSync = (...a) => { const r = write(...a); if (_hostCache && _hostCache.host === host) _hostCache.stamp = _stamp(file); return r; };
      _hostCache = { host, file, envKey, stamp: _stamp(file) };
    }
    _loadError = null;
    return host;
  } catch (e) {
    _loadError = e.message;
    console.error(`[${MODULE_ID}] §1.2 COS host unavailable: ${e.message}`);
    return null;
  }
}

/** available() -> boolean. Real, not a guess — actually boots the host. */
function available() { return !!getHost(); }

/** lastError() -> the real load failure reason, or null. */
function lastError() { return _loadError; }

// ── create ───────────────────────────────────────────────────────────────
/**
 * createCompartment({ name, purpose, runtimeId, networkIsolated }) ->
 * { ok:true, compartment } | { ok:false, error }.
 *
 * Dispatches through COS's own real gate pipeline (cos/cli/commands/
 * create.js -> 'host:compartment:create' -> CreateCompartmentGate), NOT
 * by constructing a compartment object here. That matters: the gate is
 * what writes the manifest, enforces COS-7, updates the system map and
 * emits host:compartment:created — a compartment built any other way
 * would be invisible to every one of those. This is a thin call into the
 * real mechanism, never a second copy of it (§10.3).
 *
 * §NAME UNIQUENESS — COS refuses a duplicate name outright (the gate
 * checks getCompartmentByName). Callers that generate names from user
 * input must expect that real error rather than assume success; see
 * uniqueName() below for the helper project-container uses.
 */
function createCompartment({ name, purpose = '', runtimeId = null, networkIsolated = true, parentId = null } = {}) {
  const host = getHost();
  if (!host) return { ok: false, error: `COS unavailable: ${_loadError}` };
  if (!name) return { ok: false, error: 'name is required' };

  try {
    const { createCompartment: create } = require('../cos/cli/commands/create.js');
    const compartment = create(host, { name, purpose, runtimeId, networkIsolated, parentId });
    console.log(`[${MODULE_ID}] created compartment "${compartment.name}" [${compartment.id}] at ${compartment.fs.root}`);
    return { ok: true, compartment };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * uniqueName(base) — a name COS will actually accept, derived from a real
 * base rather than randomly generated. Checks the real store; only
 * appends a suffix when a genuine collision exists. Returns the base
 * unchanged when it's already free, so the common case reads as itself.
 */
function uniqueName(base) {
  const host = getHost();
  const clean = String(base || 'compartment').trim().slice(0, 120);
  if (!host) return clean;
  if (!host.store.getCompartmentByName(clean)) return clean;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${clean}-${n}`;
    if (!host.store.getCompartmentByName(candidate)) return candidate;
  }
  // 998 collisions on one base name is not a case to paper over silently.
  return `${clean}-${Date.now().toString(36)}`;
}

/**
 * advanceWorkPhase({name, nextPhase}) — real, forward-only work-phase
 * advance (§MCO04). name is the compartment's real COS name (from
 * createCompartment's own return value), not a repo/container uuid.
 */
function advanceWorkPhase({ name, nextPhase } = {}) {
  const host = getHost();
  if (!host) return { ok: false, error: `COS unavailable: ${_loadError}` };
  if (!name) return { ok: false, error: 'name is required' };
  try {
    const { advanceWorkPhase: advance } = require('../cos/cli/commands/advance-work-phase.js');
    const compartment = advance(host, { name, nextPhase });
    return { ok: true, compartment };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * toolsAllowedForWorkPhase(phase) — real, category-grounded tool
 * allowlist per work phase, built from the tool folders that already
 * exist in lib/agent-tools/tools/ — not an invented taxonomy. EXPLORING
 * and VERIFYING share the same read-only set deliberately: verifying
 * what ACTING did is still read-only work. Returns null (not an array)
 * for a phase with no restriction table — callers should treat null as
 * "every registered tool," matching runToolLoop's own existing
 * convention for opts.allowedTools.
 */
const WORK_PHASE_TOOL_CATEGORIES = Object.freeze({
  EXPLORING: ['query', 'diagnostic', 'coordination', 'identity'],
  ACTING:    ['execution', 'sandbox', 'agent-mesh', 'guardian', 'ncp', 'ollama', 'versionium', 'clear-glass'],
  VERIFYING: ['query', 'diagnostic', 'coordination', 'identity'],
});
function toolsAllowedForWorkPhase(phase, opts = {}) {
  const categories = WORK_PHASE_TOOL_CATEGORIES[phase];
  if (!categories) return null;
  const agentTools = opts.agentTools || require('./agent-tools/index.js');
  // §HONEST — a registered tool is just whatever {name, execute, ...} its
  // file exports; nothing on that object records which tools/<category>/
  // folder it came from. Node's own require.cache still holds each tool
  // file's real path — read once per call rather than touching every
  // tool file to self-declare a category. A tool this can't classify is
  // excluded from ACTING — fail toward read-only, never toward an
  // unreviewed mutation capability slipping through unclassified.
  const pathByExports = new Map();
  for (const key of Object.keys(require.cache)) {
    const mod = require.cache[key];
    if (mod && mod.exports && typeof mod.exports === 'object' && mod.exports.name && mod.filename) {
      pathByExports.set(mod.exports, mod.filename);
    }
  }
  const allowed = [];
  for (const [toolName, tool] of agentTools.TOOLS) {
    const filename = pathByExports.get(tool);
    const inCategory = filename && categories.some(c => filename.includes(`${path.sep}tools${path.sep}${c}${path.sep}`));
    if (inCategory) allowed.push(toolName);
  }
  return allowed;
}

// ── destroy ──────────────────────────────────────────────────────────────
/**
 * destroyCompartment(nameOrId, { wipe, force }) -> { ok, result } |
 * { ok:false, error }. wipe:true removes the compartment's real
 * directory — correct for a cancelled import (nothing in it was ever
 * accepted), wrong for anything that completed.
 */
function destroyCompartment(nameOrId, { wipe = false, force = false } = {}) {
  const host = getHost();
  if (!host) return { ok: false, error: `COS unavailable: ${_loadError}` };
  try {
    const { destroyCompartment: destroy } = require('../cos/cli/commands/destroy.js');
    // The gate resolves by name first, then by id (checked directly in
    // DestroyCompartmentGate) — but destroyCompartment()'s own result
    // matcher only compares ev.payload.name, so an id must be turned
    // into its real name before dispatch or the call would throw "gate
    // did not produce a result" on an operation that actually succeeded.
    const comp = host.store.getCompartmentByName(nameOrId) || host.store.getCompartment(nameOrId);
    if (!comp) return { ok: false, error: `compartment "${nameOrId}" not found` };
    const result = destroy(host, comp.name, { wipe, force });
    console.log(`[${MODULE_ID}] destroyed compartment "${result.name}" [${result.compartmentId}]${result.wiped ? ' (filesystem wiped)' : ''}`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── mounts ───────────────────────────────────────────────────────────────
/**
 * mountPath(compartmentId, { path: target, role, writable }) — records a
 * real directory outside the compartment's own root on the compartment
 * record, in fs.mounts, and persists it to both the state store and the
 * on-disk .cos-manifest.json.
 *
 * §WHY THIS EXISTS — COS's create gate seeds fs.mounts as [] and nothing
 * anywhere ever wrote to it; the field was real and permanently empty.
 * Idearium's imported repo lives at idearium/repo/repos/<repoUuid> (its
 * own REPO_STORAGE.dir), outside COS_COMP_DIR, and a compartment that
 * governs a project it cannot name is governance in name only. This
 * writes the real relationship down.
 *
 * §HONEST LIMIT — this is a RECORD, not an enforcement. COS does not
 * currently sandbox filesystem access by fs.writable/fs.mounts (there is
 * no live enforcement point; process-runner.js sets cwd and nothing
 * more). Recording a mount does not restrict anything today. It is
 * written so the compartment's real scope is inspectable and so the
 * enforcement point, when it exists, has real data to enforce against —
 * not so a caller can believe it is already isolated.
 */
function mountPath(compartmentId, { path: target, role = 'project', writable = true } = {}) {
  const host = getHost();
  if (!host) return { ok: false, error: `COS unavailable: ${_loadError}` };
  if (!target) return { ok: false, error: 'path is required' };

  const comp = host.store.getCompartment(compartmentId) || host.store.getCompartmentByName(compartmentId);
  if (!comp) return { ok: false, error: `compartment "${compartmentId}" not found` };

  const mount = { path: target, role, writable, mountedAt: Date.now() };
  comp.fs = comp.fs || { root: null, writable: [], readonly: [], mounts: [], watchEnabled: true };
  comp.fs.mounts = Array.isArray(comp.fs.mounts) ? comp.fs.mounts : [];
  // §0.39.282 N28 — already mounted exactly so: nothing to do. Every call used to rewrite the WHOLE COS store
  // (flushSync), the system map and the manifest; idearium's nexus-self sync re-mounts every system dir every 10
  // minutes, so an unchanged sync blocked the event loop for 17–23 s on James's machine and idearium read OFFLINE.
  const same = comp.fs.mounts.find(m => m.path === target && m.role === role && m.writable === writable);
  const listsAgree = writable ? ((comp.fs.writable || []).includes(target) && !(comp.fs.readonly || []).includes(target)) : ((comp.fs.readonly || []).includes(target) && !(comp.fs.writable || []).includes(target));
  if (same && listsAgree) return { ok: true, compartmentId: comp.id, mounts: comp.fs.mounts, unchanged: true };
  // Idempotent — remounting the same path for the same role updates it
  // rather than appending a duplicate every finalize retry.
  const existing = comp.fs.mounts.findIndex(m => m.path === target && m.role === role);
  if (existing >= 0) comp.fs.mounts[existing] = mount;
  else comp.fs.mounts.push(mount);

  if (writable && !comp.fs.writable.includes(target)) comp.fs.writable.push(target);
  // §NEST 0.39.261 — a read-only mount is recorded as such (the immutable
  // Nexus base is mounted into each system compartment this way).
  comp.fs.readonly = Array.isArray(comp.fs.readonly) ? comp.fs.readonly : [];
  if (!writable) {
    if (!comp.fs.readonly.includes(target)) comp.fs.readonly.push(target);
    comp.fs.writable = comp.fs.writable.filter(w => w !== target);
  } else {
    // §0.39.282 — made writable again: it is no longer read-only (it used to stay in both lists)
    comp.fs.readonly = comp.fs.readonly.filter(r => r !== target);
  }
  comp.updatedAt = Date.now();

  try {
    host.store.setCompartment(comp);
    host.store.flushSync();
    host.sysmap.upsertCompartment(comp);
  } catch (e) {
    return { ok: false, error: `mount persist failed: ${e.message}` };
  }

  // Keep the on-disk manifest truthful too — the state store and the
  // manifest are two real readers of the same fact, and a manifest that
  // disagrees with the store is exactly the kind of quiet drift COS-7
  // exists to prevent.
  const manifestPath = comp.fs.root ? path.join(comp.fs.root, '.cos-manifest.json') : null;
  if (manifestPath) {
    try { fs.writeFileSync(manifestPath, JSON.stringify(comp, null, 2), 'utf8'); }
    catch (e) { console.warn(`[${MODULE_ID}] mount recorded in store but manifest rewrite failed (${manifestPath}): ${e.message}`); }
  }

  return { ok: true, compartmentId: comp.id, mounts: comp.fs.mounts };
}

// ── read ─────────────────────────────────────────────────────────────────
/** getCompartment(nameOrId) -> the real compartment record, or null. */
function getCompartment(nameOrId) {
  const host = getHost();
  if (!host) return null;
  return host.store.getCompartment(nameOrId) || host.store.getCompartmentByName(nameOrId) || null;
}

/**
 * setIntent(nameOrId, intent) — §0.39.372 NC2: a compartment's intent (cos/foundation/intent.js) through COS's own gate
 * (SetIntentGate, host:compartment:intent-set). Checks of a kind COS cannot run (Idearium's 'page') are left out and
 * named — COS refuses an intent whole when one check is of a kind it does not know.
 * -> { ok, compartment, dropped: [says…], effective } | { ok:false, error }
 */
function setIntent(nameOrId, intent = {}) {
  const host = getHost();
  if (!host) return { ok: false, error: `COS unavailable: ${_loadError}` };
  const comp = getCompartment(nameOrId);
  if (!comp) return { ok: false, error: `no compartment ${nameOrId}` };
  try {
    const I = require('../cos/foundation/intent.js');
    const dropped = [];
    const keep = (list) => (list || []).filter(c => { const ok = c && c.check && I.KINDS.includes(c.check.kind); if (!ok && c) dropped.push(c.says); return ok; });
    const clean = { endState: keep(intent.endState), conditions: keep(intent.conditions).filter(c => !c.inherited), axioms: (intent.axioms || []).slice(0, I.MAX_AXIOMS) };
    const compartment = require('../cos/cli/commands/intent.js').setIntent(host, { name: comp.name, intent: clean });
    return { ok: true, compartment, dropped, effective: I.effective(host.store.getCompartment(comp.id), host.store) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** intentOf(nameOrId) -> the compartment's effective intent: its own, with every ancestor's conditions and axioms */
function intentOf(nameOrId) {
  const host = getHost();
  const comp = host ? getCompartment(nameOrId) : null;
  if (!comp) return null;
  try { return require('../cos/foundation/intent.js').effective(comp, host.store); } catch (_) { return null; }
}

/** listCompartments() -> every real compartment COS knows about. */
function listCompartments() {
  const host = getHost();
  return host ? host.store.listCompartments() : [];
}

/**
 * tree(rootNameOrId) — §NEST 0.39.261. The compartment and every descendant,
 * as { id, name, state, children:[…] }. Children are read from each record's
 * own parentId (not only the parent's childIds), so a child whose parent
 * manifest refresh failed is still found. null when the root does not exist.
 */
function tree(rootNameOrId) {
  const host = getHost();
  if (!host) return null;
  const all = host.store.listCompartments();
  const root = all.find(c => c.id === rootNameOrId || c.name === rootNameOrId);
  if (!root) return null;
  const seen = new Set();
  const build = (c) => {
    seen.add(c.id);
    return {
      id: c.id, name: c.name, state: c.state, purpose: c.purpose || '', root: c.fs && c.fs.root,
      children: all.filter(k => k.parentId === c.id && !seen.has(k.id)).map(build),
    };
  };
  return build(root);
}

// ── §0.39.279 — workspaces: a repo as a branch of the original, and its desktop (cos/workspace) ──────────
// James: "have cos create the vm environment, and each new repo, if applicable could create a branch of the original,
// to save resources … once its generated, you can open it like a desktop environment". COS owns the environment; the
// caller (idearium) decides when. Every call returns { ok:false, error } instead of throwing.
function _ws() { return require('../cos/workspace/index.js'); }
/** removeBranch({ originDir, dir }) — §0.39.280 BS15: a deleted code repo's worktree goes; its git branch is kept (§0.3). */
function removeBranch({ originDir, dir } = {}) {
  try { return _ws().removeBranch({ originDir, dir, deleteBranch: false }); } catch (e) { return { ok: false, error: e.message }; }
}
function branchWorkspace({ originDir, name, root = null } = {}) {
  try { return _ws().branchWorkspace({ originDir, name, root }); } catch (e) { return { ok: false, error: e.message }; }
}
/** §0.39.284 W1 — the same, without holding the caller's event loop (idearium's request path). */
function branchWorkspaceAsync({ originDir, name, root = null } = {}) {
  try { return _ws().branchWorkspaceAsync({ originDir, name, root }).catch(e => ({ ok: false, error: e.message })); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
}
function listBranches(originDir) { try { return _ws().listBranches(originDir); } catch (_) { return []; } }
/** desktop(nameOrId, { action: 'start'|'status'|'stop', workDir, name, originNameOrId, ramMB, cpus }) */
function desktop(nameOrId, { action = 'status', workDir = null, name = null, originNameOrId = null, ramMB, cpus, network, login = null } = {}) {
  try {
    const comp = getCompartment(nameOrId);
    if (!comp) return { ok: false, error: `no compartment ${nameOrId}` };
    const W = _ws();
    if (action === 'status') return { ok: true, ...W.desktopStatus(comp.id) };
    if (action === 'stop') return W.stopDesktop(comp.id);
    if (action !== 'start') return { ok: false, error: `action must be start, status or stop` };
    const origin = originNameOrId ? getCompartment(originNameOrId) : null;
    return W.startDesktop({ compartmentId: comp.id, name: name || comp.name, workDir, stateRoot: comp.fs && comp.fs.root,
      originStateRoot: origin && origin.id !== comp.id ? origin.fs && origin.fs.root : null, ramMB, cpus, network, login });
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * desktopControl(nameOrId, action, opts) — §0.39.371 VM1: the desktop's VM like VMware, over its QMP channel
 * (cos/workspace/vm-control.js): action 'pause' | 'resume' | 'status' | 'checkpoint' ({ label, causedBy }) |
 * 'checkpoints' | 'rewind' ({ tag }). Never throws.
 */
async function desktopControl(nameOrId, action, opts = {}) {
  try {
    const comp = getCompartment(nameOrId);
    if (!comp) return { ok: false, error: `no compartment ${nameOrId}` };
    const VC = require('../cos/workspace/vm-control.js');
    if (action === 'rewind') return await VC.rewind(comp.id, opts.tag);
    if (!['pause', 'resume', 'status', 'checkpoint', 'checkpoints'].includes(action)) return { ok: false, error: `action must be pause, resume, status, checkpoint, checkpoints or rewind` };
    return await VC[action](comp.id, opts);
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = {
  branchWorkspace, branchWorkspaceAsync, listBranches, removeBranch, desktop, desktopControl,
  getHost, available, lastError,
  createCompartment, destroyCompartment, uniqueName,
  mountPath, getCompartment, listCompartments, tree,
  advanceWorkPhase, toolsAllowedForWorkPhase, setIntent, intentOf,
  MODULE_ID, VERSION,
};
