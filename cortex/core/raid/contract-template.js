'use strict';
/**
 * cortex/core/raid/contract-template.js — RD9 slice b: an input to RAID becomes a contract, filled from one template.
 * Map: docs/2026-10-13-projects-raid-and-gates-phasemap.spec RD9 (expanded 2026-11-14).
 * James, 2026-11-14: "input -> raid uses agent and contract tool with the schema or template listing the system, agent, what hat if
 * applicaple, capability/command, the data from the compartment whether the contents of a file, zip or context synthesized from a dag,
 * tags, dag to determin the conditions, etc. contract as the end state." · "yes built it"
 *
 *   TEMPLATE                          the fields, each with what fills it and whether it is required
 *   fill(t, { root }) → { ok, payload, gaps, problems }
 *       t = { input, system, agent: { name, why }, hat, capability, command, data: [item], tags: [], dag: [node], outcome: { what, why } }
 *       data item: { kind: 'file', path } · { kind: 'zip', path, entries? } · { kind: 'context', source, id, excerpt, hash? }
 *       dag node:  { id, needs: [ids], type?: 'task'|'verification'|'context'|'phase', pass_when?: [condition], does? }
 *   draft(inputNode, decision, extras, { root }) → fill() of what RAID knows from a .input node and its own decision
 *
 * The payload is RAID's executable contract, v2 (contract-gates.js: outcome, refs, gates, gaps, invariants), with the older B1 fields
 * mapped in (forAgent, intention, system, endState, conditions), so either reader finds what it knows. The DAG is the conditions: every
 * DAG node is a gate, and outcome.done_when is each gate PASSED. A required field that cannot be filled is a gap (it blocks the first
 * gate, `template`) and is put to him; it is never guessed. Data is referenced, never copied: each file or zip by its path and hash, each
 * piece of context by its source and hash (RQ7's evidence shape: the original stays the authority).
 *
 * JavaScript, said: Cortex's RAID is JavaScript and no Emerge port of RAID is mapped; this joins it and leaves with it.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..', '..');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// RQ21's closed grammar, plus system: and hat: and input: (his list)
const TAG = /^(request|phase|gate|outcome|rung|kind|system|hat|input):[\w.:/-]+$/;

const TEMPLATE = Object.freeze([
  { field: 'system', required: true, filledBy: 'the system that owns the work (its own registry, SW1); RAID reads it from the command, else asks' },
  { field: 'agent', required: true, filledBy: 'the agent RAID picks, with its reason (PC16)' },
  { field: 'hat', required: false, filledBy: 'the persona any agent can wear, when one applies (.hat)' },
  { field: 'capability', required: false, filledBy: 'what the system can do, as its registry names it' },
  { field: 'command', required: false, filledBy: 'the .command node invoked (a route or a CLI verb); a capability or a command is required' },
  { field: 'data', required: false, filledBy: 'from the compartment: a file (path, hash), a zip (path, hash, entries), or context synthesized from the DAG (source, hash)' },
  { field: 'tags', required: false, filledBy: 'request: phase: gate: outcome: rung: kind: system: hat: input:' },
  { field: 'dag', required: true, filledBy: 'what must be known or done first; each node is a gate, so the DAG is the conditions' },
  { field: 'outcome', required: true, filledBy: 'the end state: what must be true when it is done' },
]);

const slug = (s) => String(s).replace(/[^\w.-]/g, '_').slice(0, 80);

function _refs(data, root, problems) {
  const refs = {}, gaps = [];
  (data || []).forEach((d, i) => {
    const id = `data-${i + 1}`;
    if (!d || !['file', 'zip', 'context'].includes(d.kind)) { problems.push(`data ${i + 1}: kind is file, zip or context`); return; }
    if (d.kind === 'context') {
      if (!d.source) { problems.push(`data ${i + 1}: context needs its source`); return; }
      const hash = d.hash || (d.excerpt != null ? sha(Buffer.from(String(d.excerpt))) : null);
      refs[id] = { path: String(d.source), ...(hash ? { hash } : {}), note: `context${d.id ? ' ' + d.id : ''}: ${String(d.excerpt || '').slice(0, 200)}` };
      return;
    }
    const rel = String(d.path || ''); const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
    if (!rel || !fs.existsSync(abs)) { gaps.push({ id: `gap-${id}`, missing: `the ${d.kind} ${rel || '(no path)'} is not there`, inspected: [rel], blocks: ['template'], resolve_when: { exists: rel } }); refs[id] = { path: rel, note: `${d.kind}, not found` }; return; }
    const hash = sha(fs.readFileSync(abs));
    refs[id] = { path: path.isAbsolute(rel) ? path.relative(root, abs) : rel, hash, note: d.kind === 'zip' ? `zip${Array.isArray(d.entries) ? `, ${d.entries.length} entries` : ''}` : 'file' };
  });
  return { refs, gaps };
}

/** fill(t) → { ok, payload, gaps, problems } — ok when the payload is a valid v2 contract; gaps are what he is asked */
function fill(t = {}, { root = ROOT } = {}) {
  const problems = [], gaps = [];
  const need = (field, missing) => gaps.push({ id: `gap-${field}`, missing, inspected: [], blocks: ['template'], resolve_when: { evidence: `answer:${field}` } });
  if (!t.system) need('system', 'which system owns this work');
  if (!t.agent || !t.agent.name) need('agent', 'which agent does it');
  if (!t.capability && !t.command) need('command', 'what is invoked: a capability or a command');
  // his 2026-11-14: "only emerge based contracts that need emerges code". A request whose work is Emerge code is read by Emerge's own
  // say (his words → what it is, its end state, its gates; no model): its end state is the outcome unless one was given, and what say could
  // not understand is a gap in its own words (with the line that teaches it).
  const em = t.emerge || null;
  if (em && (!t.outcome || !t.outcome.what) && em.intent) t.outcome = { what: em.intent, why: 'read by Emerge\'s say from his words' };
  if (em) (em.gaps || []).forEach((g, i) => gaps.push({ id: `gap-emerge-${i + 1}`, missing: `Emerge: ${g.what}`, inspected: ['emerge say'], blocks: ['template'], resolve_when: { evidence: `answer:emerge-${i + 1}` }, ...(g.say ? { hint: g.say } : {}) }));
  if (!t.outcome || !t.outcome.what) need('outcome', 'the end state: what must be true when it is done');
  const dag = Array.isArray(t.dag) ? t.dag : [];
  if (!dag.length) need('dag', 'what must be known or done first (the DAG)');

  const tags = [...new Set([...(t.tags || []), ...(t.emerge ? ['kind:emerge'] : []), ...(t.system ? [`system:${slug(t.system)}`] : []), ...(t.hat ? [`hat:${slug(t.hat)}`] : []), ...(t.input && t.input.id ? [`input:${slug(t.input.id)}`] : [])])];
  for (const g of tags) if (!TAG.test(g)) problems.push(`tag "${g}" is not in the grammar (request: phase: gate: outcome: rung: kind: system: hat: input:)`);

  const { refs, gaps: dataGaps } = _refs(t.data, root, problems); gaps.push(...dataGaps);
  const refIds = Object.keys(refs);
  // the first gate: the template filled (every required field answered); its evidence is recorded when the last gap closes
  const gates = [{ id: 'template', type: 'context', depends_on: [], requires: [], pass_when: [{ evidence: 'template_filled' }], does: 'every field of the template filled' }];
  if (refIds.length) gates.push({ id: 'data', type: 'context', depends_on: ['template'], requires: refIds, does: 'the data from the compartment, as referenced',
    pass_when: refIds.map(r => (refs[r].hash && !/^context/.test(refs[r].note)) ? { exists: refs[r].path } : { evidence: `context:${r}` }) });
  const base = refIds.length ? 'data' : 'template';
  const ids = new Set(dag.map(n => n && n.id));
  for (const n of dag) {
    if (!n || !n.id || !/^[\w.-]+$/.test(n.id)) { problems.push('a DAG node needs an id (letters, digits, . - _)'); continue; }
    if (['template', 'data'].includes(n.id)) { problems.push(`DAG node "${n.id}" uses a name the template keeps`); continue; }
    const needs = (n.needs || []).filter(x => ids.has(x));
    for (const x of n.needs || []) if (!ids.has(x)) problems.push(`DAG node ${n.id} needs "${x}", which is not in the DAG`);
    gates.push({ id: n.id, type: ['task', 'verification', 'context', 'phase'].includes(n.type) ? n.type : 'task', depends_on: needs.length ? needs : [base],
      requires: needs.length ? [] : refIds, pass_when: Array.isArray(n.pass_when) && n.pass_when.length ? n.pass_when : [{ evidence: `done:${n.id}` }], ...(n.does ? { does: n.does } : {}) });
  }
  const dagGates = gates.filter(g => !['template', 'data'].includes(g.id)).map(g => g.id);
  const outcome = { what: (t.outcome && t.outcome.what) || '(not given: a gap)', ...(t.outcome && t.outcome.why ? { why: t.outcome.why } : {}),
    done_when: (dagGates.length ? dagGates : ['template']).map(id => ({ gate: id })) };

  const payload = {
    v: 2,
    outcome, refs, gates, gaps, invariants: [],
    // what the template names, kept as fields so a reader does not have to infer them from the gates
    template: { system: t.system || null, agent: t.agent ? { name: t.agent.name || null, why: t.agent.why || null } : null, hat: t.hat || null,
      capability: t.capability || null, command: t.command || null, input: t.input ? { id: t.input.id || null, text: t.input.text || null, by: t.input.by || null } : null },
    tags,
    ...(em ? { emerge: { kind: em.kind || null, name: em.name || null, intent: em.intent || null, gates: em.gates || [], fields: em.fields || [], read: 'emerge say' } } : {}),
    // B1's fields (schema.contract), mapped in so its readers find what they know
    forAgent: t.hat || (t.agent && t.agent.name) || null, intention: t.intention || null, system: t.system || null,
    endState: (t.outcome && t.outcome.what) || null, conditions: outcome.done_when.map(c => `gate ${c.gate} passed`),
  };
  const CG = require('./contract-gates.js');
  problems.push(...CG.validate(payload));
  return { ok: !problems.length, payload, gaps, problems };
}

/** needsEmerge(input, extras) — the work is Emerge code: said so, or it names Emerge, an emerge command, or a .eg file */
function needsEmerge(input = {}, extras = {}) {
  const a = (input.args && typeof input.args === 'object') ? input.args : {}; const x = { ...a, ...extras };
  if (x.emerge === true) return true; if (x.emerge === false) return false;
  if (String(x.system || '').toLowerCase() === 'emerge') return true;
  if (/^emerge\./.test(String(x.command || ''))) return true;
  return [...(x.files || []), ...((x.data || []).map(d => d && d.path))].some(p => /\.eg$/.test(String(p || '')));
}

/** draft(inputNode, decision, extras) — what RAID knows from a .input node and its own decision; the rest is given in extras or asked */
function draft(input = {}, decision = {}, extras = {}, opts = {}) {
  const a = input.args && typeof input.args === 'object' ? input.args : {};
  const t = {
    input: { id: input.id, text: input.text, by: input.by },
    system: extras.system || a.system || null,
    agent: extras.agent || (decision && decision.agent ? { name: decision.agent, why: decision.reason || decision.why || null } : null),
    hat: extras.hat || a.hat || null,
    capability: extras.capability || a.capability || null,
    command: extras.command || a.command || null,
    intention: extras.intention || a.intention || null,
    data: extras.data || [...(a.files || []).map(p => ({ kind: 'file', path: p })), ...(a.zip ? [{ kind: 'zip', path: a.zip }] : []), ...(a.context || []).map(c => ({ kind: 'context', ...c }))],
    tags: extras.tags || a.tags || [],
    dag: extras.dag || a.dag || [],
    // his words are the request, not yet an end state: the outcome is given, or asked
    outcome: extras.outcome || a.outcome || null,
    emerge: extras.emergeMeaning || null,
  };
  return fill(t, opts);
}

module.exports = { TEMPLATE, TAG, fill, draft, needsEmerge, MODULE_ID: 'cortex.raid.contract-template', VERSION: '1.0.0' };
