'use strict';
/**
 * lib/test-first.js — TF2: the phase's test is written first, and it shapes the expectations and the conditions (0.60.141)
 * comp_id: nexus.lib.test-first
 * Map: docs/2026-10-17-pieces-not-order-phasemap.spec (addendum c2, TF2a_test_first / TF2b_wired)
 *
 * James, 2026-10-17: "needs to build a test first then use that to shape expectation and conditions."
 *
 * Before this, a phase's code was held to TF1's structural expectations (it loads, its planned exports exist) and to the
 * plan's conditions, written by the planner in words. Nothing said what the code must DO before it was written. Now:
 *   1. the test writer (the planner — never the coder that implements: PE6 independence) writes one runnable test for the
 *      phase from its plan (brief);
 *   2. the test is run with NO implementation, in a shadow of the repo (lib/proposal-evidence.js): it must fail for the
 *      missing behaviour, never for itself (validate);
 *   3. what it requires and calls becomes the expectation: a name it calls on a planned module that the plan does not
 *      export is added to that file's exports; its run is the phase's first condition; each code brick carries its text
 *      (shape).
 *
 *   pathFor(plan, phaseKey)              → the test's path: the plan's own test file when it planned one, else tests/<phase>.test.js
 *   brief({ plan, phaseKey, does, proof, testPath, repoName, feedback }) → the request to the test writer
 *   extract(text)                        → the test's code from a reply (a fenced block, or the reply itself), or null
 *   usesOf(code, testPath)               → [{ module, names: [..] }] what the test requires and calls (relative paths resolved)
 *   classify(run, { plan, testPath, exists }) → { verdict: 'fails-as-expected' | 'invalid' | 'passes-already', why }
 *   validate({ root, plan, testPath, code, ms }) → the test run with no implementation, classified
 *   shape(plan, { testPath, code, verdict }) → { plan, added: [{ file, name }], condition }
 *   note(shaped)                         → the text each code brick's brief carries
 */
const path = require('path');

const MODULE_ID = 'nexus.lib.test-first';
const VERSION = '1.0.0';
const RUN_MS = 30000;
const LIMITS = Object.freeze({ test: 12000, brief: 6000, noteTest: 4000 });
const JS = /\.(c|m)?js$/i;

const _posix = (p) => String(p || '').split(path.sep).join('/').replace(/^\.\//, '');
const _cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const _safeKey = (k) => String(k || 'phase').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'phase';

function pathFor(plan, phaseKey) {
  const own = ((plan && plan.files) || []).find(f => f.layer === 'test' && JS.test(f.path));
  return own ? own.path : `tests/${_safeKey(phaseKey)}.test.js`;
}

/** the planned files the test may use: JS, not the test itself */
function _targets(plan, testPath) { return ((plan && plan.files) || []).filter(f => JS.test(f.path) && f.path !== testPath && f.layer !== 'test'); }

function brief({ plan, phaseKey, does = '', proof = '', testPath, repoName = 'the repo', feedback = '' } = {}) {
  const targets = _targets(plan, testPath);
  const rel = (p) => { const r = _posix(path.relative(path.dirname(testPath), p)); return r.startsWith('.') ? r : `./${r}`; };
  const lines = [
    `WRITE THE TEST FIRST for phase ${phaseKey} of ${repoName}. No code for the phase exists yet: you write only its test, and the code will be written afterwards to make it pass.`,
    does ? `WHAT THE PHASE DOES: ${_cut(does, 900)}` : '',
    proof ? `ITS PROOF: ${_cut(proof, 500)}` : '',
    plan && plan.intent ? `ITS INTENT: ${_cut(plan.intent, 400)}` : '',
    'THE FILES THAT WILL BE WRITTEN (require them by these paths, call what they export as the signatures say):',
    ...targets.map(f => `- ${rel(f.path)}${f.purpose ? ` — ${_cut(f.purpose, 160)}` : ''}\n${(f.exports || []).map(e => `    ${e.signature || `${e.name}(…)`}${e.does ? ` — ${_cut(e.does, 140)}` : ''}`).join('\n')}`),
    `THE RULES:`,
    `- One file, ${testPath}, runnable with plain \`node ${testPath}\`: require('node:assert') only, no test framework, no network, no running services, no files outside a temp folder.`,
    '- Test what the phase must DO, with concrete inputs and the exact outputs expected — not only that a function exists.',
    '- It must fail now (nothing is written yet) and pass once the files do what the phase says. Exit non-zero on any failure.',
    '- Every name you use, you define or require. Require only the files above, node built-ins, or files that already exist in the repo.',
    `- Answer with the test only, in one \`\`\`js code block.`,
    feedback ? `YOUR LAST TEST WAS NOT USABLE: ${_cut(feedback, 800)}` : '',
  ].filter(Boolean);
  return _cut(lines.join('\n'), LIMITS.brief);
}

function extract(text) {
  const s = String(text || '');
  const blocks = [...s.matchAll(/```(?:js|javascript|cjs|mjs|node)?\s*\n([\s\S]*?)```/gi)].map(m => m[1].trim()).filter(Boolean);
  const pick = blocks.sort((a, b) => b.length - a.length)[0] || (/\brequire\(|\bimport\s|assert/.test(s) ? s.trim() : null);
  return pick ? pick.slice(0, LIMITS.test) : null;
}

/** what the test requires (relative paths resolved against the test's folder) and the names it uses from each */
function usesOf(code, testPath) {
  const src = String(code || '');
  const dir = path.posix.dirname(_posix(testPath));
  const out = new Map();
  const add = (spec, names) => {
    const s = String(spec);
    const mod = s.startsWith('.') ? path.posix.normalize(path.posix.join(dir, s)) : s;
    if (!out.has(mod)) out.set(mod, new Set());
    for (const n of names) if (n) out.get(mod).add(n);
  };
  // const { a, b: c } = require('x')
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[2], m[1].split(',').map(x => x.split(':')[0].trim()));
  // const X = require('x'); then X.name — read with string literals blanked, so '../lib/notes.js' is not notes.js()
  const bare = src.replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const names = [...bare.matchAll(new RegExp(`\\b${m[1].replace(/\$/g, '\\$')}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(x => x[1]);
    add(m[2], names);
  }
  // import { a } from 'x' · import X from 'x' (X.name)
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) add(m[2], m[1].split(',').map(x => x.split(/\s+as\s+/)[0].trim()));
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g)) add(m[2], [...bare.matchAll(new RegExp(`\\b${m[1]}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(x => x[1]));
  // a bare require('x') still counts as a use of the module
  for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1], []);
  return [...out].map(([module, names]) => ({ module, names: [...names] }));
}

/** the planned file a module spec points at (with or without its extension), or null */
function _planned(plan, mod) {
  const files = ((plan && plan.files) || []).map(f => f.path);
  return files.find(f => f === mod || f.replace(JS, '') === mod || f === `${mod}.js` || f === `${mod}/index.js`) || null;
}

/**
 * classify(run) — did the test fail for the missing behaviour (good), for itself (invalid), or not at all (proves nothing)?
 *   run: { exit, tail, timedOut } from lib/proposal-evidence.js runOne
 *   exists(rel) → is that file in the repo (a module the test requires that is neither planned nor present is the test's fault)
 */
function classify(run, { plan, testPath, exists = () => false } = {}) {
  if (!run) return { verdict: 'invalid', why: 'the test did not run' };
  const tail = String(run.tail || '');
  if (run.timedOut) return { verdict: 'invalid', why: `it ran past ${RUN_MS / 1000}s with nothing written — a test must finish on its own` };
  if (run.exit === 0) return { verdict: 'passes-already', why: 'it passes before any code is written, so it proves nothing about the phase' };
  if (/SyntaxError/.test(tail) && (!/Cannot find module/.test(tail))) return { verdict: 'invalid', why: `the test itself does not parse: ${(tail.match(/SyntaxError[^\n]*/) || [''])[0]}` };
  const missing = [...tail.matchAll(/Cannot find module '([^']+)'/g)].map(m => m[1]);
  for (const m of missing) {
    const rel = _posix(m).replace(/^.*?\/proposal-shadow-[^/]+\//, '');
    const spec = rel.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(_posix(testPath)), rel)) : rel;
    if (_planned(plan, spec) || _planned(plan, rel)) continue;
    if (!rel.startsWith('/') && !rel.startsWith('.') && !rel.includes('/') && !exists(rel)) return { verdict: 'invalid', why: `it requires '${m}', which is neither planned nor installed` };
    if ((rel.startsWith('.') || rel.includes('/')) && !exists(spec) && !exists(`${spec}.js`)) return { verdict: 'invalid', why: `it requires '${m}', which is neither planned nor in the repo` };
  }
  if (missing.length) return { verdict: 'fails-as-expected', why: `the planned module is not written yet (${missing.map(m => _posix(m).split('/').slice(-2).join('/')).join(', ')})` };
  const undef = tail.match(/ReferenceError: ([\w$]+) is not defined/);
  if (undef) return { verdict: 'invalid', why: `the test uses ${undef[1]} without defining or requiring it` };
  if (/AssertionError|ERR_ASSERTION|is not a function|is not a constructor|Cannot read propert|expected|actual/i.test(tail)) return { verdict: 'fails-as-expected', why: _cut((tail.split('\n').find(l => /AssertionError|is not a|Cannot read|expected/i.test(l)) || tail.split('\n')[0] || '').trim(), 240) };
  return { verdict: 'invalid', why: `it failed, but not for a missing behaviour: ${_cut(tail.split('\n').slice(0, 2).join(' · '), 240)}` };
}

/**
 * decide(verdict, { alreadyDone }) → 'accept' | 'accept-already' | 'reject' — §0.60.167, James, 2026-10-19:
 * "been stuck on that phase for hours." A phase whose work ALREADY EXISTS on disk (e.g. SP5_title, whose lib/title.js
 * was already there) can never produce a FAILING test — fail-first only makes sense for code not yet written. Under
 * test_first:require the loop then refuses forever. A test that passes against code already present is a valid regression
 * test, and the phase is already satisfied. So: fails-as-expected / not-run → accept (as before); passes-already AND the
 * files already exist → accept-already (keep the passing test, the phase is done); otherwise reject (vacuous/broken test).
 */
function decide(verdict, { alreadyDone = false } = {}) {
  if (verdict === 'fails-as-expected' || verdict === 'not-run') return 'accept';
  if (verdict === 'passes-already' && alreadyDone) return 'accept-already';
  return 'reject';
}

/** validate — the test, with no implementation, in a shadow of the repo */
async function validate({ root, plan, testPath, code, ms = RUN_MS } = {}) {
  if (!root) return { ran: false, verdict: 'not-run', why: 'the repo has no folder on disk to test in' };
  const PE = require('./proposal-evidence.js');
  const fs = require('fs');
  const sh = PE.shadow(root, { [testPath]: code });
  try {
    const r = await PE.runOne(sh.dir, testPath, ms);
    const c = classify(r, { plan, testPath, exists: (rel) => { try { return fs.existsSync(path.join(root, rel)) || fs.existsSync(path.join(root, 'node_modules', rel)); } catch (_) { return false; } } });
    return { ran: true, ...c, exit: r.exit, tail: r.tail, ms: r.ms };
  } finally { sh.remove(); }
}

/** shape — the test becomes the expectation: names it calls join the plan's exports; its run is the first condition */
function shape(plan, { testPath, code, verdict = null } = {}) {
  const p = JSON.parse(JSON.stringify(plan || {}));
  p.files = (p.files || []).filter(f => f.path !== testPath);            // the test is written; no coder writes it again
  p.order = (p.order || []).filter(x => x !== testPath);
  const added = [];
  for (const u of usesOf(code, testPath)) {
    const file = _planned(p, u.module); if (!file) continue;
    const f = p.files.find(x => x.path === file); if (!f) continue;
    f.exports = f.exports || [];
    for (const n of u.names) {
      if (f.exports.some(e => e.name === n)) continue;
      f.exports.push({ name: n, signature: `${n}(...args)`, does: `used by ${testPath} (written first)` });
      added.push({ file, name: n });
    }
  }
  const condition = { says: `${testPath} passes — written before the code${verdict ? `, and seen failing first (${_cut(verdict, 140)})` : ''}`, check: { kind: 'tests', run: `node ${testPath}` } };
  p.conditions = [condition, ...(p.conditions || []).filter(c => !(c.check && c.check.kind === 'tests' && c.check.run === condition.check.run))];
  p.testFirst = { path: testPath, code: String(code || ''), added, verdict: verdict || null };
  return { plan: p, added, condition };
}

/** the text each code brick's brief carries */
function note(plan) {
  const t = plan && plan.testFirst;
  if (!t || !t.code) return '';
  return `\n\nTHE TEST THIS PHASE MUST PASS (written first — your file is held to it; do not change the test):\n// ${t.path}\n${_cut(t.code, LIMITS.noteTest)}`;
}

module.exports = { MODULE_ID, VERSION, LIMITS, pathFor, brief, extract, usesOf, classify, validate, decide, shape, note };
