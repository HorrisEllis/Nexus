'use strict';
/**
 * lib/coder-brief.js — CB1 (0.60.171): the brief a coder gets for one file, in the five parts Gemini said make it code at its best.
 * comp_id: nexus.lib.coder-brief
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec CB1
 *
 * James, 2026-10-19: "prioritize gemini … need to specify the axioms, from the docs axioms 3.1. like i want gemini to code at
 * his best." Gemini's own answer, which he pasted: give (1) the tech stack and environment, (2) constraints and code-style
 * standards, (3) concrete context — the relevant slice and the input/output contract, (4) an explicit output format, and
 * (5) a self-critique step. Each part is filled from what Nexus already knows, never guessed:
 *
 *   stackOf(root)       → { language, node, moduleType, testRunner, deps } from the repo's package.json and the running Node
 *   AXIOM_RULES         → the AXIOMS v3.1 laws that bind a single file, restated as rules a coder can follow (ids kept)
 *   compose({ base, plan, file, root, existing, vf, testPath }) → the brief: base (the plan's own chunkBrief) + the five parts
 *     existing: the file's current text (verify-first ran it); vf: the verify-first result (its failing checks become part 3)
 *     The self-critique is asked for INSIDE the same reply ("check, then give only the final version"), so it costs no second
 *     job behind Guardian's 15 s gap — the review James was handed asked for exactly this ("one generation request may produce
 *     several artifacts").
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.coder-brief';
const VERSION = '1.0.0';
const CAP = { test: 3000, existing: 4000 };

// AXIOMS v3.1 (docs/AXIOMS-v3.1.md) — the ones that bind one file a coder writes, in the coder's terms
const AXIOM_RULES = Object.freeze([
  { id: '§1.2', rule: 'Nothing fails silently: throw a specific error naming the function, the bad input and what was expected — never return undefined, null or a fallback quietly.' },
  { id: '§1.3', rule: 'No stub, placeholder, TODO or mock in the file: every exported function works fully.' },
  { id: '§0.5', rule: 'Complexity must earn its place: the smallest code that meets the contract; no extra abstractions, options or dependencies.' },
  { id: '§8.6', rule: 'Reuse before build: use what the repo and the platform already give (Node built-ins); add no npm dependency.' },
  { id: '§5.3', rule: 'Fix the root cause, not the symptom: if the test and the code disagree, make the code meet the test — never weaken or special-case the test.' },
  { id: '§5.7', rule: 'One responsibility per module: export exactly the planned names, nothing more.' },
  { id: '§12.2', rule: 'Tests are verification: the code must make the given test pass for the right reason, including its edge cases.' },
  { id: '§0.3', rule: 'Nothing is lost: keep every part of the existing file that already works; change only what fails.' },
]);

function stackOf(root) {
  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch (_) {}
  const test = pkg && pkg.scripts && pkg.scripts.test ? String(pkg.scripts.test) : '';
  const testRunner = /\bjest\b/.test(test) ? 'jest' : /\bmocha\b/.test(test) ? 'mocha' : /\bvitest\b/.test(test) ? 'vitest' : 'node:test (node --test) / node:assert';
  return {
    language: 'JavaScript',
    node: (pkg && pkg.engines && pkg.engines.node) || process.version,
    moduleType: pkg && pkg.type === 'module' ? 'ES modules (import/export)' : 'CommonJS (require/module.exports)',
    testRunner,
    deps: Object.keys((pkg && pkg.dependencies) || {}),
  };
}

const _cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more chars not shown)` : s; };

function compose({ base = '', plan = null, file, root = null, existing = null, vf = null, testPath = null } = {}) {
  const st = root ? stackOf(root) : null;
  const entry = plan && plan.files ? plan.files.find(f => f.path === file) || null : null;
  let testCode = null;
  if (root && testPath) { try { testCode = fs.readFileSync(path.join(root, testPath), 'utf8'); } catch (_) {} }
  const out = [String(base || '').trim()];

  out.push(['## 1. Stack and environment',
    st ? `- ${st.language}, Node ${st.node}, ${st.moduleType}` : '- JavaScript on Node.js',
    st ? `- Tests: ${st.testRunner}` : null,
    st ? `- Dependencies available: ${st.deps.length ? st.deps.join(', ') : 'none — Node built-ins only'}` : null,
    '- Runs in Nexus\'s process sandbox (clean environment, time limit): no network, no global state between runs.',
  ].filter(Boolean).join('\n'));

  out.push(['## 2. Constraints (Nexus AXIOMS v3.1 — binding)', ...AXIOM_RULES.map(a => `- ${a.id} ${a.rule}`)].join('\n'));

  const ctx = ['## 3. Contract and context'];
  if (entry && entry.exports && entry.exports.length) ctx.push(`- ${file} must export: ${entry.exports.map(e => e.signature || e.name).join('; ')}`);
  if (entry && entry.does) ctx.push(`- It does: ${entry.does}`);
  if (testCode != null) ctx.push(`- The frozen test ${testPath} (it will be run against your file unchanged — it is the input/output contract):\n\`\`\`js\n${_cut(testCode, CAP.test)}\n\`\`\``);
  if (existing != null) ctx.push(`- ${file} as it is now:\n\`\`\`js\n${_cut(existing, CAP.existing)}\n\`\`\``);
  const fb = vf ? require('./verify-first.js').feedback(vf) : '';
  if (fb) ctx.push(fb);
  else if (vf && vf.verdict === 'shallow') ctx.push(`- ${file} already parses and has its exports, but there is no test to prove it. If it already does what the contract says, return it unchanged.`);
  out.push(ctx.join('\n'));

  out.push(['## 4. Output format',
    `- Exactly ONE fenced code block: the complete file ${file}. No other code blocks, no file names or labels before or inside it.`,
    '- After the block, one line starting "CLAIMS:" listing at most 5 behaviours the file guarantees, each naming the test line or input that proves it.',
  ].join('\n'));

  out.push(['## 5. Before you answer',
    '- Check your code against every line of the test and every failure listed above, and against edge cases (wrong type, empty, whitespace-only, missing argument).',
    '- Fix what that check finds, then give only the final version — not a first draft followed by a revision.',
  ].join('\n'));
  return out.filter(Boolean).join('\n\n');
}

module.exports = { MODULE_ID, VERSION, AXIOM_RULES, stackOf, compose };
