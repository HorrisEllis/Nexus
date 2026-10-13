'use strict';
/**
 * lib/reasoning-route.js — 0.60.8 — intent routing for reasoning: how hard a request is decides who answers it.
 *
 * James (2026-10-13): "we need intent routing for the reasoning, for the complex tasks, i feel that is priority, do you?"
 * · "only if its a good idea. i just want it to be able to use clearglass."
 *
 * Not a fourth router. lib/intent-classifier.js already reads every request (RAID's entry gate: verb, objects,
 * execution class); lib/model-door.js already routes per KIND of job, learns per kind and honours a preferred agent;
 * lib/pipeline-routing.js already names a planner (routing.planner) for phase builds. What was missing is the join: a
 * chat request's complexity choosing the kind, so a complex one is routed as `agent:reason` (the door learns which
 * provider reasons best, from outcomes) with the reasoning agent preferred, and a simple one stays on the fast path.
 *
 *   assess(message, { files }) → { level: simple|moderate|complex, score, signals[], intent }   deterministic, no model
 *   route(message, { jobKind, policy, files }) → { kind, preferAgent, assessment, why }
 *
 * Builds (agent:build) are left alone: they already plan with a reasoning agent first (pipeline-routing planMode).
 */
const VERSION = '1.0.0';
const MODULE_ID = 'lib.reasoning-route';

// what makes a request need thinking, not just answering. Each names itself in signals[] so the route says why.
const REASONING_RX = /\b(plan|design|architect(?:ure)?|refactor|migrat\w*|debug|diagnos\w*|root cause|why (?:does|is|did)|trade-?offs?|compare|versus|vs\.?|prove|proof|spec(?:ify)?|phasemap|decompose|integrat\w*|optimi[sz]\w*|invariants?|failure modes?|race condition|deadlock|security|threat model)\b/gi;
const SIMPLE_RX = /^\s*(rename|fix (?:a |the )?typo|format|list|show|what is|where is|open|read|print|count)\b/i;
const LEVELS = ['simple', 'moderate', 'complex'];

function _intent(message) {
  try { return require('./intent-classifier.js').classify(String(message || '')).intent || null; } catch (_) { return null; }
}

/** assess(message, { files }) → how hard the request is, and why. Deterministic; reads no model. */
function assess(message, { files = [] } = {}) {
  const text = String(message || '');
  const signals = [];
  let score = 0;
  const add = (n, why) => { score += n; signals.push(why); };
  if (text.length > 4000) add(2, `long (${text.length} chars)`);
  else if (text.length > 1200) add(1, `long (${text.length} chars)`);
  const words = [...new Set((text.match(REASONING_RX) || []).map(w => w.toLowerCase()))];
  if (words.length) add(Math.min(3, words.length), `reasoning asked for: ${words.slice(0, 5).join(', ')}`);
  const asks = (text.match(/\?/g) || []).length;
  const steps = text.split('\n').filter(l => /^\s*(\d+[.)]|[-*•])\s+\S/.test(l)).length;
  if (asks >= 3 || steps >= 3) add(1, `several asks (${asks} questions, ${steps} listed steps)`);
  if (/```|\bat \S+:\d+:\d+\)?|Traceback \(most recent call last\)|Error: /.test(text)) add(1, 'code or a stack trace to reason over');
  if ((files || []).length >= 3) add(1, `${files.length} files involved`);
  const intent = _intent(text);
  if (intent && intent.execution_class === 'AUTONOMOUS') add(1, 'autonomous (several actions in a row)');
  if (SIMPLE_RX.test(text) && text.length < 240 && score <= 1) { score = 0; signals.push('a simple ask'); }
  const level = score >= 3 ? 'complex' : score >= 1 ? 'moderate' : 'simple';
  return { level, score, signals, intent: intent ? { verb: intent.verb, domain: intent.domain, execution_class: intent.execution_class, confidence: intent.confidence } : null };
}

/** the reasoning agent: routing.reasoner, else routing.planner (the phase-build planner), never Ollama; null = the door decides */
function reasonerOf(policy = {}) {
  for (const k of ['reasoner', 'planner']) {
    const v = String((policy && policy[k]) || '').trim().toLowerCase();
    if (v && !/^ollama\b/.test(v)) return v;
  }
  return null;
}

/**
 * route(message, { jobKind, policy, files }) → { kind, preferAgent, assessment, why }
 * complex → kind 'agent:reason' and the reasoning agent preferred; moderate/simple → the kind as asked.
 * routing.reason_route: 'off' keeps every request on its asked kind (the setting he turns it off with).
 */
function route(message, { jobKind = 'agent:chat', policy = {}, files = [] } = {}) {
  const assessment = assess(message, { files });
  if (jobKind !== 'agent:chat') return { kind: jobKind, preferAgent: null, assessment, why: `${jobKind}: builds already plan with a reasoning agent first` };
  if (policy && String(policy.reason_route || policy.reasonRoute || '').toLowerCase() === 'off') return { kind: jobKind, preferAgent: null, assessment, why: 'routing.reason_route: off' };
  if (assessment.level !== 'complex') return { kind: jobKind, preferAgent: null, assessment, why: `${assessment.level} — the usual route` };
  const preferAgent = reasonerOf(policy);
  return { kind: 'agent:reason', preferAgent, assessment,
    why: `complex (${assessment.signals.join('; ')}) — routed to ${preferAgent ? `the reasoning agent ${preferAgent}` : 'the agent the door has learned reasons best'}` };
}

// 0.60.8 — James: "speccing, mapping, like needs to do the complex parts of the project. like spec, map, read, like
// anything that needs complex reasoning. now i want to test the pipeline using the intent routing". The pipeline's own
// job kinds that are reasoning by nature — writing or completing a spec, mapping/architecture, planning a phase, reading
// to understand, and the spec/plan documents a build writes — not only chat that sounds hard.
const REASONING_KIND_RX = /(^|[:._-])(spec|specs|speccing|spec-wizard|spec-complete|workshop|map|mapping|phasemap|plan|planning|planner|architect|architecture|read|understand|analy[sz]e|review|reason|agent:reason)([:._-]|$)|^build:file\.(spec|md|yaml|yml)$/i;
function kindNeedsReasoning(kind) { return REASONING_KIND_RX.test(String(kind || '')); }

/**
 * forDoor({ kind, message, policy, block }) → { reason, why, preferAgent, assessment? }
 * What lib/model-door.js asks for EVERY route (chat, pages, chunk builds): reasoning when the kind is a reasoning job or
 * the message is complex. A spec block that names its own agent is respected (never overridden). routing.reason_route: off.
 */
function forDoor({ kind = '', message = '', policy = {}, block = null } = {}) {
  if (policy && String(policy.reason_route || policy.reasonRoute || '').toLowerCase() === 'off') return { reason: false, why: 'routing.reason_route: off' };
  if (block && block.agent) return { reason: false, why: `the spec block names its agent (${block.agent})` };
  // 0.60.14 — James: "need to be able to change the intent map and routing". routing.reason_kinds: his own kinds (or
  // prefixes ending in *) that are reasoning work, on top of the built-in ones; '!kind' takes one off.
  const extra = String((policy && (policy.reason_kinds || policy.reasonKinds)) || '').split(/[\s,]+/).filter(Boolean);
  const hit = (k, p) => (p.endsWith('*') ? k.startsWith(p.slice(0, -1)) : k === p);
  const k0 = String(kind || '');
  const byKind = extra.some(p => p.startsWith('!') && hit(k0, p.slice(1))) ? false : (kindNeedsReasoning(kind) || extra.some(p => !p.startsWith('!') && hit(k0, p)));
  const assessment = message ? assess(message) : null;
  const byMessage = !!(assessment && assessment.level === 'complex');
  if (!byKind && !byMessage) return { reason: false, why: 'not a reasoning job', assessment };
  return { reason: true, preferAgent: reasonerOf(policy), assessment,
    why: byKind ? `${kind} is reasoning work (spec, map, plan, read)` : `complex (${assessment.signals.join('; ')})` };
}

module.exports = { VERSION, MODULE_ID, LEVELS, assess, route, reasonerOf, kindNeedsReasoning, forDoor };
