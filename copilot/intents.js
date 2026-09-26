'use strict';
/**
 * copilot/intents.js — the four missing copilot intents
 * UUID: nexus-copilot-intents-v1-0000-2026-0707-jamesbrooks-001
 * Version: 1.0.0
 *
 * §GAP CLOSED 2026-07-07 — copilot's primary hook
 * (hooks/copilot.hooks.js, `copilot-prompt`) declares
 * `seam.intentId: 'ask|build|diagnose|navigate|note|tool|action'` —
 * seven intents. Confirmed exhaustively this session: `ask` is
 * hardcoded at nine separate points in copilot/server.js, `build` and
 * `diagnose` have their own real endpoints (/api/build, /api/diagnose),
 * and navigate/note/tool/action have NO implementation anywhere. This
 * is copilot's only remaining gap, and this module is it.
 *
 * Each intent is grounded in infrastructure that is already real and
 * tested, not invented for this file:
 *   navigate -> hooks/index.js's real surface->port registry
 *   note     -> cortex/push-recall.js's real /api/push (durable memory)
 *   tool     -> lib/agent-tools/'s real tool-calling loop
 *   action   -> cockpit's real ForgeCLI, via run_command
 *
 * §DRIFT-PROOF — navigate's target list is READ FROM the hook registry,
 * never hand-copied. Same discipline as run_command reading
 * cockpit's own INTERACTION_CONTRACT: the single most common bug found
 * this entire session was a declared surface drifting from its real
 * implementation. A registry-sourced list cannot drift.
 *
 * §INJECTABLE — takes its dependencies (pushToCortex, runTools) rather
 * than reaching for them, so this module is testable standalone and
 * carries no hard coupling to copilot's internals.
 */

// ── Landing paths ────────────────────────────────────────────────────────────
// Most surfaces serve a real UI at '/'. Two do not, and assuming they
// did is a real, already-observed bug: architect's bare root returns
// {"ok":false,"error":"GET / not found"} — its real entry point is
// /ui/spec-builder (this was a live 404 in the dashboard tile until it
// was fixed earlier this session). Only override what's genuinely
// different; anything absent here correctly defaults to '/'.
const LANDING_PATHS = Object.freeze({
  architect: '/ui/spec-builder',
});

// ── Intent classification ────────────────────────────────────────────────────
// Deliberately keyword-based, not model-based. Two real reasons: (1) intent
// routing must be deterministic and instant — a user typing "take me to
// guardian" should not wait on a model round-trip to be routed; (2) a
// misclassification here silently sends a request down the wrong pipeline,
// so a transparent, auditable rule beats an opaque probability. Anything
// that doesn't match a specific intent falls through to 'ask', which is
// copilot's real, working default — never a guess, never a failure.
const PATTERNS = [
  { intent: 'navigate', re: /\b(take me to|go to|open|navigate to|show me)\s+(the\s+)?(\w[\w-]*)/i },
  { intent: 'note',     re: /^\s*(note|remember|log)(\s+that)?[:\s]/i },
  { intent: 'action',   re: /^\s*(run|execute)\s+(forge\s+\w+|the\s+\w+\s+pipeline)/i },
  { intent: 'tool',     re: /\b(read|open|show)\s+(the\s+)?file\b|\bread_file\b|\bwhat('s| is) in\s+\S+\.(js|json|md|spec)\b|\b(what can you do|list (your |all )?tools|(what|which) tools|your (real )?tools|show (your |me your )?(capabilit(y|ies)|tools|commands)|help( me)?( with)? what you can do)\b/i },
];

function classifyIntent(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'ask';
  for (const { intent, re } of PATTERNS) {
    if (re.test(prompt)) return intent;
  }
  return 'ask'; // real default, not a fallback failure
}

// ── navigate ─────────────────────────────────────────────────────────────────
function _navigableSurfaces() {
  try {
    const h = require('../hooks/index.js');
    const surfaces = new Map();
    for (const hook of h.allHooks()) {
      const to = hook.to;
      if (to?.surface && to?.port) surfaces.set(to.surface, to.port);
    }
    return surfaces;
  } catch (_) {
    return new Map(); // registry unavailable — say so honestly, don't fabricate targets
  }
}

function handleNavigate(prompt) {
  const surfaces = _navigableSurfaces();
  if (!surfaces.size) return { ok: false, intent: 'navigate', error: 'hook registry unavailable — no navigation targets' };

  const lower = prompt.toLowerCase();
  // Match against real registry surface names, longest first so
  // 'orchestrator' wins over a hypothetical 'orch'.
  const names = [...surfaces.keys()].sort((a, b) => b.length - a.length);
  const target = names.find(n => lower.includes(n));

  if (!target) {
    return { ok: false, intent: 'navigate', error: `no system matched. Real targets: ${names.join(', ')}` };
  }
  const port = surfaces.get(target);
  const path = LANDING_PATHS[target] || '/';
  return {
    ok: true, intent: 'navigate', target, port, path,
    url: `http://127.0.0.1:${port}${path}`,
    text: `Opening ${target} at http://127.0.0.1:${port}${path}`,
  };
}

// ── note ─────────────────────────────────────────────────────────────────────
// Strips the leading "note:"/"remember that" trigger so the stored content
// is the actual note, not the command that created it.
async function handleNote(prompt, { pushToCortex }) {
  if (typeof pushToCortex !== 'function') {
    return { ok: false, intent: 'note', error: 'no cortex push available — note would be lost, refusing to pretend it was saved' };
  }
  const content = prompt.replace(/^\s*(note|remember|log)(\s+that)?[:\s]+/i, '').trim();
  if (!content) return { ok: false, intent: 'note', error: 'empty note' };
  try {
    const result = await pushToCortex(content, ['note', 'user'], 'session');
    return { ok: true, intent: 'note', stored: content, id: result?.id, text: `Noted and stored: "${content}"` };
  } catch (e) {
    // §1.2 — a failed write is reported, never silently swallowed into a
    // cheerful "saved!" the user would believe.
    return { ok: false, intent: 'note', error: `failed to store note: ${e.message}` };
  }
}

// §2026-08-29 — James: "need co-pilot to be able to tell me all of its
// tools. i don't even remember what it can do." §DRIFT-PROOF, same
// discipline as _navigableSurfaces() above: reads copilot's own real,
// already-existing registry-components.js (the same file /contract
// already serves — checked directly, not invented) rather than a
// hand-maintained list that could silently fall out of sync the next
// time a component is added there.
const CAPABILITIES_RE = /\b(what can you do|list (your |all )?tools|(what|which) tools|your (real )?tools|show (your |me your )?(capabilit(y|ies)|tools|commands)|help( me)?( with)? what you can do)\b/i;

function _listCapabilities() {
  try {
    const registry = require('./registry-components');
    const components = registry?.components;
    if (!Array.isArray(components) || !components.length) {
      return { ok: false, intent: 'tool', error: 'registry-components.js returned no real components' };
    }
    const lines = components.map(c => {
      const grammar = c.grammar?.length ? ` (say: "${c.grammar.join('", "')}")` : '';
      return `• ${c.name} — ${c.description}${grammar}`;
    });
    return {
      ok: true, intent: 'tool',
      text: `I have ${components.length} real, currently-registered tools:\n\n${lines.join('\n')}`,
      capabilities: components.map(c => ({ id: c.id, name: c.name, description: c.description, grammar: c.grammar, route: c.route })),
    };
  } catch (e) {
    // §HONEST — a failure to load the real registry is reported as a
    // real error, not silently swallowed into an empty-looking answer
    // that would read as "co-pilot has zero tools."
    return { ok: false, intent: 'tool', error: `could not load registry-components.js: ${e.message}` };
  }
}

// ── tool ─────────────────────────────────────────────────────────────────────
async function handleTool(prompt, { runTools }) {
  // Capabilities request short-circuits before the real agent-tool
  // execution loop — listing what copilot can do isn't itself running
  // a tool, and running it through runTools would either hallucinate an
  // answer or genuinely try to execute something nonsensical.
  if (CAPABILITIES_RE.test(prompt || '')) return _listCapabilities();

  if (typeof runTools !== 'function') {
    return { ok: false, intent: 'tool', error: 'no tool runner available' };
  }
  try {
    const result = await runTools(prompt);
    return { ok: true, intent: 'tool', text: result.text, toolCallLog: result.toolCallLog, iterations: result.iterations };
  } catch (e) {
    return { ok: false, intent: 'tool', error: e.message };
  }
}

// ── action ───────────────────────────────────────────────────────────────────
// An action is a real cockpit command. Routed through the same
// run_command tool as everything else, so it inherits that tool's
// real hallucination guard (a command not in cockpit's own contract is
// refused, never executed).
async function handleAction(prompt, { runTools }) {
  if (typeof runTools !== 'function') {
    return { ok: false, intent: 'action', error: 'no tool runner available — cannot execute actions' };
  }
  try {
    const result = await runTools(prompt);
    return { ok: true, intent: 'action', text: result.text, toolCallLog: result.toolCallLog };
  } catch (e) {
    return { ok: false, intent: 'action', error: e.message };
  }
}

/**
 * route(prompt, deps) — classify and dispatch. Returns null when the
 * intent is one copilot already handles (ask/build/diagnose), so the
 * caller falls through to its existing, real pipeline untouched. This is
 * additive: no existing behavior changes.
 */
async function route(prompt, deps = {}) {
  const intent = classifyIntent(prompt);
  switch (intent) {
    case 'navigate': return handleNavigate(prompt);
    case 'note':     return handleNote(prompt, deps);
    case 'tool':     return handleTool(prompt, deps);
    case 'action':   return handleAction(prompt, deps);
    default:         return null; // ask/build/diagnose — existing pipeline owns these
  }
}

module.exports = { classifyIntent, route, handleNavigate, handleNote, handleTool, handleAction, LANDING_PATHS };
