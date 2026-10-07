/**
 * foundation/intent.js
 * COMPARTMENT OS — a compartment's intent: its end state, the conditions it holds, the axioms it chooses by.
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 * UUID: cos-foundation-intent-v1-0000-2026-1007-jamesbrooks-001
 *
 * James (2026-10-07): "im saying to add that to cos. the conditions. like the intent of compartment is the end state."
 *
 * A compartment had a purpose (free text, never checked) and work phases EXPLORING → ACTING → VERIFYING, where
 * VERIFYING was "checking ACTING's real result" — against nothing defined. The intent is that definition:
 *
 *   purpose      what the compartment is, in words (unchanged)
 *   endState     the intent, checkable: how it is known the purpose is achieved. VERIFYING checks it.
 *   conditions   what must always hold while it works toward that end state.
 *   axioms       how it chooses between ways that are all within the conditions (e.g. "use the least amount of code
 *                with the highest leverage that achieves the end state"). Given to whatever acts inside it.
 *
 * Each check is { says, check: { kind, … } }:
 *   file      { path }          the file exists and is not empty (an empty placeholder proves nothing)
 *   command   { run, timeoutMs } the command exits 0, run in the compartment's root
 *   tests     { run, timeoutMs } the same, read as a test run
 *
 * NESTING — a child holds everything its parent holds and may add to it, never drop it: its conditions and axioms are
 * the parent's (inherited, marked so) followed by its own. Its end state is its own: a child serves part of the
 * parent's intent, and says which part.
 *
 * This is the one definition: idearium's charter.spec (lib/charter.js) is a repo's compartment intent, read with parse()
 * (with kinds widened to what idearium's proof runner can also check: page).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const KINDS = Object.freeze(['file', 'command', 'tests']);
const MAX_AXIOMS = 5;   // the same limit as the kernel's compartments: identity kept tight

const EMPTY_INTENT = Object.freeze({ endState: [], conditions: [], axioms: [] });

function _says(x) { return typeof x === 'string' ? x.trim() : x && typeof x.says === 'string' ? x.says.trim() : ''; }

/**
 * normalize(raw) -> { intent: { endState, conditions, axioms }, errors: [string] }
 * raw: { endState | end_state, conditions, axioms } — strings for axioms, { says, check } for the rest.
 */
function normalize(raw = {}, { kinds = KINDS } = {}) {
  const errors = [];
  const r = raw || {};
  const checks = (list, where) => (Array.isArray(list) ? list : []).map((x, i) => {
    const says = _says(x);
    if (!says) { errors.push(`${where}[${i}] says nothing`); return null; }
    const c = x && typeof x === 'object' ? x.check : null;
    if (!c || !c.kind) { errors.push(`${where}[${i}] "${says}" has no check — say how it is known (kind: ${kinds.join(' | ')})`); return null; }
    if (!kinds.includes(c.kind)) { errors.push(`${where}[${i}] "${says}": kind "${c.kind}" is not one of ${kinds.join(', ')}`); return null; }
    if (c.kind === 'file' && !c.path) { errors.push(`${where}[${i}] "${says}": a file check needs a path`); return null; }
    if ((c.kind === 'command' || c.kind === 'tests') && !c.run) { errors.push(`${where}[${i}] "${says}": a ${c.kind} check needs run`); return null; }
    return { says, check: { ...c }, ...(x.inherited ? { inherited: x.inherited } : {}) };
  }).filter(Boolean);
  const axioms = (Array.isArray(r.axioms) ? r.axioms : []).map(_says).filter(Boolean);
  if (axioms.length > MAX_AXIOMS) errors.push(`${axioms.length} axioms — a compartment takes at most ${MAX_AXIOMS}: keep its identity tight`);
  return { intent: { endState: checks(r.endState || r.end_state, 'endState'), conditions: checks(r.conditions, 'conditions'), axioms }, errors };
}

/** parse(yamlText) — a charter.spec / intent block as text → normalize(); YAML through js-yaml when present */
function parse(text, opts = {}) {
  if (!text || !String(text).trim()) return { intent: { ...EMPTY_INTENT }, errors: [], empty: true };
  let doc;
  try { doc = require('js-yaml').load(String(text)); }
  catch (e) { return { intent: { ...EMPTY_INTENT }, errors: [`the intent does not parse: ${String(e.message).split('\n')[0]}`], empty: true }; }
  const n = normalize((doc && (doc.charter || doc.intent || doc)) || {}, opts);
  return { ...n, empty: isEmpty(n.intent) };
}

function isEmpty(intent) { return !intent || (!(intent.endState || []).length && !(intent.conditions || []).length && !(intent.axioms || []).length); }

/**
 * inherit(child, parent) -> the child's effective intent: the parent's conditions and axioms first (marked inherited:
 * <parent name>), then the child's own; the child's end state alone. A child cannot drop what its parent holds.
 */
function inherit(child = EMPTY_INTENT, parent = null, parentName = 'parent') {
  if (!parent) return { endState: [...(child.endState || [])], conditions: [...(child.conditions || [])], axioms: [...(child.axioms || [])] };
  const pc = (parent.conditions || []).map(c => ({ ...c, inherited: c.inherited || parentName }));
  const own = (child.conditions || []).filter(c => !pc.some(p => p.says === c.says));
  const pa = parent.axioms || [];
  return { endState: [...(child.endState || [])], conditions: [...pc, ...own], axioms: [...pa, ...(child.axioms || []).filter(a => !pa.includes(a))] };
}

/** effective(comp, store) — a stored compartment's intent with every ancestor's conditions and axioms, nearest last */
function effective(comp, store) {
  const chain = [];
  const seen = new Set();
  let c = comp;
  while (c && !seen.has(c.id)) { seen.add(c.id); chain.unshift(c); c = c.parentId && store ? store.getCompartment(c.parentId) : null; }
  let acc = null, accName = null;
  for (const x of chain) { acc = inherit(x.intent || EMPTY_INTENT, acc, accName); accName = x.name; }
  return acc || { ...EMPTY_INTENT };
}

function _check(root, c) {
  const k = c.check;
  const t0 = Date.now();
  if (k.kind === 'file') {
    const abs = path.resolve(root, String(k.path));
    if (abs !== root && !abs.startsWith(root + path.sep)) return { says: c.says, met: false, evidence: `${k.path} is outside the compartment`, ms: 0 };
    let size = -1; try { size = fs.statSync(abs).size; } catch (_) {}
    return { says: c.says, met: size > 0, evidence: size < 0 ? `${k.path} does not exist` : size === 0 ? `${k.path} is empty` : `${k.path} (${size} bytes)`, ms: Date.now() - t0 };
  }
  const r = spawnSync(String(k.run), { cwd: root, shell: true, timeout: Math.min(Number(k.timeoutMs) || 60000, 300000), encoding: 'utf8', env: { ...process.env, CI: '1' } });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  const met = r.status === 0 && !r.error;
  return { says: c.says, met, evidence: r.error ? `${r.error.code === 'ETIMEDOUT' ? 'timed out' : r.error.message}` : `exit ${r.status}${out ? ` — ${out.slice(-300)}` : ''}`, ms: Date.now() - t0 };
}

/**
 * verify(intent, root) -> { met, total, endState: { met, total, results }, conditions: { met, total, results }, ok, ts }
 * The end state and the conditions, checked in root. ok: every condition holds (the end state may still be partway).
 */
function verify(intent, root) {
  const r = path.resolve(root || '.');
  const es = (intent.endState || []).map(c => _check(r, c));
  const cs = (intent.conditions || []).map(c => ({ ..._check(r, c), ...(c.inherited ? { inherited: c.inherited } : {}) }));
  const n = (xs) => xs.filter(x => x.met).length;
  return {
    endState: { met: n(es), total: es.length, results: es },
    conditions: { met: n(cs), total: cs.length, results: cs },
    met: n(es), total: es.length,
    ok: cs.every(x => x.met),
    reached: es.length > 0 && es.every(x => x.met) && cs.every(x => x.met),
    ts: Date.now(),
  };
}

/** brief(intent) — the intent in words, for whatever acts inside the compartment (an agent's request, a CLI line) */
function brief(intent, maxChars = 600) {
  if (isEmpty(intent)) return '';
  const lines = ['THE COMPARTMENT\'S INTENT — hold it in everything you do:'];
  if ((intent.endState || []).length) lines.push(`- the end state: ${intent.endState.map(e => e.says).join('; ')}`);
  for (const c of intent.conditions || []) lines.push(`- must always hold${c.inherited ? ` (from ${c.inherited})` : ''}: ${c.says}`);
  for (const a of intent.axioms || []) lines.push(`- axiom: ${a}`);
  const t = lines.join('\n');
  return t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t;
}

module.exports = { KINDS, MAX_AXIOMS, EMPTY_INTENT, normalize, parse, isEmpty, inherit, effective, verify, brief };
