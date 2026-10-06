'use strict';
/**
 * lib/charter.js — a compartment's charter: its axioms, its conditions, its end state. §0.39.362 CH1.
 * UUID: nexus-lib-charter-v1-0000-2026-1006-jamesbrooks-001
 *
 * James: "we could have each compartment in idearium support axioms, conditions, or end state. like for example, use the
 * least amount of code with the highest levarage that achieves the end state" · "good?"
 *
 * Until now a compartment (a repo, in idearium) had rules only per map (invariants: prose, never checked) and checks only
 * per phase (conditions:). Nothing said what the compartment is FOR, or what holds across every phase. The charter is
 * one file at the repo's root, charter.spec — versioned, snapshotted and read like the phasemaps:
 *
 *   charter:
 *     axioms:        rules every change follows. Given to every agent request; the leverage of what comes back is
 *                    measured (lines added per check it made pass).
 *       - "use the least amount of code with the highest leverage that achieves the end state"
 *     conditions:    always true. Checked in every phase's proof, on the code it proposes: a change that breaks one is
 *       - { says: "…", check: { kind: tests, run: "node tests/x.test.js" } }       unproven.
 *     end_state:     what done looks like for the whole compartment. Checked on demand and after every proven phase;
 *       - { says: "…", check: { kind: command, run: "node bin/demo.js" } }         it is the compartment's progress.
 *
 * A check is the proof-run shape (idearium/repo/proof-run.js): kind file | command | tests | page. Pure apart from load().
 */
const fs = require('fs');
const path = require('path');

const FILE = 'charter.spec';
const LEAST_CODE = 'use the least amount of code with the highest leverage that achieves the end state';

function _yaml() { return require('js-yaml'); }

function _says(x) { return typeof x === 'string' ? x.trim() : x && typeof x.says === 'string' ? x.says.trim() : ''; }

/** parse(text) -> { axioms:[string], conditions:[{says,check}], endState:[{says,check}], errors:[string], empty } */
function parse(text) {
  const out = { axioms: [], conditions: [], endState: [], errors: [], empty: true };
  if (!text || !String(text).trim()) return out;
  let doc;
  try { doc = _yaml().load(String(text)); } catch (e) { out.errors.push(`charter.spec does not parse as YAML: ${String(e.message).split('\n')[0]}`); return out; }
  const c = (doc && (doc.charter || doc)) || {};
  out.axioms = (Array.isArray(c.axioms) ? c.axioms : []).map(_says).filter(Boolean);
  const checks = (list, where) => (Array.isArray(list) ? list : []).map((x, i) => {
    const says = _says(x);
    if (!says) { out.errors.push(`${where}[${i}] says nothing`); return null; }
    if (!x || typeof x !== 'object' || !x.check || !x.check.kind) { out.errors.push(`${where}[${i}] "${says}" has no check — say how it is known (kind: file | command | tests | page)`); return null; }
    return { says, check: x.check };
  }).filter(Boolean);
  out.conditions = checks(c.conditions, 'conditions');
  out.endState = checks(c.end_state || c.endState, 'end_state');
  out.empty = !out.axioms.length && !out.conditions.length && !out.endState.length;
  return out;
}

/** load(repoDir) -> parse(charter.spec) plus { path, text, exists } */
function load(repoDir) {
  const p = repoDir ? path.join(repoDir, FILE) : null;
  let text = '';
  try { if (p && fs.existsSync(p)) text = fs.readFileSync(p, 'utf8'); } catch (_) { text = ''; }
  return { ...parse(text), path: FILE, text, exists: !!text };
}

/** requestText(ch, maxChars) — what every agent request is given: the axioms, what must stay true, the end state */
function requestText(ch, maxChars = 600) {
  if (!ch || ch.empty) return '';
  const lines = ['THE COMPARTMENT\'S CHARTER — hold it in everything you write:'];
  for (const a of ch.axioms) lines.push(`- axiom: ${a}`);
  for (const c of ch.conditions) lines.push(`- must stay true: ${c.says}`);
  if (ch.endState.length) lines.push(`- the end state it works toward: ${ch.endState.map(e => e.says).join('; ')}`);
  let t = lines.join('\n');
  if (t.length > maxChars) t = `${t.slice(0, maxChars - 1)}…`;
  return t;
}

/** proofConditions(ch) — the charter's conditions as proof-run conditions, marked as the charter's */
function proofConditions(ch) {
  return (ch && ch.conditions || []).map(c => ({ says: `[charter] ${c.says}`, check: c.check }));
}

/** endStateConditions(ch) */
function endStateConditions(ch) {
  return (ch && ch.endState || []).map(c => ({ says: c.says, check: c.check }));
}

/**
 * leverage({ added, removed, met }) -> { added, removed, met, linesPerCheck, says } — the least-code axiom, measured: how
 * many lines a change added for each check it made pass. Fewer is more leverage. Nothing met → no ratio, said so.
 */
function leverage({ added = 0, removed = 0, met = 0 } = {}) {
  const net = Math.max(0, added);
  const linesPerCheck = met > 0 ? +(net / met).toFixed(1) : null;
  return { added, removed, met, linesPerCheck, says: met > 0 ? `+${added} −${removed} lines for ${met} check${met === 1 ? '' : 's'} (${linesPerCheck} lines per check)` : `+${added} −${removed} lines, no check passed yet` };
}

/** template(name) — a new compartment's charter, the least-code axiom first */
function template(name = 'this compartment') {
  return [
    'charter:',
    `  # ${name} — what it is for, and the rules every change follows (lib/charter.js)`,
    '  axioms:',
    `    - "${LEAST_CODE}"`,
    '    - "reuse what exists in this repo before writing anything new"',
    '  conditions:',
    '    # always true — checked in every phase\'s proof. e.g.',
    '    # - { says: "the tests pass", check: { kind: tests, run: "npm test" } }',
    '  end_state:',
    '    # what done looks like — the compartment\'s progress. e.g.',
    '    # - { says: "a note can be added and listed", check: { kind: command, run: "node bin/demo.js" } }',
    '',
  ].join('\n');
}

module.exports = { MODULE_ID: 'nexus.lib.charter', VERSION: '1.0.0', FILE, LEAST_CODE, parse, load, requestText, proofConditions, endStateConditions, leverage, template };
