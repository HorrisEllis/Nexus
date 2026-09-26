'use strict';
/**
 * lib/self-build-loop.js — the first real, narrow slice of SR9
 * (autonomous self-build end-state), wired 2026-09-03.
 * UUID: nexus-self-build-loop-v1-0000-2026-0903-001
 *
 * §HONEST SCOPE — SR9 on the master phasemap is the FULL composite ask
 * ("update its maps, update and track versions... snapshot and backup,
 * debug and heal, optimize and remember. Doubt and attack its outputs")
 * and explicitly depends on B1, SR3, SR4, SR7, SR8, SR10, SR11 — as of
 * this file, SR4/SR7/SR8/SR10 are still OPEN. This module does NOT claim
 * to close SR9. It closes exactly the two real, dependency-free pieces
 * SR9 names that don't need any of those open tracks: real snapshotting
 * ("snapshot and backup") and real map-drift detection ("update its
 * maps"), triggered automatically on every real, governed pipeline
 * promote — not on a human prompt per step, which is the actual, narrow
 * thing "autonomous" means here.
 *
 * §THE REAL HOOK — lib/execution-pipeline.js's runPipeline() already
 * emits a real `pipeline.promoted` event (checked directly: only after
 * sandbox-verify passed AND compare-to-golden found no regression — the
 * pipeline's own stages self-gate this, per run-pipeline.js's own header,
 * "this tool can't promote unproven output"). nexus-bus.js is the real,
 * already-existing "unified event multiplex... every system emits to
 * nexus-bus" singleton every pipeline trigger path (run_pipeline,
 * run_chain, run_closed_loop) already dual-emits to when a bus isn't
 * otherwise supplied (see run-pipeline.js's own _emitters()). This module
 * subscribes there — not a new, second event path.
 *
 * §WHAT THIS DELIBERATELY DOES NOT DO — it does not auto-apply loom
 * declare() calls for drifted files. Every real loom registration this
 * session was a deliberate, reviewed act (see this repo's own commit
 * history) — silently auto-registering components on every promote would
 * break that discipline. This module only DETECTS and REPORTS drift
 * (a real, bounded diff against loom/data/registry.json when present),
 * the same "warn, don't auto-fix" posture precommit-check.js already
 * uses for the same class of finding.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let _installed = false;

function _snapshot(pipelineId) {
  try {
    const snapshot = require('../cortex/snapshot/index.js');
    // §HONEST — create()'s real signature only reads opts.type/opts.systemIds
    // (checked directly; no causedBy field exists). pipelineId is carried in
    // this module's own ledger/event data instead of invented onto create()'s
    // real, narrower contract.
    const result = snapshot.create({ type: 'post_promote' });
    return { ok: true, snapId: result?.snapId || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * _mapDrift() -> a real, bounded, honest comparison of the live source
 * tree against loom/data/registry.json's currently-declared component
 * ids. Conservative by design: scanTree's own comments document real,
 * known alias mismatches between derived ids and hand-declared ones, so
 * this reports a COUNT and a SAMPLE, never a definitive "these are
 * missing" claim — same honesty precommit-check.js's own spec-drift
 * check already uses for a related, adjacent finding.
 */
function _mapDrift() {
  const registryPath = path.join(ROOT, 'loom', 'data', 'registry.json');
  if (!fs.existsSync(registryPath)) {
    return { ok: false, reason: 'loom/data/registry.json not present (gitignored runtime data — may not exist in this checkout)' };
  }
  try {
    const { scanTree } = require('../loom/scanners/source-map.js');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const knownIds = new Set(Object.keys(registry.component || {}));
    const { FILES, stats } = scanTree({});
    const undeclared = FILES.filter(([, id]) => !knownIds.has(id));
    return {
      ok: true,
      scanned: FILES.length,
      knownComponents: knownIds.size,
      possiblyUndeclared: undeclared.length,
      sample: undeclared.slice(0, 10).map(([file]) => file),
      stats,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * install(bus, opts?) — subscribe to the real bus's pipeline.promoted
 * event. Pass nexus-bus.js's real singleton (or any bus with a real
 * .on(type, fn)) — never a mock in production use.
 */
function install(bus, opts = {}) {
  if (_installed) return { installed: true };
  if (!bus || typeof bus.on !== 'function') throw new Error('self-build-loop: install() requires a real bus with .on()');
  _installed = true;

  bus.on('pipeline.promoted', (data = {}) => {
    const { pipelineId, branchId, compartmentId } = data;
    const snap = _snapshot(pipelineId);
    const drift = _mapDrift();

    try {
      require('./component-ledger.js').write({
        system: 'nexus', component: 'self-build-loop', action: 'post-promote-housekeeping',
        status: (snap.ok && drift.ok !== false) ? 'info' : 'warn',
        detail: { pipelineId, branchId, compartmentId, snapshot: snap, mapDrift: drift },
      });
    } catch (_) {}

    try {
      bus.emit('nexus.self-build.housekeeping-complete', {
        pipelineId, snapshot: snap, mapDrift: drift, ts: Date.now(),
      });
    } catch (_) {}

    if (opts.log !== false) {
      console.log(`[self-build-loop] post-promote housekeeping for ${pipelineId}: snapshot=${snap.ok ? snap.snapId : 'FAILED'}, mapDrift=${drift.ok === false ? drift.reason : `${drift.possiblyUndeclared}/${drift.scanned} files possibly undeclared`}`);
    }
  });

  return { installed: true };
}

module.exports = { install, _snapshot, _mapDrift, VERSION: '1.0.0' };
