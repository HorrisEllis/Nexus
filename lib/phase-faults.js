'use strict';
/**
 * lib/phase-faults.js — every way a phase build goes wrong, as a fault record (lib/fault-log.js), and what went wrong
 * before, read back before the next attempt. §0.39.361 AR2.
 * UUID: nexus-lib-phase-faults-v1-0000-2026-1006-jamesbrooks-001
 *
 * James: "Failure modes and faults are still first class data." (and 2026-08-13, lib/fault-log.js: "logging faults and
 * failure modes each time they are made... first class data to learn and reduce redundant mistakes... before each
 * action, needs to check for relevant failure mode from fault taxonomy.")
 *
 * AR1 (lib/agent-record.js) turned a phase build's failures into counts and a score — learned from, then gone. Here
 * each one is its own fault_log row: the mode, the agent, the phase, the request size, the error, what it was caused
 * by. Not a second writer: lib/fault-log.js logFault is the write (and raises fault-taxonomy friction where the class
 * is one it knows, e.g. timeout).
 *
 * MODES (a phase-run row → its failure mode; null = not a fault):
 *   no-snapshot     refused: the Versionium snapshot before it failed
 *   timeout · empty · provider-down · rate-limit · login · truncated · refused · unknown   failed (lib/pipeline-routing classify)
 *   wrote-nothing   the reply changed no file
 *   missed-files    the reply did not bring back every file the phase names
 *   blocked         the reply was stopped at its gate (an agent that only says it cannot)
 *   tool-errors     failed tool calls in a row ended the attempt
 *   unproven · no-proof   the proof run did not pass / the phase declares nothing to prove
 *   chunk-stopped   a chunked build stopped: one file's chunk did not land (§0.39.361 SB51)
 *   ladder-exhausted      every rung was tried (logged once more, agent-less: the phase, not one agent, is stuck)
 * and from lib/repo-inject (the agent's code, after it came back):
 *   reply-collapse  a block that would have replaced a file with a path or a sliver of it — refused
 *   undone          the person reverted, or rejected, a file an agent wrote
 */
const COMPONENT = 'idearium.phase.build';
const INJECT_COMPONENT = 'idearium.repo.inject';

function modeOf(row = {}) {
  switch (row.state) {
    case 'refused': return /no snapshot/i.test(row.error || '') ? 'no-snapshot' : 'refused';
    case 'failed': {
      if (row.chunkStopped) return 'chunk-stopped';
      if (row.toolErrors) return 'tool-errors';
      try { return require('./pipeline-routing.js').classify({ error: row.error || '', ok: false }); } catch (_) { return 'unknown'; }
    }
    case 'incomplete': return row.toolErrors ? 'tool-errors' : row.unchanged ? 'wrote-nothing' : row.absent ? 'missed-files' : 'wrote-nothing';
    case 'blocked': return 'blocked';
    case 'unproven': return 'unproven';
    case 'no-proof': return 'no-proof';
    default: return null;
  }
}

/** faultsOf(row) -> [logFault args] — none for a row that is not a fault */
function faultsOf(row = {}) {
  const mode = modeOf(row);
  if (!mode) return [];
  const meta = {
    mode, map: row.map || null, phase: row.phase || null, runId: row.runId || null, repoUuid: row.repoUuid || null, targetRepo: row.targetRepo || null,
    rung: row.rung || null, rungs: row.rungs || null, attempt: row.attempt || null, promptChars: row.promptChars || null, elapsedMs: row.elapsedMs || null,
    error: row.error ? String(row.error).slice(0, 600) : null, absent: row.absent || null, snapshot: row.snapshot || null,
  };
  const out = [{ system: 'idearium', agent: row.provider || null, component: COMPONENT, faultClass: mode, status: row.state, intent: row.phase || null, causedBy: row.uuid || row.runId || null, meta }];
  if (row.ladderExhausted) out.push({ system: 'idearium', agent: null, component: COMPONENT, faultClass: 'ladder-exhausted', status: 'failed', intent: row.phase || null, causedBy: row.uuid || row.runId || null, meta: { ...meta, mode: 'ladder-exhausted' } });
  return out;
}

function _fl() { try { return require('./fault-log.js'); } catch (_) { return null; } }

/** log(row) — the phase-run row's faults, written. Never throws: a fault that cannot be logged must not fail the build. */
function log(row) {
  const FL = _fl(); if (!FL) return [];
  const out = [];
  for (const f of faultsOf(row)) { try { out.push(FL.logFault(f)); } catch (e) { console.warn(`[phase-faults] ${e.message}`); } }
  return out;
}

/** logInject({ mode, node, reason }) — an agent's code that was refused (reply-collapse) or undone by the person */
function logInject({ mode, node = {}, agent = null, reason = null, extra = {} } = {}) {
  const FL = _fl(); if (!FL) return null;
  try {
    return FL.logFault({ system: 'idearium', agent: agent || node.hatName || null, component: INJECT_COMPONENT, faultClass: mode, status: mode,
      intent: node.path || extra.path || null, causedBy: node.uuid || null,
      meta: { mode, path: node.path || extra.path || null, repoUuid: node.repoUuid || extra.repoUuid || null, injectId: node.uuid || null, reason: reason ? String(reason).slice(0, 600) : null, ...extra } });
  } catch (e) { console.warn(`[phase-faults] ${e.message}`); return null; }
}

/** list({ component, agent, phase, limit }) — fault rows, newest first, whole (the first-class record, not a count) */
function list({ components = [COMPONENT, INJECT_COMPONENT], agent = null, phase = null, limit = 200 } = {}) {
  let jaa = null; try { jaa = require('../cortex/memory/jaa-db.js').jaaDB; } catch (_) { return []; }
  if (!jaa) return [];
  let rows = [];
  try { rows = jaa.query(_fl().TABLE, r => components.includes(r.component) && (!agent || r.agent === agent) && (!phase || r.intent === phase || (r.meta && r.meta.phase === phase))); } catch (_) { return []; }
  return rows.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit)
    .map(r => ({ uuid: r.uuid, ts: r.ts, agent: r.agent, mode: r.faultClass, status: r.status, phase: (r.meta && r.meta.phase) || r.intent, component: r.component, causedBy: r.causedBy, meta: r.meta || {} }));
}

/**
 * precedent(phase, faults) -> { faults, text } — what went wrong on this phase before, newest first, as a few short
 * lines the next attempt is given (so it does not repeat it) and the Plan shows. text is '' when nothing went wrong.
 */
function precedent(phase, faults = null, { limit = 6, maxChars = 600 } = {}) {
  const rows = (faults || list({ phase, limit: 50 })).filter(f => f.phase === phase || f.meta.phase === phase).slice(0, limit);
  if (!rows.length) return { faults: [], text: '' };
  const say = {
    timeout: 'timed out', empty: 'answered nothing', 'wrote-nothing': 'replied but wrote no file', 'missed-files': 'left out files',
    'reply-collapse': 'sent a block that was only a path or a sliver of the file (refused)', undone: 'wrote a change that was undone',
    blocked: 'only said it could not', 'chunk-stopped': 'stopped a chunked build at a file that did not land', 'tool-errors': 'kept making failing tool calls', unproven: 'did not pass the proof', 'ladder-exhausted': 'every agent was tried',
  };
  const lines = rows.map(f => `- ${f.agent || 'the build'} ${say[f.mode] || f.mode}${f.meta.promptChars ? ` (request ${f.meta.promptChars} chars)` : ''}${f.meta.absent ? `: missing ${[].concat(f.meta.absent).slice(0, 3).join(', ')}` : ''}`);
  let text = `WHAT WENT WRONG ON THIS PHASE BEFORE (do not repeat it):\n${[...new Set(lines)].join('\n')}`;
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return { faults: rows, text };
}

module.exports = { MODULE_ID: 'nexus.lib.phase-faults', VERSION: '1.0.0', COMPONENT, INJECT_COMPONENT, modeOf, faultsOf, log, logInject, list, precedent };
