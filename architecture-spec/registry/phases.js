'use strict';
/**
 * .architecture/registry/phases.js — Phase as a full node kind, not just
 * prose in a phasemap doc. The point: querying "what's the state of
 * everything right now" should be a function call, not a memory recall.
 * Built directly in response to: "i need to take some of the overwhelm
 * off from holding all of nexus in my head."
 *
 * A phase node's shape matches architecture-spec.template.yaml's own
 * phases.entries[] fields exactly — this is that same concept, made
 * into a real, droppable, watchable node instead of only living in a
 * YAML block inside a .spec file.
 */
const fs = require('fs');
const path = require('path');

const PHASE_SCHEMA = Object.freeze({
  requiredKeys: ['id', 'system', 'phase', 'status'],
  types: { id: 'string', system: 'string', phase: 'string', status: 'string' },
});
const PHASE_STATUSES = Object.freeze(['pending', 'active', 'blocked', 'done']);

function checkPhase(payload) {
  const p = payload || {};
  const missing = PHASE_SCHEMA.requiredKeys.filter(k => !(k in p));
  const badStatus = ('status' in p) && !PHASE_STATUSES.includes(p.status);
  return { ok: missing.length === 0 && !badStatus, missing, badStatus };
}

/**
 * summarize(nodesDir) — the actual overwhelm-reduction query: one call,
 * one compact answer. Reads every phase node under nodesDir/phase/ and
 * returns counts + what's active + what's blocked (and why), grouped
 * by system — the three things a person actually needs to hold in
 * their head, computed instead of remembered.
 */
function summarize(nodesDir) {
  const dir = path.join(nodesDir, 'phase');
  if (!fs.existsSync(dir)) return { systems: {}, active: [], blocked: [], counts: { pending: 0, active: 0, blocked: 0, done: 0 } };

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const systems = {};
  const active = [];
  const blocked = [];
  const counts = { pending: 0, active: 0, blocked: 0, done: 0 };

  for (const f of files) {
    let node;
    try { node = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (_) { continue; }
    const check = checkPhase(node);
    if (!check.ok) continue;

    counts[node.status] = (counts[node.status] || 0) + 1;
    (systems[node.system] = systems[node.system] || []).push(node);
    if (node.status === 'active') active.push(node);
    if (node.status === 'blocked') blocked.push(node);
  }

  return { systems, active, blocked, counts };
}

/**
 * oneLine(nodesDir) — the actual thing to read at session start. A
 * single sentence, not a report — matches CLAUDE.md's own "query, don't
 * read" discipline (step 3) applied to phases specifically.
 */
function oneLine(nodesDir) {
  const s = summarize(nodesDir);
  const systemCount = Object.keys(s.systems).length;
  const activeNames = s.active.map(p => `${p.system}/${p.phase}`).join(', ') || 'none';
  const blockedNames = s.blocked.map(p => `${p.system}/${p.phase} (${p.blockedReason || 'no reason given'})`).join(', ') || 'none';
  return `${systemCount} systems tracked — active: ${activeNames} — blocked: ${blockedNames} — done: ${s.counts.done}, pending: ${s.counts.pending}`;
}

module.exports = { PHASE_SCHEMA, PHASE_STATUSES, checkPhase, summarize, oneLine };
