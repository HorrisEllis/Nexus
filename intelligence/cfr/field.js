'use strict';
/**
 * lib/cfr/field.js — CFR Field state machine
 * UUID: nexus-cfr-field-v1-0000-4000-0000-000000000001
 *
 * The CFR field is a continuous physics model of system health.
 * It has four dimensions:
 *
 *   coherence   (0..1) — how ordered/structured the system is
 *   friction    (0..1) — energy lost to resistance / retries / lag
 *   resonance   (0..1) — cyclic reinforcement (retries, loops, polls)
 *   entropy     (0..1) — disorder / randomness / unpredictability
 *
 * Each ledger entry snapshots the field at that moment in time.
 * The snapshot is frozen — it represents what the system believed
 * reality was at the instant of the event.
 *
 * Regime is computed from the field:
 *   stable    — coherence > 0.6, entropy < 0.3
 *   resonant  — coherence > 0.4, entropy < 0.3 (cyclically good)
 *   turbulent — friction > 0.6 OR resonance > 0.7 (loops)
 *   chaotic   — entropy > 0.7 OR coherence < 0.2
 *
 * Event → field mapping: each event type nudges the field dimensions.
 * Nudges are small (0.02–0.12) to prevent single-event overreaction.
 * The field is self-damping: every tick pulls dimensions toward 0.5.
 */

'use strict';

// ── Event → field nudge table ─────────────────────────────────────────────────
// Each entry: { coherence, friction, resonance, entropy, stress? }
// Positive = increase, negative = decrease, absent = no change

const EVENT_NUDGES = {
  // ── Guardian job lifecycle ──
  'guardian.job.queued':       { coherence: +0.02, friction:  0,     resonance: +0.03, entropy: +0.01 },
  'guardian.job.dispatched':   { coherence: +0.03, friction:  0,     resonance:  0,    entropy: -0.01 },
  'guardian.job.complete':     { coherence: +0.05, friction: -0.03,  resonance: -0.02, entropy: -0.03, stress: false },
  'guardian.job.error':        { coherence: -0.08, friction: +0.08,  resonance:  0,    entropy: +0.10, stress: true },
  'guardian.job.chunk':        { coherence: +0.01, friction:  0,     resonance:  0,    entropy:  0 },
  'guardian.artifact':         { coherence: +0.04, friction: -0.01,  resonance:  0,    entropy: -0.02 },
  'guardian.gaps':             { coherence: -0.06, friction: +0.05,  resonance:  0,    entropy: +0.08, stress: true },
  'guardian.baseline.deviation':{ coherence: -0.10, friction: +0.10, resonance:  0,    entropy: +0.12, stress: true },
  'guardian.tab.needed':       { coherence: -0.03, friction: +0.04,  resonance: +0.02, entropy: +0.03 },
  'guardian.provider.registered':{ coherence: +0.06, friction: -0.02, resonance: -0.01, entropy: -0.04 },
  'guardian.provider.connected':  { coherence: +0.06, friction: -0.02, resonance: -0.01, entropy: -0.04 },
  'guardian.provider.disconnected':{ coherence: -0.05, friction: +0.04, resonance: 0,   entropy: +0.05, stress: true },

  // ── SEAM lifecycle ──
  'seam.chunk.injected':       { coherence: +0.02, friction:  0,     resonance: +0.02, entropy:  0 },
  'seam.chunk.stable':         { coherence: +0.03, friction: -0.01,  resonance: -0.01, entropy: -0.01 },
  'seam.chunk.verified':       { coherence: +0.05, friction: -0.02,  resonance: -0.02, entropy: -0.03 },
  'seam.chunk.failed':         { coherence: -0.08, friction: +0.08,  resonance: +0.05, entropy: +0.10, stress: true },
  'seam.queue.complete':       { coherence: +0.08, friction: -0.05,  resonance: -0.04, entropy: -0.05 },
  'seam.retry':                { coherence: -0.04, friction: +0.06,  resonance: +0.08, entropy: +0.06 },

  // ── Cortex / gap system ──
  'cortex.gap.found':          { coherence: -0.07, friction: +0.06,  resonance:  0,    entropy: +0.09, stress: true },
  'cortex.gap.resolved':       { coherence: +0.06, friction: -0.04,  resonance: -0.02, entropy: -0.06 },
  'cortex.memory.updated':     { coherence: +0.01, friction:  0,     resonance:  0,    entropy: -0.01 },
  'cortex.storage.opened':     { coherence: +0.10, friction: -0.05,  resonance: -0.03, entropy: -0.08 },
  'cortex.event.stored':       { coherence: +0.005,friction:  0,     resonance:  0,    entropy:  0 },

  // ── Mirror / persistence ──
  'cortex.mirror.write':       { coherence: +0.01, friction:  0,     resonance:  0,    entropy: -0.01 },
  'cortex.mirror.fail':        { coherence: -0.04, friction: +0.05,  resonance:  0,    entropy: +0.06, stress: true },
  'cortex.ingest.ok':          { coherence: +0.01, friction:  0,     resonance:  0,    entropy: -0.01 },
  'cortex.ingest.error':       { coherence: -0.05, friction: +0.06,  resonance:  0,    entropy: +0.07, stress: true },

  // ── Contract verification ──
  'contract.ok':               { coherence: +0.02, friction: -0.01,  resonance:  0,    entropy: -0.02 },
  'contract.violation':        { coherence: -0.12, friction: +0.10,  resonance:  0,    entropy: +0.15, stress: true },
  'contract.structural.fail':  { coherence: -0.15, friction: +0.12,  resonance:  0,    entropy: +0.18, stress: true },
  'contract.behavioral.fail':  { coherence: -0.10, friction: +0.08,  resonance:  0,    entropy: +0.12, stress: true },
  'contract.temporal.fail':    { coherence: -0.07, friction: +0.06,  resonance:  0,    entropy: +0.09, stress: true },

  // ── Pulse / heartbeat ──
  'orchestrator.pulse':        { coherence: +0.01, friction: -0.005, resonance:  0,    entropy: -0.01 },
  'pulse.missed':              { coherence: -0.06, friction: +0.06,  resonance:  0,    entropy: +0.08, stress: true },
  'ncp.client.evicted':        { coherence: -0.04, friction: +0.04,  resonance:  0,    entropy: +0.05, stress: true },

  // ── System lifecycle ──
  'system.online':             { coherence: +0.10, friction: -0.08,  resonance: -0.03, entropy: -0.10 },
  'system.offline':            { coherence: -0.12, friction: +0.10,  resonance:  0,    entropy: +0.12, stress: true },
  'orchestrator.booted':       { coherence: +0.15, friction: -0.10,  resonance: -0.05, entropy: -0.15 },

  // ── File integrity ──
  'file.integrity.drift':  { coherence: -0.06, friction: +0.07, resonance:  0,    entropy: +0.08, stress: true },
  'integrity.baseline.accepted': { coherence: +0.04, friction: -0.03, resonance: -0.01, entropy: -0.04 },

  // ── Healer / self-repair ──
  'healer.resolved':           { coherence: +0.06, friction: -0.05,  resonance: -0.02, entropy: -0.06 },
  'healer.escalated':          { coherence: -0.05, friction: +0.06,  resonance:  0,    entropy: +0.07, stress: true },
  'self-heal.patched':         { coherence: +0.04, friction: -0.03,  resonance: -0.01, entropy: -0.04 },
};

// Damping factor per tick — field naturally decays toward 0.5
const DAMPING     = 0.012;
const NEUTRAL     = 0.5;
const CLAMP_MIN   = 0.0;
const CLAMP_MAX   = 1.0;

// ── CFR Field ─────────────────────────────────────────────────────────────────

function createCFRField(initial = {}) {
  let state = {
    coherence:  initial.coherence  ?? 0.6,
    friction:   initial.friction   ?? 0.2,
    resonance:  initial.resonance  ?? 0.3,
    entropy:    initial.entropy    ?? 0.2,
  };

  // Stress repulsors for visual layer (array of { strength, life })
  const stresses = [];

  /**
   * update — apply an event to the field.
   * Returns a frozen snapshot of the field state after update.
   * The snapshot is what gets stored in the ledger entry.
   */
  function update(eventType, sigmaScore = 0) {
    try {
      // §1.2: accept event object {type, sigma:{score}} or plain string
      if (typeof eventType === 'object' && eventType !== null) {
        sigmaScore = eventType.sigma?.score ?? eventType.sigmaScore ?? sigmaScore ?? 0;
        eventType  = eventType.type ?? '';
      }
      if (typeof sigmaScore !== 'number' || Number.isNaN(sigmaScore)) sigmaScore = 0;

      // Apply natural damping — field drifts toward NEUTRAL
      for (const k of Object.keys(state)) {
        state[k] += (NEUTRAL - state[k]) * DAMPING;
      }

      // Look up nudge table — partial match for prefixes
      const nudge = _findNudge(eventType);
      if (nudge) {
        for (const [k, v] of Object.entries(nudge)) {
          if (k === 'stress') continue;
          if (state[k] !== undefined) state[k] += v;
        }
        if (nudge.stress) {
          stresses.push({ strength: 300 + sigmaScore * 400, life: 1.0 });
        }
      }

      // Sigma amplifies entropy and friction
      state.entropy  += sigmaScore * 0.08;
      state.friction += sigmaScore * 0.04;

      // Clamp
      for (const k of Object.keys(state)) {
        state[k] = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, state[k]));
      }

      // Decay stresses
      for (const s of stresses) s.life *= 0.85;
      stresses.splice(0, stresses.length,
        ...stresses.filter(s => s.life > 0.05));

      return snapshot();
    } catch (e) {
      // §1.2 nothing silent — field state is hot-path (called on every event
      // across the system); a malformed event must never crash the caller,
      // but it must not vanish either. Log once with context, return the
      // last-known-good snapshot so callers keep getting a valid object.
      console.error(`[cfr/field] update() failed for event ${JSON.stringify(eventType)}:`, e.message);
      try { return snapshot(); } catch (_) {
        // state itself is corrupted — fall back to a safe neutral snapshot
        return Object.freeze({ coherence: NEUTRAL, friction: NEUTRAL, resonance: NEUTRAL, entropy: NEUTRAL, regime: 'stable', stressCount: 0 });
      }
    }
  }

  /**
   * snapshot — frozen field state for ledger entry.
   * This is what gets stored — never recomputed.
   */
  function snapshot() {
    return Object.freeze({
      coherence:  +state.coherence.toFixed(4),
      friction:   +state.friction.toFixed(4),
      resonance:  +state.resonance.toFixed(4),
      entropy:    +state.entropy.toFixed(4),
      regime:     computeRegime(state),
      stressCount: stresses.length,
    });
  }

  function get() { return { ...state }; }

  /**
   * restore — load a previously stored snapshot (for replay).
   */
  function restore(snap) {
    // §1.2 — set dimensions directly, never through update() which expects an event type string
    if (!snap || typeof snap !== 'object') return;
    state.coherence  = typeof snap.coherence  === 'number' ? Math.max(0,Math.min(1,snap.coherence))  : state.coherence;
    state.friction   = typeof snap.friction   === 'number' ? Math.max(0,Math.min(1,snap.friction))   : state.friction;
    state.resonance  = typeof snap.resonance  === 'number' ? Math.max(0,Math.min(1,snap.resonance))  : state.resonance;
    state.entropy    = typeof snap.entropy    === 'number' ? Math.max(0,Math.min(1,snap.entropy))    : state.entropy;
  }

  return { update, snapshot, get, restore };
}

/**
 * computeRegime — classify current field state into a named regime.
 */
function computeRegime({ coherence, friction, resonance, entropy }) {
  if (entropy   > 0.70) return 'chaotic';
  if (coherence < 0.25) return 'chaotic';
  if (friction  > 0.65 || resonance > 0.70) return 'turbulent';
  if (coherence > 0.55 && entropy < 0.30)  return 'resonant';
  return 'stable';
}

/**
 * findNudge — match event type to nudge entry.
 * Tries exact match first, then prefix match.
 */
function _findNudge(type) {
  // §1.2: accept both string and object {type:'event.name'}
  const t = (typeof type === 'object' && type !== null) ? (type.type || '') : (type || '');
  if (!t || typeof t !== 'string') return null;
  if (EVENT_NUDGES[t]) return EVENT_NUDGES[t];
  for (const key of Object.keys(EVENT_NUDGES)) {
    if (t.startsWith(key)) return EVENT_NUDGES[key];
  }
  return null;
}

module.exports = { createCFRField, computeRegime, EVENT_NUDGES };
