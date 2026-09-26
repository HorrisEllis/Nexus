'use strict';
/**
 * guardian/lib/wake-hint.js — the "agent hint" for jobs that do NOT go through a userscript. 2026-09-19.
 *
 * ONLY THE AGENT SAYS "hey nexus". A person never does; wake detection must stay assistant-side, because the reply reaches the chat as
 * a user-side message and anything that scanned user text for the phrase would retrigger on its own answer (a feedback loop).
 * guardian/userscript-nexus-wake.js has two separate features: a LISTENER (originally described as the person typing "hey nexus, ...";
 * intercepted, the model never sees it) and an AGENT HINT: one line injected into what the MODEL reads, telling it NEXUS
 * is reachable and how to ask ("emit a line starting with 'hey nexus,'"). Both live in the userscript. A job delivered by
 * the agent MESH (DOM transport, no userscript) would therefore reach the model WITHOUT the hint, so an agent working
 * on a code base would never know it can ask NEXUS for real system state. James: "wake relay needs to be wired in also,
 * and injected into job contents."
 *
 * This reproduces exactly what the userscript does and nothing more:
 *  - HINT is byte-identical to the userscript's (test WK-001 re-extracts it from the userscript and compares).
 *  - modes match HINT_MODE_DEFAULTS (claude 'off': metered, and the operator usually drives there); providers the
 *    userscript table does not list default to 'once'. Override per provider with GUARDIAN_WAKE_HINT_<PROVIDER>=once|always|off.
 *  - It is applied ONLY on the mesh transport. The userscript path already injects its own; doing it here too would
 *    tell the model twice (10.3: one definition per runtime).
 *  - It goes into the typed PROMPT (never into an attached file, where the model may not weigh it) and NEVER into the
 *    stored job: the job record keeps the original prompt.
 *  - 'once' is per agent tab (agentId) and is only recorded once the mesh reports the prompt was sent, so a mesh
 *    pre-flight failure that falls back to the userscript does not use up the hint.
 */
const HINT = "NEXUS is running alongside this chat and can be queried for real system state — open gaps, component registry, test results, ledger history. To ask it, emit a line starting with \"hey nexus,\" and NEXUS will answer with live data. Prefer asking over guessing at system state you cannot see.";
const DEFAULT_MODES = {"chatgpt": "once", "gemini": "once", "perplexity": "once", "claude": "off"};
const MODES = new Set(['once', 'always', 'off']);

function hintMode(provider, env = process.env) {
  const o = env[`GUARDIAN_WAKE_HINT_${String(provider).toUpperCase()}`];
  if (o && MODES.has(o)) return o;
  return DEFAULT_MODES[provider] || 'once';
}

function createHintInjector({ env = process.env } = {}) {
  const hinted = new Set();
  const keyOf = ({ agentId, provider }) => agentId || provider;
  // Returns the prompt to SEND (the caller keeps the original) and whether the hint was added.
  function apply({ provider, agentId, command, prompt, composed = false }) {
    const mode = hintMode(provider, env);
    const base = { prompt, injected: false, mode, key: keyOf({ agentId, provider }) };
    if (mode === 'off') return base;
    if (composed) return { ...base, skipped: 'composed' };        // 0.39.258 — the caller built the whole prompt (a repo agent); nothing is added
    if (/^wake/.test(command || '')) return base;                 // a reply to a wake: the model plainly already knows
    if (typeof prompt !== 'string' || !prompt.trim()) return base; // nothing typed to attach it to
    if (mode === 'once' && hinted.has(base.key)) return base;
    return { ...base, prompt: `${prompt}\n\n${HINT}`, injected: true };
  }
  const commit = (key) => { hinted.add(key); };
  return { apply, commit, _hinted: hinted };
}

module.exports = { HINT, DEFAULT_MODES, hintMode, createHintInjector };
