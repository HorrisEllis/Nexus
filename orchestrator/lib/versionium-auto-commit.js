'use strict';
/**
 * orchestrator/lib/versionium-auto-commit.js — Sigma-gated auto-commit
 * UUID: nexus-versionium-auto-commit-v1-0000-2026-0828-001
 * Version: 1.1.0
 *
 * §VERSIONIUM STEP 4 — docs/versionium.spec's own words: "CFR sigma
 * crossing a threshold triggers an automatic snapshot via the mechanism
 * above, tagged with the sigma event that caused it (causedBy, same
 * pattern as this session's other causal chaining work) — proposed, not
 * built, no existing analog found."
 *
 * The threshold-crossing detection already existed — orchestrator/lib/
 * sigma-writer.js's _writeComposite() already emits 'sigma.composite.
 * warning' (>=0.50) and 'sigma.composite.halt_risk' (>=0.70) on the real
 * bus. This module is the one piece that didn't exist: something
 * listening for those and actually triggering a real commit.
 *
 * §VERSIONIUM MIGRATION 2026-09-01 — James: "migrate to versionium
 * completely." This module originally targeted idearium's SnapshotGate
 * (docs/versionium.spec's own build_order treated idearium's commit graph
 * as "the mechanism" Versionium would inherit). Investigated directly
 * before touching anything: idearium's SnapshotGate and
 * cortex/versionium/index.js turned out to be two separate, real,
 * NEVER-RECONCILED commit-graph implementations under the same name —
 * a genuine §10.3 competing-truth finding, not a naming quibble. Per
 * James's explicit direction, cortex/versionium is now canonical (it
 * already had the more complete real capability set — kernel-based
 * temporal replay via restore(), calendar(), and correctly branch-scoped
 * commits from the start). This module now targets cortex's real
 * /api/versionium/commit route instead of idearium's /api/snapshots.
 * idearium's own SnapshotGate/SnapshotRestoreGate remain real and useful
 * for idearium's own ideas/specs/gaps/links state — just no longer fed by
 * this sigma trigger, and no longer described as "Versionium."
 *
 * §VS1 2026-09-02 (docs/2026-09-02-versionium-sovereign-and-cleanup-
 * phasemap.spec) — repointed from systemId 'cortex' to 'versionium' now
 * that Versionium is its own sovereign system (port 3754), not embedded
 * in cortex's process. §HONEST COEXISTENCE, not a duplicate-truth bug:
 * versionium/server.js also runs its OWN internal auto-commit trigger
 * now (versionium/lib/engine.js's _tick(), polling cortex's real
 * /cfr/field for local field entropy > threshold, its own 5-min
 * cooldown). This module's trigger is a DIFFERENT real signal —
 * orchestrator's system-wide COMPOSITE sigma (sigma-writer.js,
 * aggregated across sigma_records) — not the same fact tracked twice
 * disagreeing with itself (the real problem the 2026-09-01 reconciliation
 * above fixed). Two independent, real reasons a commit might be
 * warranted, each with its own cooldown, both landing on the same real
 * commit endpoint — not decided to be consolidated further in this pass;
 * flagged here so a future reader sees this as a deliberate, understood
 * state, not an overlooked duplicate.
 */

const nx = require('../../lib/nexus-client.js');

const MODULE_ID = 'versionium-auto-commit';
const VERSION   = '1.1.0';

// §REAL DESIGN DECISION — _writeComposite() runs on a fixed interval
// (COMPOSITE_WRITE_INTERVAL) and re-emits its threshold event EVERY tick
// composite sigma remains above the line, not just once on the initial
// crossing. Without a cooldown, sustained high sigma would auto-commit
// once per interval indefinitely — a real commit-spam risk, not a
// hypothetical one, for exactly the "system under real, sustained stress"
// case this feature exists to capture. 5 minutes is a real, deliberate
// choice: frequent enough that a genuine, sustained deviation is captured
// promptly, not so frequent that a single stress episode fills the commit
// history with near-duplicate snapshots.
const COOLDOWN_MS = parseInt(process.env.VERSIONIUM_AUTOCOMMIT_COOLDOWN_MS || '300000', 10);

let _lastAutoCommitAt = 0;
let _subscribed = false;
let _bus = null;

function _getBus() {
  if (_bus) return _bus;
  try { _bus = require('../../nexus/nexus-bus'); } catch (_) {}
  return _bus;
}

/**
 * _pushCommit({message, causedBy}) — the one real call this module makes.
 * §VERSIONIUM MIGRATION 2026-09-01 — now POST /api/versionium/commit on
 * cortex, via lib/nexus-client.js (sovereign transport — names a system
 * and a path, never a host/port), replacing the direct raw-http POST to
 * idearium's /api/snapshots. system: 'orchestrator' since this trigger is
 * about orchestrator's own composite sigma reading, not any one
 * downstream system. Fire-and-forget by design, same reasoning as before:
 * a failed auto-commit attempt should never affect anything else
 * orchestrator is doing, it should just be logged honestly.
 */
async function _pushCommit({ message, causedBy }) {
  try {
    const result = await nx.post('versionium', '/api/versionium/commit',
      { message, branch: 'main', causedBy, system: 'orchestrator' });
    console.log(`[${MODULE_ID}] auto-commit succeeded: ${message}`);
    return { ok: true, result };
  } catch (e) {
    console.warn(`[${MODULE_ID}] auto-commit request could not reach cortex (${e.message}) — sigma stayed high with no commit made to show for it`);
    return { ok: false, error: e.message };
  }
}

async function _onThresholdEvent(level, event) {
  const now = Date.now();
  const sinceLastMs = now - _lastAutoCommitAt;
  if (sinceLastMs < COOLDOWN_MS) {
    console.log(`[${MODULE_ID}] sigma ${level} (${event?.sigma?.toFixed?.(3)}) — within cooldown (${Math.round((COOLDOWN_MS - sinceLastMs) / 1000)}s remaining), not auto-committing again`);
    return;
  }
  _lastAutoCommitAt = now;
  const message = `auto-commit: sigma composite ${level === 'halt_risk' ? 'HALT RISK' : 'warning'} — sigma=${event?.sigma?.toFixed?.(3) ?? '?'} (${event?.count ?? '?'} samples)`;
  await _pushCommit({ message, causedBy: event?.uuid || null });
}

function init() {
  if (_subscribed) return;
  const bus = _getBus();
  if (!bus) { console.warn(`[${MODULE_ID}] bus unavailable — sigma-gated auto-commit inactive`); return; }

  bus.on('sigma.composite.warning',  (event) => _onThresholdEvent('warning',   event));
  bus.on('sigma.composite.halt_risk', (event) => _onThresholdEvent('halt_risk', event));

  _subscribed = true;
  console.log(`[${MODULE_ID}] v${VERSION} — listening for sigma.composite.warning/halt_risk, cooldown=${COOLDOWN_MS}ms`);
}

module.exports = { init, MODULE_ID, VERSION, COOLDOWN_MS };
