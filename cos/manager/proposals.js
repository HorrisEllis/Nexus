'use strict';
/**
 * cos/manager/proposals.js — agents' held acts (MG-006), taken or dropped by a person. MG18, 0.60.336.
 * Spec: cos/spec/cos-manager.spec MOD-MG-UI-PROPOSALS (schema Proposal) · Map: docs/2026-10-24-cos-manager-phasemap.spec MG18, MG_D16
 *
 * James, 2026-10-31: "okay. lets build cos ui. floating, above the event bus. all of the phases, build it."
 * An agent does not start, stop or restart a system; it proposes, and the proposal waits here until a person takes it (the act then runs
 * with by = the person) or drops it. Every proposal, take and drop is a line on the supervisor's ledger. The store is an append-only file of
 * proposal states; the newest line for an id is its state, so nothing is rewritten (§0.3).
 *   hold({ by, verb, target, why }) → Proposal · list({ open }) → Proposal[] · take(id, { by }) → { proposal, result } · drop(id, { by, why })
 */
const fs = require('fs');
const path = require('path');

const VERBS = { start: 'start', stop: 'stop', restart: 'restart', 'reset-circuit': 'resetCircuit' };

function createProposals(sup, { file } = {}) {
  const FILE = file || path.join(path.dirname(sup.ledgerFile), 'proposals.jsonl');
  let seq = 0;
  const read = () => {
    const by = new Map();
    try { for (const l of fs.readFileSync(FILE, 'utf8').split('\n')) { if (!l.trim()) continue; try { const p = JSON.parse(l); by.set(p.id, p); } catch (_) {} } } catch (_) {}
    return by;
  };
  const save = (p) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.appendFileSync(FILE, JSON.stringify(p) + '\n'); return p; };
  const view = (p) => ({ ...p, ageMs: Date.now() - p.at });

  function hold({ by, verb, target, why } = {}) {
    if (!by || !/^agent:/.test(String(by))) throw Object.assign(new Error('a proposal is an agent\'s: { "by": "agent:<name>" }'), { code: 400 });
    if (!VERBS[verb]) throw Object.assign(new Error(`no such act "${verb}": ${Object.keys(VERBS).join(', ')}`), { code: 400 });
    const sys = sup.get(target);   // throws for an undeclared system
    if (!why || String(why).trim().length < 3) throw Object.assign(new Error('say why: an agent\'s reason is part of its proposal'), { code: 400 });
    const p = { id: `p-${Date.now().toString(36)}${(seq++).toString(36)}`, at: Date.now(), by, verb, target, why: String(why).slice(0, 500),
      seen: { state: sys.state, pid: sys.pid }, status: 'held' };
    if (!sup.note('proposal-held', `${by} proposes ${verb} ${target}: ${p.why}`, { by, system: target })) throw new Error('the ledger cannot be written: nothing held');
    return view(save(p));
  }
  function list({ open = false } = {}) {
    const all = [...read().values()].sort((a, b) => b.at - a.at);
    return (open ? all.filter(p => p.status === 'held') : all).map(view);
  }
  function must(id) { const p = read().get(id); if (!p) throw Object.assign(new Error(`no proposal "${id}"`), { code: 404 }); if (p.status !== 'held') throw Object.assign(new Error(`proposal ${id} is already ${p.status}`), { code: 409 }); return p; }
  function take(id, { by } = {}) {
    if (!by || /^agent:/.test(String(by))) throw Object.assign(new Error('a proposal is taken by a person: { "by": "person" }'), { code: 400 });
    const p = must(id); let result = null, error = null;
    try { result = sup[VERBS[p.verb]](p.target, { by }); } catch (e) { error = e.message; }
    sup.note('proposal-taken', `${by} took ${p.by}'s ${p.verb} ${p.target}${error ? ` — it failed: ${error}` : ''}`, { by, system: p.target });
    return { proposal: view(save({ ...p, status: error ? 'failed' : 'taken', closedAt: Date.now(), closedBy: by, ...(error ? { error } : {}) })), result };
  }
  function drop(id, { by, why = '' } = {}) {
    if (!by) throw Object.assign(new Error('say who drops it: { "by": "person" }'), { code: 400 });
    const p = must(id);
    sup.note('proposal-dropped', `${by} dropped ${p.by}'s ${p.verb} ${p.target}${why ? `: ${why}` : ''}`, { by, system: p.target });
    return { proposal: view(save({ ...p, status: 'dropped', closedAt: Date.now(), closedBy: by, ...(why ? { dropWhy: String(why).slice(0, 300) } : {}) })) };
  }
  return { hold, list, take, drop, file: FILE, VERBS: Object.keys(VERBS) };
}

module.exports = { createProposals };
