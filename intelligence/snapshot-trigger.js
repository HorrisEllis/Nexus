'use strict';
/**
 * lib/snapshot-trigger.js — snapshot on sigma (§P2 nexus-live-mind)
 * UUID: nexus-snapshot-trigger-v1-0000-2026-0807-001
 *
 * James: "the replay engine snapshots any time a sigma is detected in the system,
 * and also used to find bottlenecks, using deltas, and use the timeline as a tool
 * for debugging and reverting if needed." And earlier: the trigger is NOT a raw
 * threshold — it's the intelligence system using RFR2 (the relational-field
 * reader) to trace the CONDITIONS that created the friction, and snapshotting that.
 *
 * THE LOOP (now on the LIVE stream from P1):
 *   sigma.spike / delta.tension  (flows through lib/ledger-fanin)
 *     → relational-field reader (RFR2 causality.traceToRoot)
 *       → the conditions that created it, root-tagged
 *         → replay.snapshot({ trigger:'sigma', causalRoot, conditions, severity })
 *
 * The snapshot timeline becomes the debug/revert tool: each snapshot is tagged
 * with the sigma that caused it and the causal conditions, so you can see WHEN a
 * regime shifted and revert to before it.
 *
 * §8.6 composes lib/replay-engine.snapshot + the relational-field wire + the P1
 * fan-in; no new snapshot logic. §16.4 debounced so a sigma storm doesn't storm
 * snapshots. §1.2 honest — a failure is stated, never silent, and never breaks
 * the stream. §0.3 — rebuilt here after being lost between trees; the design is
 * docs/snapshot-trigger-phasemap.spec.
 */

const DEFAULT_MIN_INTERVAL_MS = 60_000;
let _lastSnapshot = 0;

const SIGMA_TYPES = /sigma\.spike|delta\.tension|sigma|tension|regime\.(shift|collapse)/i;

/**
 * onSigma(sigmaEvent, opts) — the event-driven entry. Given a sigma/tension event
 * (from the fan-in or direct), trace its conditions and snapshot.
 * @param sigmaEvent { type, severity, source, entry?, id?, causalStore?, kinematicWindow? }
 * @returns { snapshotId, causalRoot, conditions, severity, skipped, reason }
 */
async function onSigma(sigmaEvent = {}, opts = {}) {
  const out = { snapshotId: null, causalRoot: null, conditions: [], severity: sigmaEvent.severity || null, skipped: false, reason: null };
  const cfg = {
    force: opts.force != null ? opts.force : sigmaEvent.force,
    minIntervalMs: opts.minIntervalMs != null ? opts.minIntervalMs : sigmaEvent.minIntervalMs,
    severityFloor: opts.severityFloor != null ? opts.severityFloor : 0.70,
    causalStore: opts.causalStore || sigmaEvent.causalStore,
    relationalField: opts.relationalField,
    replay: opts.replay,
  };
  const minInterval = cfg.minIntervalMs != null ? cfg.minIntervalMs : DEFAULT_MIN_INTERVAL_MS;
  const now = Date.now();

  // 1. Debounce (§16.4). force overrides.
  if (!cfg.force && (now - _lastSnapshot) < minInterval) {
    out.skipped = true; out.reason = `debounced — last snapshot ${Math.round((now - _lastSnapshot) / 1000)}s ago (< ${Math.round(minInterval / 1000)}s)`;
    return out;
  }

  // 2. Severity gate — only real sigmas snapshot (the 0.70/0.75 thresholds cfr uses).
  const severity = sigmaEvent.severity != null ? sigmaEvent.severity : (sigmaEvent.entry?.sigma?.score || 0);
  if (!cfg.force && severity < cfg.severityFloor) {
    out.skipped = true; out.reason = `severity ${severity} below floor ${cfg.severityFloor} — not a real sigma`;
    return out;
  }

  // 3. Trace the CONDITIONS that created it (RFR2 via intelligence).
  const eventId = sigmaEvent.id || sigmaEvent.entry?.uuid || sigmaEvent.entry?.type || sigmaEvent.type;
  try {
    const rf = cfg.relationalField || require('./relational-field');
    const field = await rf.readFieldForFriction({ id: eventId, causalStore: cfg.causalStore, kinematicWindow: sigmaEvent.kinematicWindow }, cfg);
    out.causalRoot = field.root;
    out.conditions = field.conditions || [];
    out._deviation = field.deviation || null;
  } catch (e) { out.reason = `relational-field read failed: ${e.message}`; /* still snapshot on a real sigma */ }

  // 4. Snapshot, tagged with the sigma + its causal conditions (§17.5 provenance).
  try {
    const replay = cfg.replay || require('../lib/replay-engine');
    const res = replay.snapshot({
      trigger: 'sigma', actor: 'snapshot-trigger',
      sigmaType: sigmaEvent.type, severity, source: sigmaEvent.source,
      causalRoot: out.causalRoot, conditions: out.conditions,
      message: sigmaEvent.message || sigmaEvent.entry?.message || null,
    });
    const sid = res && (res.snapshotId || res.uuid);
    if (sid) { out.snapshotId = sid; _lastSnapshot = now; }
    else out.reason = out.reason || 'replay.snapshot returned no id';
  } catch (e) { out.reason = `snapshot failed: ${e.message}`; }

  return out;
}

/**
 * attach(fanin, opts) — P2 wiring: subscribe to the LIVE stream and snapshot on
 * every sigma/tension event. One call makes "snapshots on any sigma" true
 * system-wide. Returns a detach fn.
 */
function attach(fanin, opts = {}) {
  const unsub = fanin.subscribe('snapshot-trigger', (row) => {
    if (!SIGMA_TYPES.test(row.type || '')) return;   // only sigma/tension events
    // fire-and-forget; a snapshot must never block the stream
    onSigma({ type: row.type, severity: row.severity ?? row.payload?.severity, source: row.source, id: row.causedBy || row.type, entry: row.payload, message: row.payload?.detail }, opts)
      .catch(() => {});
  }, { filter: (row) => SIGMA_TYPES.test(row.type || '') });
  return unsub;
}

function sinceLastSnapshot() { return _lastSnapshot ? (Date.now() - _lastSnapshot) : null; }

/**
 * timeline(opts) — the sigma snapshots as a debuggable timeline (James: "use the
 * timeline as a tool for debugging and reverting"). Each entry is a moment a sigma
 * shifted the system, tagged with its cause, and revertible via replay-engine.
 */
function timeline(opts = {}) {
  const replay = opts.replay || require('../lib/replay-engine');
  const all = replay.listSnapshots ? replay.listSnapshots(opts.limit || 50) : [];
  // sigma-triggered snapshots are the debug points; keep the causal tag.
  return all
    .filter(s => !opts.sigmaOnly || s.trigger === 'sigma')
    .map(s => ({ snapshotId: s.snapshotId || s.uuid, trigger: s.trigger, severity: s.severity, sigmaType: s.sigmaType, causalRoot: s.causalRoot, ts: s.ts, revertTo: s.snapshotId || s.uuid }));
}

function _resetForTest() { _lastSnapshot = 0; }

module.exports = { onSigma, attach, timeline, sinceLastSnapshot, SIGMA_TYPES, DEFAULT_MIN_INTERVAL_MS, _resetForTest, MODULE_ID: 'snapshot-trigger', VERSION: '1.0.0' };
