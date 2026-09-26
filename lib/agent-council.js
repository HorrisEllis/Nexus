'use strict';
/**
 * lib/agent-council.js — multiple real agents deliberate on one decision;
 * RAID governs what actually happens with their verdicts.
 * comp_id: nexus.lib.agent-council
 * UUID: nexus-agent-council-v1-0000-2026-0813-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-13): "what if we use each agent, in tandem with the
 * raid engine as a council or court to make large decisions?"
 *
 * §NOT A NEW DISPATCH MECHANISM — reuses copilot/tool-runtime.js's
 * runViaAgent (this session's own NCP tool loop) to actually ask each
 * council member. Each member is independent — one agent's verdict never
 * sees another's before answering, same as any real deliberation body; a
 * council where members see each other's answers first isn't independent
 * verdicts, it's one opinion with an echo.
 *
 * §RAID IS THE COURT, NOT ANOTHER VOTE — convene() only COLLECTS real
 * verdicts. It does not decide anything. A caller takes the verdicts to
 * governAction (copilot/lib/self-model.js) — the same real constitutional/
 * RAID gate every other consequential action in this system already goes
 * through — for the actual decision. A council that could bypass RAID by
 * simply out-voting it would defeat the reason RAID exists.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

/**
 * convene(question, members, opts) — ask every member the SAME question,
 * independently, in parallel. members: array of agent names (or forged hat
 * names). Each verdict is real: a real dispatch call, a real answer, or a
 * real recorded failure — never fabricated, never silently dropped.
 *
 * opts.dispatchToAgent(agentOrHatName, prompt) — required. The caller
 * supplies real dispatch (this module has no opinion on ollama vs NCP —
 * that's copilot/lifeline.js's job, not this one's).
 */
async function convene(question, members, opts = {}) {
  if (!opts.dispatchToAgent) throw new Error('agent-council: opts.dispatchToAgent is required — this module collects verdicts, it does not know how to reach an agent itself');
  if (!Array.isArray(members) || !members.length) throw new Error('agent-council: members must be a non-empty array of agent or hat names');

  const verdicts = await Promise.all(members.map(async (member) => {
    const startedAt = Date.now();
    try {
      const result = await opts.dispatchToAgent(member, question);
      return { member, ok: true, verdict: result.text || result, durationMs: Date.now() - startedAt, toolCallLog: result.toolCallLog || null };
    } catch (e) {
      // §1.2 — a member that fails to answer is a REAL data point (that
      // agent could not weigh in), not silently excluded from the record.
      return { member, ok: false, error: e.message, durationMs: Date.now() - startedAt };
    }
  }));

  const record = {
    id: `council-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question, members, verdicts, convenedAt: Date.now(),
    respondedCount: verdicts.filter(v => v.ok).length,
    failedCount: verdicts.filter(v => !v.ok).length,
  };
  try { const jaa = _jaa(); if (jaa) jaa.insert('council_sessions', record); } catch (_) {}

  return record;
}

/**
 * summarize(record) — a real, mechanical summary of a council record — no
 * fabricated consensus, no invented majority. Just what's actually there:
 * who answered, who didn't, and the raw verdicts for a human or RAID to
 * actually weigh. Deliberately does NOT pick a winner — that's governance's
 * job (see module docblock), not this function's.
 */
function summarize(record) {
  return {
    question: record.question,
    respondedCount: record.respondedCount, failedCount: record.failedCount, totalMembers: record.members.length,
    verdicts: record.verdicts.map(v => ({ member: v.member, ok: v.ok, verdict: v.ok ? v.verdict : `[no answer: ${v.error}]` })),
  };
}

module.exports = { convene, summarize, MODULE_ID: 'agent-council', VERSION: '1.0.0' };
