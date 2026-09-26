'use strict';
/**
 * copilot/assist-loop.js — P10 of the bridge phases
 * UUID: nexus-copilot-assist-loop-v1-0000-2026-0730-001
 *
 * §PHASEMAP P10 (docs/raid-warp-verification-phasemap.spec Part II) — diagnose +
 * notify. On a RELEVANT detected event (P9's classifyRelevance), co-pilot runs
 * diagnose (the existing diagnose tool) and NOTIFIES the user — a toast (via the
 * existing _copilotBus → SSE → ui/toast/toast.js path) or a CLI line. This is the
 * OUTPUT half of the bridge: the user is told what NEXUS found (§1.2 specific,
 * §16.2 reads like a story). §8.6 — wires the existing detector + diagnose +
 * toast path, builds nothing new. The dominant bug of this codebase is "a real
 * detector wired to nothing"; this is the wire, not another detector.
 *
 * @param {object} deps
 *   classifyRelevance — from lib/stream-digest (P9)
 *   runDiagnose       — async (signal) => diagnosis  (wraps the diagnose tool)
 *   notify            — (message, meta) => void       (broadcast toast / CLI line)
 *   getStream         — () => events                  (the shared stream)
 */
function createAssistLoop(deps = {}) {
  const { classifyRelevance, runDiagnose, notify, getStream } = deps;
  if (typeof classifyRelevance !== 'function') throw new Error('[assist-loop] classifyRelevance required');
  if (typeof notify !== 'function') throw new Error('[assist-loop] notify required');

  let _lastNotifiedKey = null;   // dedupe — don't re-toast the same signal every tick

  // check() — run one assist pass over the current stream. Returns what it did
  // (for tests + logging), never throws (§1.2 — assist must never break the app).
  async function check() {
    try {
      const events = typeof getStream === 'function' ? getStream() : [];
      const verdict = classifyRelevance(events);
      if (!verdict.relevant) return { acted: false };

      // Take the strongest signal (repeated_error before stuck_flow).
      const signal = verdict.signals.find(s => s.kind === 'repeated_error') || verdict.signals[0];
      const key = `${signal.kind}:${signal.detail}`;
      if (key === _lastNotifiedKey) return { acted: false, reason: 'already-notified' };
      _lastNotifiedKey = key;

      // Diagnose (best-effort — a diagnosis enriches the notice but isn't required).
      let diagnosis = null;
      if (typeof runDiagnose === 'function') {
        try { diagnosis = await runDiagnose(signal); } catch (_) { /* notify without it */ }
      }

      // Notify — the user is told, plainly (§16.2).
      const message = _composeMessage(signal, diagnosis);
      notify(message, { signal, diagnosis });
      return { acted: true, signal, message };
    } catch (e) {
      return { acted: false, error: e.message };
    }
  }

  // Reset dedupe when the situation clears, so a recurrence re-notifies.
  function clear() { _lastNotifiedKey = null; }

  return { check, clear };
}

function _composeMessage(signal, diagnosis) {
  if (signal.kind === 'repeated_error') {
    const base = `I noticed "${signal.detail}" happened ${signal.count} times.`;
    return diagnosis && diagnosis.summary ? `${base} ${diagnosis.summary}` : `${base} Want me to look into it?`;
  }
  if (signal.kind === 'stuck_flow') {
    return `You've been working on this a while without it completing — want me to diagnose what's blocking?`;
  }
  return `I noticed something worth a look: ${signal.detail}.`;
}

module.exports = { createAssistLoop, _composeMessage };
