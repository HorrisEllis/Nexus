'use strict';
/**
 * lib/change-record.js — FR1: one record per change an agent makes, joined from what Nexus already writes. A projection, never a
 * Product: flight-recorder   (§PB1 0.60.116: part of products/flight-recorder; the branch tool carries every file tagged so)
 * second store (§7.6): nothing here is saved; every field points back at where it came from.
 * comp_id: nexus.lib.change-record
 * Map: docs/2026-10-16-repo-carve-phasemap.spec (FR1_one_record_per_change)
 *
 * James, 2026-10-16: "look at rfr2. versionium. event ledgers. causal graph. cos test env. its a product?" · "expand it." ·
 * "next". The coder's reading (to confirm): the product is an undo button and flight recorder for AI coding agents, and its
 * first piece is this record.
 *
 * The change is an .inject node (lib/repo-inject.js): one write of one file by one agent, with its lifecycle and its undo.
 * Joined onto it:
 *   who / why     its task (inject.task, recorded at propose since 0.60.114: lib/repo-activity.js current()) and the run
 *                 (lib/run-state.js) — by the task's runId, else matched by path and time (said as matched, never as known)
 *   what          lines added / removed (versionium/lib/text-diff.js), from `before` once applied, or a base the caller read
 *   checked       inject.evidence (lib/proposal-evidence.js: linked tests run, regressions)
 *   landed        the version commits whose labels name it (lib/repo-versions.js commitNow → activity row version.commit)
 *   timeline      its activity rows (inject.<status>, ref = its uuid) and those commits, oldest first
 *   undo          whether it can be undone now, and how
 *   holes         each link that should be there and is not, named (§1.2), never filled
 *
 * record(inject, { activity, runs, base, now }) → the record      summary(inject, opts) → one line's worth      lines(record)
 */
const VERSION = '1.0.0';
const MATCH_SLACK_MS = 2 * 60000;

function _counts(a, b) {
  if (a == null && b == null) return null;
  try {
    const d = require('../versionium/lib/text-diff.js').diff(a == null ? '' : String(a), b == null ? '' : String(b));
    let added = 0, removed = 0;
    for (const l of String(d).split('\n')) { if (l.startsWith('+') && !l.startsWith('+++')) added++; else if (l.startsWith('-') && !l.startsWith('---')) removed++; }
    return { added, removed };
  } catch (_) { return null; }
}

function _labelsOf(row) {
  const d = row && row.detail && typeof row.detail === 'object' ? row.detail : {};
  return Array.isArray(d.labels) ? d.labels : [];
}

function _runFor(inj, runs) {
  const t = inj.task || null;
  if (t) {
    // the task names its session; run-state keys a session's run as <repo>__<session> (lib/run-state.js runIdFor)
    let ids = [t.runId]; try { if (t.session) ids.push(require('./run-state.js').runIdFor({ repoUuid: inj.repoUuid, session: t.session })); } catch (_) {}
    for (const id of ids.filter(Boolean)) { const r = runs.find(x => x.runId === id); if (r) return { run: r, how: 'task' }; }
  }
  // written before tasks were recorded, or the run is gone: the run in this repo that wrote this path while the inject was made
  const at = inj.createdAt || 0;
  const hit = runs.filter(r => (!r.repoUuid || r.repoUuid === inj.repoUuid) && (r.filesChanged || []).includes(inj.path)
    && at >= (r.startedAt || 0) - MATCH_SLACK_MS && at <= (r.updatedAt || 0) + MATCH_SLACK_MS)
    .sort((a, b) => Math.abs(at - (a.updatedAt || 0)) - Math.abs(at - (b.updatedAt || 0)));
  return hit.length ? { run: hit[0], how: 'matched by path and time' } : null;
}

function record(inj, { activity = [], runs = [], base = undefined, now = Date.now() } = {}) {
  if (!inj || !inj.uuid) return null;
  const holes = [];
  const id = inj.uuid;
  const status = inj.status || 'proposed';
  const applied = status === 'applied' || status === 'reverted';

  // what
  const prior = applied ? inj.before : base;
  const lines = inj.op === 'delete' ? _counts(prior === undefined ? null : prior, '') : prior === undefined ? null : _counts(prior, inj.content);
  if (!lines && inj.op !== 'delete' && !applied && base === undefined) holes.push({ what: 'lines', why: 'the file as it was is not given, so the lines changed are not counted' });

  // who and why
  const task = inj.task || null;
  const found = _runFor(inj, runs);
  const run = found ? found.run : null;
  if (!task && (inj.hatName || (inj.source && inj.source.kind === 'agent'))) holes.push({ what: 'task', why: 'no task recorded: written before changes kept their task (0.60.114), or none was running' });
  if (!run && (task || inj.hatName)) holes.push({ what: 'run', why: task && task.session ? `no run of its session ${task.session} is on disk` : 'no run of this repo wrote this path at that time' });

  // checked
  const ev = inj.evidence || null;
  // §FR2 0.60.114 — where it was tested (Nexus's tree or the repo's own), and the staged batch's test, tested together
  const where = ev ? (ev.root === undefined ? 'nexus' : ev.root) : null;
  const checked = ev ? { testsRan: ev.tests ? ev.tests.ran : null, testsLinked: ev.tests ? ev.tests.linked : null, regressions: ev.regressions ?? null, at: ev.at || null,
    where, ...(ev.tests && ev.tests.skipped ? { skipped: ev.tests.skipped } : {}) } : null;
  if (ev && where === 'nexus' && !inj.target) holes.push({ what: 'checked', why: "tested in Nexus's tree, not this repo's (evidence from before 0.60.114): its result says nothing about this repo" });
  const batch = inj.batch ? { ...inj.batch } : null;
  if (!ev && inj.op === 'write' && (inj.hatName || (inj.source && inj.source.kind === 'agent'))) holes.push({ what: 'checked', why: 'no evidence was gathered before it was decided' });

  // landed and timeline
  const mine = activity.filter(r => r && (r.ref === id || _labelsOf(r).some(l => l.inject === id)
    || (r.detail && typeof r.detail === 'object' && Array.isArray(r.detail.refs) && r.detail.refs.includes(`inject:${id}`))));
  const commits = mine.filter(r => r.kind === 'version.commit').map(r => ({ commitId: r.ref, at: r.ts, kind: (_labelsOf(r).find(l => l.inject === id) || {}).kind || null, title: r.title || null }));
  if (applied && !commits.length) holes.push({ what: 'version', why: 'it was applied but no version commit names it (versioning off, not settled yet, or failed: the activity log says which)' });
  const timeline = [
    ...(inj.history || []).map(h => ({ at: h.at, what: h.event, by: null, source: 'inject' })),
    ...mine.filter(r => r.kind === 'version.commit').map(r => ({ at: r.ts, what: `version ${r.ref}`, by: r.actor || null, source: 'versions' })),
    ...mine.filter(r => r.kind !== 'version.commit' && !(inj.history || []).some(h => Math.abs((h.at || 0) - (r.ts || 0)) < 5 && String(h.event).startsWith(String(r.status))))
      .map(r => ({ at: r.ts, what: r.kind, by: r.actor || null, source: 'activity' })),
  ].sort((a, b) => (a.at || 0) - (b.at || 0));

  // undo
  // §FR3 0.60.117 — an applied change can be undone even after later edits: they are kept (a three-way merge); a region a
  // later change also touched refuses, named
  const undo = status === 'applied' ? { possible: true, how: inj.creates ? 'revert deletes the file it created (refused if it was edited since)' : 'revert writes back the content it replaced, keeping any later edits', route: `POST /api/repos/${inj.repoUuid}/injects/${id}/revert` }
    : status === 'proposed' || status === 'staged' ? { possible: true, how: 'not written yet: reject it', route: `POST /api/repos/${inj.repoUuid}/injects/${id}/reject` }
    : { possible: false, how: status === 'reverted' ? (inj.revertMerged ? 'already undone (merged: the later edits were kept)' : 'already undone') : 'it was never written' };

  return {
    version: VERSION, id, repoUuid: inj.repoUuid || null, path: inj.path, op: inj.op || 'write', status, creates: !!inj.creates,
    at: inj.createdAt || null, decidedAt: inj.appliedAt || inj.rejectedAt || inj.revertedAt || null,
    what: { lines, contentSha256: inj.contentSha256 || null, baseSha256: inj.baseSha256 || null },
    who: { agent: inj.hatName || (task && task.hat) || null, agentId: inj.agentId || null, provider: (task && task.provider) || (run && run.provider) || null,
      model: (task && task.model) || null, kind: (inj.source && inj.source.kind) || null, via: (inj.source && inj.source.via) || inj.via || null, approvedBy: inj.approvedBy || null },
    why: { task: task ? { id: task.id, title: task.title, session: task.session, phaseRun: task.runId || null } : null,
      run: run ? { runId: run.runId, goal: run.goal ? String(run.goal).slice(0, 300) : null, attempt: run.attempt || 1, brick: run.brick || null, status: run.status || null, how: found.how } : null,
      causedBy: (inj.staging && inj.staging.causedBy) || (inj.source && inj.source.causedBy) || null },
    checked, batch, landed: commits, timeline, undo, holes,
  };
}

function lines(r) {
  if (!r) return ['no such change'];
  const t = (at) => (at ? new Date(at).toISOString().replace('T', ' ').slice(0, 19) : '—');
  const L = [`${r.id.slice(0, 8)} ${r.op} ${r.path} — ${r.status}${r.what.lines ? ` (+${r.what.lines.added} −${r.what.lines.removed})` : ''}`];
  L.push(`who: ${r.who.agent || r.who.kind || 'unknown'}${r.who.provider ? ` via ${r.who.provider}` : ''}${r.who.approvedBy ? ` · approved by ${r.who.approvedBy}` : ''}`);
  if (r.why.run) L.push(`why: ${r.why.run.goal || '(no goal)'} — run ${r.why.run.runId}, attempt ${r.why.run.attempt}${r.why.run.brick ? `, brick ${r.why.run.brick}` : ''} (${r.why.run.how})`);
  else if (r.why.task) L.push(`why: ${r.why.task.title || r.why.task.id}`);
  if (r.checked) L.push(r.checked.skipped && !r.checked.testsRan ? `checked: ${r.checked.skipped}` : `checked: ${r.checked.testsRan}/${r.checked.testsLinked} linked tests run, ${r.checked.regressions} regressed${r.checked.where ? ` (in ${r.checked.where === 'nexus' ? "Nexus's tree" : "the repo's tree"})` : ''}`);
  if (r.batch) L.push(`batch: tested with ${r.batch.files} file(s) together, ${r.batch.ran}/${r.batch.linked} linked tests, ${r.batch.regressions} regressed`);
  for (const c of r.landed) L.push(`landed: version ${c.commitId} at ${t(c.at)}`);
  L.push(`undo: ${r.undo.possible ? r.undo.how : `no — ${r.undo.how}`}`);
  for (const h of r.holes) L.push(`missing ${h.what}: ${h.why}`);
  return L;
}

module.exports = { VERSION, MATCH_SLACK_MS, record, lines };
