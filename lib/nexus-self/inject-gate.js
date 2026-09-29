'use strict';
/**
 * lib/nexus-self/inject-gate.js — an agent's code on a Nexus repo, through the apply gate on approval.
 * comp_id: nexus.lib.nexus-self.inject-gate
 *
 * §0.39.266 — James: "really close to being able to use idearium to build nexus from
 * inside nexus using you as the agent" … asked how agent code should reach the live
 * tree: "just prompt for approval".
 *
 * The Nexus repos are immutable (RepoLayer refuses writes), so an .inject on one could
 * be proposed but never applied — the agent loop dead-ended. This is the other target
 * an inject can have:
 *
 *   agent reply ─▶ .inject (proposed, target nexus-gate, system = ownerOf(path))
 *                       │  the person is prompted: system · path · diff · gate plan
 *                       ▼  approve
 *                  apply.js plan ─▶ apply (live tree write, recorded, snapshot)
 *                       ▼
 *                  nexus-self sync of that system (the caller's job — it owns HTTP/sync)
 *
 * The approval IS the gate's check: the branch "run first" requirement belongs to
 * branch applies, where no person looked at the diff. Here one did, and the apply
 * record's reason says so. Revert is the gate's own rollback of that apply.
 *
 * Content is read from the immutable base's HEAD snapshot, never from a repo's chunks,
 * so a path owned by another system (an edit to guardian/ from nexus/core) resolves to
 * the same bytes the gate will compare against.
 */

const store = require('./store');
const systems = require('./systems');
const AP = require('./apply');
const crypto = require('crypto');
const _sha = (s) => (s == null ? null : crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'));

const MODULE_ID = 'nexus-self-inject-gate';
const TARGET = 'nexus-gate';

function isNexus(repo) { return !!(repo && repo.nexusSelf); }

function _norm(rel) { return String(rel || '').replace(/\\/g, '/').replace(/^\/+/, ''); }

/**
 * _head({ fresh, liveRoot }) -> { hash, snap } | null
 * fresh: snapshot the live tree first (index-cached: only moved files are re-hashed),
 * so the gate compares against the tree as it is NOW, not as the last 10-minute sync
 * saw it. Without it, any file James touched since the last sync reads as a gate
 * conflict even when the inject never goes near it — and an inject proposed against a
 * stale base would pass its own sha check while overwriting his edit.
 */
function _head({ fresh = false, liveRoot } = {}) {
  if (fresh) store.snapshot(liveRoot ? { liveRoot } : {});
  const h = store.head();
  if (!h || !h.hash) return null;
  const snap = store.loadSnapshot(h.hash);
  return snap ? { hash: h.hash, snap } : null;
}

/** current(rel, { fresh, liveRoot }) -> string | null — the file at HEAD (null: not in the base). Throws when there is no snapshot. */
function current(rel, { fresh = false, liveRoot } = {}) {
  const h = _head({ fresh, liveRoot });
  if (!h) throw new Error('no Nexus snapshot yet — sync the nexus repo first');
  const p = _norm(rel);
  const hit = store.filesOf(h.snap, systems.ownerOf(p)).find(([x]) => x === p);
  return hit ? store.getBlob(hit[1]).toString('utf8') : null;
}

/** target(rel) -> the target record stored on the inject node */
function target(rel) {
  const p = _norm(rel);
  return { kind: TARGET, system: systems.ownerOf(p), path: p };
}

/** lineDiff(before, after) -> string — the same shallow +/- form the branch view shows. */
function lineDiff(before, after) {
  const lines = (t) => { const x = String(t).split('\n'); if (x.length && x[x.length - 1] === '') x.pop(); return x; };   // a final newline is not a line
  const a = before == null ? [] : lines(before);
  const b = lines(after);
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    const look = j < b.length ? a.indexOf(b[j], i) : -1;
    if (j < b.length && (look === -1 || look - i > 50)) { out.push(`+${j + 1}: ${b[j]}`); j++; }
    else if (i < a.length) { out.push(`-${i + 1}: ${a[i]}`); i++; }
    if (out.length > 600) { out.push('… (diff truncated)'); break; }
  }
  return out.join('\n');
}

/**
 * preview(node, { liveRoot }) -> { system, path, base, creates, diff, plan:{ ok, errors, conflicts } }
 * What the approval prompt shows: exactly what the gate would do, without doing it.
 */
function preview(node, { liveRoot } = {}) {
  const t = node.target || target(node.path);
  const h = _head({ fresh: true, liveRoot });
  if (!h) return { system: t.system, path: t.path, plan: { ok: false, errors: ['no Nexus snapshot yet — sync the nexus repo first'], conflicts: [] } };
  const before = current(t.path);
  const p = AP.plan({ system: t.system, base: h.hash, changes: [{ path: t.path, content: Buffer.from(node.content, 'utf8') }], ...(liveRoot ? { liveRoot } : {}) });
  return {
    system: t.system, path: t.path, base: h.hash, creates: before === null,
    diff: lineDiff(before, node.content),
    plan: { ok: p.ok, errors: p.errors, conflicts: p.conflicts },
  };
}

/**
 * apply(node, { reason, liveRoot }) -> { ok, applyId, snapshot, system, before } | { ok:false, conflict?, errors }
 * Writes the live tree through apply.js, after checking the inject's baseSha against
 * the live tree as it is now (force overrides that check only; the gate's own
 * plan still runs).
 */
function apply(node, { reason = '', liveRoot, force = false } = {}) {
  const t = node.target || target(node.path);
  const h = _head({ fresh: true, liveRoot });
  if (!h) return { ok: false, errors: ['no Nexus snapshot yet — sync the nexus repo first'] };
  const before = current(t.path);
  // the inject's own guard: the file must still be what the agent was shown
  if (!force && node.baseSha256 !== undefined && _sha(before) !== node.baseSha256) {
    return { ok: false, conflict: true, errors: [`${t.path} changed since this inject was proposed (expected ${node.baseSha256 ? node.baseSha256.slice(0, 12) : 'no file'}, found ${before === null ? 'no file' : _sha(before).slice(0, 12)}) — re-propose or force`] };
  }
  const r = AP.apply({
    system: t.system, base: h.hash, changes: [{ path: t.path, content: Buffer.from(node.content, 'utf8') }],
    reason: reason || `approved inject ${node.uuid}${node.hatName ? ` by ${node.hatName}` : ''}`, by: 'idearium.inject',
    ...(liveRoot ? { liveRoot } : {}),
  });
  if (!r.ok) {
    const conflicts = (r.conflicts || []).map(c => `CONFLICT ${c.path}: ${c.why}`);
    return { ok: false, conflict: conflicts.length > 0, errors: [...(r.errors || []), ...conflicts] };
  }
  return { ok: true, applyId: r.applyId, snapshot: r.snapshot, system: t.system, before };
}

/** revert(node, { liveRoot }) -> the gate's rollback of that one apply */
function revert(node, { reason = '', liveRoot } = {}) {
  if (!node.applyId) return { ok: false, errors: ['this inject has no gate apply to roll back'] };
  const r = AP.rollback(node.applyId, { reason: reason || `revert inject ${node.uuid}`, ...(liveRoot ? { liveRoot } : {}) });
  if (!r.ok) {
    const conflicts = (r.conflicts || []).map(c => `CONFLICT ${c.path}: ${c.why}`);
    return { ok: false, conflict: conflicts.length > 0, errors: [...(r.errors || [r.error].filter(Boolean)), ...conflicts] };
  }
  return { ok: true, snapshot: r.snapshot, system: (node.target || target(node.path)).system };
}

module.exports = { MODULE_ID, TARGET, isNexus, current, target, preview, apply, revert, lineDiff };
