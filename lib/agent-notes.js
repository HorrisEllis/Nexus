'use strict';
/**
 * lib/agent-notes.js — the editable per-agent constraint log James asked
 * for directly, distinct from lib/agent-capability-profile.js's passive,
 * measured stats.
 * comp_id: nexus.lib.agent-notes
 * UUID: nexus-agent-notes-v1-0000-2026-0822-001
 * Version: 1.0.0
 *
 * James: "maybe you have an editable model in cortex, each agent does,
 * that logs constraints, token limits, anything that helps the system
 * work around token limits, data persistence, anything."
 *
 * Checked before building (§8.6): agent-capability-profile.js already
 * measures per-agent stats — but only ever from other tables' data,
 * read-only, and it can't hold a genuinely learned workaround an agent
 * discovered mid-task ("gapField's dedup_key is domain::type::source
 * only — a constant source collapses distinct findings into one"). That
 * kind of lesson has nowhere real to persist today; it lives in a chat
 * transcript and evaporates the moment the session ends. This is that
 * missing, editable half — not a replacement for the measured profile,
 * a real complement to it.
 *
 * §1.2 — every write requires a real agent id and real body text; there
 * is no anonymous or blank note.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TABLE = 'agent_notes';

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

/**
 * note(agent, body, opts) — an agent writes a real, learned constraint or
 * workaround about itself or about NEXUS. `kind` distinguishes what KIND
 * of thing this is, so a later reader can filter ("give me every token-
 * limit workaround for claude") without parsing free text.
 * @param agent string — the agent this note is about (self-authored or observed)
 * @param body string — the real, specific lesson, not a vague summary
 * @param opts { kind?: 'token-limit'|'workaround'|'constraint'|'persistence'|'other',
 *               source?: string — who/what discovered this,
 *               relatesTo?: string — a real file/component/tool this concerns }
 */
function note(agent, body, opts = {}) {
  if (!agent || typeof agent !== 'string') return { ok: false, reason: 'agent is required' };
  if (!body || typeof body !== 'string' || body.trim().length < 3) return { ok: false, reason: 'body must be real, specific text' };
  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'cortex unavailable' };

  const row = {
    uuid: require('crypto').randomUUID(),
    agent, body: body.trim(),
    kind: opts.kind || 'other',
    source: opts.source || null,
    relatesTo: opts.relatesTo || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    supersedes: opts.supersedes || null,   // uuid of an older note this corrects, if any
  };
  try { jaa.insert(TABLE, row); return { ok: true, note: row }; }
  catch (e) { return { ok: false, reason: `write failed: ${e.message}` }; }
}

/**
 * notesFor(agent, opts) — every real, current note for one agent, newest
 * first. §1.2 — a note that was superseded is still returned (never
 * silently dropped) but flagged, so a reader can see the correction
 * happened rather than just seeing the newer note appear from nowhere.
 */
function notesFor(agent, opts = {}) {
  const jaa = _jaa();
  if (!jaa) return [];
  let rows = jaa.query(TABLE, r => r.agent === agent, 10000) || [];
  if (opts.kind) rows = rows.filter(r => r.kind === opts.kind);
  const supersededIds = new Set(rows.filter(r => r.supersedes).map(r => r.supersedes));
  rows = rows.map(r => ({ ...r, superseded: supersededIds.has(r.uuid) }));
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** allAgents() — every agent with at least one real note, for a full-system view. */
function allAgents() {
  const jaa = _jaa();
  if (!jaa) return [];
  const rows = jaa.query(TABLE, () => true, 10000) || [];
  return [...new Set(rows.map(r => r.agent))].sort();
}

module.exports = { note, notesFor, allAgents, TABLE, MODULE_ID: 'lib.agent-notes', VERSION: '1.0.0' };
