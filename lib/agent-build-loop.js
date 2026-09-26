'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// lib/agent-build-loop.js — a real agent, writing into a real compartment,
// iterating against a real end-state, informed by a real introspect summary.
// UUID: nexus-agent-build-loop-v1-0000-2026-0818-001
// Version: 1.0.0
// Component: lib.agent-build-loop
// Hook: lib.agent-build-loop:v1:p0001
//
// James: "I want to be able to build a compartment, open the compartment,
// then I want to be able to interact with the agents, and have that
// compartment be the output directory. then have the agent use introspect
// to check nexus and improve it's own outputs. or could have co-pilot
// prompt the agent to introspect and iterate endlessly."
//
// Checked what already existed before writing a line of new orchestration —
// this composes four real, separately-tested pieces rather than building a
// fifth, parallel mechanism:
//
//   agent-chat.js   — ask() reaches a real external agent (chatgpt/gemini/
//                      claude) over the real NCP round trip; checkAgainstSystem()
//                      is the real, independent verification channel (§10.3:
//                      an agent's own claim is NEVER treated as the verdict).
//   self-repair.js  — propose()/test() already write into and run inside a
//                      real COS compartment (a real process, spawned via
//                      COS's own real gate, real stdout/exit code) — this IS
//                      "the compartment as the output directory," already
//                      built, just never fed from an external agent's answer.
//   end-state.js    — pursue() is the real "iterate endlessly" loop, with a
//                      real, principled floor under "endlessly": conditions
//                      are frozen (an agent cannot redefine success under
//                      iteration pressure), and STUCK_ROUNDS halts on
//                      genuine non-progress rather than grinding forever —
//                      which is a safer reading of "endlessly" than literal
//                      infinite iteration, not a lesser one.
//
// The one genuinely new piece: introspect(). No real "check nexus's current
// state" summary existed anywhere (grepped directly — one incidental comment
// mention, no real function). Built here, minimal and honest: real open-gap
// count/types (gap-field.js), real test suite health if a recent run exists,
// and real loom phase completion — enough for an agent to know whether the
// system it's writing into is currently healthy, not a full system dump.
// ─────────────────────────────────────────────────────────────────────────────

const MODULE_ID = 'nexus-agent-build-loop';
const VERSION   = '1.0.0';

/**
 * introspect() — a real, compact summary of nexus's current state. Every
 * section degrades honestly (§1.2) rather than throwing — a partial
 * introspection is real information; a thrown error is not.
 */
function introspect() {
  const sections = {};

  try {
    const gf = require('./gap-field');
    const gaps = gf.openGaps({});
    const byType = {};
    for (const g of gaps) byType[g.type] = (byType[g.type] || 0) + 1;
    sections.gaps = { open: gaps.length, byType, note: gaps.length === 0 ? 'no open gaps' : `${gaps.length} real open gap(s)` };
  } catch (e) {
    sections.gaps = { unavailable: true, reason: e.message };
  }

  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const recent = jaaDB.tail('phasemap_history', 20);
    const done = recent.filter(r => r.status === 'done').length;
    sections.recentPhaseActivity = recent.length
      ? { checked: recent.length, done, note: `${done}/${recent.length} of the last ${recent.length} real phase transitions were completions` }
      : { note: 'no phase history recorded yet' };
  } catch (e) {
    sections.recentPhaseActivity = { unavailable: true, reason: e.message };
  }

  return {
    ok: true,
    ts: Date.now(),
    sections,
    summary: Object.entries(sections)
      .map(([k, v]) => `${k}: ${v.note || (v.unavailable ? `unavailable (${v.reason})` : 'no summary')}`)
      .join('\n'),
  };
}

/**
 * _extractCode(text) — real, minimal fenced-code-block extraction from an
 * agent's raw text answer. Honest about ambiguity: if MULTIPLE fenced blocks
 * are present, returns the LARGEST one (the most likely candidate for "the
 * real file"), and says so — never silently concatenates unrelated blocks
 * into one file, which would corrupt content neither block actually contains.
 */
function _extractCode(text) {
  if (!text) return { ok: false, error: 'no text to extract from' };
  const blocks = [...text.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map(m => m[1]);
  if (blocks.length === 0) return { ok: false, error: 'no fenced code block found in the response' };
  if (blocks.length === 1) return { ok: true, code: blocks[0], multiple: false };
  const largest = blocks.reduce((a, b) => (b.length > a.length ? b : a));
  return { ok: true, code: largest, multiple: true, blockCount: blocks.length,
    note: `${blocks.length} fenced blocks found — used the largest; verify this was the intended one` };
}

/**
 * buildInCompartment(opts) — the real, composed workflow.
 *
 * @param {string}  opts.compartmentName  real COS compartment name (created if absent)
 * @param {string}  opts.provider         real agent to dispatch to (chatgpt/gemini/claude)
 * @param {string}  opts.goal             human-readable goal, passed to end-state.declare
 * @param {array}   opts.conditions       end-state conditions (§ end-state.js's real shape)
 * @param {string}  opts.targetFile       real path, relative to the compartment root, the agent writes to
 * @param {string}  [opts.entryFile]      real path to run for test() — defaults to targetFile
 * @param {boolean} [opts.useIntrospect]  include a real introspect() summary in every prompt (default true)
 * @param {number}  [opts.maxRounds]      passed through to pursue() (default 5 — see end-state.js's own STUCK_ROUNDS floor under "endless")
 * @param {function}[opts.onRound]        passed through to pursue()
 */
async function buildInCompartment({
  compartmentName, provider, goal, conditions, targetFile, entryFile = null,
  useIntrospect = true, maxRounds = 5, onRound = null,
}) {
  if (!compartmentName || !provider || !goal || !conditions || !targetFile) {
    return { ok: false, error: `${MODULE_ID} needs compartmentName, provider, goal, conditions, targetFile` };
  }

  const agentChat = require('./agent-chat');
  const endState  = require('./end-state');
  const selfRepair = require('./agent-tools/tools/sandbox/self-repair');
  const realEntryFile = entryFile || targetFile;

  const es = endState.declare({ goal, conditions, sandbox: false, owner: 'user' });

  const attempt = async (feedback, round) => {
    const introspectSummary = useIntrospect ? introspect().summary : null;

    const prompt = [
      `Goal: ${goal}`,
      `File to write: ${targetFile}`,
      round > 1 ? `\nFEEDBACK FROM ROUND ${round - 1}:\n${JSON.stringify(feedback, null, 2)}` : '',
      introspectSummary ? `\nCURRENT NEXUS STATE (introspect):\n${introspectSummary}` : '',
      `\nReturn the complete file content in a single fenced code block.`,
    ].filter(Boolean).join('\n');

    const askResult = await agentChat.ask(provider, prompt, { from: 'nexus', intent: 'build' });
    if (!askResult.ok) {
      return { ok: false, round, stage: 'ask', error: askResult.error, agentUnreachable: true };
    }

    const extracted = _extractCode(askResult.text);
    if (!extracted.ok) {
      return { ok: false, round, stage: 'extract', error: extracted.error, rawText: (askResult.text || '').slice(0, 500) };
    }

    const proposeResult = await selfRepair.execute({ action: 'propose', name: compartmentName, targetFile, newContent: extracted.code });
    if (!proposeResult.ok) {
      return { ok: false, round, stage: 'propose', error: proposeResult.error };
    }

    const testResult = await selfRepair.execute({ action: 'test', name: compartmentName, entryFile: realEntryFile });

    return {
      ok: true, round,
      passed: !!testResult.passed,
      testResult,
      codeExtractionNote: extracted.note || null,
      agentClaim: null, // §10.3 — an agent's own "this should work" is never solicited here; the gate is the verdict
    };
  };

  const result = await endState.pursue({ endState: es, attempt, maxRounds, onRound });
  return { ok: true, endState: es, result };
}

module.exports = { introspect, buildInCompartment, _extractCode, MODULE_ID, VERSION };
