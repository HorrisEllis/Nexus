'use strict';
/**
 * lib/manifest.js — per-system file manifests, hash diff, and SIGMA-SCORED drift.
 * comp_id: nexus.lib.manifest
 * UUID: nexus-manifest-v1-0000-2026-0808-001
 * Version: 0.1.0
 *
 * WHY (James, 2026-08-08): "what about doing a git per system, with file
 * hashes... sigmas or comparison engine for detecting hashes?" — then: "yes, or
 * sigma."
 *
 * NOT per-system git. The repo began 2026-07-13 specifically because two
 * sessions had built conflicting work without seeing each other, and every
 * recurring defect in this tree spans two systems — a wire declared in loom
 * whose consumer is in cortex, a spec in docs/ diverged from its twin in
 * cortex/spec/. Splitting into ~18 repos removes the atomic commit that is the
 * only thing able to catch those. Per-system history already exists:
 * `git log -- guardian/`.
 *
 * The measured gap is elsewhere:
 *     cortex     36 tracked /   36 on disk
 *     idearium   43 tracked / 1594 on disk     ← 1,551 untracked
 *     data        0 tracked /  746 on disk     ← zero history, by design (§2.2)
 * Source is versioned. ARTIFACTS AND STATE ARE NOT. The 1,551 untracked
 * idearium files are the chunk contracts — the exact layer where "everything is
 * a tangible artifact" lives. Git is the wrong tool there (§2.2 says state is
 * never committed, and that is right). Hashes are the right tool.
 *
 * ── WHAT ALREADY EXISTED, AND WHAT DID NOT ──────────────────────────────────
 * cos/foundation/snapshot.js walks a tree producing { path, sizeBytes, sha256,
 * mtime } and offers take/list/load/restore/delete. It has NO diff. So a shape
 * could be captured and never compared, which is the entire point. It is also
 * bound to a COS Compartment, not a NEXUS system. This is the comparison engine,
 * for NEXUS systems, and it deliberately reuses that record shape so the two
 * remain readable by the same eyes.
 *
 * ── WHY SIGMA AND NOT A COUNT ───────────────────────────────────────────────
 * "40 files changed" is useless. WHICH forty, and how unusual, is a sigma
 * question — and meta/cfr/sigma.js already scores deviation across structural /
 * temporal / contextual axes with the same 0.50/0.30/0.20 weighting used here,
 * so manifest drift lands in the vocabulary sigma_rollups already speaks
 * (avgSigma, maxSigma, warnCount, haltCount) rather than inventing a new one.
 *
 * The signal that matters most is not "changed". It is:
 *   - RENAMED  — same sha256, different path. A file that moved BETWEEN systems
 *                is the cross-boundary drift this codebase actually suffers.
 *   - GHOST    — content changed while mtime did NOT. Something wrote without
 *                touching the clock. Near-maximum structural deviation, because
 *                every other detector in this tree trusts mtime.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.nex', '.cos-wal', 'coverage']);
const MAX_HASH_BYTES = 8 * 1024 * 1024;   // beyond this, hash size+mtime only, and SAY so

function _walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) _walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function _hash(abs, size) {
  if (size > MAX_HASH_BYTES) return { sha256: null, hashed: false, reason: `>${MAX_HASH_BYTES}B — size+mtime only` };
  try { return { sha256: crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'), hashed: true }; }
  catch (e) { return { sha256: null, hashed: false, reason: e.code || e.message }; }
}

/**
 * capture(system, opts) -> manifest
 * A system is a directory under ROOT, or 'data/<name>' for state.
 * Record shape matches cos/foundation/snapshot.js on purpose.
 */
function capture(system, opts = {}) {
  if (!system || typeof system !== 'string') return { ok: false, reason: 'capture(system) requires a system name' };
  const base = path.isAbsolute(system) ? system : path.join(ROOT, system);
  if (!fs.existsSync(base)) return { ok: false, reason: `no such system directory: ${system}` };

  const files = _walk(base);
  const entries = [];
  let unhashed = 0, bytes = 0;
  for (const abs of files) {
    let st;
    try { st = fs.statSync(abs); } catch (_) { continue; }
    const h = _hash(abs, st.size);
    if (!h.hashed) unhashed++;
    bytes += st.size;
    entries.push({
      path: path.relative(base, abs).replace(/\\/g, '/'),
      sizeBytes: st.size,
      sha256: h.sha256,
      mtime: Math.floor(st.mtimeMs),
      ...(h.hashed ? {} : { unhashed: h.reason }),
    });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    ok: true, system, base: path.relative(ROOT, base) || '.', ts: Date.now(),
    fileCount: entries.length, totalBytes: bytes, unhashed,
    // §1.2 — a manifest that could not hash part of itself must say so, or a
    // later diff will read "unchanged" where it actually means "never read".
    complete: unhashed === 0,
    entries,
  };
}

/**
 * diff(before, after) -> { added, removed, changed, renamed, ghost, unchanged }
 * Pure. Takes two manifests, touches no disk.
 */
function diff(before, after) {
  if (!before || !after || !before.ok || !after.ok) {
    return { ok: false, reason: 'diff(before, after) needs two successful manifests' };
  }
  const A = new Map(before.entries.map(e => [e.path, e]));
  const B = new Map(after.entries.map(e => [e.path, e]));

  const added = [], removed = [], changed = [], ghost = [], unchanged = [];
  for (const [p, b] of B) {
    const a = A.get(p);
    if (!a) { added.push(b); continue; }
    if (a.sha256 === null || b.sha256 === null) {
      // Neither says "same" nor "different" — it says "not compared" (§1.2).
      changed.push({ path: p, kind: 'uncomparable', reason: a.unhashed || b.unhashed || 'a side was not hashed' });
      continue;
    }
    if (a.sha256 !== b.sha256) {
      // §FOUND 2026-08-08 by MF-5 going flaky: comparing mtime in MILLISECONDS
      // makes ghost detection precision-sensitive. `utimes` restores at second
      // resolution, so a clock put back by a process (or by hand) still differs
      // in the sub-second digits and the ghost escapes. Second granularity is
      // what a writer can actually control, so it is what the flag keys on. The
      // full ms value stays in the record — this changes the COMPARISON, not
      // what is stored.
      const mtimeMoved = Math.floor(b.mtime / 1000) !== Math.floor(a.mtime / 1000);
      const rec = { path: p, from: a.sha256.slice(0, 12), to: b.sha256.slice(0, 12),
                    sizeDelta: b.sizeBytes - a.sizeBytes, mtimeMoved,
                    mtimeMsDelta: b.mtime - a.mtime };
      changed.push(rec);
      // GHOST — content moved, clock did not. Every other drift detector in
      // this tree keys off mtime, so this is the one that hides from all of them.
      if (!rec.mtimeMoved) ghost.push(rec);
    } else unchanged.push(p);
  }
  for (const [p, a] of A) if (!B.has(p)) removed.push(a);

  // RENAMED — same content, different path. Resolved from added/removed so a
  // move is never double-counted as one of each.
  const renamed = [];
  const removedByHash = new Map();
  for (const r of removed) if (r.sha256) {
    if (!removedByHash.has(r.sha256)) removedByHash.set(r.sha256, []);
    removedByHash.get(r.sha256).push(r);
  }
  for (let i = added.length - 1; i >= 0; i--) {
    const a = added[i];
    const cands = a.sha256 && removedByHash.get(a.sha256);
    if (cands && cands.length) {
      const from = cands.pop();
      renamed.push({ from: from.path, to: a.path, sha256: a.sha256.slice(0, 12),
                     crossSystem: from.path.split('/')[0] !== a.path.split('/')[0] });
      added.splice(i, 1);
      const ri = removed.indexOf(from); if (ri >= 0) removed.splice(ri, 1);
    }
  }

  return { ok: true, system: after.system, spanMs: after.ts - before.ts,
           added, removed, changed, renamed, ghost, unchanged: unchanged.length,
           incomparable: !before.complete || !after.complete };
}

/**
 * sigma(delta, opts) -> { sigma, band, structural, temporal, contextual, reasons }
 *
 * Same three axes and the same 0.50/0.30/0.20 weighting as
 * meta/cfr/sigma.js::computeSigma, so a manifest delta scores in the vocabulary
 * sigma_rollups already stores rather than a parallel one.
 *
 * opts.expected — true when a build/dispatch was running. 40 files changing
 * during an idearium build is not deviation; 1 file changing in meta/rfr2/kernel
 * with nothing running is.
 */
function sigma(delta, opts = {}) {
  if (!delta || !delta.ok) return { ok: false, reason: 'sigma(delta) needs a successful diff' };
  const total = delta.added.length + delta.removed.length + delta.changed.length + delta.renamed.length;
  const reasons = [];
  let structural = 0, temporal = 0, contextual = 0;

  // ── Structural: what KIND of change, not how many ────────────────────────
  if (delta.ghost.length) {
    structural += 0.45;   // the highest single term, deliberately
    reasons.push(`${delta.ghost.length} GHOST edit(s) — content changed, mtime did not`);
  }
  if (delta.renamed.some(r => r.crossSystem)) {
    structural += 0.30;
    reasons.push(`${delta.renamed.filter(r => r.crossSystem).length} file(s) moved BETWEEN systems`);
  }
  if (delta.removed.length) {
    structural += Math.min(0.25, delta.removed.length * 0.05);
    reasons.push(`${delta.removed.length} removed`);
  }
  if (delta.incomparable) {
    structural += 0.20;
    reasons.push('a side was not fully hashed — parts are UNCOMPARED, not unchanged');
  }
  if (delta.changed.some(c => c.kind === 'uncomparable')) {
    structural += 0.10;
    reasons.push('some paths could not be compared');
  }

  // ── Temporal: change rate against the span ───────────────────────────────
  const hours = Math.max(delta.spanMs / 3600e3, 1 / 60);
  const rate = total / hours;
  if (rate > 100) { temporal += 0.35; reasons.push(`${rate.toFixed(0)} changes/hour`); }
  else if (rate > 20) { temporal += 0.15; reasons.push(`${rate.toFixed(0)} changes/hour`); }
  if (total > 0 && delta.spanMs < 60e3) { temporal += 0.15; reasons.push('changes inside one minute'); }

  // ── Contextual: was anything supposed to be writing? ─────────────────────
  if (total > 0 && !opts.expected) {
    contextual += 0.40;
    reasons.push('no build or dispatch was declared running');
  }
  if (opts.friction > 0.7) { contextual += (opts.friction - 0.7) * 0.3; reasons.push(`high friction ${opts.friction}`); }

  const s = Math.min(1, structural * 0.50 + temporal * 0.30 + contextual * 0.20);
  const band = s >= 0.7 ? 'HALT' : s >= 0.4 ? 'WARN' : s > 0 ? 'NOTE' : 'STABLE';
  return {
    ok: true, sigma: +s.toFixed(4), band,
    structural: +structural.toFixed(4), temporal: +temporal.toFixed(4), contextual: +contextual.toFixed(4),
    totalChanges: total,
    // §0.1 — a score with no reasons is a number nobody can check.
    reasons: reasons.length ? reasons : ['no deviation observed'],
  };
}

/** Convenience: capture -> compare against a stored manifest -> score. */
function drift(system, previousManifest, opts = {}) {
  const now = capture(system, opts);
  if (!now.ok) return { ok: false, reason: now.reason };
  if (!previousManifest) {
    return { ok: true, baseline: true, manifest: now,
             note: 'no previous manifest — this capture becomes the baseline. Nothing is scored, because nothing has been compared (§1.1).' };
  }
  const d = diff(previousManifest, now);
  return { ok: true, baseline: false, manifest: now, delta: d, sigma: sigma(d, opts) };
}

module.exports = { capture, diff, sigma, drift, _walk, VERSION: '0.1.0' };
