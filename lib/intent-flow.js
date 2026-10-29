'use strict';
/**
 * lib/intent-flow.js — what he types, carried in his order: the intent, the context it needs, the DAG, the context found, the gaps asked,
 * then the contract.
 * comp_id: nexus.lib.intent-flow
 * UUID: nexus-lib-intent-flow-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-INTENT-FLOW · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA8
 *
 * James, 2026-10-29: "yes, and can you do what you can to get idearium to work dynamically? like type in the cli, determine context needed,
 * build dag. search the project for context, ask user about any gaps, then contract, etc"
 *
 * Deterministic first (his rule, 2026-10-13): no model is asked here. Reuse (§8.6): the spine (lib/project-spine.js) is the graph; the
 * adapters read exports; code-intel's terms() reads the words; the contract is RAID's v2 shape (cortex/core/raid/contract-gates.js scaffold),
 * built here as data — the caller (Idearium's route, which already reaches RAID) validates and saves it, so lib never reaches into cortex.
 *
 *   run({ text, files, project, answers, spine? }) → { stages, intent, needed, dag, found, gaps, contract | null, blockedBy }
 */

const path = require('path');
const S = require('./project-spine.js');
const { terms: termsOf } = require('./code-intel/text.js');

const MODULE_ID = 'nexus.lib.intent-flow';
const VERSION = '1.1.0';   // 1.1.0 (0.60.287 FA11): bidirectional causal chaining
const STAGES = ['intent', 'context-needed', 'dag', 'context-found', 'gaps', 'contract'];
const VERBS = [['fix', /\b(fix|repair|broken|bug|crash|fails?|error)\b/i], ['add', /\b(add|new|create|make|build|support)\b/i], ['change', /\b(change|update|rename|move|refactor|split|replace|improve)\b/i],
  ['remove', /\b(remove|delete|drop)\b/i], ['explain', /\b(explain|why|how does|what is|where is|show)\b/i], ['test', /\b(test|prove|verify|check)\b/i]];
const TEST_RE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
const STOP = new Set(['want', 'need', 'make', 'thing', 'stuff', 'work', 'like', 'also', 'just', 'should', 'would', 'could', 'into', 'with', 'from', 'that', 'this', 'then', 'when', 'some', 'every']);

function _slug(s, n = 40) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n).replace(/-+$/, '') || 'intent'; }

/** the intent: its verb, its words, the paths it names, and whether it says when it is done */
function readIntent(text) {
  const t = String(text || '').trim();
  const verb = (VERBS.find(([, re]) => re.test(t)) || ['do'])[0];
  const paths = [...new Set((t.match(/[\w@./-]+\.(?:[cm]?js|ts|tsx|jsx|md|spec|json|eg|html|css|py)\b/g) || []))];
  const words = [...new Set(termsOf(t).filter(w => w.length > 2 && !STOP.has(w) && !VERBS.some(([v]) => v === w)))];
  const doneWhen = /\b(so that|until|done when|should (?:then|now)?|must|so it|test|passes|shows?|returns?)\b/i.test(t);
  // 0.60.287 FA11 — the end state as he said it: what follows "so that / so / until / done when" (the clause the backward chain starts from)
  const m = /\b(?:so that|done when|until|so)\b\s+(.+)$/i.exec(t);
  return { text: t, verb, words, paths, doneWhen, doneClause: m ? m[1].trim() : null };
}

/** score each component: a word in its path counts 3, in its exports 2, in its content 1 (once per word); paths he named count 10 */
function score(spine, files, intent) {
  const byPath = new Map(files.map(f => [String(f.path).replace(/\\/g, '/'), f]));
  const out = [];
  for (const c of spine.components) {
    if (TEST_RE.test(c.path) && intent.verb !== 'test') continue;
    const f = byPath.get(c.path); const body = f && typeof f.content === 'string' ? f.content.toLowerCase() : '';
    const p = c.path.toLowerCase(); const ex = (c.exports || []).join(' ').toLowerCase();
    let s = 0; const why = [];
    for (const w of intent.words) {
      if (p.includes(w)) { s += 3; why.push(`${w} in its path`); }
      else if (ex.includes(w)) { s += 2; why.push(`${w} in its exports`); }
      else if (body.includes(w)) { s += 1; why.push(`${w} in its text`); }
    }
    if (intent.paths.some(x => c.path === x || c.path.endsWith(`/${x}`))) { s += 10; why.unshift('named in the intent'); }
    if (s) out.push({ path: c.path, id: c.id, score: s, why });
  }
  return out.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/** the DAG: the chosen components, what they use (built first), who uses them (checked after); ordered dependencies first */
function dagOf(spine, chosen, { usesDepth = 1, max = 24 } = {}) {
  const nodes = new Map(chosen.map(p => [p, { path: p, role: 'change' }]));
  const resolved = spine.wires.filter(w => w.toPath && w.kind !== 'reference');
  let frontier = [...chosen];
  for (let d = 0; d < usesDepth; d++) {
    const next = [];
    for (const p of frontier) for (const w of resolved) if (w.fromPath === p && !nodes.has(w.toPath) && nodes.size < max) { nodes.set(w.toPath, { path: w.toPath, role: 'uses' }); next.push(w.toPath); }
    frontier = next;
  }
  for (const p of chosen) for (const w of resolved) if (w.toPath === p && !nodes.has(w.fromPath) && nodes.size < max) nodes.set(w.fromPath, { path: w.fromPath, role: 'used-by' });
  const keys = [...nodes.keys()];
  const edges = resolved.filter(w => nodes.has(w.fromPath) && nodes.has(w.toPath) && w.fromPath !== w.toPath).map(w => ({ from: w.toPath, to: w.fromPath }));   // dependency → its user
  // Kahn, dependencies first; a cycle is said and broken at the edge that closes it
  const indeg = new Map(keys.map(k => [k, 0])); for (const e of edges) indeg.set(e.to, indeg.get(e.to) + 1);
  const order = []; const q = keys.filter(k => !indeg.get(k)).sort(); const cycles = [];
  while (order.length < keys.length) {
    if (!q.length) { const k = keys.find(x => !order.includes(x)); cycles.push(k); q.push(k); indeg.set(k, 0); }
    const k = q.shift(); if (order.includes(k)) continue; order.push(k);
    for (const e of edges) if (e.from === k) { indeg.set(e.to, indeg.get(e.to) - 1); if (indeg.get(e.to) === 0) q.push(e.to); }
  }
  return { nodes: order.map(p => nodes.get(p)), edges, order, cycles };
}

/** the lines of a file that hold the intent's words (at most `max`), each with its number */
function linesFor(text, words, max = 6) {
  const out = []; const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length && out.length < max; i++) { const l = lines[i].toLowerCase(); if (words.some(w => l.includes(w))) out.push({ line: i + 1, text: lines[i].trim().slice(0, 200) }); }
  return out;
}

/**
 * 0.60.287 FA11 — James, 2026-10-29: "Each problem needs to build a dag using reverse end state reasoning." · "Yes the same way I reason.
 * Bidirectional causal changing." Backward from the end state through what each node uses; forward from the change through what uses each
 * node. The meeting set is the causal path. Only backward: preconditions the change does not touch (they hold already, or are missing).
 * Only forward: side effects to verify. No meeting: the change cannot cause the end state — said, never turned into a contract.
 */
function causal(spine, { start = [], end = [], depth = 6 } = {}) {
  const wires = spine.wires.filter(w => w.kind !== 'reference');
  const uses = new Map(), usedBy = new Map(), missing = new Map();
  for (const w of wires) {
    if (!w.toPath) { if (!missing.has(w.fromPath)) missing.set(w.fromPath, []); missing.get(w.fromPath).push(w.spec); continue; }
    if (w.fromPath === w.toPath) continue;
    if (!uses.has(w.fromPath)) uses.set(w.fromPath, new Set()); uses.get(w.fromPath).add(w.toPath);
    if (!usedBy.has(w.toPath)) usedBy.set(w.toPath, new Set()); usedBy.get(w.toPath).add(w.fromPath);
  }
  const reach = (from, next) => { const seen = new Map(from.map(p => [p, 0])); let q = [...from];
    for (let d = 1; d <= depth && q.length; d++) { const nq = []; for (const p of q) for (const n of next.get(p) || []) if (!seen.has(n)) { seen.set(n, d); nq.push(n); } q = nq; }
    return seen; };
  const B = reach(end, uses), F = reach(start, usedBy);
  const meet = [...B.keys()].filter(p => F.has(p));
  // the path in build order: a dependency before what uses it (among the meeting nodes)
  const inMeet = new Set(meet); const indeg = new Map(meet.map(p => [p, 0]));
  for (const p of meet) for (const n of usedBy.get(p) || []) if (inMeet.has(n)) indeg.set(n, indeg.get(n) + 1);
  const order = []; const q = meet.filter(p => !indeg.get(p)).sort();
  while (q.length) { const p = q.shift(); order.push(p); for (const n of [...(usedBy.get(p) || [])].sort()) if (inMeet.has(n)) { indeg.set(n, indeg.get(n) - 1); if (!indeg.get(n)) q.push(n); } }
  for (const p of meet) if (!order.includes(p)) order.push(p);   // a cycle: kept, after the rest
  const preconditions = [...B.keys()].filter(p => !F.has(p)).map(p => ({ path: p, holds: !missing.has(p), missing: missing.get(p) || [] }));
  const sideEffects = [...F.keys()].filter(p => !B.has(p));
  return { meets: meet.length > 0 && meet.some(p => end.includes(p) || B.has(p)) && meet.some(p => start.includes(p) || F.has(p)), path: meet, order, preconditions, sideEffects, start, end };
}

/** endOf(spine, files, doneWhen) — the components and tests the end state names (its words, scored as the intent's are) */
function endOf(spine, files, doneWhen) {
  const ii = readIntent(doneWhen || ''); if (!ii.words.length) return [];
  const s = score(spine, files, { ...ii, verb: 'test' });
  if (!s.length) return [];
  const top = s[0].score;
  return s.filter(x => x.score >= Math.max(2, top * 0.5)).slice(0, 6).map(x => x.path);
}

/**
 * run({ text, files, project, answers }) — the whole flow. answers: { <gapId>: value }. A gap is blocking when the contract cannot be
 * written without it (which part of the project, which of two, when it is done); the rest are said and kept in the contract's gaps.
 */
function run({ text, files = [], project = 'project', answers = {}, spine = null, limit = 5 } = {}) {
  const intent = readIntent(text);
  if (!intent.text) return { ok: false, error: 'say what you want — the flow starts from your words' };
  const stages = [];
  stages.push({ id: 'intent', say: `${intent.verb}: ${intent.words.join(', ') || '(no words it can search)'}${intent.paths.length ? ` · names ${intent.paths.join(', ')}` : ''}` });
  const sp = spine || S.scan({ files, project });
  const paths = new Set(files.map(f => String(f.path).replace(/\\/g, '/')));
  // 0.60.287 FA11 — the start is what he changes, not the end he wants: the words of the "so …" clause choose the end, not the start
  const startIntent = intent.doneClause ? { ...intent, words: (() => { const w = readIntent(intent.text.slice(0, intent.text.length - intent.doneClause.length)).words; return w.length ? w : intent.words; })() } : intent;
  let scored = score(sp, files, startIntent);
  const gaps = [];
  // a path named that is not in the project
  for (const p of intent.paths) if (![...paths].some(x => x === p || x.endsWith(`/${p}`))) gaps.push({ id: `missing:${p}`, blocking: false, question: `"${p}" is not in the project — create it, or did you mean another file?`, options: ['create it', ...scored.slice(0, 3).map(s => s.path)] });
  // words found nowhere
  const unfound = intent.words.filter(w => !scored.some(s => s.why.some(y => y.startsWith(`${w} `))));
  if (unfound.length && unfound.length < intent.words.length) gaps.push({ id: 'unknown-words', blocking: false, question: `Nothing in the project mentions ${unfound.map(w => `"${w}"`).join(', ')} — new, or called something else here?`, options: ['new — build it', 'it is called something else (say what)'] });
  // which part of the project: chosen by answer, else the top scores; two tied at the top → ask
  let chosen = [];
  if (answers.where) chosen = String(answers.where).split(',').map(s => s.trim()).filter(p => paths.has(p));
  if (!chosen.length) {
    if (!scored.length) gaps.push({ id: 'where', blocking: true, question: 'Which part of the project is this about? (a file or folder)', options: sp.components.slice(0, 12).map(c => c.path) });
    else {
      const top = scored[0].score; const tied = scored.filter(s => s.score === top);
      if (tied.length > 1 && !intent.paths.length && top < 6) gaps.push({ id: 'where', blocking: true, question: `${tied.length} parts match equally — which is it?`, options: tied.slice(0, 8).map(s => s.path) });
      else chosen = scored.filter(s => s.score >= Math.max(2, top * 0.5)).slice(0, limit).map(s => s.path);   // a path match (3) stays beside a text-heavy one (6)
    }
  }
  stages.push({ id: 'context-needed', say: chosen.length ? `${chosen.length} component(s): ${chosen.join(', ')}` : scored.length ? 'waiting on which part — see the gaps' : 'nothing matched' });
  // 0.60.287 FA11 — when the end state is known (his done-when, or the "so …" clause of what he typed), the DAG is chained from both ends
  const endText = answers['done-when'] || intent.doneClause || null;
  const end = endText && chosen.length ? endOf(sp, files, endText) : [];
  let dag = dagOf(sp, chosen); let chain = null;
  if (end.length) {
    chain = causal(sp, { start: chosen, end });
    if (chain.meets) {
      const role = (p) => (chosen.includes(p) ? 'change' : 'carry');
      const nodes = [...chain.order.map(p => ({ path: p, role: role(p) })), ...chain.sideEffects.filter(p => !chain.order.includes(p)).map(p => ({ path: p, role: 'used-by' }))];
      const keys = new Set(nodes.map(n => n.path));
      dag = { nodes, order: nodes.map(n => n.path), cycles: [], causal: true,
        edges: sp.wires.filter(w => w.toPath && w.kind !== 'reference' && keys.has(w.fromPath) && keys.has(w.toPath) && w.fromPath !== w.toPath).map(w => ({ from: w.toPath, to: w.fromPath })) };
    } else {
      // answered (he said how the end is reached): the end nodes join the work as changes, so the contract carries both sides
      if (answers.disconnected != null) for (const p of end) if (!dag.order.includes(p)) { dag.nodes.push({ path: p, role: 'change' }); dag.order.push(p); }
      gaps.push({ id: 'disconnected', blocking: true, question: `Changing ${chosen.join(', ')} cannot reach ${end.join(', ')} (the end you named) — nothing on one side leads to the other. Which is it?`,
        options: [`the end is elsewhere — name the file`, `wire it: ${chosen[0]} must reach ${end[0]}`, 'change the end too'] });
    }
    for (const pc of chain.preconditions.filter(x => !x.holds)) gaps.push({ id: `precondition:${pc.path}`, blocking: false, question: `${pc.path} is needed for the end state but reaches nothing for ${pc.missing.join(', ')} — build that too?`, options: ['yes, build it', 'no, it is outside'] });
  }
  stages.push({ id: 'dag', say: (chain ? (chain.meets ? `both ways: back from ${chain.end.join(', ')}, forward from ${chain.start.join(', ')} — they meet; ` : `both ways: back from ${chain.end.join(', ')} and forward from ${chain.start.join(', ')} do NOT meet; `) : end.length || !chosen.length ? '' : 'forward only (no end state yet); ')
    + (dag.order.length ? `${dag.order.length} node(s) in order: ${dag.order.join(' → ')}${dag.cycles.length ? ` (a cycle broken at ${dag.cycles.join(', ')})` : ''}` : 'no graph yet') });
  const byPath = new Map(files.map(f => [String(f.path).replace(/\\/g, '/'), f]));
  const found = dag.nodes.map(n => ({ path: n.path, role: n.role, lines: linesFor((byPath.get(n.path) || {}).content, intent.words) }));
  stages.push({ id: 'context-found', say: `${found.reduce((n, f) => n + f.lines.length, 0)} line(s) across ${found.filter(f => f.lines.length).length} file(s)` });
  // tests near the change, and done-when
  const tests = [...paths].filter(p => TEST_RE.test(p) && chosen.some(c => { const b = path.posix.basename(c).replace(/\.[^.]+$/, ''); return p.includes(b); }));
  if (chosen.length && !tests.length) gaps.push({ id: 'test', blocking: false, question: 'No test touches these files — how should the change be proven?', options: ['write a new test', 'an existing command (say which)', 'I will check it by hand'] });
  if (!intent.doneWhen) gaps.push({ id: 'done-when', blocking: true, question: 'How will you know it is done? (what you will see, or the test that passes)', options: ['the tests pass', 'it shows on the screen', 'a command returns the right answer'] });
  for (const g of gaps) if (answers[g.id] != null && answers[g.id] !== '') { g.answer = String(answers[g.id]); g.blocking = false; }
  const blockedBy = gaps.filter(g => g.blocking && g.answer == null).map(g => g.id);
  stages.push({ id: 'gaps', say: gaps.length ? `${gaps.length} question(s)${blockedBy.length ? `, ${blockedBy.length} needed before the contract` : ', none blocking'}` : 'none — the project answered everything' });
  let contract = null;
  if (!blockedBy.length && chosen.length) {
    const id = `${_slug(project, 20)}.${intent.verb}-${_slug(intent.words.slice(0, 4).join('-'), 30)}`;
    const refs = {}; dag.order.forEach((p, i) => { refs[`f${i + 1}`] = { path: p, role: dag.nodes[i].role }; });
    const refOf = (p) => Object.keys(refs).find(k => refs[k].path === p);
    const changing = dag.nodes.filter(n => n.role !== 'used-by');   // change and carry (FA11: a node on the causal path carries the change to the end)
    const gates = [{ id: 'context', type: 'context', depends_on: [], requires: Object.keys(refs), pass_when: [{ evidence: 'context_reviewed' }] }];
    const gid = (p) => `build-${_slug(p.replace(/\.[^.]+$/, ''), 36)}`;
    for (const n of changing) {
      const deps = dag.edges.filter(e => e.to === n.path && changing.some(c => c.path === e.from)).map(e => gid(e.from));
      gates.push({ id: gid(n.path), type: 'task', depends_on: ['context', ...deps], requires: [refOf(n.path)], actions: [{ do: n.role === 'change' ? intent.verb : n.role === 'carry' ? 'carry-to-end' : 'keep-compatible', path: n.path }], pass_when: [{ evidence: `changed:${n.path}` }] });
    }
    const users = dag.nodes.filter(n => n.role === 'used-by').map(n => refOf(n.path));
    gates.push({ id: 'verify', type: 'verification', depends_on: gates.filter(g => g.type === 'task').map(g => g.id), requires: users, pass_when: [{ evidence: 'tests_pass' }],
      ...(tests.length ? { tests } : {}), done_when: answers['done-when'] || (intent.doneWhen ? intent.text : null) });
    contract = { v: 2, uuid: id, status: 'draft', intention: intent.verb === 'explain' ? 'research' : 'build',
      outcome: { what: intent.text, why: answers.why || null, done_when: [{ gate: 'verify' }] },
      refs, invariants: ['every file a gate changes is named in refs', 'the used-by files keep working (verify reads them)'],
      gaps: gaps.map(g => ({ id: g.id, question: g.question, answer: g.answer || null, blocks: [] })),
      gates, failure: { retry_limit: 3 }, state: { gates: {}, evidence: {} },
      source: { by: 'lib/intent-flow.js', version: VERSION, stages: STAGES } };
  }
  stages.push({ id: 'contract', say: contract ? `${contract.uuid}: ${contract.gates.length} gate(s) — context → ${contract.gates.filter(g => g.type === 'task').length} build → verify` : blockedBy.length ? `waiting on: ${blockedBy.join(', ')}` : 'no part of the project chosen' });
  return { ok: true, stages, intent, needed: { chosen, scored: scored.slice(0, 12) }, dag, causal: chain, end, found, gaps, contract, blockedBy };
}

module.exports = { MODULE_ID, VERSION, STAGES, readIntent, score, dagOf, causal, endOf, linesFor, run };
