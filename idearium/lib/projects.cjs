'use strict';
/**
 * idearium/lib/projects.cjs — COSA10: every project of his on one screen, sorted by what moved last.
 * comp_id: nexus.idearium.lib.projects
 *
 * James, 2026-10-16: "i figure cos could be helpfui for managing my projects so im not so overwhelmed." · "heklp wirth
 * overwhekm need to be done."
 *
 * Nothing here is new data. Each row composes what Nexus already keeps per repo:
 *   notes    lib/repo-notes.js counts()            — open todos and questions (his, and the agents')
 *   phases   idearium/repo/roadmap.js summary      — how many, how many done, what is in progress, what is ready next
 *   activity lib/activity-log/compartment.js list() — the last thing that happened
 * The readers are passed in, so the overview is a pure function of what they return (testable without a server), and a
 * reader that fails is said on the row (§1.2), never dropped.
 *
 * Which repos are "his projects": the same rule the repo library uses (idearium/ui/js/app.js _isRaidContractRepo,
 * nexus-atlas.js _nxIsMain): RAID's per-contract repos are plumbing, and Nexus is ONE project (its core repo, or the parent
 * when there is no core), not one per system.
 *
 * overview({ repos, notesOf, activityOf, phasesOf, now }) → { projects: [row], counts, failed }
 *   row: { uuid, name, nexus, lastActivity: { ts, title, kind } | null, notes: { open, todo, question },
 *          phases: { total, complete, active, ready, next: { map, key, title, status } | null } | null,
 *          attention: [string], errors: [string] }
 */
const VERSION = '1.0.0';

function isRaidContract(r) { return !!r && (r.source === 'raid-contract' || /^raid-contract-/.test(r.name || '')); }

/** isProject(r, repos) — one of his projects: not a RAID contract repo; of Nexus's repos, only the main one */
function isProject(r, repos = []) {
  if (!r || isRaidContract(r)) return false;
  if (!r.nexusSelf) return true;
  if (r.nexusSelf.system === 'core') return true;
  const hasCore = repos.some(x => x && x.nexusSelf && x.nexusSelf.system === 'core');
  return r.nexusSelf.role === 'parent' && !hasCore;
}

/** nextPhase(phases) — the phase to look at next: one already in progress, else the first ready one in the map's order */
function nextPhase(phases = []) {
  const open = phases.filter(p => p && p.status !== 'complete');
  const pick = open.find(p => p.status === 'active') || open.find(p => p.ready) || null;
  return pick ? { map: pick.map || null, key: pick.phase_key || pick.key || null, title: pick.title || pick.phase_key || '', status: pick.status } : null;
}

function _try(fn, errors, what) {
  try { return fn(); } catch (e) { errors.push(`${what}: ${e.message}`); return null; }
}

async function overview({ repos = [], notesOf = null, activityOf = null, phasesOf = null, now = Date.now() } = {}) {
  const rows = [];
  for (const r of repos.filter(x => isProject(x, repos))) {
    const errors = [];
    const notes = notesOf ? _try(() => notesOf(r.uuid), errors, 'notes') : null;
    const act = activityOf ? _try(() => activityOf(r.uuid), errors, 'activity') : null;
    let ph = null;
    if (phasesOf) { try { ph = await phasesOf(r); } catch (e) { errors.push(`phases: ${e.message}`); } }
    const lastActivity = act ? { ts: act.ts || null, title: act.title || act.kind || '', kind: act.kind || null } : null;
    const phases = ph ? {
      total: ph.summary ? ph.summary.total : (ph.phases || []).length,
      complete: ph.summary ? ph.summary.complete : 0, active: ph.summary ? ph.summary.active : 0, ready: ph.summary ? ph.summary.ready : 0,
      next: nextPhase(ph.phases || []),
    } : null;
    const n = { open: (notes && notes.open) || 0, todo: (notes && notes.todo) || 0, question: (notes && notes.question) || 0 };
    const attention = [];
    if (n.question) attention.push(`${n.question} question${n.question === 1 ? '' : 's'} waiting on you`);
    if (n.todo) attention.push(`${n.todo} todo${n.todo === 1 ? '' : 's'} open`);
    if (phases && phases.next) attention.push(`${phases.next.status === 'active' ? 'in progress' : 'next'}: ${phases.next.title}`);
    rows.push({ uuid: r.uuid, name: r.name, nexus: !!r.nexusSelf, lastActivity, notes: n, phases, attention, errors,
      _sort: (lastActivity && lastActivity.ts) || r.updatedAt || r.createdAt || 0 });
  }
  rows.sort((a, b) => (b._sort || 0) - (a._sort || 0) || String(a.name).localeCompare(String(b.name)));
  for (const x of rows) delete x._sort;
  return {
    projects: rows,
    counts: { projects: rows.length, questions: rows.reduce((s, x) => s + x.notes.question, 0), todos: rows.reduce((s, x) => s + x.notes.todo, 0),
      inProgress: rows.filter(x => x.phases && x.phases.next && x.phases.next.status === 'active').length },
    failed: rows.filter(x => x.errors.length).map(x => ({ uuid: x.uuid, name: x.name, errors: x.errors })),
    at: now,
  };
}

module.exports = { VERSION, overview, isProject, isRaidContract, nextPhase };
