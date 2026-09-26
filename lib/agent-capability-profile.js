'use strict';
/**
 * lib/agent-capability-profile.js — what's actually true about each
 * agent's real capabilities, measured over time, not assumed.
 * comp_id: nexus.lib.agent-capability-profile
 * UUID: nexus-agent-capability-profile-v1-0000-2026-0813-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-13): "each agent's capabilities are measured over
 * time. token limits, outputs. optimized, understood, constraints,
 * innovating around constraints." lib/agent-router.js's AGENT_CONSTRAINTS
 * is a static, hand-authored table (claude: maxTokens 200000, etc.) — a
 * claim, not a measurement. This is the measurement: real aggregate stats
 * from what actually happened, across every source that has real data.
 *
 * §HONEST SOURCING — checked before building, not assumed: chat_log (the
 * LIVE table) has durationMs, status, and real response text (length is a
 * real proxy for output volume) but no token counts. guardian_chat_log
 * (an OLDER table, confirmed this session to have NO current writer — see
 * commit 36d26b4) has real tokensIn/tokensOut/provider but is frozen at
 * whatever it had before its writer died — historical signal, not live.
 * RAID's _health (cortex/core/raid/index.js) tracks successRate/callCount
 * live, in-memory, for the 3 agents it currently knows about. Every field
 * this module returns is tagged with which of these three it came from
 * and whether that source is live or historical — never blended into one
 * number that hides which part is stale.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

function _mean(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }
function _max(nums) { return nums.length ? Math.max(...nums) : null; }

/**
 * profile(agent) — the real, measured profile for one agent. Returns null
 * fields (not fabricated numbers) wherever no real data exists for that
 * agent in that source.
 */
function profile(agent) {
  const out = { agent, live: {}, historical: {}, raid: {}, measuredAt: Date.now() };
  const jaa = _jaa();

  if (jaa) {
    const rows = jaa.query('chat_log', r => r.agent === agent);
    if (rows.length) {
      const durations = rows.filter(r => typeof r.durationMs === 'number').map(r => r.durationMs);
      const lengths = rows.map(r => (r.response || '').length);
      const complete = rows.filter(r => r.status === 'complete').length;
      out.live = {
        source: 'chat_log', sampleSize: rows.length,
        successRate: rows.length ? complete / rows.length : null,
        avgDurationMs: _mean(durations), maxDurationMs: _max(durations),
        avgResponseChars: _mean(lengths), maxResponseChars: _max(lengths),
        note: 'response length is a real proxy for output volume — chat_log does not record real token counts',
      };
    } else {
      out.live = { source: 'chat_log', sampleSize: 0, note: 'no live exchanges recorded for this agent yet' };
    }

    const gRows = jaa.query('guardian_chat_log', r => r.provider === agent);
    if (gRows.length) {
      const tokensIn = gRows.filter(r => typeof r.tokensIn === 'number').map(r => r.tokensIn);
      const tokensOut = gRows.filter(r => typeof r.tokensOut === 'number').map(r => r.tokensOut);
      out.historical = {
        source: 'guardian_chat_log', sampleSize: gRows.length, stale: true,
        note: 'this table has NO current writer (confirmed 2026-08-13) — frozen historical data, not growing',
        avgTokensIn: _mean(tokensIn), maxTokensIn: _max(tokensIn),
        avgTokensOut: _mean(tokensOut), maxTokensOut: _max(tokensOut),
      };
    } else {
      out.historical = { source: 'guardian_chat_log', sampleSize: 0, stale: true, note: 'no historical rows for this agent/provider' };
    }
  }

  try {
    const raid = require(path.join(ROOT, 'cortex/core/raid/index.js'));
    const key = agent === 'ollama' ? 'ollama' : `guardian-${agent}`;
    const h = raid._health[key];
    out.raid = h ? { source: 'cortex/core/raid._health', ...h } : { source: 'cortex/core/raid._health', note: `RAID does not currently track "${key}" — only ollama, guardian-claude, guardian-chatgpt are wired` };
  } catch (e) { out.raid = { source: 'cortex/core/raid._health', error: e.message }; }

  return out;
}

/** profileAll() — every agent this system knows about, same real sourcing. */
function profileAll() {
  const AGENTS = ['ollama', 'claude', 'chatgpt', 'gemini', 'mistral', 'perplexity'];
  return AGENTS.map(a => profile(a));
}

module.exports = { profile, profileAll, MODULE_ID: 'agent-capability-profile', VERSION: '1.0.0' };
