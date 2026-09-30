/**
 * idearium/repo/work-surface.js — what the agent changed, as files with their diffs, and the tools it has and used.
 * §0.39.284 W3 · Map: docs/2026-09-30-idearium-coding-flow-phasemap.spec (W3_work_surface)
 * UUID: nexus-idearium-repo-work-surface-v1-0000-2026-0930-jamesbrooks-001
 *
 * James: "i want below the plan, in idearium, the worksurface from cos or the ide identicle to yours" — the Claude Code
 * diff view: one card per changed file, +added −removed, the lines themselves, green and red. "also the tools arent
 * exposed still appearently."
 *
 * A projection (§10.2) — it stores nothing. Its sources are what already records the work:
 *   .inject nodes (lib/repo-inject.js)     every write the agent made or proposed: path, content, `before` (the file
 *                                          as it was when applied), status (proposed · staged · applied · reverted ·
 *                                          rejected), who wrote it, when
 *   idearium_phase_runs rows               each plan/phase run: its state, the files its reply brought (injects), and
 *                                          since W3 the tool calls it made (tools)
 *   the repo's files (readCurrent)         the file as it is now — the "before" of a change not yet applied
 *   unifiedDiff (lib/code-edit.js)         the one line diff NEXUS already has
 *
 *   workSurface({ injects, runs, readCurrent, unifiedDiff, listed, scope, limit }) -> { files, totals, runs, tools }
 */

const _lines = (s) => (s == null ? 0 : String(s).split('\n').length);

/** counts(diffText) -> { added, removed } — from a unified diff's body lines */
export function counts(diff) {
  let added = 0, removed = 0;
  for (const l of String(diff || '').split('\n')) {
    if (l.startsWith('+++ ') || l.startsWith('--- ')) continue;
    if (l.startsWith('+')) added++;
    else if (l.startsWith('-')) removed++;
  }
  return { added, removed };
}

function _runFor(node, runs) {
  // the run whose reply brought this path, and whose window holds the node's creation
  const t = node.createdAt || 0;
  let best = null;
  for (const r of runs) {
    if (!r.injected.includes(node.path)) continue;
    if (t < r.startedAt - 1000 || t > (r.endedAt || Infinity) + 60000) continue;
    if (!best || r.startedAt > best.startedAt) best = r;
  }
  return best;
}

/** runsOf(rows) -> [{ runId, phase, map, title, state, startedAt, endedAt, injected, tools, provider, error }] newest first */
export function runsOf(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (!r || !r.runId) continue;
    const cur = by.get(r.runId) || { runId: r.runId, phase: r.phase, map: r.map, title: r.title || null, state: null, startedAt: null, endedAt: null, injected: [], tools: [], provider: null, error: null, ts: 0 };
    if (r.state === 'building' || r.state === 'reviewing') cur.startedAt = r.ts;
    else { cur.endedAt = r.ts; }
    if ((r.ts || 0) >= cur.ts) { cur.state = r.state; cur.ts = r.ts || 0; if (r.error !== undefined) cur.error = r.error; }
    if (r.injects && Array.isArray(r.injects.injected)) cur.injected = [...new Set([...cur.injected, ...r.injects.injected])];
    if (Array.isArray(r.draftFiles)) cur.injected = [...new Set([...cur.injected, ...r.draftFiles])];
    if (Array.isArray(r.tools)) cur.tools = r.tools;
    if (r.provider) cur.provider = r.provider;
    if (r.title && !cur.title) cur.title = r.title;
    by.set(r.runId, cur);
  }
  for (const r of by.values()) if (r.startedAt == null) r.startedAt = r.endedAt || r.ts;
  return [...by.values()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export function workSurface({ injects = [], runs: rows = [], readCurrent = () => null, unifiedDiff, listed = [], scope = null, limit = 60, maxDiffLines = 400 } = {}) {
  if (typeof unifiedDiff !== 'function') throw new Error('workSurface needs unifiedDiff');
  const runs = runsOf(rows);
  // newest node per path is the file's state; the older ones are its history
  const byPath = new Map();
  for (const n of [...injects].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) {
    if (!n || !n.path) continue;
    if (!byPath.has(n.path)) byPath.set(n.path, { node: n, earlier: [] });
    else byPath.get(n.path).earlier.push(n);
  }
  const files = [];
  for (const [p, { node: n, earlier }] of byPath) {
    if (files.length >= limit) break;
    const del = n.op === 'delete';
    // what the change is measured against: the file before it was applied, or the file as it is now if it is not applied
    const applied = n.status === 'applied' || n.status === 'reverted';
    const before = applied ? n.before : readCurrent(p);
    const after = del ? null : n.content;
    // a final newline is not a line of its own (the chunk store trims it; an agent's block keeps it) — compared without it
    const _nl = (x) => (x == null ? null : String(x).replace(/\r?\n$/, ''));
    const diff = unifiedDiff(_nl(before), _nl(after), { path: p, context: 3, maxLines: maxDiffLines }) || '';
    const c = counts(diff);
    const run = _runFor(n, runs);
    files.push({
      path: p, id: n.uuid, status: n.status, op: del ? 'delete' : 'write', creates: before == null && !del,
      added: c.added, removed: c.removed, lines: _lines(after), diff,
      unchanged: !diff, by: n.hatName || (n.source && n.source.kind) || null,
      at: n.appliedAt || n.createdAt || null, staged: !!(n.source && n.source.staged) || n.status === 'staged',
      run: run ? { runId: run.runId, phase: run.phase, state: run.state } : null,
      history: earlier.length,
      actions: n.status === 'proposed' ? ['apply', 'reject'] : n.status === 'applied' ? ['revert'] : n.status === 'staged' ? ['promote', 'reject'] : [],
    });
  }
  const totals = files.reduce((t, f) => ({ files: t.files + 1, added: t.added + f.added, removed: t.removed + f.removed,
    pending: t.pending + (f.status === 'proposed' || f.status === 'staged' ? 1 : 0) }), { files: 0, added: 0, removed: 0, pending: 0 });
  const calls = [];
  for (const r of runs) for (const t of r.tools || []) calls.push({ runId: r.runId, phase: r.phase, name: t.name, ok: t.ok !== false, error: t.error || null, args: t.args || null });
  return {
    files, totals,
    runs: runs.slice(0, 20).map(r => ({ runId: r.runId, phase: r.phase, map: r.map, title: r.title, state: r.state, at: r.startedAt, files: r.injected.length, tools: (r.tools || []).length, provider: r.provider, error: r.error })),
    tools: { scope, listed, calls: calls.slice(0, 200), used: [...new Set(calls.map(c => c.name))] },
  };
}

/** toolsBrief(reply) -> the tool calls of one agent reply, small enough to keep on its run row */
export function toolsBrief(r) {
  const T = r && Array.isArray(r.toolCalls) ? r.toolCalls : null;
  if (!T) return null;
  return T.slice(0, 40).map(t => ({ name: String(t.name || '?'), ok: t.ok !== false, error: t.error ? String(t.error).slice(0, 200) : null,
    args: (() => { try { return JSON.stringify(t.arguments || {}).slice(0, 200); } catch (_) { return null; } })() }));
}
