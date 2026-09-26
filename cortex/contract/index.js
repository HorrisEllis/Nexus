'use strict';
/**
 * cortex/contract/index.js — Agent Interaction Contracts
 * UUID: nexus-cortex-contract-v1-0000-2026-0629-jamesbrooks-001
 * Version: 1.0.0
 *
 * One source of truth for "what is this source of requests allowed to do."
 * docs/raid.spec's tool_approval_gate reuses this instead of a second
 * tools.json — built here because it didn't exist anywhere in the tree,
 * despite `cortex/core/raid`'s own test suite requiring it directly.
 *
 * §AX-001 — nothing is trusted until proven. Unregistered sources fall
 * through to _default, which requires proof for everything and explicitly
 * denies 'tool' outright — a registered contract is how a source earns
 * more than that, not something it gets by default.
 */

const CONTRACTS = {
  // §ADDED 2026-07-14 — 'browser' is a real action now (guardian's
  // dispatch to Clear Glass, real physical browser control: navigate,
  // DOM mutate, driver exec). It was added to guardian/server.js's
  // dispatch two sessions ago without ever being gated here — found
  // during an invariant audit prompted by a related fix (raw-prompt
  // dispatch bypassing chunking the same way). copilot and cli are the
  // two real sources that legitimately trigger it (the browser_action
  // agent-tool, and direct operator use) — deliberately NOT added to
  // guardian's or orchestrator's own contracts, since neither of those
  // should be originating browser actions on their own.
  //
  // Registered, known-internal sources. Add an entry here when a new
  // sovereign system needs to call _approveTool — don't widen _default.
  copilot: {
    trust_level:     'local',
    allowed_actions: ['tool', 'chat', 'build', 'diagnose', 'ask', 'browser'],
    denied_actions:  ['forge'],
    proof_required:  false,
    rate_limits:     { tool: { max: 20, windowMs: 60000 }, browser: { max: 15, windowMs: 60000 } },
  },

  guardian: {
    trust_level:     'local',
    allowed_actions: ['tool', 'chat', 'dispatch'],
    denied_actions:  [],
    proof_required:  false,
    rate_limits:     { tool: { max: 30, windowMs: 60000 } },
  },

  // §ADDED 2026-09-21 — James's boot log: every chatgpt/claude/gemini chunk
  // build failed with "RAID denied dispatch: proof required, none supplied for
  // 'chat'" while the same ChatGPT tab happily answered other jobs. Traced:
  // idearium/agent-suite's POST to guardian /command carried its identity only
  // in body.meta.source, and guardian's route reads body.source (the same
  // nested-source bug the console block below documents), so every chunk fell
  // to _default (proof_required:true). Idearium builds spec chunks through
  // guardian by design; it is a registered internal system like copilot, not an
  // anonymous caller — so it gets its own contract rather than a widened
  // _default. No 'forge' / 'browser': chunk builds only ever ask for text.
  idearium: {
    trust_level:     'local',
    allowed_actions: ['tool', 'chat', 'build'],
    denied_actions:  ['forge', 'browser'],
    proof_required:  false,
    rate_limits:     { chat: { max: 120, windowMs: 60000 } },
  },

  cli: {
    trust_level:     'operator',
    allowed_actions: ['tool', 'chat', 'build', 'diagnose', 'forge', 'ask', 'browser'],
    denied_actions:  [],
    proof_required:  false,
    rate_limits:     { tool: { max: 60, windowMs: 60000 } },
  },

  orchestrator: {
    trust_level:     'system',
    allowed_actions: ['tool', 'dispatch'],
    denied_actions:  [],
    proof_required:  false,
    rate_limits:     { tool: { max: 100, windowMs: 60000 } },
  },

  // §ADDED 2026-08-12 — found via two real screenshots showing "dispatch
  // failed: unknown" from the claude/chatgpt consoles on a plain "hello".
  // Root cause was two compounding bugs, both fixed same session: (1) the
  // consoles sent source nested in body.meta.source, never at the top
  // level guardian's /command actually reads (body.source) — fixed in
  // ui/agents/*/index.html + guardian/ui/agents/*/index.html, all 10
  // files, all 18 call sites — so every request fell through as
  // source:'unknown'; (2) _default's proof_required:true then correctly
  // denied every one of them, but the console's api() helper (also fixed
  // same session) discarded the real 403 body, showing "unknown" instead
  // of the actual reason. Registering these five sources here is the
  // real, permanent fix for the denial itself — 'unknown' should never
  // have been the console's live identity. trust_level 'operator': same
  // posture as 'cli' (a human is directly driving these), not 'system' —
  // narrower than cli's action set on purpose, these consoles only ever
  // legitimately dispatch chat/diagnose_and_repair, never forge/browser.
  'claude-console': {
    trust_level:     'operator',
    allowed_actions: ['tool', 'chat', 'diagnose'],
    denied_actions:  ['forge', 'browser'],
    proof_required:  false,
    rate_limits:     { tool: { max: 30, windowMs: 60000 } },
  },
  'chatgpt-console': {
    trust_level:     'operator',
    allowed_actions: ['tool', 'chat', 'diagnose'],
    denied_actions:  ['forge', 'browser'],
    proof_required:  false,
    rate_limits:     { tool: { max: 30, windowMs: 60000 } },
  },
  'gemini-console': {
    trust_level:     'operator',
    allowed_actions: ['tool', 'chat', 'diagnose'],
    denied_actions:  ['forge', 'browser'],
    proof_required:  false,
    rate_limits:     { tool: { max: 30, windowMs: 60000 } },
  },
  'mistral-console': {
    trust_level:     'operator',
    allowed_actions: ['tool', 'chat', 'diagnose'],
    denied_actions:  ['forge', 'browser'],
    proof_required:  false,
    rate_limits:     { tool: { max: 30, windowMs: 60000 } },
  },
  'perplexity-console': {
    trust_level:     'operator',
    allowed_actions: ['tool', 'chat', 'diagnose'],
    denied_actions:  ['forge', 'browser'],
    proof_required:  false,
    rate_limits:     { tool: { max: 30, windowMs: 60000 } },
  },

  // Fallback for any source not listed above. Minimal trust by
  // construction — 'tool' is explicitly denied (not just absent from
  // allowed_actions, so the reason can say so plainly), everything else
  // requires proof.
  _default: {
    trust_level:     'minimal',
    allowed_actions: [],
    denied_actions:  ['tool'],
    proof_required:  true,
    rate_limits:     { '*': { max: 10, windowMs: 60000 } },
  },
};

function get(source) {
  return CONTRACTS[source] || CONTRACTS._default;
}

module.exports = { CONTRACTS, get };
