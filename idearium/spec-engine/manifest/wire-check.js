// idearium/spec-engine/manifest/wire-check.js
// UUID: nexus-idearium-manifest-wire-check-v1-0000-2026-0925-jamesbrooks-001
// Intent: the static, no-LLM gate (P2). Given a normalized file list, list
// EVERY violation — never stop at the first. severity 'error' blocks chunking;
// 'warn' is recorded and shown but does not block.
//
// Structure checks run on every file list. Signal checks (I3/I4/schemas) run
// only on entries that declare emits/consumes — a bare file list has none yet.

import { resolve, order, cycles } from './graph.js';

const v = (code, severity, where, message) => ({ code, severity, where, message });
const sigName = s => (typeof s === 'string' ? s : (s && (s.signature || s.event))) || null;
const required = s => (s && typeof s === 'object' && s.schema && Array.isArray(s.schema.required)) ? s.schema.required : [];
const props = s => (s && typeof s === 'object' && s.schema && s.schema.properties) ? Object.keys(s.schema.properties) : null;

function structure(files, out) {
  const seen = new Map();
  for (const f of files) {
    for (const [kind, k] of [['key', f.key], ['path', f.path]]) {
      const tag = `${kind}:${k}`;
      if (seen.has(tag)) out.push(v('DUPLICATE_' + kind.toUpperCase(), 'error', f.path, `${kind} "${k}" is also used by ${seen.get(tag)}`));
      else seen.set(tag, f.path);
    }
    if (!f.intent) out.push(v('MISSING_INTENT', 'error', f.path, 'no intent — every file needs exactly one'));
    if (f.notes.includes('LEGACY_REF')) out.push(v('LEGACY_REF', 'warn', f.path, '`ref` mixes "calls" and "relates to"; read as depends — split into depends / related'));
    if (f.depends.includes(f.key) || f.depends.includes(f.uuid) || f.depends.includes(f.path)) out.push(v('SELF_DEPENDENCY', 'error', f.path, 'depends on itself'));
  }
}

function signals(files, out) {
  const producers = new Map(), consumers = new Map();
  for (const f of files) {
    for (const e of f.emits) { const n = sigName(e); if (n) (producers.get(n) || producers.set(n, []).get(n)).push({ f, e }); }
    for (const c of f.consumes) { const n = sigName(c); if (n) (consumers.get(n) || consumers.set(n, []).get(n)).push({ f, c }); }
  }
  for (const [n, ps] of producers) {
    if (ps.length > 1) out.push(v('MULTIPLE_PRODUCERS', 'error', n, `produced by ${ps.map(p => p.f.path).join(', ')} — exactly one producer allowed (I3)`));
    if (!consumers.has(n) && !ps.every(p => p.e && p.e.residue === true)) out.push(v('UNDECLARED_RESIDUE', 'error', n, `emitted by ${ps[0].f.path} with no consumer and not marked residue (I4)`));
  }
  for (const [n, cs] of consumers) {
    const ps = producers.get(n);
    if (!ps) { out.push(v('NO_PRODUCER', 'error', n, `consumed by ${cs.map(c => c.f.path).join(', ')} but nothing emits it`)); continue; }
    const have = props(ps[0].e);
    if (!have) continue;
    for (const { f, c } of cs) {
      const missing = required(c).filter(r => !have.includes(r));
      if (missing.length) out.push(v('SCHEMA_MISMATCH', 'error', n, `${f.path} requires ${missing.join(', ')} which ${ps[0].f.path} never sends`));
    }
  }
}

/** wireCheck(files) → { ok, violations, graph: { nodes, order, layers } } */
export function wireCheck(files) {
  const out = [];
  structure(files, out);
  const { nodes, unresolved } = resolve(files);
  for (const u of unresolved) out.push(v(u.field === 'depends' ? 'UNRESOLVED_DEPENDENCY' : 'UNRESOLVED_RELATED',
    u.field === 'depends' ? 'error' : 'warn', files.find(f => f.key === u.from).path, `${u.field} "${u.ref}" matches no file in this list`));
  const g = order(nodes);
  if (g.stuck.length) {
    const byKey = new Map(files.map(f => [f.key, f.path]));
    const cs = cycles(nodes.filter(n => g.stuck.includes(n.id)));
    for (const c of cs) out.push(v('CYCLE', 'error', byKey.get(c[0]), c.map(id => byKey.get(id)).join(' → ')));
    if (!cs.length) out.push(v('CYCLE', 'error', g.stuck.map(id => byKey.get(id)).join(', '), 'stuck behind a cycle'));
  }
  signals(files, out);
  return { ok: !out.some(x => x.severity === 'error'), violations: out, graph: { nodes, order: g.order, layers: g.layers, stuck: g.stuck, dependents: g.dependents } };
}
