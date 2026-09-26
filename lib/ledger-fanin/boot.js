'use strict';
/**
 * lib/ledger-fanin/boot.js — wire the nervous system live (§P1 nexus-live-mind)
 * UUID: nexus-fanin-boot-v1-0000-2026-0807-001
 *
 * James: "every system and the intelligence system needs to read the SSE and
 * event ledger, all pointed towards autopilot, all systems with logging enabled,
 * error logs, all saved in cortex, read by intelligence and diagnostic, injected
 * into co-pilot."
 *
 * The producer side is already done: lib/component-ledger.write() (the universal
 * ledger entry point every component calls) now emits into lib/ledger-fanin. This
 * wires the CONSUMER side — one call at boot subscribes everyone who needs the
 * stream:
 *   - activity-log  → persists every event to cortex event_log + error_log
 *   - intelligence  → so it detects across ALL systems (not just some ledgers)
 *   - autopilot     → the stream "all pointed towards autopilot"
 *   - co-pilot      → injected into the mind's continuous awareness
 *
 * §8.6 — subscribers already exist; this connects them. §1.2 — each subscribe is
 * independent; one unavailable consumer doesn't stop the others. Idempotent
 * (fan-in.subscribe replaces by id), so a re-boot re-wires cleanly.
 */

function wireFanin(opts = {}) {
  const fanin = opts.fanin || require('./index');
  const wired = [];
  const skipped = [];

  // 1) Activity logging — every system's events → cortex, errors → error_log.
  try {
    const log = opts.activityLog || require('../activity-log');
    log.attach(fanin, opts.logWriter ? { writer: opts.logWriter } : {});
    log.enable();                    // James: logging enabled for all systems
    wired.push('activity-log');
  } catch (e) { skipped.push(['activity-log', e.message]); }

  // 2) Intelligence — reads the fan-in so it detects across EVERY system.
  try {
    const onIntel = opts.onIntelligence || _defaultIntelligenceSink();
    if (onIntel) { fanin.subscribe('intelligence', onIntel); wired.push('intelligence'); }
    else skipped.push(['intelligence', 'no sink available']);
  } catch (e) { skipped.push(['intelligence', e.message]); }

  // 3) Autopilot — the stream all points here.
  try {
    if (opts.onAutopilot) { fanin.subscribe('autopilot', opts.onAutopilot); wired.push('autopilot'); }
    else skipped.push(['autopilot', 'no sink provided (autopilot wires itself at its own boot)']);
  } catch (e) { skipped.push(['autopilot', e.message]); }

  // 4) Co-pilot — injected into the mind's continuous awareness stream.
  try {
    if (opts.onCopilot) { fanin.subscribe('copilot', opts.onCopilot); wired.push('copilot'); }
    else skipped.push(['copilot', 'no sink provided (co-pilot subscribes at its own boot)']);
  } catch (e) { skipped.push(['copilot', e.message]); }

  // 5) §P2 snapshot-on-sigma — the replay engine snapshots on every sigma/tension
  // event flowing through the stream, tracing the conditions that created it.
  try {
    const trigger = opts.snapshotTrigger || require('../../intelligence/snapshot-trigger');
    trigger.attach(fanin, opts.snapshotOpts || {});
    wired.push('snapshot-trigger');
  } catch (e) { skipped.push(['snapshot-trigger', e.message]); }

  // 6) Associative lattice — docs/nexus-relationship-shape.spec build_order_v0_2
  // steps 8 (event-triggered recompute) and 9 (background sweep). Until this,
  // intelligence/lattice/associative-lattice.js was real and callable but wired
  // to nothing — its own header said so. This is that wiring, nothing more.
  try {
    const lattice = opts.lattice || require('../../intelligence/lattice/associative-lattice');
    const faninListener = opts.faninListener || require('../../intelligence/lattice/fanin-listener');
    faninListener.attachListener(fanin, lattice);
    faninListener.startSweep(lattice, opts.latticeSweepOpts || {});
    wired.push('lattice');
  } catch (e) { skipped.push(['lattice', e.message]); }

  return { wired, skipped, ok: wired.length > 0 };
}

// Intelligence's existing intake reads jaaDB event_log on a scan; the fan-in can
// ALSO push to it live. If the intelligence module exposes an ingest/observe
// hook, use it; otherwise return null and let the scan-based path stand (the
// component-ledger already writes event_log, which intelligence reads).
function _defaultIntelligenceSink() {
  try {
    const intel = require('../../intelligence');
    if (typeof intel.ingestEvent === 'function') return (row) => { try { intel.ingestEvent(row); } catch (_) {} };
    if (typeof intel.observe === 'function') return (row) => { try { intel.observe(row); } catch (_) {} };
  } catch (_) {}
  return null;   // scan-based intake already fed by component-ledger's event_log write
}

module.exports = { wireFanin };
