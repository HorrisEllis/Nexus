'use strict';
/**
 * cortex/core/raid/contract-adapters.js — 0.60.18 EX0 — the agent and phase adapters for the contract scheduler.
 *
 * James (2026-10-13): "Yes. Build the agent and phase adapters next, then wire Idearium's phase build through the
 * contract scheduler... build and test the adapters independently first, then connect the phase-build action." ·
 * "Keep the existing tool registry as the execution boundary, avoid duplicating routing logic and make the first real
 * phase build produce an auditable record of every brick, dependency, checkpoint and gate."
 *
 * No new runner and no new router (docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec EX0):
 *   agentExecutor({ route, dispatch })  an executor for schedule()'s `agent` kind. route is lib/model-door.js route()
 *                                       by the brick's kind unless the caller passes its own (Idearium: its ladder);
 *                                       dispatch is the caller's existing runner (Idearium: climb + makeAttempt).
 *                                       The adapter adds only what was missing: each routed agent's learned budget
 *                                       (Boundaries) against the brick's packet, and the evidence of who ran it.
 *   fromPhasePlan(plan, opts)           an Idearium phase plan (lib/phase-plan.js parsePlan) → a v2 contract: a brick
 *                                       per file, the plan's import edges as depends_on, a parent `phase` gate that
 *                                       passes only on its integration (the phase's proof run).
 *   openCheckpoint(file, built)         resume a saved contract, or reject it (archived, §0.3) when the plan changed.
 *   audit(p)                            every brick, dependency, checkpoint and gate — the record of a build.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CG = require('./contract-gates.js');

const VERSION = '1.0.0';
const ROOT = path.join(__dirname, '../../..');

/** the door's route for a brick: providers in the order the door gives them (it learns per kind; reasoning kinds first) */
function doorRoute({ kind, packet }) {
  const door = require(path.join(ROOT, 'lib/model-door.js'));
  const msg = packet && packet.gate ? [...(packet.gate.actions || [])].join('\n').slice(0, 2000) : '';
  const r = door.route({ kind, message: msg }, { resolve: () => ({}) });
  return (r.route || []).map(h => ({ provider: h.provider, why: h.why || null }));
}

/**
 * agentExecutor({ route, dispatch, boundaries, sizeOf }) → fn(target, args, { gate, packet, contract, root })
 * Returns { ok, agent, evidence, output, error } — or { unsupported, why } when nothing can take the brick (no dispatcher,
 * no agent for its kind), or { decompose, why } when the brick is bigger than every routed agent has passed reliably.
 */
function agentExecutor({ route = doorRoute, dispatch = null, boundaries = CG.Boundaries, sizeOf = null } = {}) {
  return async (target, args, { gate, packet, contract = null, root = ROOT } = {}) => {
    if (typeof dispatch !== 'function') return { unsupported: true, why: 'no agent dispatcher is wired here' };
    const kind = gate.kind || 'agent:build';
    let hops;
    try { hops = (await route({ kind, gate, packet, target, args })) || []; }
    catch (e) { return { unsupported: true, why: `routing ${kind} failed: ${e.message}` }; }
    if (!hops.length) return { unsupported: true, why: `no agent is available for ${kind}` };
    const size = sizeOf ? sizeOf(gate, packet) : contract ? CG.packetTokens(contract, gate.id, { root }) : Math.ceil(JSON.stringify(packet || {}).length / 4);
    const fits = [], over = [];
    for (const h of hops) {
      let b = null; try { b = boundaries.budget(h.provider, kind); } catch (_) { b = null; }
      if (b && size > b) over.push({ ...h, budget: b }); else fits.push(h);
    }
    let overNote = over.length ? ` (over budget, skipped: ${over.map(h => `${h.provider} ~${h.budget}`).join(', ')})` : '';
    if (!fits.length) {
      // a budget is a prediction: a brick with pieces is split; one that is a single piece already goes to the agents
      // anyway, the largest learned budget first, and says so — escalation, never a silent block
      if ((gate.actions || []).length >= 2 && !(gate.children || []).length) return { decompose: true, why: `~${size} tokens; every routed agent passes reliably below that${overNote}` };
      fits.push(...over.sort((a, b2) => b2.budget - a.budget));
      overNote = ` (~${size} tokens is over every learned budget — ${over.map(h => `${h.provider} ~${h.budget}`).join(', ')} — and it is one piece, so tried anyway, largest first)`;
    }
    let out;
    try { out = await dispatch(fits, { gate, packet, kind, target, args, size }); }
    catch (e) { out = { ok: false, error: e.message }; }
    out = out || { ok: false, error: 'the dispatcher returned nothing' };
    if (out.unsupported) return { unsupported: true, why: out.why || 'the dispatcher could not run it' };
    const agent = out.agent || out.provider || fits[0].provider;
    const ok = out.ok !== false && !out.error;
    return { ok, agent, ...(out.transient ? { transient: true } : {}), ...(ok ? {} : { error: String(out.error || out.state || 'failed').slice(0, 500) }), output: out.output !== undefined ? out.output : (out.state || null),
      evidence: { [`${gate.id}.agent`]: agent, [`${gate.id}.route`]: `${fits.map(h => h.provider).join(' → ')}${overNote}`, ...(out.evidence || {}) } };
  };
}

const _id = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
const _ext = (p) => (String(p).match(/\.([a-z0-9]+)$/i) || [, 'txt'])[1].toLowerCase();

/** planHash(plan) — what a plan asks for (files, exports, imports, steps, order): a changed one rejects old checkpoints */
function planHash(plan) {
  const core = { order: plan.order || [], files: (plan.files || []).map(f => ({ path: f.path, exports: (f.exports || []).map(e => e.name), imports: f.imports || [], steps: f.steps || [], new: !!f.new })) };
  return crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0, 16);
}

/**
 * fromPhasePlan(plan, { id, phaseKey, title, intent, inputs, onDisk, root }) → { doc, payload } a v2 contract.
 *   inputs  [{ id, path, lines? }] the phase's own inputs (its phasemap): every brick requires them, so a change STALEs it
 *   onDisk  true when writes land on disk (not review proposals): each brick also needs { exists: <its file> }
 */
function fromPhasePlan(plan, { id = null, phaseKey = 'phase', title = '', intent = '', inputs = [], onDisk = false, root = ROOT } = {}) {
  if (!plan || !Array.isArray(plan.files) || !plan.files.length) throw Object.assign(new Error('a phase plan with files is required'), { status: 400 });
  const PP = require(path.join(ROOT, 'lib/phase-plan.js'));
  const deps = PP.depsOf(plan);
  const brickOf = new Map((plan.order || plan.files.map(f => f.path)).map((p, i) => [p, `b${i + 1}.${_id(p.split('/').pop())}`]));
  for (const f of plan.files) if (!brickOf.has(f.path)) brickOf.set(f.path, `b${brickOf.size + 1}.${_id(f.path.split('/').pop())}`);
  const refs = {};
  for (const inp of inputs) if (inp && inp.id && inp.path) refs[_id(inp.id)] = { path: inp.path, ...(inp.lines ? { lines: inp.lines } : {}), note: inp.note || 'an input of the phase' };
  const shared = Object.keys(refs);
  const gates = [];
  for (const p of brickOf.keys()) {
    const f = plan.files.find(x => x.path === p);
    const gid = brickOf.get(p);
    const own = [];
    // a file the plan edits (not new) that is there now is this brick's input: changed under it → STALE
    if (!f.new && fs.existsSync(path.join(root, p))) { const rid = `src.${_id(p)}`; refs[rid] = { path: p, ...(f.component ? { component: f.component } : {}), note: 'edited by this brick' }; own.push(rid); }
    gates.push({ id: gid, type: 'task', kind: `build:file.${_ext(p)}`, file: p,
      requirement: { phase: phaseKey, file: p, purpose: f.purpose || null, component: f.component || null, exports: (f.exports || []).map(e => e.name) },
      depends_on: (deps.get(p) || []).map(d => brickOf.get(d)).filter(Boolean),
      requires: [...shared, ...own], actions: (f.steps || []).length ? f.steps : [`write ${p}`],
      pass_when: [{ evidence: `${gid}.verified`, match: '^ok' }, ...(onDisk ? [{ exists: p }] : [])],
      run: { agent: p } });
  }
  const bricks = gates.map(g => g.id);
  gates.push({ id: 'phase', type: 'phase', kind: 'phase:integrate', children: bricks, depends_on: bricks, requires: [...shared],
    requirement: { phase: phaseKey, title, intent: intent || plan.intent || null },
    pass_when: [...bricks.map(b => ({ gate: b })), { evidence: 'phase.integrated', match: '^met' }],
    integration: 'phase.integrated', run: { integrate: phaseKey } });
  const cid = _id(id || `phase-${phaseKey}`);
  const payload = { v: 2, uuid: cid, status: 'draft', intention: 'build', plan_hash: planHash(plan),
    outcome: { what: title || `phase ${phaseKey}`, why: intent || plan.intent || '', done_when: [{ gate: 'phase' }] },
    refs, invariants: [], gaps: [], gates, failure: { retry_limit: 3 }, state: { gates: {}, evidence: {}, checkpoints: [] } };
  const problems = CG.validate(payload);
  if (problems.length) throw Object.assign(new Error(`the phase contract is not valid: ${problems.join('; ')}`), { status: 422, problems });
  const doc = require(path.join(ROOT, 'lib/node-export.js')).wrap('contract', cid, payload, { context: 'cortex/core/raid/contract-adapters.js fromPhasePlan', tags: ['v2', 'phase-build'] });
  return { doc, payload: doc.payload || payload };
}

/**
 * openCheckpoint(file, built, { root }) → { loaded, resumed, rejected?, kept[], stale[], reset[] }
 * Saved and the same plan → resumed: PASSED bricks kept (their inputs unchanged), changed inputs STALE, bricks that ran
 * out of retries given a fresh budget (their attempts kept in state.history). The plan changed → the saved contract is a
 * stale checkpoint: archived beside it, never deleted, and the build starts from `built`.
 */
function openCheckpoint(file, built, { root = ROOT } = {}) {
  if (!fs.existsSync(file)) return { loaded: built, resumed: false, kept: [], stale: [], reset: [] };
  let old;
  try { old = CG.load(file); } catch (e) { old = null; }
  if (!old || old.payload.plan_hash !== built.payload.plan_hash) {
    const arch = `${file}.superseded-${Date.now()}`;
    fs.renameSync(file, arch);
    return { loaded: built, resumed: false, rejected: { why: old ? 'the plan changed since this checkpoint was saved' : 'the saved contract could not be read', archived: arch }, kept: [], stale: [], reset: [] };
  }
  const p = old.payload;
  const ev = CG.evaluate(p, { root });
  const reset = [];
  const limit = (p.failure && p.failure.retry_limit) || 3;
  for (const g of p.gates || []) {
    const st = p.state.gates[g.id] || {};
    if (st.status === 'FAILED' && (st.attempts || 0) >= limit) {
      p.state.history = p.state.history || [];
      p.state.history.push({ gate: g.id, status: st.status, attempts: st.attempts, reasons: st.reasons || [], at: st.at || null, closed: Date.now() });
      p.state.gates[g.id] = { ...st, status: 'READY', attempts: 0, reasons: ['a new build: a fresh retry budget (the old attempts are in state.history)'] };
      reset.push(g.id);
    }
  }
  return { loaded: old, resumed: true, kept: ev.gates.filter(g => g.status === 'PASSED').map(g => g.id), stale: ev.gates.filter(g => g.status === 'STALE').map(g => g.id), reset };
}

/** audit(p) → the record of a build: every brick, every dependency edge, every checkpoint, every gate, and what is blocked */
function audit(p, { root = ROOT } = {}) {
  const ev = CG.evaluate(p, { root });
  const st = (id) => (p.state.gates || {})[id] || {};
  const evd = p.state.evidence || {};
  const status = new Map(ev.gates.map(g => [g.id, g.status]));
  return {
    contract: p.uuid || null, plan_hash: p.plan_hash || null, complete: ev.complete, why: ev.why,
    bricks: (p.gates || []).filter(g => g.type !== 'phase').map(g => ({ id: g.id, file: g.file || null, kind: g.kind || g.type, status: status.get(g.id), agent: evd[`${g.id}.agent`] || null,
      attempts: st(g.id).attempts || 0, verified: evd[`${g.id}.verified`] || null, blocked: evd[`${g.id}.blocked`] || null, ...(g.parent ? { parent: g.parent } : {}) })),
    dependencies: (p.gates || []).flatMap(g => (g.depends_on || []).map(d => ({ from: d, to: g.id }))),
    checkpoints: p.state.checkpoints || [],
    gates: ev.gates.map(g => ({ id: g.id, type: g.type, status: g.status, reasons: g.reasons })),
    splits: p.splits || [], history: p.state.history || [],
  };
}

module.exports = { VERSION, doorRoute, agentExecutor, planHash, fromPhasePlan, openCheckpoint, audit };
