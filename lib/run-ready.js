'use strict';
/**
 * lib/run-ready.js — 0.60.28 PF1 — ready before run: a phase build leaves off what cannot answer before it asks.
 *
 * James (2026-10-13): "can we work on inventing anything that will get this pipeline going. like why doesn't this work
 * yet?" He chose "A then B": A is this.
 *
 * The build already leaves off an Ollama rung whose model is not installed (pipeline-routing present) and tries a tab-less
 * browser agent after the others (byTabs). This adds what Guardian knows (GET /api/providers/ready,
 * guardian/lib/provider-ready.js): a sign-in wall, every account resting, a usage limit with no fallback, a ◎ wait.
 *
 *   apply(rungs, ready, { planner, memoryLevel }) → { rungs, dropped, moved, planner: { use, was, why } | null, notes }
 *     ready null    Guardian did not answer: nothing is changed and the run says readiness was not checked (the same
 *                   as the tab order, byTabs, when Guardian is down)
 *     not ready     left off, with Guardian's reason
 *     order 'last'  tried after every other rung (a ◎ wait: the pick clears it, so it is never dropped)
 *     planner       the configured planner when ready, else the first ready browser rung not waiting on the person;
 *                   none → use null (the plan is then written without a model, PF2)
 *     memory        critical is said on the run, not acted on: it settles in seconds, and dropping the local rungs would
 *                   send every file to a paid agent (his rule: local by default)
 * Pure.
 */
const VERSION = '1.0.0';

const baseOf = (p) => String(p || '').split(':')[0].toLowerCase();
const isLocal = (b) => b === 'ollama';

function apply(rungs = [], ready, { planner = null, memoryLevel = null } = {}) {
  const dropped = [], moved = [], notes = [];
  const keep = [], last = [];
  for (const rg of rungs) {
    const b = rg.base || baseOf(rg.provider);
    if (isLocal(b)) { keep.push(rg); continue; }
    if (ready == null) { keep.push(rg); continue; }
    const r = ready[b];
    if (!r) { keep.push(rg); continue; }   // not a Guardian tab (claude-code, copilot): its own route decides
    if (!r.ready) { dropped.push({ provider: rg.provider, why: r.why }); continue; }
    if (r.order === 'last') { last.push(rg); moved.push({ provider: rg.provider, why: r.why }); continue; }
    keep.push(rg);
  }
  if (ready == null && rungs.some(rg => !isLocal(rg.base || baseOf(rg.provider)))) notes.push('Guardian did not answer: whether the browser agents can take a job was not checked');
  if (memoryLevel === 'critical') notes.push('memory is critical: a local model may load slowly or be cut off — Settings → lean mode frees memory');

  let plan = null;
  if (planner) {
    const pb = baseOf(planner);
    const pr = isLocal(pb) || ready == null ? null : ready[pb];
    if (!pr || (pr.ready && pr.order !== 'last')) plan = { use: planner, was: planner, why: pr ? `${planner} is ready` : ready == null ? `${planner} not checked (Guardian did not answer)` : `${planner} is not a Guardian tab: its own route decides` };
    else {
      const alt = keep.find(rg => !isLocal(rg.base || baseOf(rg.provider)));
      const why = pr.ready ? pr.why : pr.why || `${planner} is not ready`;
      plan = alt ? { use: alt.base || baseOf(alt.provider), was: planner, why: `${planner} is not ready (${why}) — ${alt.base || baseOf(alt.provider)} plans instead` }
        : { use: null, was: planner, why: `${planner} is not ready (${why}) and no other agent is — the plan is written without a model` };
    }
  }
  return { rungs: [...keep, ...last], dropped, moved, planner: plan, notes };
}

/** line(r) — the run's one sentence: what was left off, what goes last, who plans */
function line(r) {
  const parts = [];
  if (r.dropped.length) parts.push(`left off: ${r.dropped.map(d => `${d.provider} (${d.why})`).join('; ')}`);
  if (r.moved.length) parts.push(`tried last: ${r.moved.map(d => `${d.provider} (${d.why})`).join('; ')}`);
  if (r.planner && r.planner.use !== r.planner.was) parts.push(r.planner.why);
  parts.push(...r.notes);
  return parts.length ? parts.join(' · ') : 'every agent on the ladder is ready';
}

module.exports = { VERSION, apply, line, baseOf };
