'use strict';
/**
 * lib/agent-router.js — CA5 of the awareness/routing phasemap
 * UUID: nexus-agent-router-v1-0000-2026-0730-001
 *
 * §PHASEMAP CA5 (docs/copilot-awareness-routing-phasemap.spec, CHUNK C). Maps a
 * task's INTENT to the strongest AGENT for it (James's agent-strength spec),
 * both AUTO (by classified intent) and USER-DIRECTED (explicit override wins).
 * §10.3 — this is the ONE intent→agent layer; it composes with routing-ir's
 * fitness/availability logic rather than replacing it (routing-ir still decides
 * ollama-first / availability; this decides WHICH external agent when one is
 * used). §17.5 — every route records {intent, agent, why}. §0.4 — the map is
 * config (CA6 makes it editable cortex rows); this module reads a config with a
 * sane built-in default so it works before CA6 lands.
 *
 * James's strengths:
 *   perplexity → reliable data / research / current facts
 *   claude     → large codebases (+ WARP + relevant context injected); last resort
 *   chatgpt    → optimal general agent, BUT 900-token limit → chunk long inputs
 *   gemini     → coding + adversarial testing (secondary to claude for code)
 */

// §CHANGED 2026-08-14 — James, explicit: "using gemini and chatgpt as
// primary, then [claude] as last resort" for autonomous coding. This
// used to route large_code straight to claude (primary) and code to
// gemini "secondary to claude." Both flipped. DEFAULT_FALLBACK below was
// ALREADY claude-last (checked before touching anything) — this change
// is real: previously large_code's PRIMARY pick was claude, not merely
// its fallback position, so this is not a no-op.
// Blast radius, stated plainly: DEFAULT_ROUTES governs routing for
// EVERY caller through RAID, not a coding-specific feature — this
// changes large_code/code intent routing system-wide, not just an
// "autonomous build for me" path.
const DEFAULT_ROUTES = [
  { intent: 'data',        agent: 'perplexity', why: 'reliable data / research / current facts' },
  { intent: 'research',    agent: 'perplexity', why: 'research needs sourced, current data' },
  { intent: 'large_code',  agent: 'gemini',     why: 'large codebases — gemini primary per 2026-08-14 directive (was claude); 1M context, real cheap-first-pass', inject: ['warp', 'context'] },
  { intent: 'adversarial', agent: 'gemini',     why: 'adversarial testing is a gemini strength' },
  { intent: 'code',        agent: 'gemini',     why: 'coding — gemini primary per 2026-08-14 directive, chatgpt close second, claude last resort' },
  { intent: 'general',     agent: 'chatgpt',    why: 'optimal general agent', constraints: { maxTokens: 900, chunk: true } },
  { intent: 'ask',         agent: 'chatgpt',    why: 'default general Q&A', constraints: { maxTokens: 900, chunk: true } },
];

// Fallback order when the chosen agent is unavailable (claude is last resort).
const DEFAULT_FALLBACK = ['perplexity', 'gemini', 'deepseek', 'chatgpt', 'claude'];   // §0.59.1 deepseek was absent

const AGENT_CONSTRAINTS = {
  chatgpt: { maxTokens: 900, chunk: true },   // §the 900-token limit chunking exists for
  claude:  { maxTokens: 200000, inject: ['warp', 'context'] },
  perplexity: { maxTokens: 4000 },
  gemini:  { maxTokens: 1000000, outputTokens: 65536, contextCaching: true },
};

/**
 * routeAgent({ intent, prompt, directed, config, available }) — choose the agent.
 * @param directed  — explicit agent the user named (wins over auto, §user-directed)
 * @param intent    — classified task intent (auto path)
 * @param config    — optional CA6 config { routes, fallback } overriding defaults
 * @param available — optional (agent)=>bool availability check (composes w/ routing-ir)
 * @returns { agent, why, directed, constraints, inject, fallbackChain }
 */
function routeAgent({ intent, prompt, directed, config, available } = {}) {
  const routes = (config && config.routes) || DEFAULT_ROUTES;
  const fallback = (config && config.fallback) || DEFAULT_FALLBACK;
  const isUp = typeof available === 'function' ? available : () => true;

  // 1. User-directed override wins (§user in control).
  if (directed) {
    return _decorate(directed, `user-directed to ${directed}`, true, fallback, isUp);
  }

  // 2. Auto: first route rule whose intent matches.
  const eff = intent || _inferIntent(prompt);
  const rule = routes.find(r => r.intent === eff) || routes.find(r => r.intent === 'ask');
  const agent = rule ? rule.agent : 'chatgpt';
  const why = rule ? rule.why : 'default';
  const dec = _decorate(agent, `auto: intent "${eff}" → ${why}`, false, fallback, isUp);
  if (rule && rule.inject) dec.inject = rule.inject;
  return dec;
}

function _decorate(agent, why, directed, fallback, isUp) {
  const constraints = AGENT_CONSTRAINTS[agent] || {};
  // Build the fallback chain from the chosen agent, skipping unavailable ones.
  const chain = [agent, ...fallback.filter(a => a !== agent)].filter(isUp);
  // §CA7 — attach the account slot this provider should use (default or named),
  // so ClearGlass logs into the right account. Best-effort; no accounts → null.
  let account = null;
  try {
    const ar = require('./account-registry');
    const a = ar.getAccountForRoute(agent);
    if (a) account = { label: a.label, credentialRef: a.credentialRef, uuid: a.uuid };
  } catch (_) { /* account registry optional */ }
  return {
    agent, why, directed,
    constraints,
    inject: constraints.inject || [],
    fallbackChain: chain.length ? chain : [agent],
    account,   // §CA7 which ClearGlass account to use for this provider
  };
}

/**
 * _inferIntent(prompt) — lightweight task-intent inference for the agent map
 * (distinct from copilot/intents.classifyIntent which is UI-action intent). Pure.
 */
function _inferIntent(prompt = '') {
  const p = prompt.toLowerCase();
  if (/\b(latest|current|news|who is|what is the|price of|statistics|data on|research)\b/.test(p)) return 'data';
  if (/\b(refactor|entire codebase|whole repo|across (the )?(files|modules)|large|architecture)\b/.test(p)) return 'large_code';
  if (/\b(adversarial|attack|break|penetration|fuzz|red.?team|exploit)\b/.test(p)) return 'adversarial';
  if (/\b(code|function|bug|implement|debug|compile|refactor|test)\b/.test(p)) return 'code';
  return 'general';
}

/**
 * chunkForAgent(text, agent) — respect an agent's token constraint. For chatgpt
 * (900-token limit) this splits into chunks; others return [text]. Rough token
 * estimate = words / 0.75. §17.11 — the chunking is the real thing the "chatgpt
 * is optimal but limited" claim depends on.
 */
function chunkForAgent(text, agent) {
  const c = AGENT_CONSTRAINTS[agent];
  if (!c || !c.chunk || !c.maxTokens) return [text];
  const maxWords = Math.floor(c.maxTokens * 0.75);
  const words = (text || '').split(/\s+/);
  if (words.length <= maxWords) return [text];
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) chunks.push(words.slice(i, i + maxWords).join(' '));
  return chunks;
}

module.exports = {
  routeAgent, chunkForAgent, _inferIntent,
  DEFAULT_ROUTES, DEFAULT_FALLBACK, AGENT_CONSTRAINTS,
  MODULE_ID: 'agent-router', VERSION: '1.0.0',
};
