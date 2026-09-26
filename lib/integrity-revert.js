'use strict';
/**
 * lib/integrity-revert.js — integrity sigma → guarded revert (agnostic)
 * UUID: nexus-integrity-revert-v1-0000-2026-0808-001
 *
 * James: "each system's files have integrity hashes for all files, sigmas to
 * detect changes, replay engine with the timeline, relevant files and data
 * reverted if a sigma is detected that has broken functionality."
 *
 * §8.6 — this is the LAST LINK in a loop that's otherwise already built:
 *   lib/file-integrity  — hashes every file/registry/wire, computes a sigma from
 *                         detected changes (EXISTS: _computeSigma, check()).
 *   lib/snapshot-trigger— sigma → snapshot with causal root + timeline (P2).
 *   lib/replay-engine   — snapshot() / replay() = revert (P2).
 * This module closes them: an integrity sigma over threshold, WHERE functionality
 * is confirmed broken, triggers a revert of the affected files to the last-good
 * snapshot on the timeline.
 *
 * THE GUARD THAT MATTERS (§1.1, §2.1): a hash change ALONE is not a revert
 * trigger — legitimate edits change hashes. Revert only when (a) the integrity
 * sigma is high AND (b) a functionality probe (tests/health) confirms BREAKAGE.
 * An intentional working change has a high sigma but PASSES the probe → no revert.
 * Reverting a working change would be catastrophic, so the probe is mandatory.
 */

const DEFAULT_SIGMA_FLOOR = 0.65;   // matches file-integrity's registry-change tier

/**
 * evaluate(opts) — run the integrity check, and IF the sigma is high, probe
 * functionality; recommend a revert only when broken. Does NOT revert by itself
 * unless opts.autoRevert is set (default false — recommend, don't act).
 * @returns { sigma, changes, broken, reverted, recommendation }
 */
async function evaluate(opts = {}) {
  const out = { sigma: 0, changes: [], broken: null, reverted: false, recommendation: null };

  // 1. Integrity check (existing file-integrity).
  let integ;
  try {
    const fi = opts.fileIntegrity || require('./file-integrity');
    integ = fi.check({ jaaDB: opts.jaaDB });
  } catch (e) { out.recommendation = `integrity check unavailable: ${e.message}`; return out; }
  out.sigma = integ.sigma || 0;
  out.changes = integ.changes || [];

  // 2. Below the floor → nothing to consider (§1.2 stated).
  const floor = opts.sigmaFloor != null ? opts.sigmaFloor : DEFAULT_SIGMA_FLOOR;
  if (out.sigma < floor) { out.recommendation = `sigma ${out.sigma} < floor ${floor} — no action`; return out; }

  // 3. High sigma → is functionality actually BROKEN? (mandatory guard §1.1)
  //    A high sigma from an INTENTIONAL working change must NOT revert.
  out.broken = await _probeBroken(opts);
  if (!out.broken) {
    out.recommendation = `sigma ${out.sigma} high but functionality intact — a legitimate change, NOT reverting`;
    return out;
  }

  // 4. High sigma AND broken → recommend/perform revert to last-good snapshot.
  const affected = out.changes.filter(c => c.category === 'file').map(c => c.key || c.path);
  out.recommendation = `sigma ${out.sigma} + broken functionality → revert ${affected.length} affected file(s) to last-good snapshot`;

  if (opts.autoRevert) {
    try {
      const replay = opts.replay || require('./replay-engine');
      const snaps = replay.listSnapshots ? replay.listSnapshots(20) : [];
      const lastGood = snaps.find(s => s.trigger !== 'sigma') || snaps[snaps.length - 1];   // prefer a non-sigma (stable) point
      if (lastGood) {
        const r = replay.replay(lastGood.snapshotId || lastGood.uuid, { files: affected, reason: 'integrity-sigma-broken' });
        out.reverted = !!(r && (r.ok !== false));
        out.revertedTo = lastGood.snapshotId || lastGood.uuid;
      } else out.recommendation += ' — but no snapshot on the timeline to revert to';
    } catch (e) { out.recommendation += ` — revert failed: ${e.message}`; }
  }
  return out;
}

/**
 * _probeBroken(opts) — is functionality broken RIGHT NOW? Pluggable: a caller
 * passes a probe (run the suite, hit /health). Default: unknown → treat as NOT
 * broken (§1.1 — never revert on absence of evidence; a missing probe must not
 * cause a destructive revert).
 */
async function _probeBroken(opts = {}) {
  if (typeof opts.probe === 'function') { try { return !(await opts.probe()); } catch { return true; } }
  if (opts.brokenSignal != null) return !!opts.brokenSignal;   // caller already knows
  return false;   // no probe → assume intact; do NOT revert on a guess
}

/**
 * attach(fanin, opts) — subscribe to the live stream; on an integrity-related
 * sigma, evaluate (recommend by default; autoRevert only if explicitly enabled).
 */
function attach(fanin, opts = {}) {
  return fanin.subscribe('integrity-revert', (row) => {
    if (!/integrity|file\.changed|hash\.mismatch/i.test(row.type || '')) return;
    evaluate(opts).catch(() => {});
  }, { filter: (row) => /integrity|file\.changed|hash\.mismatch/i.test(row.type || '') });
}

module.exports = { evaluate, attach, DEFAULT_SIGMA_FLOOR, MODULE_ID: 'integrity-revert', VERSION: '1.0.0' };
