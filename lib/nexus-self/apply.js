'use strict';
/**
 * lib/nexus-self/apply.js — the apply gate: the ONLY path from the immutable
 * Nexus repo back into the live tree.
 * comp_id: nexus.lib.nexus-self.apply
 *
 * §0.39.261 — James chose "immutable base + apply gate": edits are made on a
 * COS branch, run and tested there, and reach the live files only through
 * this gate. Every apply is:
 *
 *   1. SCOPED    each changed path must belong to the system being applied
 *                (systems.ownerOf) — a guardian apply cannot write cortex.
 *   2. BASED     the change names the snapshot it was made against. Each
 *                touched live file must still hash to that snapshot's blob
 *                (or still be absent, for an added file). If the live tree
 *                moved underneath the edit: CONFLICT, nothing written.
 *   3. RECORDED  before -> after blobs for every path go to applies/<id>.json
 *                BEFORE the first live write, so a crash mid-apply is still
 *                fully described and reversible.
 *   4. ATOMIC    per file: write to a temp file beside it, then rename.
 *   5. LEDGERED  data/nexus-self/event_log.jsonl (lib/ledger-writer.js).
 *   6. RESNAPSHOTTED  the live tree is snapshotted again; the result is the
 *                new base the repo moves to.
 *
 * rollback(applyId) is the same gate in reverse: it refuses when a file it
 * would restore has changed since the apply (the rollback would silently
 * destroy that later change).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const systems = require('./systems');
const store = require('./store');

const MODULE_ID = 'nexus-self-apply';

function _ledger(record) {
  try { require('../ledger-writer').write('nexus-self', 'event_log', record); } catch (_) { /* the apply record on disk is authoritative */ }
}

function _liveSha(liveRoot, rel) {
  try { return store.sha256(fs.readFileSync(path.join(liveRoot, rel))); } catch (_) { return null; }
}

function _safeRel(rel) {
  const norm = path.posix.normalize(String(rel || '').replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!norm || norm.startsWith('..') || norm.includes('/../') || path.isAbsolute(norm)) return null;
  const segs = norm.split('/');
  for (let i = 0; i < segs.length; i++) if (systems.skipped(segs.slice(0, i + 1).join('/'), i < segs.length - 1)) return null;
  return norm;
}

/**
 * plan({ system, base, changes, liveRoot }) -> { ok, items, errors, conflicts }
 * changes: [{ path, content?: string|Buffer, delete?: true }]
 * Pure check — writes nothing. apply() runs it first; the UI calls it for a dry run.
 */
function plan({ system, base, changes = [], liveRoot = systems.ROOT, root = store.storeRoot() } = {}) {
  const errors = [], conflicts = [], items = [];
  if (!systems.get(system)) errors.push(`unknown system: ${system}`);
  const snap = store.loadSnapshot(base, root);
  if (!snap) errors.push(`base snapshot not found: ${String(base).slice(0, 12)}`);
  if (!Array.isArray(changes) || !changes.length) errors.push('no changes to apply');
  if (errors.length) return { ok: false, errors, conflicts, items };

  const baseSha = new Map(store.filesOf(snap).map(([p, s]) => [p, s]));
  const seen = new Set();
  for (const c of changes) {
    const rel = _safeRel(c.path);
    if (!rel) { errors.push(`path not allowed: ${c.path}`); continue; }
    if (seen.has(rel)) { errors.push(`path listed twice: ${rel}`); continue; }
    seen.add(rel);
    const owner = systems.ownerOf(rel);
    if (owner !== system) { errors.push(`${rel} belongs to ${owner}, not ${system}`); continue; }
    const before = baseSha.get(rel) || null;
    const live = _liveSha(liveRoot, rel);
    if (live !== before) {
      conflicts.push({ path: rel, base: before, live, why: before ? (live ? 'live file changed since the base snapshot' : 'live file was deleted since the base snapshot') : 'file now exists live but was absent in the base snapshot' });
      continue;
    }
    if (c.delete) {
      if (!before) { errors.push(`cannot delete ${rel}: not in the base snapshot`); continue; }
      items.push({ path: rel, op: 'delete', before, after: null });
    } else {
      const buf = Buffer.isBuffer(c.content) ? c.content : (typeof c.content === 'string' ? Buffer.from(c.content, 'utf8') : null);
      if (!buf) { errors.push(`no content for ${rel}`); continue; }
      const after = store.sha256(buf);
      if (after === before) continue;                // unchanged — not an item
      items.push({ path: rel, op: before ? 'modify' : 'add', before, after, _buf: buf });
    }
  }
  if (!items.length && !errors.length && !conflicts.length) errors.push('every listed change is identical to the base — nothing to apply');
  return { ok: !errors.length && !conflicts.length, errors, conflicts, items };
}

function _writeLive(liveRoot, rel, buf) {
  const dest = path.join(liveRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.nexus-apply.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
}

/**
 * apply({ system, base, changes, reason, by }) -> { ok, applyId, applied, snapshot } | { ok:false, errors, conflicts }
 */
function apply({ system, base, changes, reason = '', by = 'idearium', liveRoot = systems.ROOT, root = store.storeRoot() } = {}) {
  const p = plan({ system, base, changes, liveRoot, root });
  if (!p.ok) {
    _ledger({ type: 'nexus-self.apply.refused', system, base, errors: p.errors, conflicts: p.conflicts.map(c => c.path) });
    return { ok: false, errors: p.errors, conflicts: p.conflicts };
  }
  for (const it of p.items) if (it._buf) store.putBlob(it._buf, root);   // after-blobs exist before anything live moves

  const applyId = `apply-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const record = {
    id: applyId, system, base, reason: String(reason).slice(0, 2000), by, at: Date.now(), status: 'writing',
    items: p.items.map(({ _buf, ...i }) => i),
  };
  const recPath = path.join(store._paths(root).applies, `${applyId}.json`);
  fs.mkdirSync(path.dirname(recPath), { recursive: true });
  fs.writeFileSync(recPath, JSON.stringify(record, null, 2));

  const written = [];
  try {
    for (const it of p.items) {
      if (it.op === 'delete') fs.rmSync(path.join(liveRoot, it.path), { force: true });
      else _writeLive(liveRoot, it.path, it._buf);
      written.push(it.path);
    }
  } catch (e) {
    record.status = 'failed'; record.error = e.message; record.written = written;
    fs.writeFileSync(recPath, JSON.stringify(record, null, 2));
    _ledger({ type: 'nexus-self.apply.failed', applyId, system, error: e.message, written });
    return { ok: false, applyId, errors: [`write failed after ${written.length} file(s): ${e.message} — rollback('${applyId}') restores them`] };
  }

  const snap = store.snapshot({ liveRoot, root });
  record.status = 'applied'; record.snapshot = snap.hash;
  fs.writeFileSync(recPath, JSON.stringify(record, null, 2));
  _ledger({ type: 'nexus-self.apply', applyId, system, base, snapshot: snap.hash, paths: written, reason: record.reason });
  return { ok: true, applyId, applied: record.items, snapshot: snap.hash };
}

function listApplies(root = store.storeRoot()) {
  const dir = store._paths(root).applies;
  let names = [];
  try { names = fs.readdirSync(dir).filter(n => n.endsWith('.json')); } catch (_) { return []; }
  return names.map(n => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch (_) { return null; } })
    .filter(Boolean).sort((a, b) => b.at - a.at);
}

/** rollback(applyId) — restore every path of an apply to its before-blob. */
function rollback(applyId, { reason = '', liveRoot = systems.ROOT, root = store.storeRoot() } = {}) {
  const recPath = path.join(store._paths(root).applies, `${applyId}.json`);
  let rec; try { rec = JSON.parse(fs.readFileSync(recPath, 'utf8')); } catch (_) { return { ok: false, errors: [`apply not found: ${applyId}`] }; }
  if (rec.status === 'rolled-back') return { ok: false, errors: [`${applyId} was already rolled back`] };
  const conflicts = [];
  for (const it of rec.items) {
    const live = _liveSha(liveRoot, it.path);
    const expect = (rec.status === 'failed' && !(rec.written || []).includes(it.path)) ? it.before : it.after;
    if (live !== expect) conflicts.push({ path: it.path, why: 'changed again after this apply — rolling back would destroy that change' });
  }
  if (conflicts.length) return { ok: false, conflicts, errors: [] };
  for (const it of rec.items) {
    if (it.before) _writeLive(liveRoot, it.path, store.getBlob(it.before, root));
    else fs.rmSync(path.join(liveRoot, it.path), { force: true });
  }
  const snap = store.snapshot({ liveRoot, root });
  rec.status = 'rolled-back'; rec.rolledBackAt = Date.now(); rec.rollbackReason = reason; rec.rollbackSnapshot = snap.hash;
  fs.writeFileSync(recPath, JSON.stringify(rec, null, 2));
  _ledger({ type: 'nexus-self.rollback', applyId, system: rec.system, snapshot: snap.hash });
  return { ok: true, applyId, snapshot: snap.hash, restored: rec.items.map(i => i.path) };
}

module.exports = { MODULE_ID, plan, apply, rollback, listApplies };
