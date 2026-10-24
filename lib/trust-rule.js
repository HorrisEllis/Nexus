'use strict';
/**
 * lib/trust-rule.js — SL5: his rule for what lands without him.
 * comp_id: nexus.lib.trust-rule
 * Spec: docs/self-building-loop.spec MOD-SL-TRUST. Map: docs/2026-10-23-self-building-loop-phasemap.spec SL5.
 *
 * James, 2026-10-24, to "Say 'B' and 'the 2' (or your own picks) and I'll start SL4.": "yes do it."
 * The options the coder put to him (2026-10-23):
 *   A  always asks (today: every change waits for him; the loop builds and proves, he applies, SL1 closes on apply)
 *   B  a proven change lands by itself in his project repos when every deterministic gate passed, undo one click away;
 *      Nexus's own repos stay review
 *   C  as B, and Nexus too, except the files he keeps
 * The coder recommended B. His "yes do it." is read as B (a reading, recorded as one): DECIDED below is the default for every repo.
 *
 * The rule is stored with his words (no words → refused): one rule for every repo ('*'), and a repo may have its own. What a rule
 * allows is decided per change, and said on every change it lands (allows → { lands, why }).
 *
 *   get(repoUuid)                             → TrustRule { rule: 'A'|'B'|'C', kept: [path], words, by, at, scope }
 *   set({ repo = '*', rule, kept, words, context, by }) → TrustRule   (throws without words)
 *   allows({ repo, change, run, rule })       → { lands, why }
 *
 * Storage is passed in (load/append) so the rule lives where Idearium keeps its tables; the default is an in-memory list.
 */
const VERSION = '1.0.0';
const RULES = ['A', 'B', 'C'];
// his decision, recorded where the code lives (the store is data and is never committed): the rule every repo has until he sets
// another through the route (POST /api/trust-rule, his words required). Superseded by a newer rule, never rewritten (§0.3).
const DECIDED = { uuid: 'trust-decided-2026-10-24', scope: '*', rule: 'B', kept: [], by: 'james', at: Date.parse('2026-10-24T00:00:00Z'),
  words: 'yes do it.',
  context: 'Asked: "Say B and the 2 (or your own picks) and I\'ll start SL4." after the options A (always asks), B (his project repos land a proven change whose gates all passed; Nexus stays review), C (B and Nexus too, except kept files); the coder recommended B. Read as B: a reading, to confirm.' };

let _store = { rows: [], load() { return this.rows; }, append(r) { this.rows.push(r); } };
function setStore(s) { if (s && typeof s.load === 'function' && typeof s.append === 'function') _store = s; }

function get(repoUuid) {
  const rows = (_store.load() || []).filter(r => r && RULES.includes(r.rule));
  const last = (scope) => rows.filter(r => r.scope === scope).sort((a, b) => (a.at || 0) - (b.at || 0)).pop() || null;
  return (repoUuid && last(repoUuid)) || last('*') || DECIDED;
}

function set({ repo = '*', rule, kept = [], words, context = null, by = 'james' } = {}) {
  if (!RULES.includes(rule)) throw new Error(`rule must be one of ${RULES.join(', ')}`);
  if (!words || !String(words).trim()) throw new Error('a trust rule is his to set: his words are required');
  const row = { uuid: `trust-${repo}-${Date.now()}`, scope: repo, rule, kept: [...new Set(kept || [])], words: String(words), context, by, at: Date.now() };
  _store.append(row);
  return row;
}

/**
 * repo   { uuid, nexusSelf }      change  an inject { path, status, target, evidence }
 * run    { proven }               rule    (optional) a TrustRule, else get(repo.uuid)
 */
function allows({ repo, change, run, rule } = {}) {
  const r = rule || get(repo && repo.uuid);
  const tag = `rule ${r.rule}${r.words ? ` (his words: "${String(r.words).slice(0, 60)}")` : ''}`;
  if (r.rule === 'A') return { lands: false, why: `${tag}: every change asks` };
  if (!run || !run.proven) return { lands: false, why: `${tag}: the run is not proven` };
  if (!change || change.status !== 'proposed') return { lands: false, why: `${tag}: not a proposal (${change ? change.status : 'none'})` };
  const nexus = !!(repo && repo.nexusSelf) || !!(change.target && change.target.kind === 'nexus-gate');
  if (nexus && r.rule === 'B') return { lands: false, why: `${tag}: a Nexus repo stays review under B` };
  if ((r.kept || []).includes(change.path)) return { lands: false, why: `${tag}: ${change.path} is a file he keeps` };
  const ev = change.evidence || null;
  if (ev && (ev.regressions > 0)) return { lands: false, why: `${tag}: its evidence shows ${ev.regressions} regressed test(s)` };   // lib/repo-inject.js attachEvidence (apply() refuses it too)
  return { lands: true, why: `${tag}: proven, every gate passed${nexus ? '' : ', a project repo'}; undo is one click (revert)` };
}

module.exports = { VERSION, RULES, DECIDED, setStore, get, set, allows };
