/**
 * idearium/lib/idea-workbench.js — the Compartment: where promoted ideas are worked
 * component_id: idearium.workbench
 *
 * §BUILT 2026-09-26 — James: "i want ideas once promoted to move to the
 * compartment idea section for brainstorming, problem solving, expanding,
 * and improving … make the tabs much more recursive, deep and expanded
 * fully. interconnected."
 *
 * Model (all pure — this file never touches the store; api/index.js owns
 * loadTable/appendRow/syncTable and hands rows in):
 *
 *   member  — one per idea that lives in the Compartment.
 *             { uuid:'cm-<ideaUuid>', ideaUuid, parentIdea, promotedFrom, ts }
 *             parentIdea makes ideas recursive: an entry can be spun out
 *             into its own idea, which is itself a member with its own lanes.
 *   entry   — one thought inside an idea's compartment.
 *             { uuid, ideaUuid, parentUuid, lane, text, ts, status, links[], spawnedIdea }
 *             parentUuid makes entries recursive (a problem → its sub-
 *             problems → a fix → an improvement to the fix, to any depth).
 *             links[] are cross-references to any other entry or idea uuid —
 *             the "interconnected" half; they are walked both directions.
 *
 * Lanes are fixed and closed — an unknown lane is a hard error, never a
 * silent default (collision/ambiguity is an error, not a warning).
 */

export const LANES = Object.freeze({
  brainstorm: { label: 'Brainstorm',      icon: '✎', verb: 'riff on' },
  problem:    { label: 'Problem solving', icon: '⚠', verb: 'break down' },
  expand:     { label: 'Expand',          icon: '⤢', verb: 'expand' },
  improve:    { label: 'Improve',         icon: '↑', verb: 'improve' },
});
export const LANE_IDS = Object.freeze(Object.keys(LANES));
export const ENTRY_STATUS = Object.freeze(['open', 'resolved', 'parked']);

export const MEMBER_TABLE = 'idearium_workbench_members';
export const ENTRY_TABLE  = 'idearium_workbench_entries';

const _id = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Validate + shape a new entry. Returns { entry } or { error }. */
export function makeEntry({ ideaUuid, lane, text, parentUuid = null, links = [] }, entries = []) {
  if (!ideaUuid) return { error: 'ideaUuid required' };
  if (!LANE_IDS.includes(lane)) return { error: `unknown lane "${lane}" — one of ${LANE_IDS.join(', ')}` };
  if (typeof text !== 'string' || !text.trim()) return { error: 'text required' };
  if (parentUuid) {
    const parent = entries.find(e => e.uuid === parentUuid);
    if (!parent) return { error: `parent entry not found: ${parentUuid}` };
    if (parent.ideaUuid !== ideaUuid) return { error: 'parent entry belongs to a different idea' };
  }
  return {
    entry: {
      uuid: _id('we'), ideaUuid, parentUuid: parentUuid || null, lane, text: text.trim(),
      ts: Date.now(), updatedAt: Date.now(), status: 'open',
      links: [...new Set((links || []).filter(Boolean))], spawnedIdea: null,
    },
  };
}

export function makeMember({ ideaUuid, parentIdea = null, promotedFrom = null }) {
  return { uuid: `cm-${ideaUuid}`, ideaUuid, parentIdea, promotedFrom, ts: Date.now() };
}

/** Apply a patch to an entry. Only text/status/lane/links/spawnedIdea are writable. */
export function patchEntry(entry, patch = {}) {
  const next = { ...entry };
  if (patch.text !== undefined) {
    if (typeof patch.text !== 'string' || !patch.text.trim()) return { error: 'text cannot be empty' };
    next.text = patch.text.trim();
  }
  if (patch.status !== undefined) {
    if (!ENTRY_STATUS.includes(patch.status)) return { error: `unknown status "${patch.status}"` };
    next.status = patch.status;
  }
  if (patch.lane !== undefined) {
    if (!LANE_IDS.includes(patch.lane)) return { error: `unknown lane "${patch.lane}"` };
    next.lane = patch.lane;
  }
  if (patch.addLink) next.links = [...new Set([...(next.links || []), patch.addLink])];
  if (patch.removeLink) next.links = (next.links || []).filter(l => l !== patch.removeLink);
  if (patch.spawnedIdea !== undefined) next.spawnedIdea = patch.spawnedIdea;
  next.updatedAt = Date.now();
  return { entry: next };
}

/** Every descendant uuid of an entry (for cascade delete). */
export function descendants(entries, uuid) {
  const out = [];
  const stack = [uuid];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of entries) if (e.parentUuid === cur) { out.push(e.uuid); stack.push(e.uuid); }
  }
  return out;
}

/** Nest a flat entry list into a tree per lane. Orphans (parent deleted) surface at the root. */
export function buildTree(entries) {
  const byId = new Map(entries.map(e => [e.uuid, { ...e, children: [] }]));
  const lanes = Object.fromEntries(LANE_IDS.map(l => [l, []]));
  for (const node of byId.values()) {
    const parent = node.parentUuid && byId.get(node.parentUuid);
    if (parent) parent.children.push(node);
    else lanes[node.lane]?.push(node);
  }
  const sort = (arr) => { arr.sort((a, b) => a.ts - b.ts); arr.forEach(n => sort(n.children)); return arr; };
  for (const l of LANE_IDS) sort(lanes[l]);
  return lanes;
}

/**
 * Backlinks: every entry (in any idea) whose links[] point at `target`
 * — an entry uuid or an idea uuid. This is what makes the graph walkable
 * in both directions without storing the edge twice.
 */
export function backlinks(allEntries, target) {
  return allEntries.filter(e => (e.links || []).includes(target));
}

/**
 * The Compartment index: every member with its lane counts, open counts,
 * and child ideas nested under their parent (recursive idea tree).
 */
export function memberTree(members, allEntries, ideasByUuid) {
  const counts = new Map();
  for (const e of allEntries) {
    const c = counts.get(e.ideaUuid) || { total: 0, open: 0, lanes: Object.fromEntries(LANE_IDS.map(l => [l, 0])) };
    c.total++; if (e.status === 'open') c.open++; c.lanes[e.lane] = (c.lanes[e.lane] || 0) + 1;
    counts.set(e.ideaUuid, c);
  }
  const nodes = new Map(members.map(m => {
    const idea = ideasByUuid.get(m.ideaUuid) || null;
    return [m.ideaUuid, {
      ...m,
      text: idea?.text || '(idea missing)',
      phase: idea?.phase || null,
      tension: idea?.tension ?? null,
      missing: !idea,
      counts: counts.get(m.ideaUuid) || { total: 0, open: 0, lanes: Object.fromEntries(LANE_IDS.map(l => [l, 0])) },
      children: [],
    }];
  }));
  const roots = [];
  for (const n of nodes.values()) {
    const p = n.parentIdea && nodes.get(n.parentIdea);
    if (p && p !== n) p.children.push(n); else roots.push(n);
  }
  const sort = (arr) => { arr.sort((a, b) => b.ts - a.ts); arr.forEach(n => sort(n.children)); return arr; };
  return sort(roots);
}

/** Ancestor chain of an idea inside the Compartment, root first (breadcrumb). */
export function ancestry(members, ideaUuid) {
  const byIdea = new Map(members.map(m => [m.ideaUuid, m]));
  const chain = [];
  const seen = new Set();
  let cur = byIdea.get(ideaUuid);
  while (cur && cur.parentIdea && !seen.has(cur.parentIdea)) {
    seen.add(cur.parentIdea);
    chain.unshift(cur.parentIdea);
    cur = byIdea.get(cur.parentIdea);
  }
  return chain;
}

/** The prompt used when copilot is asked to work an entry in its lane. */
export function lanePrompt(lane, ideaText, entryText, pathTexts = []) {
  const L = LANES[lane];
  const trail = pathTexts.length ? `\nThread so far:\n${pathTexts.map((t, i) => `${'  '.repeat(i)}- ${t}`).join('\n')}` : '';
  const ask = {
    brainstorm: 'Give 3-5 divergent directions this could go. One line each.',
    problem:    'Break this problem into its root causes and list concrete sub-problems. One line each.',
    expand:     'Expand this into the next level of detail: components, interfaces, what it touches. One line each.',
    improve:    'Propose concrete improvements, each with the tradeoff it costs. One line each.',
  }[lane];
  return `Idea: ${ideaText}${trail}\nCurrent (${L.label}): ${entryText}\n\n${ask}`;
}
