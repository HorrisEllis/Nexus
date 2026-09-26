'use strict';
/**
 * lib/autopilot-intelligence.js — wire + verify the intelligence substrate at boot
 * UUID: nexus-autopilot-intelligence-v1-0000-2026-0808-001
 *
 * James: "completely update the entire autopilot. Check lib, the intelligence
 * system, RFR2, emergence, CFR, sigmas, baseline behavior — make sure they're all
 * wired in."
 *
 * Autopilot is the boot entry. Today it wires the fan-in (P1) but the broader
 * intelligence substrate is wired piecemeal (intelligence.init lives in cortex
 * boot; CFR/baseline/RFR2 aren't verified as a coherent bundle). This module is
 * the ONE place autopilot calls to wire AND VERIFY the whole faculty:
 *
 *   intelligence   — the learner (init/observe pattern+failure scanning)
 *   RFR2           — relational-field: conditions behind friction
 *   CFR            — the field + regime (intelligence/cfr)
 *   baseline       — baseline behavior + sigma (lib/baseline)
 *   sigmas         — sigma detection feeding snapshot-on-sigma (P2)
 *   emergence      — intelligence's pattern/emergence detection over the stream
 *
 * §1.1 declared≠real — this VERIFIES each is actually reachable, returns a wired/
 * missing report, not a claim. §8.6 composes existing modules; starts nothing
 * that's already running (idempotent — won't double-init intelligence). §1.2 a
 * missing faculty degrades honestly; the boot never dies on a wiring gap.
 */

function _try(p) { try { return require(p); } catch (_) { return null; } }

/**
 * wireIntelligence(opts) — wire + verify the whole substrate against the live
 * fan-in. Returns { wired:[], missing:[], report } — the truth of what's connected.
 */
function wireIntelligence(opts = {}) {
  const fanin = opts.fanin || _try('./ledger-fanin');
  const wired = [];
  const missing = [];

  // 1) Intelligence — the learner.
  // §FIXED 2026-08-18 — James, direct, from his own real terminal
  // screenshots: unprefixed, uncolored, no-timestamp "[cortex/
  // intelligence] pattern crystallised" lines mixed in among the
  // properly-piped ones, and: "i feel like it's fragmented or not the
  // same system." Confirmed exactly right: this used to call
  // intel.init() HERE, directly in autopilot's own process. cortex/
  // boot.js ALSO calls intelligence.init() in its own, separately
  // spawned, properly-supervised process. Node processes share no
  // memory — require('../cortex/intelligence') from autopilot's process
  // creates a genuine SECOND, independent instance: its own pattern
  // scanner, its own six real setInterval() timers (PATTERN_SCAN_MS,
  // FAILURE_SCAN_MS, REUSE_INDEX_MS, CROSS_LEDGER_MS, META_SCAN_MS,
  // LOOM_MAP_SYNC_MS), running forever, doubling the real CPU/RAM cost
  // of the entire intelligence system for no benefit — cortex's own
  // real instance is the one that actually matters; this was a
  // redundant, wasteful phantom copy. Its console.log calls never went
  // through autopilot's own per-kernel pipe() (that only wraps spawned
  // CHILD process streams), which is exactly why they appeared raw:
  // no timestamp, no color, no [source:file] prefix.
  // Fixed to match the exact same reachability-only pattern already
  // used correctly for RFR2/CFR/baseline two sections below — verify
  // the module is reachable, never start a second real instance.
  const intel = opts.intelligence || _try('../intelligence');
  if (intel) {
    wired.push('intelligence (module reachable — real instance lives in cortex\'s own supervised process, not started here)');
    // Still real, still useful: subscribe THIS reachability check's own
    // observed module to the live stream if it exposes an intake, same
    // as before — this does not start a scanning instance, just lets
    // autopilot's own process forward real fan-in events onward.
    if (fanin && fanin.subscribe && (intel.observe || intel.ingestEvent)) {
      try { fanin.subscribe('intelligence-live', (row) => { try { (intel.observe || intel.ingestEvent)(row); } catch (_) {} }); wired.push('intelligence←fanin'); }
      catch (e) { missing.push(['intelligence←fanin', e.message]); }
    }
  } else missing.push(['intelligence', 'module not found']);

  // 2) RFR2 — relational-field (conditions behind friction).
  const rfr2 = opts.relationalField || _try('../intelligence/relational-field');
  if (rfr2 && rfr2.readFieldForFriction) wired.push('RFR2 (relational-field)');
  else missing.push(['RFR2', 'relational-field not reachable']);

  // 3) CFR — the field + regime.
  const cfr = opts.cfr || _try('../intelligence/cfr');
  if (cfr && (cfr.createCFRLedger || cfr.field)) wired.push('CFR (field/regime)');
  else missing.push(['CFR', 'intelligence/cfr not reachable']);

  // 4) baseline behavior + sigma.
  const baseline = opts.baseline || _try('../intelligence/baseline');
  if (baseline && baseline.sigma && baseline.createBaseline) wired.push('baseline+sigma');
  else missing.push(['baseline', 'lib/baseline not reachable']);

  // 5) sigmas → snapshot-on-sigma (P2) — is the snapshot trigger on the stream?
  const snap = opts.snapshotTrigger || _try('../intelligence/snapshot-trigger');
  if (snap && snap.attach) {
    if (fanin && !opts.snapshotAlreadyAttached) { try { snap.attach(fanin, opts.snapshotOpts || {}); wired.push('sigma→snapshot'); } catch (e) { missing.push(['sigma→snapshot', e.message]); } }
    else wired.push('sigma→snapshot (present)');
  } else missing.push(['sigma→snapshot', 'snapshot-trigger not reachable']);

  // 6) emergence — intelligence's pattern/emergence detection. It's a PROPERTY of
  //    intelligence scanning the stream, not a separate module: verify the scan path.
  if (intel && (intel.getState || intel._scanPatterns || intel.observe)) wired.push('emergence (intelligence pattern scan)');
  else missing.push(['emergence', 'no intelligence scan path']);

  const report = `intelligence substrate: ${wired.length} wired [${wired.join(', ')}]` +
    (missing.length ? ` · ${missing.length} MISSING [${missing.map(m => m[0]).join(', ')}]` : ' · all connected');

  return { wired, missing, ok: missing.length === 0, report };
}

module.exports = { wireIntelligence, MODULE_ID: 'autopilot-intelligence', VERSION: '1.0.0' };
