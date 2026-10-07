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

/**
 * parse(text) -> { axioms, conditions, endState, errors, empty } — §2026-10-07 the charter IS the compartment's intent
 * (cos/foundation/intent.js, the one definition): parsed there, with the check kinds idearium's proof runner also has.
 */
function parse(text) {
  const p = require('../cos/foundation/intent.js').parse(text, { kinds: ['file', 'command', 'tests', 'page'] });
  return { axioms: p.intent.axioms, conditions: p.intent.conditions, endState: p.intent.endState, errors: p.errors.map(e => e.replace(/^endState/, 'end_state')), empty: !!p.empty };
}

/** load(repoDir) -> parse(charter.spec) plus { path, text, exists } */
function load(repoDir) {
  const p = repoDir ? path.join(repoDir, FILE) : null;
  let text = '';
  try { if (p && fs.existsSync(p)) text = fs.readFileSync(p, 'utf8'); } catch (_) { text = ''; }
  return { ...parse(text), path: FILE, text, exists: !!text };
}

/**
 * withInherited(ch, effective) — §0.39.372 NC2: the charter with what its compartment inherits from its parents (COS
 * nesting: a Nexus system's compartment holds Nexus's conditions and axioms). Inherited entries come first, marked
 * (inherited: <parent>); the charter's own follow. A child adds, never drops. effective: cos intent.effective().
 */
function withInherited(ch, effective) {
  if (!ch || !effective) return ch;
  const ic = (effective.conditions || []).filter(c => c.inherited);
  const own = new Set((ch.axioms || []));
  const ia = (effective.axioms || []).filter(a => !own.has(a) && !(ch.axioms || []).includes(a));
  if (!ic.length && !ia.length) return ch;
  return { ...ch, conditions: [...ic.filter(c => !(ch.conditions || []).some(x => x.says === c.says)), ...(ch.conditions || [])], axioms: [...ia, ...(ch.axioms || [])],
    inherited: { conditions: ic.length, axioms: ia.length }, empty: false };
}

/** requestText(ch, maxChars) — what every agent request is given: the axioms, what must stay true, the end state */
function requestText(ch, maxChars = 600) {
  if (!ch || ch.empty) return '';
  const lines = ['THE COMPARTMENT\'S CHARTER — hold it in everything you write:'];
  for (const a of ch.axioms) lines.push(`- axiom: ${a}`);
  for (const c of ch.conditions) lines.push(`- must stay true${c.inherited ? ` (from ${c.inherited})` : ''}: ${c.says}`);
  if (ch.endState.length) lines.push(`- the end state it works toward: ${ch.endState.map(e => e.says).join('; ')}`);
  let t = lines.join('\n');
  if (t.length > maxChars) t = `${t.slice(0, maxChars - 1)}…`;
  return t;
}

/** proofConditions(ch) — the charter's conditions as proof-run conditions, marked as the charter's */
function proofConditions(ch) {
  return (ch && ch.conditions || []).map(c => ({ says: `[${c.inherited ? `from ${c.inherited}` : 'charter'}] ${c.says}`, check: c.check }));
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

module.exports = { MODULE_ID: 'nexus.lib.charter', VERSION: '1.1.0', FILE, LEAST_CODE, parse, load, withInherited, requestText, proofConditions, endStateConditions, leverage, template };
