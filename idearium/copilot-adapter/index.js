/**
 * idearium/copilot-adapter/index.js — Copilot Adapter (the gate, not the intelligence)
 * UUID: idearium-copilot-adapter-v1-0000-2026-0711-jamesbrooks-001
 * Version: 1.0.0
 * Component: idearium.copilot-adapter
 *
 * §SCOPED 2026-07-10 — "do not invent the full copilot contract yet. stub
 * only the interface boundary. create the gate, not the intelligence."
 *
 *   Wizard
 *      |
 *   Interaction Contract     <- this file's exported shape
 *      |
 *   Copilot Adapter          <- this module — the gate
 *      |
 *   Actual Copilot           <- not built. registerBackend() is where it plugs in.
 *
 * The wizard (or anything else) never talks to a real copilot directly —
 * it talks to this adapter, which is the warp gate: one stable signature
 * in, one stable shape out, regardless of what's behind it. Right now
 * nothing is registered behind it, so it answers honestly (connected:false,
 * empty suggestions) instead of fabricating output that looks like an AI
 * produced it — that would be exactly the kind of stub axiom #1 in
 * SYSTEM_SPEC_v1_0_0.md rules out ("nothing pretends to work"). The GATE
 * is real and callable today; the INTELLIGENCE behind it is the explicitly
 * deferred part.
 *
 * Contract (fixed, per the 2026-07-10 scoping decision):
 *   input:  { context: object, goal: string, current_gate: string }
 *   output: { suggestions: array, confidence: number, artifacts: array }
 * plus two honesty fields no version of this contract should ever drop:
 *   connected: boolean — was a real backend consulted for this answer
 *   reason:    string  — why not, when connected is false
 */

const MODULE_ID = 'idearium.copilot-adapter';
const VERSION   = '1.0.0';
const COMP_ID   = 'idearium.copilot-adapter';

// The one plug point. A real copilot backend registers a function here:
//   registerBackend(async ({context, goal, current_gate}) => ({suggestions, confidence, artifacts}))
// Swapping what's behind the gate never changes the gate's own signature —
// callers (the wizard, the CLI, anything else) are never touched.
let _backend = null;

export function registerBackend(fn) {
  if (typeof fn !== 'function') throw new Error('registerBackend requires a function');
  _backend = fn;
  console.log(`[${MODULE_ID}] backend registered — copilot suggestions now live`);
}

export function isConnected() {
  return typeof _backend === 'function';
}

/**
 * suggest — the one gate operation. Never throws on a missing backend;
 * "no intelligence connected yet" is a normal, honestly-reported state,
 * not a failure mode.
 */
export async function suggest({ context = {}, goal = '', current_gate = '' } = {}) {
  if (!goal && !current_gate) {
    return { suggestions: [], confidence: 0, artifacts: [], connected: isConnected(),
      reason: 'no goal or current_gate given — nothing to suggest against' };
  }
  if (!_backend) {
    return {
      suggestions: [], confidence: 0, artifacts: [],
      connected: false,
      reason: 'no copilot backend registered — this is the adapter boundary only, per the 2026-07-10 scoping decision. Wire a real backend with registerBackend().',
    };
  }
  try {
    const out = await _backend({ context, goal, current_gate });
    return {
      suggestions: Array.isArray(out?.suggestions) ? out.suggestions : [],
      confidence: typeof out?.confidence === 'number' ? out.confidence : 0,
      artifacts: Array.isArray(out?.artifacts) ? out.artifacts : [],
      connected: true,
      reason: null,
    };
  } catch (e) {
    // §1.2 — a failed backend call is reported, never swallowed into a
    // silently-empty "no suggestions" response indistinguishable from
    // "nothing to suggest."
    return { suggestions: [], confidence: 0, artifacts: [], connected: true,
      reason: `backend error: ${e.message}` };
  }
}

export default { suggest, registerBackend, isConnected, MODULE_ID, VERSION, COMP_ID };

// §DISCOVERY 2026-07-11 — "wire in... the entire project." Packaging the
// full nexus tree surfaced something the original scoping got wrong: there
// IS a real copilot service — nexus/copilot/server.js, 1077 lines, a real
// HTTP server on :3750 with a genuine adaptive-fulfillment endpoint
// (POST /api/prompt/fulfill — dispatches to ollama/claude/chatgpt via
// Guardian, with retry weighting). It wasn't in what was uploaded earlier
// in this conversation, so "stub the interface, not the intelligence" was
// the right call against what was visible at the time. Against the full
// project, it's no longer accurate to leave this gate pointed at nothing.
//
// Registered here as the DEFAULT backend — not because it's been proven
// live (this sandbox has no running Guardian/Ollama/copilot process to hit,
// so this is verified by construction — request/response shapes checked
// against server.js's actual handler — not verified end-to-end), but
// because leaving `registerBackend` uncalled when a real target exists
// would be the same "gate with nothing behind it" problem all over again,
// just now for a reason that no longer holds.
//
// If copilot :3750 isn't running when this executes, the fetch fails and
// `suggest()`'s existing catch path reports that honestly (connected:true,
// reason: 'backend error: ...') — never silently falls back to looking
// like "no backend registered" when one very much is.
const COPILOT_URL = process.env.COPILOT_URL || 'http://127.0.0.1:3750';

registerBackend(async ({ context, goal, current_gate }) => {
  const prompt = current_gate ? `[wizard section: ${current_gate}] ${goal}` : goal;
  const res = await fetch(`${COPILOT_URL}/api/prompt/fulfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, maxAttempts: 2 }),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `copilot :3750 returned ${res.status}`);
  }
  // adaptive-fulfillment's outcome shape is {ok, output, attempts, ...} —
  // not our {suggestions, confidence, artifacts} contract. Translate once,
  // here, so every caller of suggest() still sees the one stable shape
  // regardless of what's behind the gate.
  return {
    suggestions: data.output ? [data.output] : [],
    confidence: data.ok ? Math.max(0, 1 - ((data.events?.length || 1) - 1) * 0.15) : 0,
    artifacts: [],
  };
});
