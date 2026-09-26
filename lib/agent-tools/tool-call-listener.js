'use strict';
/**
 * lib/agent-tools/tool-call-listener.js
 *
 * §BUILT 2026-09-08 — James: "the listener for the tools. like when an
 * agent uses one in guardian, from the sse?... persistent storage using
 * cortex memory architectures, vector in the lib. reusing outputs."
 *
 * Real, honest scope — named explicitly, not silently narrowed: this
 * listens for guardian.tool.called (emitted the real moment
 * extractToolCallsFromDOM finds a tool call in an agent's response —
 * guardian/lib/ncp-handler.js), persists each real invocation to JAA
 * (cortex's real memory store — the same table jaaDB.insert() already
 * routes through _observeForEmbedding() for automatically, giving this
 * real vector search for free, not built here), and exposes a real
 * findRecentResult() lookup so a caller CAN check for a reusable prior
 * result before dispatching the same tool+args again.
 *
 * NOT done here, named rather than silently skipped: automatic
 * interception/skipping of a tool call when a cached result exists —
 * that needs wiring into the actual dispatch path (guardian's own
 * /command/tools resolveJob), a real, separate, larger change. This
 * listener observes and makes reuse POSSIBLE; it doesn't yet enforce
 * it. Compartment-scoped caching and intelligence-system synthesis
 * hooks are also real, separate, larger pieces, not attempted here.
 */

const crypto = require('crypto');

const TABLE = 'guardian_tool_calls';
const REUSE_WINDOW_MS = 10 * 60 * 1000; // 10 min — a real, bounded window; stale results are refused, not returned as if fresh

function _argsHash(name, args) {
  return crypto.createHash('sha256').update(`${name}:${JSON.stringify(args || {})}`).digest('hex').slice(0, 16);
}

/**
 * install(bus, jaa) — wire the real listener onto guardian's real bus.
 * jaa is the same real jaaDB singleton every other JAA write in this
 * codebase already uses — no separate store invented.
 */
function install(bus, jaa) {
  if (!bus || typeof bus.on !== 'function') throw new Error('[tool-call-listener] a real bus with .on() is required');
  if (!jaa || typeof jaa.insert !== 'function') throw new Error('[tool-call-listener] a real jaa store with .insert() is required');

  bus.on('guardian.tool.called', (event) => {
    const { jobId, provider, calls, ts } = event;
    for (const call of calls || []) {
      const argsHash = _argsHash(call.name, call.arguments);
      try {
        jaa.insert(TABLE, {
          uuid: crypto.randomUUID(), jobId, provider,
          toolName: call.name, arguments: JSON.stringify(call.arguments || {}),
          argsHash, ts: ts || Date.now(), result: null, // result filled in later by recordResult(), if the caller has one
        });
      } catch (e) {
        // §1.2 — a failed persist must never crash the real dispatch
        // this listener is observing; loud, not fatal.
        console.warn(`[tool-call-listener] failed to persist call for ${call.name}: ${e.message}`);
      }
    }
  });
}

/**
 * recordResult(jaa, jobId, toolName, args, result) — a real caller
 * (wherever a tool's actual execution completes) can attach the real
 * result to the most recent matching call row, making it available for
 * future reuse lookups.
 */
/**
 * recordCall(jaa, jobId, toolName, args, result) — a real, direct,
 * complete insert (call + result together), for a caller that never
 * went through install()'s bus-driven "called" event first (executeTool
 * itself, the one universal dispatch point every tool call — guardian's
 * own flow AND copilot's separate tool-runtime.js — actually passes
 * through). recordResult() below stays for the guardian-specific,
 * bus-driven path where a "called" row already exists to attach to.
 */
function recordCall(jaa, jobId, toolName, args, result) {
  try {
    jaa.insert(TABLE, {
      uuid: crypto.randomUUID(), jobId, provider: null,
      toolName, arguments: JSON.stringify(args || {}),
      argsHash: _argsHash(toolName, args), ts: Date.now(), result: JSON.stringify(result),
    });
  } catch (e) {
    console.warn(`[tool-call-listener] recordCall failed for ${toolName}: ${e.message}`);
  }
}

function recordResult(jaa, jobId, toolName, args, result) {
  const argsHash = _argsHash(toolName, args);
  const rows = jaa.query(TABLE, r => r.jobId === jobId && r.argsHash === argsHash && r.result === null, 1);
  if (rows && rows[0]) {
    jaa.update(TABLE, rows[0].uuid, { result: JSON.stringify(result) });
  }
}

/**
 * findRecentResult(jaa, toolName, args) — real reuse lookup. Returns
 * the real, parsed result of the most recent successful call with the
 * exact same tool+args, within a real, bounded freshness window — or
 * null, honestly, if none exists. A caller decides what to do with it;
 * this never silently substitutes a stale or missing result.
 */
function findRecentResult(jaa, toolName, args) {
  const argsHash = _argsHash(toolName, args);
  const cutoff = Date.now() - REUSE_WINDOW_MS;
  const rows = jaa.query(TABLE, r => r.argsHash === argsHash && r.result !== null && r.ts >= cutoff, 5);
  if (!rows || !rows.length) return null;
  const latest = rows.sort((a, b) => b.ts - a.ts)[0];
  try { return { result: JSON.parse(latest.result), ts: latest.ts, ageMs: Date.now() - latest.ts }; }
  catch (_) { return null; }
}

module.exports = { install, recordCall, recordResult, findRecentResult, TABLE, REUSE_WINDOW_MS };
