'use strict';
/**
 * lib/repo-versions.js — every change to a repo's files is a versionium commit. §0.40.0 VR1
 * comp_id: nexus.lib.repo-versions
 * Map: docs/2026-10-07-versionium-releases-phasemap.spec (VR1_every_change_a_commit)
 *
 * James: "and link the releases with versionium. needs to snapshot every accept, every change, diff, write, only the
 * changes. like github., supposed to be an alternative to github to an extent. but i want to replace it for myself."
 *
 * ONE hook: idearium/repo/index.js writeFile() / deleteFile() call touched() — every write to a repo's files passes
 * there (an accepted proposal, an agent's auto write, a revert, a person's save, a restore), so no write path added
 * later can be missed. Writes SETTLE: a burst (a Claude Code run writing six files) becomes one commit, after SETTLE_MS
 * of quiet. The commit itself is the existing repo snapshot (idearium/repo/snapshot.js through versionium's files
 * layer): plan() sends only the files versionium lacks, stored as deltas — only the changes.
 *
 * Provenance without plumbing: the task running when the write happens (lib/repo-activity.js, AsyncLocalStorage) names
 * who (its hat / provider), why (its id) and the desktop checkpoint taken before it (CK1) — so a commit can rewind the
 * code AND the machine that ran it. attribute() adds what the async context cannot know (the person who approved a
 * proposal, the inject's id). A commit that fails loses nothing: its changes go back to pending, said in the log, and
 * are committed with the next (the snapshot is of the whole tree, so the next one carries them).
 */
const MODULE_ID = 'nexus.lib.repo-versions';
const SETTLE_MS = Math.max(0, parseInt(process.env.NEXUS_VERSION_SETTLE_MS || '1500', 10) || 0);
const RETRY_MS = 60000;
const MAX_PATHS = 2000;

const _pending = new Map();    // repoUuid -> { paths: Map(path -> op), by: Set, refs: Set, checkpoint, timer, since }
const _inflight = new Map();   // repoUuid -> Promise
const _last = new Map();       // repoUuid -> the latest commit's result (flush() answers it when nothing is pending)
let _committer = null;

/** setCommitter(async ({ repoUuid, message, causedBy, provenance }) → { ok, commitId, error }) — idearium's snapshot */
function setCommitter(fn) { _committer = typeof fn === 'function' ? fn : null; }

function _entry(repoUuid) {
  let e = _pending.get(repoUuid);
  if (!e) { e = { paths: new Map(), by: new Set(), refs: new Set(), checkpoint: null, timer: null, since: Date.now() }; _pending.set(repoUuid, e); }
  return e;
}
function _schedule(repoUuid, ms = SETTLE_MS) {
  const e = _pending.get(repoUuid);
  if (!e) return;
  if (e.timer) clearTimeout(e.timer);
  e.timer = setTimeout(() => { e.timer = null; settle(repoUuid).catch(() => {}); }, ms);
  if (e.timer.unref) e.timer.unref();
}
function _task() { try { return require('./repo-activity.js').current(); } catch (_) { return null; } }

/** touched(repoUuid, path, op) — the repo layer wrote (op 'write') or removed ('delete') a file */
function touched(repoUuid, relPath, op = 'write') {
  if (!repoUuid || !relPath) return;
  const e = _entry(repoUuid);
  if (e.paths.size < MAX_PATHS || e.paths.has(relPath)) e.paths.set(String(relPath), op === 'delete' ? 'delete' : 'write');
  const t = _task();
  if (t && t.repoUuid === repoUuid) {
    e.by.add(t.hat || t.provider || 'agent'); e.refs.add(t.id);
    if (t.checkpoint && !e.checkpoint) e.checkpoint = t.checkpoint;
  }
  _schedule(repoUuid);
}

/** attribute(repoUuid, { by, ref }) — who stands behind the pending change (an approver, an inject) */
function attribute(repoUuid, { by = null, ref = null } = {}) {
  if (!repoUuid) return;
  const e = _pending.get(repoUuid);
  if (!e) return;   // nothing written (a gate apply: the live tree, versioned by nexus-self)
  if (by) e.by.add(String(by));
  if (ref) e.refs.add(String(ref));
}

function _message(paths, by) {
  const list = [...paths.keys()];
  const del = [...paths.values()].filter(o => o === 'delete').length;
  const names = list.slice(0, 3).join(', ') + (list.length > 3 ? ` +${list.length - 3}` : '');
  return `${list.length} file${list.length === 1 ? '' : 's'}${del ? ` (${del} deleted)` : ''}: ${names}${by.size ? ` — by ${[...by].join(', ')}` : ''}`;
}

function _log(row) { try { require('./activity-log/compartment.js').record(row); } catch (_) { /* the log never stops a commit */ } }

/** settle(repoUuid) → the commit of everything pending for it now (after any commit already in flight) */
function settle(repoUuid) {
  const prev = _inflight.get(repoUuid) || Promise.resolve();
  const p = prev.then(async () => {
    const e = _pending.get(repoUuid);
    if (!e || !e.paths.size) return _last.get(repoUuid) || null;
    if (!_committer) return { ok: false, error: 'no committer (versionium not wired in this process) — kept pending' };
    _pending.delete(repoUuid);
    if (e.timer) clearTimeout(e.timer);
    const files = [...e.paths].map(([path, op]) => ({ path, op }));
    const provenance = { by: [...e.by], refs: [...e.refs], files, checkpoint: e.checkpoint, since: e.since, at: Date.now() };
    const message = _message(e.paths, e.by);
    let r;
    try { r = await _committer({ repoUuid, message, causedBy: provenance.refs[0] || MODULE_ID, provenance }); }
    catch (err) { r = { ok: false, error: err.message }; }
    if (r && r.ok && !r.commitId) return r;   // versioning switched off (versions.every_change): nothing to record
    if (r && r.ok) {
      _log({ compartment: repoUuid, kind: 'version.commit', status: 'ok', actor: provenance.by.join(', ') || 'unattributed', ref: r.commitId,
        title: `commit ${r.commitId} — ${message}`, detail: { ...provenance, changed: r.changed ?? null } });
      return r;
    }
    // nothing lost: back to pending (merged with anything written since), said, retried
    const back = _entry(repoUuid);
    for (const [k, v] of e.paths) if (!back.paths.has(k)) back.paths.set(k, v);
    for (const b of e.by) back.by.add(b);
    for (const f of e.refs) back.refs.add(f);
    back.checkpoint = back.checkpoint || e.checkpoint; back.since = Math.min(back.since, e.since);
    back.failures = (e.failures || 0) + 1;
    if (back.failures === 1) _log({ compartment: repoUuid, kind: 'version.failed', status: 'failed', actor: 'auto', ref: null,
      title: `not committed yet — ${message} — ${(r && r.error) || 'no answer'} (kept; retried)`, detail: { files, error: (r && r.error) || null } });
    _schedule(repoUuid, Math.min(RETRY_MS * back.failures, 30 * 60000));   // said once; retried, further apart each time
    return r || { ok: false, error: 'no answer' };
  });
  const tracked = p.then((r) => { if (r) _last.set(repoUuid, r); return r; }).finally(() => { if (_inflight.get(repoUuid) === tracked) _inflight.delete(repoUuid); });
  _inflight.set(repoUuid, tracked);
  return tracked;
}

/** flush(repoUuid?) — commit what is pending now (one repo, or all); resolves when done */
async function flush(repoUuid = null) {
  const ids = repoUuid ? [repoUuid] : [...new Set([..._pending.keys(), ..._inflight.keys()])];
  const out = {};
  for (const id of ids) out[id] = await settle(id);
  return repoUuid ? out[repoUuid] : out;
}

function pending(repoUuid) { const e = _pending.get(repoUuid); return e ? { files: [...e.paths.keys()], by: [...e.by], refs: [...e.refs] } : null; }
function _reset() { for (const e of _pending.values()) if (e.timer) clearTimeout(e.timer); _pending.clear(); _inflight.clear(); _last.clear(); _committer = null; }

module.exports = { MODULE_ID, SETTLE_MS, touched, attribute, settle, flush, pending, setCommitter, _reset };
