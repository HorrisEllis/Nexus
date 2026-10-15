'use strict';
/**
 * lib/reply-kind.js — what kind of reply an agent sent (CE4, 0.60.50)
 * comp_id: nexus.lib.reply-kind
 * UUID: nexus-lib-reply-kind-v1-0000-2026-1015-jamesbrooks-001
 * Map: docs/2026-10-15-code-tab-run-state-phasemap.spec (CE4_reply_kind_and_tags)
 *
 * James, 2026-10-15: "what about adding status for each response. also grouping them by contract or repo? maybe tagging for
 * repo? like better coordination?" Read from his runs: a 59-character reply counted as "done" was a tool call, and a 1143-character
 * one was the agent asking him what to do. Status alone could not tell them apart.
 *
 *   tool-call  a fenced block (or bare JSON) with { name, arguments } — the agent is working, not answering
 *   code       a non-empty fenced block that is not a tool call
 *   plan       JSON with a plan / steps / phases list
 *   off-task   hands the task back to the person and does no work (lib/step-gates/reply.on_task.step_gate)
 *   empty      nothing
 *   prose      anything else
 * Pure: it reads the text and the gate node, writes nothing.
 */
const MODULE_ID = 'nexus.lib.reply-kind';
const KINDS = Object.freeze(['tool-call', 'code', 'plan', 'off-task', 'empty', 'prose']);
const FENCE = /```([^\n]*)\n([\s\S]*?)```/g;

function _json(s) { try { return JSON.parse(s); } catch (_) { return null; } }
function _isCall(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && typeof o.name === 'string' && 'arguments' in o; }
function _isPlan(o) { return !!o && typeof o === 'object' && (Array.isArray(o.plan) || Array.isArray(o.steps) || Array.isArray(o.phases) || (o.plan && typeof o.plan === 'object')); }

function classify(text) {
  const t = String(text == null ? '' : text);
  if (!t.trim()) return 'empty';
  let code = false;
  for (const m of t.matchAll(FENCE)) {
    const lang = String(m[1] || '').trim().toLowerCase(); const body = m[2].trim();
    if (!body) continue;
    const o = _json(body);
    if (lang === 'tool' || _isCall(o)) return 'tool-call';
    if (_isPlan(o)) return 'plan';
    code = true;
  }
  const bare = _json(t.trim());
  if (_isCall(bare)) return 'tool-call';
  if (_isPlan(bare)) return 'plan';
  if (code) return 'code';
  try { const g = require('./step-gate.js').check('reply.on_task', { text: t }); if (g && !g.ok) return 'off-task'; } catch (_) { /* no gate: prose */ }
  return 'prose';
}

module.exports = { MODULE_ID, KINDS, classify };
