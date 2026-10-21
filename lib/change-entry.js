'use strict';
/**
 * lib/change-entry.js — one approved (or reverted) change as its Versionium commit carries it (APV1, 0.60.190).
 * comp_id: nexus.lib.change-entry
 * Spec: docs/approval-chain.spec MOD-APV-ENTRY (schema ChangeEntry). Map: docs/2026-10-21-approval-chain-phasemap.spec.
 *
 * James, 2026-10-21: "make sure it's all interconnected, changes are logged and the diff snapshotted in versionium with a change log
 * when approved. what about an api route or the pulse emission system"
 *
 * Decided by his axioms (APV0: §7.6, §0.3, §8.6): the change-log entry is written INTO the commit of the diff, so the change log he reads
 * is a projection of the commits and cannot drift from them. This module only builds the entry: pure, from the inject (lib/repo-inject.js)
 * and what a resolver knows of its run (phase, map, who started it — RC7). Anything not known is null, never guessed.
 */
const MODULE_ID = 'nexus.lib.change-entry';
const VERSION = '1.0.0';

function _lines(t) { const x = String(t).split('\n'); if (x.length && x[x.length - 1] === '') x.pop(); return x; }

/** counts(before, after) → { added, removed } — the lines of inject-gate's lineDiff (null text = no file) */
function counts(before, after) {
  if (after == null) return { added: 0, removed: before == null ? 0 : _lines(before).length };
  const d = require('./nexus-self/inject-gate.js').lineDiff(before, after);
  let added = 0, removed = 0;
  for (const l of d ? d.split('\n') : []) { if (l[0] === '+') added++; else if (l[0] === '-') removed++; }
  return { added, removed };
}

/** runOf(inject) → the run that produced it, or null */
function runOf(n) {
  const s = (n && n.source) || {};
  return s.runId || s.run || (n && n.task && n.task.runId) || null;
}

function _why(n) {
  const s = n.source || {};
  const said = s.goal || s.reason || (n.task && n.task.title) || s.action || null;
  if (said) return String(said).split('\n')[0].slice(0, 200);
  const last = Array.isArray(n.history) ? n.history[n.history.length - 1] : null;
  return last && last.reason ? String(last.reason).split('\n')[0].slice(0, 200) : null;
}

/** title(entry) → the one line the commit message, the activity log and the change log all show */
function title(e) {
  const f = e.files || [];
  const what = f.length === 1 ? f[0].path : `${f.length} files`;
  const plus = f.reduce((a, x) => a + (x.added || 0), 0), minus = f.reduce((a, x) => a + (x.removed || 0), 0);
  const head = e.phase ? `${e.phase} · ${what}` : what;
  const verb = e.status === 'reverted' ? 'reverted' : 'approved';
  return `${head}${e.why ? `: ${e.why}` : ''} (+${plus} −${minus}) — ${verb} by ${e.approvedBy || 'unknown'}`.slice(0, 300);
}

/**
 * entry(inject, { run }) → ChangeEntry
 *   run: what a resolver knows of runOf(inject) — { phase, map, title, startedBy } — or null
 */
function entry(n, { run = null } = {}) {
  const reverted = n.status === 'reverted';
  // applied: before → content. reverted: what was applied → what it restored (before)
  const from = reverted ? n.content : n.before, to = reverted ? n.before : (n.op === 'delete' ? null : n.content);
  const c = counts(from == null ? null : from, to == null ? null : to);
  const approvedBy = reverted ? 'person' : (!n.approvedBy || n.approvedBy === 'idearium' ? 'person' : n.approvedBy);   // 'idearium': the page's Apply, the person (as _logActivity reads it)
  const e = {
    title: null,
    why: _why(n),
    files: [{ path: n.path, op: n.op === 'delete' ? 'delete' : 'write', added: c.added, removed: c.removed }],
    approvedBy,
    proposedBy: n.hatName || (n.source && n.source.kind) || 'person',
    inject: n.uuid || null,
    run: runOf(n),
    phase: (run && run.phase) || (n.source && n.source.phase) || null,
    map: (run && run.map) || null,
    startedBy: (run && run.startedBy) || null,
    status: reverted ? 'reverted' : 'applied',
    at: (reverted ? n.revertedAt : n.appliedAt) || Date.now(),
  };
  e.title = title(e);
  return e;
}

module.exports = { MODULE_ID, VERSION, entry, title, counts, runOf };
