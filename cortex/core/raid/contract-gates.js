'use strict';
/**
 * cortex/core/raid/contract-gates.js — 0.60.15 — .contract v2: an executable contract, gated step by step.
 *
 * James (2026-10-13): "each block in a .contract file(literally contract as the file extension.) using yaml file, each
 * gated as steps, each chunk or gap can be gated for the llm to need less context window." · his approval of the
 * design: "extend Nexus's existing .contract system and make it executable, rather than create another planning format
 * alongside it" — with four acceptance conditions (docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec CT0).
 *
 * Same file type and envelope as v1 (lib/node-export.js; v1 is contract-intake.js's BUILD_CONTRACT_SCHEMA). Every v2
 * field is optional: a v1 contract loads as v1 and is reported `legacy` — never evaluated as if it had gates.
 *
 *   payload (v2 additions):
 *     outcome      { what, why, done_when: [condition] }
 *     refs         { <id>: { path, hash?, lines?: [from,to], component?, note? } }   path relative to the repo root
 *     invariants   [{ id, says, check: condition }]                                 no check → unverified, never done
 *     gaps         [{ id, missing, inspected: [], blocks: [gateId], resolve_when: condition, resolved?: bool }]
 *     gates        [{ id, type: context|task|verification|phase, depends_on: [gateId], requires: [refId], actions: [],
 *                     pass_when: [condition], proof: [], optional?: bool, on_failure? }]
 *     completion   { gates: all_mandatory, gaps: blocking_resolved, invariants: verified }   (the defaults; fixed)
 *     failure      { retry_limit }
 *     state        { gates: { <id>: { status, evidence: [], hashes: {refId: sha}, at, attempts, reasons } }, evidence: {} }
 *
 *   A condition is machine-checkable or it can never pass:
 *     { test: <file> }                 node runs it; exit 0 passes (its output tail is the evidence)
 *     { exists: <path> }               the file is there
 *     { evidence: <key>, match? }      recorded evidence under that key (and, given, matching the regex)
 *     { gate: <id> }                   that gate is PASSED
 *     { check: CK-nnn, path? }         a catalogue check (lib/check-catalogue.js): the import checks run over a folder
 *                                      (lib/import-checks.js — CK-001, 002, 006, 008, 060), every other check by its
 *                                      runner (lib/checks/); a check with no runner is unverifiable, never a pass
 *   Anything else (a free sentence) is `unverifiable`: reported, never counted as proof.
 *
 *   Gate states: BLOCKED · READY · RUNNING · PASSED · FAILED · STALE. SKIPPED only for a gate marked optional by its
 *   own rule — a mandatory gate can never be skipped to look complete.
 *
 *   Invalidation: each PASSED gate keeps the hashes of the refs it required. A ref whose content hash changed makes
 *   those gates STALE, and through depends_on only the gates downstream of them — unrelated gates keep their result.
 *   A hash proves the content is that version, not that it is right; the checks prove that.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSION = '1.0.0';
const STATES = ['BLOCKED', 'READY', 'RUNNING', 'PASSED', 'FAILED', 'STALE', 'SKIPPED'];
const DEFAULT_ROOT = path.join(__dirname, '../../..');

function _ne() { return require(path.join(DEFAULT_ROOT, 'lib/node-export.js')); }
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** load(file) → { doc, payload, v, legacy } — any .contract, v1 or v2 */
function load(file) {
  const doc = _ne().importFromFile(file);
  if (doc.type !== 'contract') throw Object.assign(new Error(`${file} is a ${doc.type}, not a contract`), { status: 400 });
  const p = doc.payload || {};
  const v2 = p.v === 2 || Array.isArray(p.gates);
  return { doc, payload: p, v: v2 ? 2 : 1, legacy: !v2 };
}
/** save(file, loaded) — written back in the same envelope */
function save(file, { doc, payload }) {
  doc.payload = payload;
  fs.writeFileSync(file, _ne().toYaml(doc));
}

/** validate(payload) → [problems] — empty is valid. v1 payloads are validated as v1 (only that they are objects). */
function validate(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['payload is not an object'];
  if (!(p.v === 2 || Array.isArray(p.gates))) return errs;
  const refs = p.refs || {}, gates = p.gates || [], ids = new Set();
  if (!p.outcome || !p.outcome.what) errs.push('outcome.what is required: what must change');
  for (const g of gates) {
    if (!g.id) { errs.push('a gate has no id'); continue; }
    if (ids.has(g.id)) errs.push(`gate ${g.id} is defined twice`);
    ids.add(g.id);
    if (!['context', 'task', 'verification', 'phase'].includes(g.type)) errs.push(`gate ${g.id}: type must be context|task|verification|phase`);
    for (const r of g.requires || []) if (!refs[r]) errs.push(`gate ${g.id} requires ref "${r}", which is not in refs`);
    if (!(g.pass_when || []).length && !g.optional) errs.push(`gate ${g.id} has no pass_when: a mandatory gate needs conditions it can be proven against`);
  }
  for (const g of gates) for (const d of g.depends_on || []) if (!ids.has(d)) errs.push(`gate ${g.id} depends on "${d}", which is not a gate`);
  for (const g of gates) if ((g.children || []).length && !(g.pass_when || []).some(c => c && typeof c === 'object' && !c.gate)) errs.push(`gate ${g.id} is split but has no integration check — its children passing does not prove the whole`);
  // cycles
  const seen = new Map();
  const visit = (id, trail) => {
    if (seen.get(id) === 2) return; if (seen.get(id) === 1) { errs.push(`gates loop: ${[...trail, id].join(' → ')}`); return; }
    seen.set(id, 1); const g = gates.find(x => x.id === id); for (const d of (g && g.depends_on) || []) visit(d, [...trail, id]); seen.set(id, 2);
  };
  for (const g of gates) visit(g.id, []);
  for (const gp of p.gaps || []) for (const b of gp.blocks || []) if (!ids.has(b)) errs.push(`gap ${gp.id} blocks "${b}", which is not a gate`);
  return errs;
}

function _refHash(ref, root) {
  const fp = path.join(root, ref.path || '');
  if (!ref.path || !fs.existsSync(fp)) return null;
  let buf = fs.readFileSync(fp);
  if (Array.isArray(ref.lines)) buf = Buffer.from(buf.toString('utf8').split('\n').slice(ref.lines[0] - 1, ref.lines[1]).join('\n'));
  return sha(buf);
}

function _order(gates) {
  const out = [], done = new Set();
  const visit = (g) => { if (done.has(g.id)) return; done.add(g.id); for (const d of g.depends_on || []) { const x = gates.find(y => y.id === d); if (x) visit(x); } out.push(g); };
  gates.forEach(visit);
  return out;
}

/** checkCondition(cond, ctx) → { ok, verifiable, evidence, reason } */
function checkCondition(c, { root, state, runTest }) {
  if (!c || typeof c !== 'object') return { ok: false, verifiable: false, reason: `unverifiable: ${JSON.stringify(c)} names no check` };
  if (c.test) {
    const fp = path.join(root, c.test);
    if (!fs.existsSync(fp)) return { ok: false, verifiable: true, reason: `test ${c.test} does not exist` };
    const r = runTest(fp);
    return { ok: r.code === 0, verifiable: true, evidence: { test: c.test, exit: r.code, tail: r.tail }, reason: r.code === 0 ? null : `test ${c.test} exited ${r.code}` };
  }
  if (c.exists) { const ok = fs.existsSync(path.join(root, c.exists)); return { ok, verifiable: true, evidence: ok ? { exists: c.exists } : null, reason: ok ? null : `${c.exists} does not exist` }; }
  if (c.evidence) {
    const v = state.evidence && state.evidence[c.evidence];
    if (v === undefined || v === null || v === '') return { ok: false, verifiable: true, reason: `no evidence recorded for "${c.evidence}"` };
    // §0.60.158 (gates solid, H5) — a match that is not a regex is the contract's mistake: said, never a throw out of check()
    let re = null; if (c.match) { try { re = new RegExp(c.match); } catch (e) { return { ok: false, verifiable: false, reason: `unverifiable: match /${c.match}/ is not a regular expression (${e.message})` }; } }
    if (re && !re.test(String(v))) return { ok: false, verifiable: true, reason: `evidence "${c.evidence}" does not match /${c.match}/` };
    return { ok: true, verifiable: true, evidence: { [c.evidence]: String(v).slice(0, 200) } };
  }
  if (c.gate) { const s = state.gates && state.gates[c.gate] && state.gates[c.gate].status; return { ok: s === 'PASSED', verifiable: true, evidence: s === 'PASSED' ? { gate: c.gate } : null, reason: s === 'PASSED' ? null : `gate ${c.gate} is ${s || 'not run'}` }; }
  if (c.check) {
    const id = String(c.check).toUpperCase();
    // §QA1 0.60.33 — every other check with a runner (lib/check-catalogue.js); without one it stays unverifiable — never a pass.
    // §0.60.158 (gates solid, H4) — which checks lib/import-checks.js runs is the catalogue's list, not a second one kept here:
    // this file named three of its five, so a condition { check: CK-006 } or CK-008 could never pass
    let CC = null; try { CC = require(path.join(DEFAULT_ROOT, 'lib/check-catalogue.js')); } catch (_) { CC = null; }
    if ((CC && CC.runnable(id) === 'import-checks') || ['CK-001', 'CK-002', 'CK-060'].includes(id)) return { ok: false, verifiable: true, async: true, check: id, dir: path.join(root, c.path || '.') };
    if (!CC || CC.runnable(id) !== 'runner') return { ok: false, verifiable: false, reason: `unverifiable: ${id} has no executable check here yet (lib/check-catalogue.js runners: ${CC ? CC.summary().runners.join(', ') : 'not loaded'}; lib/import-checks.js: CK-001, CK-002, CK-060)` };
    const r = CC.run(id, c, { root });
    return { ok: !!r.ok, verifiable: r.verifiable !== false, evidence: r.ok ? (r.evidence || { check: id }) : null, reason: r.ok ? null : r.reason };
  }
  return { ok: false, verifiable: false, reason: `unverifiable: ${JSON.stringify(c)} names no check` };
}

function _runTest(fp) {
  try {
    const out = execFileSync(process.execPath, [fp], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000, env: { ...process.env, NEXUS_TEST_SANDBOX: '1' } }).toString('utf8');
    return { code: 0, tail: out.trim().split('\n').slice(-2).join(' | ').slice(0, 300) };
  } catch (e) { return { code: e.status == null ? 1 : e.status, tail: String((e.stdout || '') + (e.stderr || '')).trim().split('\n').slice(-3).join(' | ').slice(0, 300) }; }
}

/**
 * evaluate(payload, { root }) → { legacy, valid, problems, gates: [{ id, status, reasons }], stale: [refId], complete, why }
 * Pure reading: sets each gate's status from the recorded state and the current file hashes; runs no gate's work.
 * Writes the statuses into payload.state (the caller saves).
 */
function evaluate(p, { root = DEFAULT_ROOT } = {}) {
  if (!(p.v === 2 || Array.isArray(p.gates))) return { legacy: true, valid: true, problems: [], gates: [], complete: null, why: 'a v1 contract: RAID runs it as before (no gates to evaluate)' };
  const problems = validate(p);
  p.state = p.state || {}; p.state.gates = p.state.gates || {}; p.state.evidence = p.state.evidence || {};
  const refs = p.refs || {}, gates = _order(p.gates || []);
  const now = {}; const staleRefs = [];
  for (const [id, r] of Object.entries(refs)) { now[id] = _refHash(r, root); }
  const status = {};
  for (const g of gates) {
    const st = p.state.gates[g.id] || {};
    const reasons = [];
    const missing = (g.requires || []).filter(r => !now[r]);
    const changed = (g.requires || []).filter(r => st.hashes && st.hashes[r] && now[r] && st.hashes[r] !== now[r]);
    const upstream = (g.depends_on || []).filter(d => status[d] !== 'PASSED' && status[d] !== 'SKIPPED');
    const blockingGaps = (p.gaps || []).filter(x => !x.resolved && (x.blocks || []).includes(g.id));
    let s;
    if (st.status === 'STALE') {
      // stale is sticky: it was invalidated and has not been re-verified since — only check() clears it
      s = 'STALE'; reasons.push(...((st.reasons || []).length ? st.reasons : ['invalidated; re-verify']));
      changed.forEach(r => staleRefs.includes(r) || staleRefs.push(r));
    } else if (st.status === 'PASSED') {
      // §0.60.158 (gates solid, H2) — a ref this gate proved against and that is gone now is a change too: the pass was about
      // a file that no longer exists (before, `changed` needed the file to exist, so a deleted ref left the gate PASSED)
      const gone = (g.requires || []).filter(r => st.hashes && st.hashes[r] && !now[r]);
      if (gone.length) { s = 'STALE'; reasons.push(`gone since it passed: ${gone.join(', ')}`); gone.forEach(r => staleRefs.includes(r) || staleRefs.push(r)); }
      else if (changed.length) { s = 'STALE'; reasons.push(`changed since it passed: ${changed.join(', ')}`); changed.forEach(r => staleRefs.includes(r) || staleRefs.push(r)); }
      else if (upstream.length) { s = 'STALE'; reasons.push(`upstream is no longer passed: ${upstream.join(', ')}`); }
      else s = 'PASSED';
    } else if (missing.length) { s = 'BLOCKED'; reasons.push(`refs missing: ${missing.join(', ')}`); }
    else if (upstream.length) { s = 'BLOCKED'; reasons.push(`waits on: ${upstream.join(', ')}`); }
    else if (blockingGaps.length) { s = 'BLOCKED'; reasons.push(`gaps open: ${blockingGaps.map(x => x.id).join(', ')}`); }
    else if (st.status === 'FAILED') { s = 'FAILED'; reasons.push(...(st.reasons || [])); }
    else if (g.optional && st.status === 'SKIPPED') s = 'SKIPPED';
    else s = 'READY';
    status[g.id] = s;
    p.state.gates[g.id] = { ...st, status: s, reasons: reasons.length ? reasons : (s === 'PASSED' ? [] : st.reasons || []) };
  }
  const c = completion(p, status, { root });
  return { legacy: false, valid: !problems.length, problems, gates: gates.map(g => ({ id: g.id, type: g.type, status: status[g.id], reasons: p.state.gates[g.id].reasons || [] })), stale: staleRefs, complete: c.complete, why: c.why };
}

/**
 * holds(cond, …) — does a condition hold NOW, without running anything: a gate by its current status, a file or a piece of
 * evidence read directly. A test or a catalogue check is work, so it holds only as verifyOutcome() last recorded it.
 * §0.60.158 (gates solid) — James, 2026-10-18: "Need to get the gates solid." Three ways a contract read complete when it was
 * not: a done_when that was not a gate was never looked at (H1); an invariant stayed 'verified' after its gate went stale (H6);
 * and an invariant checked by anything but a gate could never be verified at all (H3).
 */
function _key(c) { return JSON.stringify(c); }
function holds(c, { p, status, root }) {
  if (!c || typeof c !== 'object') return { ok: false, why: `${JSON.stringify(c)} names no check — unverifiable` };
  if (c.gate) return status[c.gate] === 'PASSED' ? { ok: true } : { ok: false, why: `needs gate ${c.gate} (${status[c.gate] || 'not a gate'})` };
  if (c.exists || c.evidence) { const r = checkCondition(c, { root, state: p.state, runTest: () => ({ code: 1, tail: '' }) }); return r.ok ? { ok: true } : { ok: false, why: r.reason }; }
  if (c.test || c.check) {
    const v = p.state.verified && p.state.verified[_key(c)];
    return v && v.ok ? { ok: true } : { ok: false, why: v ? `${c.test || c.check} failed when last verified: ${v.reason || '?'}` : `${c.test || c.check} not verified yet (verifyOutcome runs it)` };
  }
  return { ok: false, why: `${JSON.stringify(c)} names no check — unverifiable` };
}

/** completion(payload, status, { root }) — derived only from gate results, gaps, invariants and the outcome; never declared */
function completion(p, status, { root = DEFAULT_ROOT } = {}) {
  const why = [];
  for (const g of p.gates || []) if (!g.optional && status[g.id] !== 'PASSED') why.push(`gate ${g.id} is ${status[g.id]}`);
  for (const x of p.gaps || []) if (!x.resolved && (x.blocks || []).length) why.push(`gap ${x.id} is open`);
  for (const inv of p.invariants || []) {
    if (!inv.check) { why.push(`invariant ${inv.id} has no check — unverified`); continue; }
    const h = holds(inv.check, { p, status, root });
    if (!h.ok) why.push(`invariant ${inv.id} not verified: ${h.why}`);
  }
  for (const d of (p.outcome && p.outcome.done_when) || []) {
    const h = holds(d, { p, status, root });
    if (!h.ok) why.push(`outcome condition not met: ${h.why}`);
  }
  return { complete: why.length === 0, why: why.length ? why : ['every mandatory gate passed against current inputs; no blocking gap; every invariant and outcome condition holds'] };
}

/**
 * verifyOutcome(payload, { root, runTest }) → { verified: [{ condition, ok, reason }] } — runs the tests and catalogue checks the
 * outcome and the invariants name (the work completion() will not do), and records each result in payload.state.verified.
 */
async function verifyOutcome(p, { root = DEFAULT_ROOT, runTest = _runTest } = {}) {
  p.state = p.state || {}; p.state.verified = p.state.verified || {};
  const conds = [...((p.outcome && p.outcome.done_when) || []), ...(p.invariants || []).map(i => i.check)].filter(c => c && typeof c === 'object' && (c.test || c.check));
  const out = [];
  for (const c of conds) {
    let r = checkCondition(c, { root, state: p.state, runTest });
    if (r.async) {
      const IC = require(path.join(DEFAULT_ROOT, 'lib/import-checks.js'));
      const res = await IC.run({ repo: null, dir: r.dir });
      const one = res.checks.find(x => x.id === r.check);
      r = { ok: !!(one && one.ok), reason: one && one.ok ? null : `${r.check} found ${one ? one.count : '?'}` };
    }
    p.state.verified[_key(c)] = { ok: !!r.ok, reason: r.ok ? null : (r.reason || 'failed'), at: Date.now() };
    out.push({ condition: c, ok: !!r.ok, reason: r.ok ? null : r.reason });
  }
  return { verified: out };
}

/**
 * check(payload, gateId, { root, runTest }) → { status, reasons, evidence } — verify one READY (or FAILED/STALE) gate now,
 * against real evidence, and record the result. Missing proof is never a pass.
 */
async function check(p, gateId, { root = DEFAULT_ROOT, runTest = _runTest, agent = null, learn = true } = {}) {
  const ev = evaluate(p, { root });
  const g = (p.gates || []).find(x => x.id === gateId);
  if (!g) throw Object.assign(new Error(`no gate ${gateId}`), { status: 404 });
  const cur = ev.gates.find(x => x.id === gateId);
  if (cur.status === 'BLOCKED') return { status: 'BLOCKED', reasons: cur.reasons, evidence: [] };
  const st = p.state.gates[gateId];
  const limit = (p.failure && p.failure.retry_limit) || 3;
  if ((st.attempts || 0) >= limit && st.status === 'FAILED') return { status: 'FAILED', reasons: [`retry limit ${limit} reached — escalate`, ...(st.reasons || [])], evidence: [] };
  const evidence = [], reasons = [];
  for (const c of g.pass_when || []) {
    let r = checkCondition(c, { root, state: p.state, runTest });
    if (r.async) {
      const IC = require(path.join(DEFAULT_ROOT, 'lib/import-checks.js'));
      const res = await IC.run({ repo: null, dir: r.dir });
      const one = res.checks.find(x => x.id === r.check);
      r = { ok: !!(one && one.ok), verifiable: true, evidence: one ? { check: r.check, count: one.count } : null, reason: one && one.ok ? null : `${r.check} found ${one ? one.count : '?'}` };
    }
    if (r.ok && r.evidence) evidence.push(r.evidence); else reasons.push(r.reason || 'failed');
  }
  const passed = reasons.length === 0 && evidence.length === (g.pass_when || []).length && evidence.length > 0;
  const hashes = {};
  for (const r of g.requires || []) hashes[r] = _refHash((p.refs || {})[r] || {}, root);
  p.state.gates[gateId] = { ...st, status: passed ? 'PASSED' : 'FAILED', evidence, reasons, hashes: passed ? hashes : st.hashes || {}, at: Date.now(), attempts: (st.attempts || 0) + 1 };
  // CT1 — every check is a lesson about boundaries: how big this gate's packet was, for which agent and kind of work
  if (learn) { try { Boundaries.record({ agent: agent || g.agent || null, kind: g.kind || g.type, tokens: packetTokens(p, gateId, { root }), ok: passed }); } catch (_) { /* learning is best-effort; the gate result stands */ } }
  for (const inv of p.invariants || []) {
    if (inv.check && inv.check.gate === gateId && passed) { p.state.invariants = p.state.invariants || {}; p.state.invariants[inv.id] = 'verified'; }
  }
  return { status: p.state.gates[gateId].status, reasons, evidence };
}

/**
 * packet(payload, gateId, { root, maxLines }) → the smallest context one gate needs: the outcome, the gate, the
 * invariants, its refs (line ranges resolved, whole files only as path + hash), the evidence of the gates it depends
 * on, the gaps that touch it. Nothing from unrelated gates.
 */
function packet(p, gateId, { root = DEFAULT_ROOT, maxLines = 60 } = {}) {
  const g = (p.gates || []).find(x => x.id === gateId);
  if (!g) throw Object.assign(new Error(`no gate ${gateId}`), { status: 404 });
  const refs = {};
  for (const id of g.requires || []) {
    const r = (p.refs || {})[id] || {};
    const fp = path.join(root, r.path || '');
    const out = { path: r.path, hash: _refHash(r, root) };
    if (Array.isArray(r.lines) && fs.existsSync(fp)) {
      out.lines = r.lines;
      out.excerpt = fs.readFileSync(fp, 'utf8').split('\n').slice(r.lines[0] - 1, Math.min(r.lines[1], r.lines[0] - 1 + maxLines)).join('\n');
    }
    if (r.component) out.component = r.component;
    if (r.note) out.note = r.note;
    refs[id] = out;
  }
  const upstream = {};
  for (const d of g.depends_on || []) { const s = (p.state && p.state.gates && p.state.gates[d]) || {}; upstream[d] = { status: s.status || 'not run', evidence: s.evidence || [] }; }
  return {
    contract: p.uuid || p.id || null, outcome: p.outcome || null,
    gate: { id: g.id, type: g.type, actions: g.actions || [], pass_when: g.pass_when || [], proof: g.proof || [], on_failure: g.on_failure || null },
    invariants: (p.invariants || []).map(i => ({ id: i.id, says: i.says })),
    refs, upstream,
    gaps: (p.gaps || []).filter(x => (x.blocks || []).includes(g.id)).map(x => ({ id: x.id, missing: x.missing, resolved: !!x.resolved, resolve_when: x.resolve_when })),
  };
}

/** scaffold({ id, what, why }) → a new v2 contract envelope, ready to edit */
function scaffold({ id, what = '', why = '' } = {}) {
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw Object.assign(new Error('a contract id: letters, digits, . _ -'), { status: 400 });
  const payload = {
    v: 2, uuid: id, status: 'draft', intention: 'build',
    outcome: { what, why, done_when: [{ gate: 'verify' }] },
    refs: {}, invariants: [], gaps: [],
    gates: [
      { id: 'context', type: 'context', depends_on: [], requires: [], pass_when: [{ evidence: 'context_reviewed' }] },
      { id: 'build', type: 'task', depends_on: ['context'], requires: [], actions: [], pass_when: [{ evidence: 'change_made' }] },
      { id: 'verify', type: 'verification', depends_on: ['build'], requires: [], pass_when: [{ evidence: 'tests_pass' }] },
    ],
    failure: { retry_limit: 3 }, state: { gates: {}, evidence: {} },
  };
  return _ne().wrap('contract', id, payload, { context: 'cortex/core/raid/contract-gates.js v2 scaffold', tags: ['v2'] });
}

/** record(payload, key, value, { by }) — evidence recorded under a key (what an { evidence } condition reads); who and when kept */
function record(p, key, value, { by = null } = {}) {
  if (!key) throw Object.assign(new Error('an evidence key is required'), { status: 400 });
  p.state = p.state || {}; p.state.evidence = p.state.evidence || {}; p.state.evidence_log = p.state.evidence_log || [];
  p.state.evidence[key] = value;
  p.state.evidence_log.push({ key, value: String(value).slice(0, 300), by, at: Date.now() });
  return { key, value };
}

// ── CT1 — dynamic chunking ─────────────────────────────────────────────────────────────────────────────────────────
// James (2026-10-13): "everything can be broken down into smaller pieces, with gates between. dynamic chunking for smaller
// agents or if the agent is struggling?" · "like this is meant to be agent tools. like the chunking. for data ingestion
// … also learns better boundaries overtime, nuance, uses nexus to hold the complexity".

/** packetTokens(p, gateId) → a rough size of the gate's packet (chars / 4) — what an agent would have to hold */
function packetTokens(p, gateId, { root = DEFAULT_ROOT } = {}) {
  const pk = packet(p, gateId, { root, maxLines: 400 });
  let n = JSON.stringify(pk).length;
  for (const r of Object.values(pk.refs)) if (!r.excerpt && r.path) { try { n += fs.statSync(path.join(root, r.path)).size; } catch (_) {} }
  return Math.ceil(n / 4);
}

/** §BR2 — split one level deeper by units, within the depth bound; at the bound, or with no units, say it is indivisible
 *  (once). → { status: 'SPLIT' | 'INDIVISIBLE', reasons } | null */
function _splitDeeper(p, g, { maxDepth = 3, why = '' } = {}) {
  const d = depthOf(p, g);
  const units = unitsOf(g);
  if (units && d < maxDepth) {
    try { const kids = split(p, g.id, { by: 'units', units }); return { status: 'SPLIT', reasons: [`${why} — split into its own ${kids.length} steps (depth ${d + 1} of ${maxDepth})`, `into ${kids.join(', ')}`] }; }
    catch (e) { return { status: 'INDIVISIBLE', reasons: [e.message] }; }
  }
  const ev = (p.state.evidence || {});
  if (ev[`${g.id}.indivisible`]) return null;
  const reason = d >= maxDepth ? `at the depth bound (${maxDepth}) — not split further` : 'one step that cannot be split further';
  record(p, `${g.id}.indivisible`, reason, { by: 'scheduler:split' });
  return { status: 'INDIVISIBLE', reasons: [`${why} — ${reason}`] };
}

/** Boundaries — what Nexus learns about how big a piece each agent handles: one JAA row per check (agent, kind, size, ok) */
const Boundaries = {
  _db() { return require(path.join(DEFAULT_ROOT, 'cortex/memory/jaa-db.js')).jaaDB; },
  record({ agent, kind, tokens, ok }) { this._db().insert('contract_boundaries', { agent: agent || 'any', kind: kind || 'task', tokens: tokens || 0, ok: !!ok, at: Date.now() }); },
  /** budget(agent, kind) → the size this agent has passed reliably (the 75th percentile of its passes, capped below its first failure size), or null while untried */
  budget(agent, kind, { min = 3 } = {}) {
    const rows = this._db().query('contract_boundaries', r => r.agent === (agent || 'any') && (!kind || r.kind === kind), { limit: 5000 });
    const ok = rows.filter(r => r.ok).map(r => r.tokens).sort((a, b) => a - b);
    if (ok.length < min) return null;
    let b = ok[Math.floor((ok.length - 1) * 0.75)];
    const failedAbove = rows.filter(r => !r.ok && r.tokens > 0).map(r => r.tokens).sort((a, b2) => a - b2);
    if (failedAbove.length && failedAbove[0] <= b) b = Math.max(ok[0], Math.floor(failedAbove[0] * 0.8));
    return b;
  },
};

/**
 * shouldSplit(p, gateId, { agent, budget }) → { split, why } — too big for the agent (its learned budget, or the one
 * given), or it has failed twice. A gate with one ref and one action cannot be split further: said, not forced.
 */
function shouldSplit(p, gateId, { agent = null, budget = null, root = DEFAULT_ROOT } = {}) {
  const g = (p.gates || []).find(x => x.id === gateId);
  if (!g) throw Object.assign(new Error(`no gate ${gateId}`), { status: 404 });
  const st = (p.state && p.state.gates && p.state.gates[gateId]) || {};
  const pieces = Math.max((g.requires || []).length, (g.actions || []).length);
  if (pieces < 2) return { split: false, why: 'one ref and one action — already the smallest piece' };
  const size = packetTokens(p, gateId, { root });
  const b = budget || Boundaries.budget(agent, g.kind || g.type);
  if (b && size > b) return { split: true, why: `its packet is ~${size} tokens; ${agent || 'this agent'} passes reliably up to ~${b}`, size, budget: b };
  if (st.status === 'FAILED' && (st.attempts || 0) >= 2) return { split: true, why: `capability: failed ${st.attempts} times — smaller pieces`, size };
  // 0.60.17 — the reviewer's two more triggers: a gate whose completion cannot be verified as it stands, and a gate holding
  // separable work (several actions over several refs that need not wait on each other)
  const unverifiable = (g.pass_when || []).filter(c => !c || typeof c !== 'object').length;
  if (unverifiable && (g.actions || []).length >= 2) return { split: true, why: `verification: ${unverifiable} condition(s) cannot be checked as written — one verifiable piece per action`, size };
  if ((g.actions || []).length >= 3 && (g.requires || []).length >= 2) return { split: true, why: `dependency: ${(g.actions || []).length} actions over ${(g.requires || []).length} refs can progress independently`, size };
  return { split: false, why: b ? `~${size} tokens, within ~${b}` : `~${size} tokens; no learned budget yet`, size, budget: b };
}

/**
 * split(p, gateId, { by }) → the child gate ids. One child per ref (by 'requires') or per action ('actions'): each child
 * keeps the parent's dependencies, its own piece, the parent's conditions that concern that piece, and an evidence key
 * of its own. The parent becomes a phase that passes only when every child has — downstream gates are unchanged.
 * Recorded in p.splits (nothing lost); the parent's own conditions still have to hold.
 */
/**
 * §BR2 0.60.39 — recursion, bounded. A brick with one action can still hold several steps ("export x; document it; add a
 * test"): unitsOf() reads them out of the action's own text (sentences, ';', list items, 'then'). depthOf() counts its
 * splits so far; split(by 'units') goes one level deeper until the bound (schedule's depth, routing.contract_depth,
 * default 3). CK-247: a piece is never split into the same pieces it came from, and an indivisible piece says so.
 */
function unitsOf(g) {
  if (!g || (g.actions || []).length !== 1) return null;
  const parts = String(g.actions[0]).split(/(?:\.\s+(?=[A-Za-z])|;\s*|\n+\s*(?:[-*•]|\d+[.)])?\s*|\s+then\s+|,\s*then\s+)/i)
    .map(x => x.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '').replace(/^then\s+/i, '').replace(/\.$/, '')).filter(x => x.length >= 3);
  return parts.length >= 2 ? parts : null;
}
function depthOf(p, g) { let d = 0, cur = g; while (cur && cur.parent && d < 50) { d++; cur = (p.gates || []).find(x => x.id === cur.parent); } return d; }

function split(p, gateId, { by = null, units = null } = {}) {
  const g = (p.gates || []).find(x => x.id === gateId);
  if (!g) throw Object.assign(new Error(`no gate ${gateId}`), { status: 404 });
  if (g.children && g.children.length) throw Object.assign(new Error(`gate ${gateId} is already split into ${g.children.join(', ')}`), { status: 409 });
  const mode = by || ((g.requires || []).length >= (g.actions || []).length ? 'requires' : 'actions');
  let items = mode === 'requires' ? (g.requires || []) : mode === 'units' ? (units || unitsOf(g) || []) : (g.actions || []);
  if (mode === 'units') {
    // CK-247 — never the same pieces again: a split whose pieces are exactly its parent's (or its own) is refused
    const parent = g.parent ? (p.gates || []).find(x => x.id === g.parent) : null;
    const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => String(x).trim() === String(b[i]).trim());
    if (same(items, g.actions) || (parent && same(items, parent.actions))) throw Object.assign(new Error(`gate ${gateId}: its units are the pieces it already is — not split again (CK-247)`), { status: 409 });
  }
  if (items.length < 2) throw Object.assign(new Error(`gate ${gateId} has fewer than two ${mode} — nothing to split`), { status: 400 });
  const children = items.map((it, i) => {
    const id = `${gateId}.${i + 1}`;
    const refPath = mode === 'requires' ? ((p.refs || {})[it] || {}).path : null;
    const own = (g.pass_when || []).filter(c => c && typeof c === 'object' && refPath && (c.exists === refPath || c.test === refPath));
    return { id, type: 'task', parent: gateId, requirement: g.requirement || { gate: gateId, outcome: (p.outcome && p.outcome.what) || null, actions: g.actions || [] }, depends_on: [...(g.depends_on || [])],
      requires: mode === 'requires' ? [it] : [...(g.requires || [])], actions: mode === 'actions' || mode === 'units' ? [it] : (g.actions || []),
      pass_when: [...own, { evidence: `${id}.done` }], kind: g.kind || g.type, ...(g.run ? { run: g.run } : {}), ...(g.file ? { file: g.file } : {}) };
  });
  const at = p.gates.indexOf(g);
  p.gates.splice(at, 0, ...children);
  g.children = children.map(c => c.id);
  g.type = 'phase';
  g.depends_on = [...new Set([...(g.depends_on || []), ...g.children])];
  // the parent never passes merely because its children did: it keeps its own conditions, and when it has none that
  // prove the pieces fit together, an integration check is required (recorded evidence of the assembled result)
  const own = (g.pass_when || []).filter(c => !(c && c.evidence && /\.done$/.test(c.evidence)));
  const integration = own.filter(c => c && typeof c === 'object' && !c.gate);
  g.pass_when = [...g.children.map(id => ({ gate: id })), ...own, ...(integration.length ? [] : [{ evidence: `${gateId}.integrated` }])];
  g.integration = integration.length ? 'its own conditions' : `${gateId}.integrated`;
  p.splits = p.splits || [];
  p.splits.push({ gate: gateId, by: mode, into: g.children, at: Date.now() });
  if (p.state && p.state.gates && p.state.gates[gateId]) p.state.gates[gateId] = { ...p.state.gates[gateId], status: 'BLOCKED', reasons: [`split into ${g.children.join(', ')}`] };
  return g.children;
}

// ── SC0 — the scheduler ───────────────────────────────────────────────────────────────────────────────────────────
// Every READY brick with work to do runs — independent bricks at the same time — through the executors Nexus already has
/**
 * §GT1 2026-10-14 — gates classify before they learn (docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec GT1;
 * folds RQ2, RQ3, RQ4, RQ24). James: "each gate can route, diagnose, and retry". 0.60.18 showed that learning from an
 * unclassified failure poisons routing: a provider that timed out was learned as one that could not do the work.
 *
 * classifyFailure({ out, result }) → { cls, why } — out is what the executor returned, result what check() found.
 *   transient     the agent never really answered (timeout, empty, down, login, rate limit)  → retry, same agent, learn nothing
 *   context       the piece was too big for it (truncated, context / token limit)            → split; Boundaries learns
 *   capability    it answered and the work did not meet the gate (or it refused)             → next agent; the door's order learns
 *   spec          the gate's own condition cannot be checked (unverifiable, names a missing test) → a question, not a retry
 *   verification  the check itself broke (its runner did not run)                            → a question, not a retry
 *   tool          nothing here can run it (unsupported, failing tool calls)                   → blocked, said
 */
const FAILURE_CLASSES = Object.freeze(['transient', 'capability', 'context', 'spec', 'tool', 'verification']);
const LEARNS_ROUTE = new Set(['capability']);              // only these change the door's learned order
const LEARNS_BUDGET = new Set(['capability', 'context']);  // only these teach Boundaries (a size lesson)
function classifyFailure({ out = null, result = null } = {}) {
  const reasons = (result && result.reasons) || [];
  if (out && out.unsupported) return { cls: 'tool', why: out.why || 'nothing here can run it' };
  if (reasons.some(r => /^unverifiable:/.test(String(r)))) return { cls: 'spec', why: reasons.find(r => /^unverifiable:/.test(String(r))) };
  if (reasons.some(r => /^test .+ does not exist$/.test(String(r)))) return { cls: 'spec', why: reasons.find(r => /does not exist$/.test(String(r))) };
  if (reasons.some(r => /^test .+ exited (null|undefined|-?\d{3,})$/.test(String(r)) || /runner (crashed|failed)/i.test(String(r)))) return { cls: 'verification', why: reasons.join('; ') };
  const failedToRun = out && (out.ok === false || out.error);
  if (failedToRun) {
    if (out.transient) return { cls: 'transient', why: String(out.error || 'the agent did not answer').slice(0, 300) };
    let mode = 'unknown';
    try { mode = require(path.join(DEFAULT_ROOT, 'lib/pipeline-routing.js')).classify({ error: String(out.error || ''), ok: false, toolErrors: out.toolErrors }); } catch (_) { /* no classifier: the text rules below */ }
    const text = String(out.error || '');
    if (mode === 'tool-errors') return { cls: 'tool', why: text.slice(0, 300) };
    if (mode === 'truncated' || /context (length|window)|too (long|large|big)|token limit|maximum context/i.test(text)) return { cls: 'context', why: text.slice(0, 300) };
    if (['timeout', 'empty', 'provider-down', 'login', 'rate-limit'].includes(mode)) return { cls: 'transient', why: `${mode}: ${text.slice(0, 280)}` };
    return { cls: 'capability', why: text.slice(0, 300) || 'the agent failed the work' };
  }
  return { cls: 'capability', why: reasons.join('; ').slice(0, 300) || 'the work did not meet the gate' };
}

/**
 * §GS1 0.60.39 — compare(p, gateId, { root, diff }) → { gate, status, stale, reasons, passedAt, commit, diff } — the gate as
 * it is now against what passed: the evaluator's own reasons (a changed input makes it STALE), the commit it passed at,
 * and — given the caller's diff({ gate, from, files }) (Idearium: Versionium) — what changed in its files since.
 */
async function compare(p, gateId, { root = DEFAULT_ROOT, diff = null } = {}) {
  const g = (p.gates || []).find(x => x.id === gateId);
  if (!g) throw Object.assign(new Error(`no gate ${gateId}`), { status: 404 });
  const ev = evaluate(p, { root });
  const now = ev.gates.find(x => x.id === gateId) || {};
  const passedAt = [...(p.state.checkpoints || [])].reverse().find(c => c.gate === gateId) || null;
  const files = [...new Set([g.file, ...(g.requires || []).map(r => ((p.refs || {})[r] || {}).path)].filter(Boolean))];
  let d = null;
  if (diff && passedAt && passedAt.commit) { try { d = await diff({ gate: g, from: passedAt.commit, files }); } catch (e) { d = { error: e.message }; } }
  return { gate: gateId, status: now.status || null, stale: now.status === 'STALE', reasons: now.reasons || [], passedAt: passedAt ? passedAt.at : null,
    commit: passedAt ? passedAt.commit || null : null, files, diff: d };
}

// (lib/agent-tools executeTool: the copilot's tools, Clear Glass automation and macros, run-pipeline/run-chain, nexus.command);
// its output is recorded as evidence, its gate is checked, and the next round sees what became READY. Order is whatever
// the dependencies allow. A brick with no executor for its kind of work is left READY and said — never faked.
function _defaultExecutors() {
  return { tool: async (name, args) => require(path.join(DEFAULT_ROOT, 'lib/agent-tools/index.js')).executeTool(name, args || {}) };
}
// §GT1 — what each classified outcome writes: fault-taxonomy friction (the next route reads it) and, for a capability
// failure only, the door's learned order (a verdict: it never moves a breaker). Both best-effort, both injectable.
function _defaultLearners() {
  return {
    friction: (cls, meta) => { try { return require(path.join(DEFAULT_ROOT, 'cortex/self-heal/fault-taxonomy.js')).raiseFriction(`contract.${cls}`, cls === 'transient' ? 0 : 1, meta); } catch (_) { return null; } },
    door: (o) => { try { return require(path.join(DEFAULT_ROOT, 'lib/model-door.js')).outcome(o); } catch (_) { return null; } },
  };
}
/**
 * assess(p, gateId, { root, read, exportsOf }) — §GA1 0.60.44: before a brick spends an agent call, its gate checks with no
 * model (docs/2026-10-15-automatic-tracking-phasemap.spec GA1). James: "gates can asses if dependacies are being met or
 * if context is needed."
 *   deps     each upstream brick's exports as recorded when it passed (<id>.exports) still in its file now —
 *            not only "status PASSED". read(file) is the caller's view of the code (Idearium: the proposal overlay in
 *            review mode); a file it cannot read is said, never counted as unmet.
 *   context  the names this brick's planned imports take ('./a.js: x, y') that no dependency's code provides.
 * → { gate, ready, deps: [{ gate, file, missing, unreadable }], context: { needs: [names] }, why: [] }
 */
function _importNames(imports) {
  const out = [];
  for (const i of imports || []) { const m = String(i).match(/:\s*(.+)$/); if (m) for (const n of m[1].split(',')) { const k = n.trim(); if (/^[A-Za-z_$][\w$]*$/.test(k)) out.push(k); } }
  return out;
}
function assess(p, gateId, { root = DEFAULT_ROOT, read = null, exportsOf = null } = {}) {
  const g = (p.gates || []).find(x => x.id === gateId);
  if (!g) throw Object.assign(new Error(`no gate ${gateId}`), { status: 404 });
  const ev = (p.state && p.state.evidence) || {};
  const rd = read || ((f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return null; } });
  const exOf = exportsOf || ((code) => require(path.join(DEFAULT_ROOT, 'lib/phase-plan.js')).exportsOf(code));
  const deps = [], provided = new Set();
  for (const d of g.depends_on || []) {
    const dg = (p.gates || []).find(x => x.id === d);
    if (!dg || dg.type !== 'task' || !dg.file) continue;
    // what the dependency was SEEN to export when it passed (its recorded evidence) — never the plan's promise alone: a
    // brick passed by an executor that records no exports is not checked (said), rather than reopened on a guess
    let promised = null; try { promised = JSON.parse(ev[`${d}.exports`] || 'null'); } catch (_) {}
    if (!Array.isArray(promised)) { deps.push({ gate: d, file: dg.file, missing: [], unchecked: true }); continue; }
    let code = null; try { code = rd(dg.file); } catch (_) { code = null; }
    if (code == null) { deps.push({ gate: d, file: dg.file, missing: [], unreadable: true }); continue; }
    const have = new Set(exOf(code)); have.forEach(n => provided.add(n));
    deps.push({ gate: d, file: dg.file, missing: promised.filter(n => !have.has(n)) });
  }
  const unreadable = deps.some(x => x.unreadable || x.unchecked);
  const needs = unreadable ? [] : _importNames(g.requirement && g.requirement.imports).filter(n => !provided.has(n));
  const why = [...deps.filter(x => x.missing.length).map(x => `${x.gate}: ${x.file} no longer exports ${x.missing.join(', ')}`),
    ...(needs.length ? [`imports ${needs.join(', ')}, which no dependency provides`] : []),
    ...deps.filter(x => x.unreadable).map(x => `${x.gate}: ${x.file} could not be read — not checked`),
    ...deps.filter(x => x.unchecked).map(x => `${x.gate}: no exports were recorded when it passed — not checked`)];
  return { gate: gateId, ready: !deps.some(x => x.missing.length), deps, context: { needs }, why };
}

async function schedule(p, { root = DEFAULT_ROOT, executors = null, concurrency = 4, maxRounds = 50, onEvent = () => {}, onCheckpoint = () => {}, learners = null, versioning = null, depth = null, assessing = null } = {}) {
  const L = learners || _defaultLearners();
  const maxDepth = Number(depth || (p.policy && p.policy.depth) || 3);   // §BR2 — how deep a brick may split   // not `learn`: inside the loop that name is the per-attempt boolean
  const ex = executors || _defaultExecutors();
  const log = [];
  // 0.60.18 EX0a — James: "the scheduler must distinguish a failed task from a task that has no available executor. The
  // latter should be reported as blocked or unsupported, not repeatedly retried or incorrectly marked complete."
  const noExecutor = new Map();   // gate → why nothing here can run it: set aside, said, never retried in a loop, never FAILED
  const limit = (p.failure && p.failure.retry_limit) || 3;
  const aside = () => [...noExecutor].map(([id, why]) => ({ id, why, unsupported: true }));
  for (let round = 1; round <= maxRounds; round++) {
    const ev = evaluate(p, { root });
    // READY or STALE runs; a FAILED brick with work to do and retries left runs again (recovery)
    const ready = ev.gates.filter(g => g.status === 'READY' || g.status === 'STALE' || (g.status === 'FAILED' && ((p.state.gates[g.id] || {}).attempts || 0) < limit && (p.gates || []).find(x => x.id === g.id).run))
      .map(g => (p.gates || []).find(x => x.id === g.id));
    const runnable = ready.filter(g => !noExecutor.has(g.id) && (g.run || !(g.pass_when || []).some(c => c && c.evidence && !(p.state.evidence || {})[c.evidence])));
    if (!runnable.length) {
      return { rounds: round - 1, log, complete: ev.complete, why: ev.why, blocked: aside(),
        waiting: ready.filter(g => !runnable.includes(g) && !noExecutor.has(g.id)).map(g => ({ id: g.id, why: 'waits on evidence a person or agent records' })) };
    }
    for (let i = 0; i < runnable.length; i += concurrency) {
      await Promise.all(runnable.slice(i, i + concurrency).map(async (g) => {
        const before = (p.state.gates[g.id] || {}).status;
        // a brick failed twice that has pieces is split rather than run a third time the same way (capability trigger)
        if (before === 'FAILED' && !(g.children || []).length) {
          const sp = (g.actions || []).length >= 2 ? shouldSplit(p, g.id, { root }) : { split: false };
          if (sp.split) { const kids = split(p, g.id, { by: 'actions' }); log.push({ round, gate: g.id, status: 'SPLIT', reasons: [sp.why, `into ${kids.join(', ')}`] }); onEvent({ gate: g.id, status: 'SPLIT', round }); return; }
          // §BR2 — one action, failed twice: deeper, by the steps inside it, to the depth bound
          if ((st0 => (st0.attempts || 0) >= 2)(p.state.gates[g.id] || {})) {
            const deeper = _splitDeeper(p, g, { maxDepth, why: `capability: failed ${(p.state.gates[g.id] || {}).attempts} times` });
            if (deeper) { log.push({ round, gate: g.id, status: deeper.status, reasons: deeper.reasons }); onEvent({ gate: g.id, status: deeper.status, round }); if (deeper.status === 'SPLIT') return; }
          }
        }
        // §GA1 0.60.44 — the gate checks before it spends: a dependency whose promised export is gone is reopened (it re-runs;
        // this brick waits, no attempt used); names its imports need that nothing provides are said (NEEDS_CONTEXT) and
        // handed to the executor. A dependency is reopened at most retry_limit times, so a loop cannot form.
        let assessment = null;
        if (g.type === 'task' && (g.depends_on || []).length && !(g.children || []).length && assessing !== false) {
          try { assessment = assess(p, g.id, { root, ...(assessing || {}) }); } catch (e) { assessment = null; }
          if (assessment) {
            record(p, `${g.id}.assessed`, JSON.stringify({ ready: assessment.ready, why: assessment.why }).slice(0, 600), { by: 'scheduler:assess' });
            const reopen = assessment.deps.filter(x => x.missing.length && Number(((p.state.evidence || {})[`${x.gate}.reopened`]) || 0) < limit);
            if (reopen.length) {
              for (const x of reopen) {
                const n = Number(((p.state.evidence || {})[`${x.gate}.reopened`]) || 0) + 1;
                record(p, `${x.gate}.reopened`, String(n), { by: 'scheduler:assess' });
                p.state.gates[x.gate] = { ...(p.state.gates[x.gate] || {}), status: 'STALE', reasons: [`${x.file} no longer exports ${x.missing.join(', ')} — ${g.id} needs it (GA1)`] };
              }
              p.state.gates[g.id] = { ...(p.state.gates[g.id] || {}), status: before === 'RUNNING' ? 'READY' : (before || 'READY') };
              log.push({ round, gate: g.id, status: 'WAITING', reasons: assessment.why });
              onEvent({ gate: g.id, status: 'WAITING', round, waitOn: reopen.map(x => x.gate), why: assessment.why });
              return;
            }
            if (assessment.context.needs.length) {
              log.push({ round, gate: g.id, status: 'NEEDS_CONTEXT', reasons: assessment.why });
              onEvent({ gate: g.id, status: 'NEEDS_CONTEXT', round, needs: assessment.context.needs, why: assessment.why });
            }
          }
        }
        p.state.gates[g.id] = { ...(p.state.gates[g.id] || {}), status: 'RUNNING' };
        onEvent({ gate: g.id, status: 'RUNNING', round });
        let agent = null, learn = true, lastOut = null;
        if (g.run) {
          const kind = g.run.tool ? 'tool' : Object.keys(g.run)[0];
          const fn = ex[kind];
          const setAside = (why) => { p.state.gates[g.id].status = before && before !== 'RUNNING' ? before : 'READY'; noExecutor.set(g.id, why); record(p, `${g.id}.blocked`, why, { by: `scheduler:${kind}` }); log.push({ round, gate: g.id, status: 'BLOCKED', reasons: [why] }); onEvent({ gate: g.id, status: 'BLOCKED', round }); };
          if (!fn) { setAside(`no executor for ${kind} work`); return; }
          let out;
          try { out = await fn(g.run.tool || g.run[kind], g.run.args || {}, { gate: g, packet: packet(p, g.id, { root }), contract: p, root, ...(assessment ? { assessment } : {}) }); }
          catch (e) { out = { ok: false, error: e.message }; }
          lastOut = out;
          if (out && out.unsupported) { setAside(`unsupported: ${out.why || `nothing can run this ${kind} work`}`); return; }
          if (out && out.decompose) {
            // its pieces are its actions (a file brick's steps); refs it shares with every brick are not pieces of it
            if ((g.actions || []).length < 2 && !(g.children || []).length) {
              const deeper = _splitDeeper(p, g, { maxDepth, why: out.why || 'too big for the routed agents' });   // §BR2
              if (deeper && deeper.status === 'SPLIT') { log.push({ round, gate: g.id, status: 'SPLIT', reasons: deeper.reasons }); onEvent({ gate: g.id, status: 'SPLIT', round }); return; }
            }
            if ((g.actions || []).length >= 2 && !(g.children || []).length) { const kids = split(p, g.id, { by: 'actions' }); log.push({ round, gate: g.id, status: 'SPLIT', reasons: [out.why || 'too big for the routed agents', `into ${kids.join(', ')}`] }); onEvent({ gate: g.id, status: 'SPLIT', round }); return; }
            setAside(`unsupported: ${out.why || 'too big for every routed agent'} — and it is one piece already, so it cannot be split`); return;
          }
          const ok = out && out.ok !== false && !out.error;
          for (const [k, v] of Object.entries((out && typeof out === 'object' && out.evidence) || {})) if (v != null) record(p, k, typeof v === 'string' ? v : JSON.stringify(v), { by: `scheduler:${kind}` });
          record(p, `${g.id}.output`, typeof out === 'string' ? out.slice(0, 2000) : JSON.stringify(out && out.output !== undefined ? { ok, output: out.output, error: out.error } : out).slice(0, 2000), { by: `scheduler:${kind}` });
          if (ok) record(p, `${g.id}.done`, 'yes', { by: `scheduler:${kind}` });
          agent = (out && (out.agent || out.provider)) || null;
          // a transient failure (the provider never answered) says nothing about how big a piece the agent can hold
          if (out && out.transient) learn = false;
        }
        // §GT1 — check without learning; what is learned depends on the failure's class
        const r = await check(p, g.id, { root, agent, learn: false });
        let fc = null;
        if (r.status === 'PASSED') {
          if (learn) { try { Boundaries.record({ agent: agent || g.agent || null, kind: g.kind || g.type, tokens: packetTokens(p, g.id, { root }), ok: true }); } catch (_) {} }
        } else if (r.status === 'FAILED') {
          fc = classifyFailure({ out: lastOut, result: r });
          record(p, `${g.id}.class`, fc.cls, { by: 'scheduler:classify' });
          const st = p.state.gates[g.id];
          st.classes = [...(st.classes || []), fc.cls].slice(-10);
          // RQ3 — the retry carries the check's own words
          if (r.reasons && r.reasons.length) record(p, `${g.id}.feedback`, `${fc.cls}: ${r.reasons.join('; ')}`.slice(0, 1000), { by: 'scheduler:classify' });
          if (learn && LEARNS_BUDGET.has(fc.cls)) { try { Boundaries.record({ agent: agent || g.agent || null, kind: g.kind || g.type, tokens: packetTokens(p, g.id, { root }), ok: false }); } catch (_) {} }
          if (LEARNS_ROUTE.has(fc.cls) && agent) {
            // the next attempt skips this agent (escalate); the door's order learns it was not up to this kind of work
            let excl = []; try { excl = JSON.parse((p.state.evidence || {})[`${g.id}.exclude`] || "[]"); } catch (_) {}
            if (!excl.includes(agent)) record(p, `${g.id}.exclude`, JSON.stringify([...excl, agent]), { by: 'scheduler:classify' });
            try { L.door({ provider: agent, kind: g.kind || g.type, ok: false, class: 'capability', verdict: 'failed', error: fc.why }); } catch (_) {}
          }
          try { L.friction(fc.cls, { example: { gate: g.id, agent, why: fc.why } }); } catch (_) {}
          if (fc.cls === 'transient') {
            // nothing was learned and nothing was tried: a transient failure does not spend the brick's retries — up to
            // `limit` of them in a row, then it counts like any other (a provider that never answers is not retried forever)
            // §GT1a 0.60.35 — but an executor that already climbed every agent it had (out.exhausted: a ladder walked to its
            // end) DID try: refunding that attempt re-ran the whole climb up to `limit` more times for nothing
            st.transients = (st.transients || 0) + 1;
            if (st.transients <= limit && !(lastOut && lastOut.exhausted)) st.attempts = Math.max(0, (st.attempts || 1) - 1);
          } else if (fc.cls === 'spec' || fc.cls === 'verification' || fc.cls === 'tool') {
            // the gate itself (or its runner, or its tool) is suspect: a question for a person, never a retry loop
            const q = `${fc.cls}: ${fc.why}`;
            noExecutor.set(g.id, q); record(p, `${g.id}.question`, q, { by: 'scheduler:classify' });
          } else if (fc.cls === 'context' && (g.actions || []).length >= 2 && !(g.children || []).length) {
            const kids = split(p, g.id, { by: 'actions' });
            log.push({ round, gate: g.id, status: 'SPLIT', reasons: [`context: ${fc.why}`, `into ${kids.join(', ')}`] });
          } else if (fc.cls === 'context' && !(g.children || []).length) {
            const deeper = _splitDeeper(p, g, { maxDepth, why: `context: ${fc.why}` });   // §BR2
            if (deeper) log.push({ round, gate: g.id, status: deeper.status, reasons: deeper.reasons });
          }
        }
        let commit = null;
        log.push({ round, gate: g.id, status: r.status, reasons: r.reasons, ...(agent ? { agent } : {}), ...(fc ? { class: fc.cls } : {}) });
        if (r.status === 'PASSED') {
          // every pass is a checkpoint: what was verified, against which input hashes, by whom — the caller saves it
          // §GS1 — and the Versionium commit it passed at (versioning.commit), so it can be rewound to and compared against
          if (versioning && typeof versioning.commit === 'function') { try { commit = await versioning.commit({ gate: g, contract: p }); } catch (_) { commit = null; } }
          if (commit) record(p, `${g.id}.commit`, String(commit), { by: 'scheduler:versioning' });
          p.state.checkpoints = p.state.checkpoints || [];
          p.state.checkpoints.push({ gate: g.id, at: Date.now(), hashes: (p.state.gates[g.id] || {}).hashes || {}, ...(agent ? { agent } : {}), ...(commit ? { commit } : {}) });
          try { onCheckpoint(p, g.id); } catch (_) { /* the caller's save failing never fails the brick; it is in memory */ }
        }
        // §GT2 0.60.42 — the move carries what the caller tracks: the file, the agent, the failure class, the commit it passed at
        onEvent({ gate: g.id, status: r.status, round, file: g.file || null, ...(agent ? { agent } : {}), ...(fc ? { class: fc.cls } : {}), ...(commit ? { commit } : {}) });
        // §QA2 0.60.43 — after the failure is said, not before: the record reads fail → rewind → retry, the order it happened.
        // §GS1 0.60.39 — a brick that failed (and will be tried again) is put back to its last good state first: the commit
        // its gate last passed at, else the build's own snapshot (p.state.baseCommit). The retry starts from known-good, not
        // from the failed attempt's half-write. Only for a failure that wrote (not transient: it never answered; not a
        // question: nothing will retry it). versioning.rewind is the caller's (Idearium: Versionium restore-file / the
        // brick's pending proposals set aside).
        if (r.status === 'FAILED' && fc && !['transient', 'spec', 'verification', 'tool'].includes(fc.cls) && versioning && typeof versioning.rewind === 'function') {
          const passedAt = [...(p.state.checkpoints || [])].reverse().find(c => c.gate === g.id && c.commit);
          const toCommit = (passedAt && passedAt.commit) || (p.state.baseCommit || null);
          let rw = null;
          try { rw = await versioning.rewind({ gate: g, toCommit, contract: p }); } catch (e) { rw = { ok: false, why: e.message }; }
          if (rw) {
            record(p, `${g.id}.rewound`, JSON.stringify({ to: toCommit, ok: rw.ok !== false, files: rw.files || [], why: rw.why || null }).slice(0, 1000), { by: 'scheduler:rewind' });
            log.push({ round, gate: g.id, status: 'REWOUND', reasons: [rw.ok !== false ? `back to ${toCommit || 'the build snapshot'}${(rw.files || []).length ? ` — ${rw.files.join(', ')}` : ''}` : `not rewound: ${rw.why || 'no answer'}`] });
            onEvent({ gate: g.id, status: 'REWOUND', round, to: toCommit, ok: rw.ok !== false, files: rw.files || [] });
          }
        }
      }));
    }
    // a gate that failed and has no retries left stops the loop from spinning on it
    const stuck = (p.gates || []).filter(g => { const s = p.state.gates[g.id] || {}; return s.status === 'FAILED' && (s.attempts || 0) >= limit; });
    const e1 = evaluate(p, { root });
    const more = e1.gates.some(g => (g.status === 'READY' || g.status === 'STALE') && !noExecutor.has(g.id));
    if (stuck.length && !more) return { rounds: round, log, complete: e1.complete, why: e1.why, failed: stuck.map(g => g.id), blocked: aside() };
  }
  const e3 = evaluate(p, { root });
  return { rounds: maxRounds, log, complete: e3.complete, why: e3.why, blocked: aside() };
}

module.exports = { VERSION, STATES, load, save, validate, evaluate, completion, holds, verifyOutcome, check, packet, scaffold, record, checkCondition, compare, unitsOf, depthOf,
  packetTokens, Boundaries, shouldSplit, split, schedule, assess, classifyFailure, FAILURE_CLASSES };
