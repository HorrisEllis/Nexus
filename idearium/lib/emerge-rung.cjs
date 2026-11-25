'use strict';
/**
 * idearium/lib/emerge-rung.cjs — the Emerge rung: a planned JS file written in Emerge, checked by Emerge's compiler, retried with what failed,
 * built to JavaScript and judged by its expectation test (EMB1, 0.60.421). Map: docs/2026-10-17-pieces-not-order-phasemap.spec EMB1.
 *
 * James, 2026-11-06: "emerge, we need to get it coding remember. thats why emerge is important, also the test env, using the test file for
 * expectation, the primitive also, then emerge can also verify itself with the compiler." · "yes basically nexus holds as much complexity as
 * possible, agent tools, context per gate, component registry as the spine so components can be dumb. also the retry engine for emerge."
 *
 * Nexus holds the complexity, the brick stays dumb: the caller hands in the agent (ask), the expectation (expect) and the gate's context; this
 * only runs the loop. Emerge is another system, reached through its command line (node emerge/emerge/cli.js lang-check | lang-build), never its
 * files (AXIOMS §5.15).
 *
 *   createRung({ root, ask, expect, maxTries, timeoutMs, cli })
 *     ask(message, { tryNo })       → the agent's reply text (Nexus's agent call: WARP, the gate's context, its tools)
 *     expect({ file, files })       → { ok, why } — the brick's expectation test over the built files (TF1, in the shadow)
 *   rung.build({ file, exports, expectation, context }) → { ok, why, tries: [{ n, stage, why, ms }], source, files }
 *     stages: no-code · compile (Emerge's compiler: line, column, why) · build · exports (a planned name not defined) · expect · pass
 *     each failure goes into the next try word for word — the retry engine for Emerge; after maxTries it says why and stops
 *   files (on pass) — what lands, beside the planned file:  <dir>/<name>.eg (the source) · <dir>/<name>.eg.js (built) · _emerge/** (Emerge's
 *     runtime, once at the root) · <file> (three lines: the runtime, then the module's top-level functions as plain exports)
 *   brief(), extract(), adapter() are pure and exported for the tests.
 *
 * 0.60.607 — skeleton first (EMB1 expanded). James, 2026-11-19: "yes we could have the skeleton gaps, it needs to fill. using the dependancy
 * graph." · "everything, should be as deterministic as possible, and the llm only when strictly necessary. primitive per primitive" · "get it
 * working, built, expanded, dont forget pillar". Measured the same day: DeepSeek 16b asked for a whole Emerge function was refused by the
 * compiler twice; given a skeleton with one gap it filled it first time. So when every export has a signature, Nexus writes the module's
 * skeleton (each fn, its parameters, a body to fill), and the agent fills one body at a time, in the order the plan's own words give
 * (gaps.eg needs/order), each gated by Emerge's compiler (lang-check) with its refusal fed back; each gap is a pillar:gap (gaps.eg as_gap).
 * The filled module is built and judged by its expectation as before. A gap that will not fill, or an expectation that fails, falls back to
 * the whole-module loop below with what failed. skeletonOf(), paramsOf(), bodyOf() are pure and exported for the tests.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MODULE_ID = 'idearium.lib.emerge-rung';
// EMB4 (2026-11-23) — James: "torrents in a magnet link. The pieces always save." Every answer is first repaired by autocorrect (EMB3, written by the
// 3b, idearium/lib/autocorrect.eg): a habit with exactly one fix never costs a try. Absent or failing, the rung goes on without it.
let _ac;
function _autocorrect() {
  if (_ac !== undefined) return _ac;
  try { const { createRuntime } = require('../../_emerge/lang/runtime.js'); const m = require('./autocorrect.eg.cjs')(createRuntime({ file: 'autocorrect.eg', loadModule: (abs, r) => require(abs.replace(/\.eg$/, '.cjs'))(r) }));
    _ac = (b) => { const r = m.autocorrect(String(b)); return { body: String(r.body), fixes: Array.from(r.fixes || []).map(String) }; }; } catch (_) { _ac = null; }
  return _ac;
}
// a parameter assigned in a body: copy it once and use the copy (Emerge's parameters are read-only), outside quoted text only
const _unParam = (b, n) => '  var ' + n + '_v = ' + n + '\n' + String(b).split(/("(?:[^"\\\n]|\\.)*")/).map((x, i) => (i % 2 ? x : x.replace(new RegExp('\\b' + n + '\\b', 'g'), n + '_v'))).join('');
// the one piece of Emerge a model needs to write a brick (its syntax, kept small); from Emerge's own bench card (bench/chunks.js), with modules
const CARD = `You write Emerge (.eg). Syntax you may use:
fn name(a: num, b: list): map { ... }      fn name(x: num): bool = <expression>
types: num, bool, list, map, string, any
let x = 1   (constant)     var y = 0   (variable)     y = 2   y += 1   y -= 1
if a and b { ... } else if not c { ... } else { ... }        or, and, not
while i < len(xs) { ... }      for k in 1..n { ... }   (k goes 1 .. n-1; the end is excluded)
for e in xs { ... }   (each item of a list: no parentheses, no let, no of)
return value     break     skip (continue)
comparisons: == != < <= > >=      arithmetic: + - * / %
lists: [1, 2, 3]   xs[i]   len(xs)   push(xs, v) returns a NEW list (use: xs = push(xs, v))
maps: { ok: true, n: 3 }   m.ok   (== compares lists and maps by value)
strings: "text"   s + t   len(s)
No semicolons. No classes. No imports. Blocks use { }. Every top-level fn is exported.
No throw, no try: a failure is a returned map, e.g. return { error: "path taken" }.
Loop variables and parameters are read-only. To change one item of a list, build a new list (the pattern):
  var out = []
  for x in xs {
    if x.key == k { out = push(out, { key: x.key, value: v }) } else { out = push(out, x) }
  }
  return { items: out }
Never x.value = v, never xs[i] = v. Compare with ==, !=, and, or, not (never !, &&, ||).
Inside a string, { } is code: write a brace in the text itself twice, "if not x {{ y }}".
Text: split(s, sep) -> list, join(xs, sep) -> string, slice(s, from, to), find_text(s, t) (-1 when absent). s starts_with t, s ends_with t, s contains t are words between two values, never calls.
To replace every t in s: join(split(s, t), u). In split(s, "\\""), the odd parts are the text inside double quotes.
Write the general rule. Never compare the input with the examples' own values: the test has other inputs.`;   // 0.60.632: EMB3 run 15   // 0.60.607: the two refusals DeepSeek 16b met filling rename (throw; a loop variable changed), 2026-11-19

const _q = (s) => String(s == null ? '' : s);
// equal by value, a map's key order not counted (a piece's answer against its contract, EMB8)
const _deq = (a, b) => (a === b) || (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
  && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.prototype.hasOwnProperty.call(b, k) && _deq(a[k], b[k])));
function brief({ file, exports = [], expectation = null, context = '', feedback = null } = {}) {
  const names = exports.map(e => (typeof e === 'string' ? e : e.name)).filter(Boolean);
  return [
    CARD,
    '',
    `Write the Emerge module that becomes ${file}.`,
    names.length ? `It must define these top-level functions (they are its exports): ${names.join(', ')}.` : 'Its top-level functions are its exports.',
    expectation ? `\nIt must pass this test (the expectation, run against its exports):\n\`\`\`js\n${_q(expectation).slice(0, 6000)}\n\`\`\`` : '',
    context ? `\nWhat Nexus holds for this piece:\n${_q(context).slice(0, 3000)}` : '',
    feedback ? `\nYOUR LAST TRY FAILED — fix exactly this, keep what was right:\n${_q(feedback).slice(0, 2000)}` : '',
    '\nReply with only the Emerge code in one fenced code block (```eg). No explanation.',
  ].filter(x => x !== '').join('\n');
}

/** the Emerge code in a reply: an ```eg / ```emerge block, else the first fenced block, else nothing */
function extract(text) {
  const t = _q(text);
  const m = /```(?:eg|emerge)\s*\n([\s\S]*?)```/i.exec(t) || /```[a-z]*\s*\n([\s\S]*?)```/i.exec(t);
  const code = m ? m[1] : '';
  return code.trim() ? code.replace(/\s+$/, '') + '\n' : null;
}

/** the planned file: Emerge's runtime, then the built module's top-level functions as plain exports. In an ES-module folder (0.60.621: the
 *  nearest package.json says "type": "module", as idearium/ does) the planned file is an ES module that loads the built CommonJS (.eg.cjs) through
 *  createRequire and exports each function by name; elsewhere it is CommonJS as before. */
function adapter(file, { esm = false, names = [] } = {}) {
  const dir = path.posix.dirname(file); const base = path.posix.basename(file).replace(/\.[cm]?js$/, '');
  const up = dir === '.' ? '.' : dir.split('/').map(() => '..').join('/');
  // 0.60.633 — Emerge's maps reach JavaScript as objects with no prototype, and a JavaScript caller's deepStrictEqual (the build's own test)
  // reads { body, fixes } as different from them (the cbuild run of 2026-11-21, round 2). At the door every value comes back plain.
  const PLAIN = `const plain = (v) => Array.isArray(v) ? v.map(plain) : (v && typeof v === 'object' && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const wrap = (f) => typeof f === 'function' ? (...a) => plain(f(...a)) : plain(f);`;
  if (esm) {
    return `// built by Emerge from ${base}.eg (EMB1) — edit the .eg, not this file
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createRuntime } = require('${up}/_emerge/lang/runtime.js');
const m = require('./${base}.eg.cjs')(createRuntime({ file: '${base}.eg', loadModule: (abs, r) => require(abs.replace(/\\.eg$/, '.cjs'))(r) }));
${PLAIN}
${names.map(n => `export const ${n} = wrap(m.${n});`).join('\n')}
export default Object.fromEntries(Object.entries(m).map(([k, f]) => [k, wrap(f)]));
`;
  }
  return `'use strict';
// built by Emerge from ${base}.eg (EMB1) — edit the .eg, not this file
const { createRuntime } = require('${up}/_emerge/lang/runtime.js');
${PLAIN}
const m = require('./${base}.eg.js')(createRuntime({ file: '${base}.eg', loadModule: (abs, r) => require(abs.replace(/\\.eg$/, '.js'))(r) }));
module.exports = Object.fromEntries(Object.entries(m).map(([k, f]) => [k, wrap(f)]));
`;
}
/** "module" when the nearest package.json above the file says "type": "module" (as Node decides), else "commonjs" */
function moduleTypeOf(root, file) {
  if (/\.mjs$/.test(file)) return 'module'; if (/\.cjs$/.test(file)) return 'commonjs';
  let d = path.dirname(path.resolve(root || '.', file));
  for (let i = 0; i < 40; i++) { try { const j = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')); return j.type === 'module' ? 'module' : 'commonjs'; } catch (_) {} const u = path.dirname(d); if (u === d) break; d = u; }
  return 'commonjs';
}

// ── the skeleton (0.60.607) ──
let _gapsMod = null;
function _gapsEg() { if (!_gapsMod) { const dir = path.join(__dirname, 'eg-build', 'gaps'); const { createRuntime } = require(path.join(dir, '_emerge', 'lang', 'runtime.js')); _gapsMod = require(path.join(dir, 'main.js'))(createRuntime({ file: 'gaps.eg' })); } return _gapsMod; }   // gaps.eg built standalone by Emerge's command line (lang-build --standalone): its own runtime, never emerge/emerge (AXIOMS 5.15, ER-05)
/** an export's parameter names, from its plan signature "name(a: T, b?: T) -> R" (or e.params); null when it cannot be read */
function paramsOf(e) {
  if (e && Array.isArray(e.params)) return e.params.map(p => String(p).replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean);
  const sig = _q(e && e.signature); const open = sig.indexOf('('); if (open < 0) return null;
  let depth = 0, i = open, cur = '', parts = [];
  for (i = open + 1; i < sig.length; i++) { const ch = sig[i]; if ('{[<('.includes(ch)) depth++; if ('}]>)'.includes(ch)) { if (depth === 0) break; depth--; } if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  if (i >= sig.length) return null;
  parts.push(cur); parts = parts.map(p => p.trim()).filter(Boolean);
  const names = parts.map(p => p.split(/[?:=\s]/)[0].replace(/^\.\.\./, ''));
  return names.every(n => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) ? names : null;
}
const MARK = (n) => '{{gap:' + n + '}}';
/** the module Nexus writes: each export a fn with its parameters (typed any) and a body to fill; null when an export has no readable signature */
function skeletonOf(exports = []) {
  const fns = [];
  for (const e of exports) { const name = typeof e === 'string' ? e : e && e.name; const ps = typeof e === 'string' ? null : paramsOf(e); if (!name || !ps) return null;
    fns.push({ name, params: ps, does: _q(e.does || ''), signature: _q(e.signature || ''), contract: (e && e.contract) || null }); }   // EMB8: a piece carries its own contract
  if (!fns.length) return null;
  const text = fns.map(x => '// ' + (x.signature || x.name).replace(/\n/g, ' ') + (x.does ? ' — ' + x.does.replace(/\n/g, ' ') : '') + '\nfn ' + x.name + '(' + x.params.map(p => p + ': any').join(', ') + '): any {\n' + MARK(x.name) + '\n}').join('\n\n') + '\n';
  return { text, fns };
}
const render = (skel, filled, focus = null) => skel.fns.reduce((s, x) => s.split(MARK(x.name)).join(x.name === focus ? '  ___' : (filled[x.name] != null ? filled[x.name] : '  return null')), skel.text);
/** a reply's body: a fenced block, else the text; when it wrote the whole fn, only what is inside its braces */
function bodyOf(text, name) {
  let t = _q(text).replace(/\r/g, ''); const m = /```[a-z]*\s*\n([\s\S]*?)```/i.exec(t); if (m) t = m[1];
  const at = t.search(new RegExp('fn\\s+' + name + '\\s*\\('));
  if (at >= 0) { const open = t.indexOf('{', at); let d = 0, i = open; for (; i < t.length; i++) { if (t[i] === '{') d++; else if (t[i] === '}' && --d === 0) break; } if (open >= 0 && i < t.length) t = t.slice(open + 1, i); }
  t = t.split('\n').filter(l => l.trim() !== '___' && !/^\s*```/.test(l)).join('\n').replace(/^\n+|\s+$/g, '');
  return t.trim() ? t.split('\n').map(l => (l.startsWith('  ') ? l : '  ' + l.trimStart())).join('\n') : null;
}
function briefGap({ skel, filled, name, expectation = null, feedback = null, lesson = '', method = '' }) {
  return [CARD, '', 'Nexus wrote this Emerge module. Fill ONLY the body marked ___ (in fn ' + name + '). The other functions are done or stubbed; do not change them.',
    '', render(skel, filled, name), '',
    // EMB8 (THE_CONTRACT_JOINS_THEM, his "yes like constraints, need to be acknowledged also"): this piece's own end state, first
    ...(() => { const c = ((skel.fns.find(x => x.name === name) || {}).contract) || null; if (!c) return [];
      const ex = (c.examples || []).slice(0, 8), cs = (c.constraints || []).slice(0, 6);
      return [ex.length ? name + ' must give exactly these (its contract; write the general rule, the test has other inputs):\n' + ex.map(x => '  ' + _q(x)).join('\n') : '',
        cs.length ? 'Its constraints (each must hold):\n' + cs.map(x => '  - ' + _q(x.says || x) + (x.kind ? ' (' + x.kind + ')' : '')).join('\n') : '', ''].filter(Boolean); })(),
    method ? 'The method:\n' + method + '\n' : '',
    expectation ? 'The module must pass this test (run against its exports):\n' + _q(expectation).slice(0, 2500) : '',
    lesson ? '\nBEFORE YOU WRITE — the lesson from this gap\'s earlier tries:\n' + _q(lesson).slice(0, 3500) : '',
    feedback ? '\nYOUR LAST BODY WAS REFUSED — fix exactly this:\n' + _q(feedback).slice(0, 1200) : '',
    '\nReply with only the body of ' + name + ' (the lines that replace ___), no fn line, no explanation.'].filter(x => x !== '').join('\n');
}

// EMB7 (2026-11-23): CIE's templates (emerge/emerge/lang/cie/synth.eg rung 2) before a free body. James, 2026-11-23: "Using schemas, templates,
// and schematics or specs. For reusable structure." The 3b picks a shape and writes each hole as one expression; Emerge renders it (lang-synth).
const TEMPLATE_MENU = [
  ['map_list', 'each item of a list becomes one new item', 'var out = [] / for x in OVER { out = push(out, EACH) } / return RESULT', ['over', 'each', 'result']],
  ['filter_list', 'keep the items that pass', 'var out = [] / for x in OVER { if KEEP { out = push(out, x) } } / return RESULT', ['over', 'keep', 'result']],
  ['fold', 'one value built up from every item', 'var acc = START / for x in OVER { acc = STEP } / return RESULT', ['start', 'over', 'step', 'result']],
  ['find_first', 'the first item that matches, else what is missing', 'for x in OVER { if MATCH { return FOUND } } / return MISSING', ['over', 'match', 'found', 'missing']],
  ['update_item', 'a new list with the matching items changed', 'var out = [] / for x in OVER { if MATCH { out = push(out, CHANGED) } else { out = push(out, x) } } / return RESULT', ['over', 'match', 'changed', 'result']],
  ['guard_then', 'refuse a bad input, else compute', 'if REFUSE_WHEN { return REFUSAL } / return VALUE', ['refuse_when', 'refusal', 'value']],
  ['scan_text', 'walk a text one character at a time (c is the character, i its position)', 'var acc = START / var i = 0 / while i < len(TEXT) { let c = slice(TEXT, i, i + 1) / acc = STEP / i += 1 } / return RESULT', ['start', 'text', 'step', 'result']],
];
// EMB8 small gates (2026-11-24). James: "aren't the gates for each function supposed to reduce that? like gates only hold what is absolutely
// needed". Measured: replace_all's brief was 4,519 to 6,390 characters; what it needs is 169. A piece with a contract is briefed with its own
// function and contract, the signatures (never the bodies) of the module's other functions, only the card lines its examples call for, and
// the last refusal's reason. Everything else stays where it is.
// 2026-11-24: the lines are chosen by the examples AND by the piece's own spec (its "does"): fix_outside's examples are text only, so its gate
// never got the while line nor push, which its spec ("Build a new list: a part at an even index …") needs; the 3b and the 16b wrote Python
function cardFor(examples = [], does = '') {
  const ex = examples.join('\n'), d = String(does || ''), lines = CARD.split('\n'), pick = (re) => lines.filter((l) => re.test(l));
  const core = pick(/^(You write Emerge|fn name\(|let x = 1|if a and b|for e in xs|return value|comparisons:|No semicolons|No throw|Never x\.value|Write the general rule)/);
  const walks = /\b(index|each|every|walk|list|parts|loop|until|while|count|even|odd)\b/i.test(d) ? pick(/^while i < len/) : [];
  const text = /"/.test(ex) || /"|\bsplit\b|\bjoin\b|\btext\b|\bstring\b/i.test(d) ? pick(/^(strings:|Inside a string|Text: split|To replace every)/) : [];
  const list = /\[/.test(ex) || /\b(list|push|parts|index|split)\b/i.test(d) ? pick(/^lists:/) : [], map = /\{/.test(ex) || /\{\s*\w+:/.test(d) ? pick(/^maps:/) : [];
  const pattern = /\[\s*\{/.test(ex) ? lines.slice(lines.findIndex((l) => /^Loop variables/.test(l)), lines.findIndex((l) => /^Never x\.value/.test(l))) : [];
  return [...core.slice(0, 1), ...core.slice(1), ...walks, ...list, ...map, ...text, ...pattern].join('\n');
}
/** an example in Emerge's own literals: the call's arguments and the expected value re-written (a recorded 'x' in single quotes is JavaScript) */
function egLine(l) {
  const s = _q(l), k = s.search(/\)\s*==/); if (k < 0) return s;
  const call = s.slice(0, k + 1), at = call.indexOf('('), want = s.slice(k + 1).replace(/^\s*==\s*/, '');
  try { const vm = require('vm'), args = vm.runInNewContext(`[${call.slice(at + 1, -1)}]`, {}, { timeout: 50 }), w = vm.runInNewContext(`(${want})`, {}, { timeout: 50 });
    return `${call.slice(0, at)}(${args.map((a) => JSON.stringify(a)).join(', ')}) == ${JSON.stringify(w)}`; } catch (_) { return s; }
}
function briefPiece({ skel, filled, name, lesson = '' }) {
  const me = skel.fns.find((x) => x.name === name) || {}, c = me.contract || {}, ex = (c.examples || []).slice(0, 6), cs = (c.constraints || []).slice(0, 4);
  const others = skel.fns.filter((x) => x.name !== name && filled[x.name] != null).map((x) => `fn ${x.name}(${(x.params || []).join(', ')})`);   // only what exists can be called
  const last = _q(lesson).split('\n').filter((l) => /^Refused|^The fix:/.test(l)).slice(-2).join('\n');
  return [cardFor(ex, me.does), '',
    `Write the body of this one Emerge function${me.does ? ' (' + me.does + ')' : ''}:`, `fn ${name}(${(me.params || []).join(', ')}) {`, '  ___', '}', '',
    ex.length ? 'It must give exactly these (write the rule they share; other inputs are tested too):\n' + ex.map((x) => '  ' + egLine(x)).join('\n') : '',
    cs.length ? 'Constraints:\n' + cs.map((x) => '  - ' + _q(x.says || x)).join('\n') : '',
    others.length ? 'Other functions in the module you may call (signatures only):\n' + others.map((x) => '  ' + x).join('\n') : '',
    last ? 'Your last try was refused:\n' + last : '',
    `Reply with only the body of ${name} (the lines that replace ___), no fn line, no explanation.`].filter((x) => x !== '').join('\n');
}

function briefTemplate(args) {
  const base = briefGap(args).replace(/\nReply with only the body of [^\n]*$/, '');
  return [base, '', 'Do not write the body yourself. Choose the template whose shape fits ' + args.name + ', and write each of its holes as ONE Emerge expression.',
    'The names a hole may use: the parameters, x (the item), acc (the running value), out (the list so far), c and i (in scan_text).', '',
    ...TEMPLATE_MENU.map(([n, what, shape, holes]) => `${n}: ${what}\n    ${shape}\n    holes: ${holes.join(', ')}`), '',
    'Reply exactly in this form, one hole per line, nothing else:', 'template: <name>', '<hole>: <one expression>', '…',
    'If no template fits, reply: template: none'].join('\n');
}
/** the reply → { template, holes } or null: "template: fold" then "start: 0" lines */
function templateOf(text) {
  const lines = _q(text).replace(/```\w*/g, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const t = (/^template\s*:\s*`?(\w+)`?/i.exec(lines.find(l => /^template\s*:/i.test(l)) || '') || [])[1];
  const row = TEMPLATE_MENU.find(x => x[0] === t); if (!row) return null;
  const holes = {}; for (const l of lines) { const m = /^`?(\w+)`?\s*:\s*(.+)$/.exec(l); if (m && row[3].includes(m[1].toLowerCase())) holes[m[1].toLowerCase()] = m[2].replace(/`/g, '').trim(); }
  return row[3].every(h => holes[h]) ? { template: t, holes } : { template: t, holes, missing: row[3].filter(h => !holes[h]) };
}

// EMB2 (0.60.611): each skeleton gap is its own node file, <gapDir>/<file>#<fn>.gap (lib/node-export.js, the known type `gap`), in Idearium's
// own data (AXIOMS §5.15: the rung is Idearium's). Every attempt is written to it as it happens (§2.1, his 2026-11-14 "stop using memory for
// storage"), and every try is a fresh chat told gaps.eg lesson() over the gap's earlier attempts, across runs. James, 2026-11-19: "gates need
// to inject the lesson, and failure mode from the previous attempt, and try again, like it needs to understand the problem before trying again"
// James, 2026-11-19: "all the relenavnt files per task need to be bundled in athe same folder. not fragmented. stored in a folder, maybe with the
// contract id or task id? so it needs to be indexed in the node index database for the server.js" — and he chose the contract id. A task's folder
// is <tasksDir>/<contract>/ (the ▶ build's contract: <repo>/<map>.<phase>, the saved idearium/data/phase-contracts one); every gap of it lives
// there, and each file is indexed into Idearium's own node database (lib/node-registry.js storeFor('idearium'): idearium/data/node-index, the
// one its server's registry runs), so `system nodes idearium gap` finds every gap and the folder it is in.
function taskDirOf(tasksDir, contract, file) {
  const NE = require('../../lib/node-export.js');
  const parts = contract ? String(contract).split('/') : ['no-contract', file];   // a gap is never lost for want of a contract (§2.1); said in its record
  return path.join(tasksDir, ...parts.filter(Boolean).map(p => NE.fileIdOf(p)));
}
function gapStore(gapDir, file, { contract = null, index = null } = {}) {
  if (!gapDir) return null;
  const NE = require('../../lib/node-export.js');
  const idOf = (name) => (contract || 'no-contract') + '/' + file + '#' + name;
  const at = (name) => path.join(gapDir, NE.fileIdOf(file + '#' + name) + '.gap');
  return {
    at, dir: gapDir,
    read(name) { try { return NE.importFromFile(at(name)).payload || null; } catch (_) { return null; } },
    write(name, rec) {
      try {
        const doc = NE.wrap('gap', idOf(name), { ...rec, contract, file, fn: name }, { context: 'a skeleton gap of ' + file + ' (the Emerge rung, EMB2), task ' + (contract || 'no-contract'), system: 'idearium', tags: ['emerge-rung', 'task:' + (contract || 'no-contract')] });
        fs.mkdirSync(gapDir, { recursive: true }); const p = at(name); fs.writeFileSync(p, NE.toYaml(doc), 'utf8');
        if (index) { try { require('../../lib/node-index.js').indexNode('gap', doc, p, index); index.flush && index.flush(); } catch (e) { console.log('[emerge-rung] the gap was written but not indexed (said, not silent): ' + e.message); } }
        return p;
      } catch (e) { console.log('[emerge-rung] the gap file was not written (said, not silent): ' + e.message); return null; }
    },
  };
}

/** the rung's gaps from Idearium's node index (nodes_gap), newest first: { id, contract, status, tries, last, file } — filtered by contract or
 *  status; with id, that one gap whole, read from its file (the file is the truth, the index finds it) */
function listGaps({ root = path.resolve(__dirname, '..', '..'), id = null, contract = null, status = null, store = null } = {}) {
  const NI = require('../../lib/node-index.js'); const NE = require('../../lib/node-export.js');
  const db = store || require('../../lib/node-registry.js').storeFor('idearium', { root, fresh: true });
  const rows = NI.queryNodes('gap', (r) => !r._deleted && (!id || r.id === id) && (!contract || (r.payload && r.payload.contract) === contract), db);
  if (id) { const r = rows[0]; if (!r) return null; try { return { id: r.id, filePath: r.filePath, ...NE.importFromFile(r.filePath).payload }; } catch (_) { return { id: r.id, filePath: r.filePath, ...(r.payload || {}), said: 'its file is gone; this is the index\'s copy' }; } }
  return rows.map(r => { const p = r.payload || {}; const a = Array.isArray(p.attempts) ? p.attempts : []; const l = a[a.length - 1] || {};
    return { id: r.id, contract: p.contract || null, status: p.status || 'open', tries: a.length, last: l.said || null, at: l.at || null, filePath: r.filePath }; })
    .filter(g => !status || g.status === status).sort((x, y) => String(y.at).localeCompare(String(x.at)));
}

function createRung({ root = path.resolve(__dirname, '..', '..'), ask, expect, maxTries = 3, timeoutMs = 60000, cli = null, tasksDir = path.join(root, 'idearium', 'data', 'tasks'), indexRoot = root, keep = 3, model = null, maxDepth = 1e9, maxGaps = 1e9, ladder = null, rounds = 1, method = null } = {}) {
  if (typeof ask !== 'function' && !(ladder && ladder.length)) throw new Error('ask(message) is required: the agent that writes the Emerge');
  // the ladder, smallest first: [{ name, ask }] — the first fills every gap; a gap held on it goes to the next, told every earlier try
  const L = ladder && ladder.length ? ladder.filter(x => x && typeof x.ask === 'function') : [{ name: model, ask }];
  // the method per gate is given, never chosen here (his "the pipeline and gates are agnostic", 2026-11-20; 0.60.614): { fill, diagnose, test } → text, as
  // the step's own method resolved by COS (cos/automation/method.eg, a task's method:); a gate with none gets none
  const M = (g) => (method && typeof method === 'object' && typeof method[g] === 'string' ? method[g] : '');
  const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
  /** the gap that stops `name`: deterministic first (a function its own tries called that does not exist), then the learning memory (what
   *  unblocked a gap stuck the same way before, from Idearium's node index), then one short question to the model. null when none is named. */
  async function blockerFor({ name, rec, st, skel, filled, index, who = L[0], method = '' }) {
    const taken = new Set(skel.fns.map(x => x.name));
    const last = [...rec.attempts].reverse().find(a => !a.ok && a.body) || {};
    for (const m of st.missing) {   // its own try called m: the piece it wanted becomes the gap
      if (taken.has(m) || !ID.test(m)) continue;
      const call = new RegExp('\\b' + m + '\\s*\\(([^()]*)\\)').exec(_q(last.body)); const args = call ? call[1].split(',').map(s => s.trim()).filter(Boolean) : [];
      const params = args.map((a, i) => (ID.test(a) && !taken.has(a) ? a : 'arg' + (i + 1))).filter((p, i, xs) => xs.indexOf(p) === i);
      return { name: m, params, signature: m + '(' + params.join(', ') + ')', does: 'the piece ' + name + ' called and needs (named by its own try)', namedBy: 'its own try' };
    }
    const kinds = st.kinds.concat(st.missing.map(() => 'is not defined'));
    let seen = [];
    if (index) { try { seen = require('../../lib/node-index.js').queryNodes('gap', r => r.payload && r.payload.blocks && r.payload.status === 'passed' && r.payload.struggle && (r.payload.struggle.kinds || []).some(k => kinds.includes(k)), index).slice(-3).map(r => r.payload); } catch (_) { seen = []; } }
    const msg = ['You are helping fill an Emerge module one function at a time. The body of fn ' + name + ' could not be written; its tries were refused:',
      ...rec.attempts.filter(a => !a.ok).slice(-3).map(a => '- ' + _q(a.said).split('\n')[0]),
      '', 'The module so far:', render(skel, filled, name), '',
      seen.length ? 'Gaps stuck the same way before were unblocked by a smaller function like:\n' + seen.map(s => '- fn ' + s.signature + ' — ' + s.does).join('\n') + '\n' : '',
      method ? 'The method:\n' + method + '\n' : '',
      'Name ONE smaller new function that, once written, makes ' + name + ' easy (it takes what it needs as parameters and returns a new value; it never changes a parameter).',
      'Reply with exactly one line:  fn <name>(<param>, <param>) — <what it returns>'].filter(x => x !== '').join('\n');
    // James, 2026-11-24: "3b needs to do it's pices use nexus' systems and agent tools to outsource the complexirty, request or build what it needs
    // to solve the problem". The same small model is asked again (up to 3 times, warmer each time) when it names nothing or a name the module
    // already has, told the names that are taken; only then is the piece left to the ladder
    let m = null, said = '';
    for (let k = 1; k <= 3 && !m; k++) {
      const again = k === 1 ? msg : msg + '\n\nThese names are taken, name a NEW one: ' + [...taken].join(', ') + (said ? '\nYou said: ' + said.split('\n')[0].slice(0, 120) : '');
      let text = ''; try { text = await who.ask(again, { gap: name, diagnose: true, tryNo: k }); } catch (_) { break; }
      said = _q(text); const x = /fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*(?:—|--|-|:)?\s*(.*)/.exec(said);
      if (x && !taken.has(x[1]) && x[2].split(',').map(s => s.trim().split(/[:\s=]/)[0]).filter(Boolean).every(p => ID.test(p))) m = x;
    }
    if (!m) return null;
    const params = m[2].split(',').map(s => s.trim().split(/[:\s=]/)[0]).filter(Boolean);
    if (!params.every(p => ID.test(p))) return null;
    return { name: m[1], params, signature: m[1] + '(' + params.join(', ') + ')', does: _q(m[3]).trim().slice(0, 200) || 'what ' + name + ' needs', namedBy: (who.name || model || 'the model') + ', asked why ' + name + ' was stuck' };
  }
  const CLI = cli || path.join(root, 'emerge', 'emerge', 'cli.js');
  // Emerge's door, its command line: { ok, code, stdout, stderr, files }
  const eg = (cmd, source, extra = []) => new Promise((resolve) => {
    if (!fs.existsSync(CLI)) return resolve({ ok: false, stderr: `Emerge is not here (${CLI})`, missing: true });
    execFile(process.execPath, [CLI, cmd, '--source', source, ...extra], { cwd: path.dirname(CLI), timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      try { return resolve(JSON.parse(String(stdout))); } catch (_) { return resolve({ ok: false, stderr: `${String(stderr || '').trim() || (err && err.message) || 'no answer'}` }); }
    });
  });
  // the same door with structured arguments (EMB7): lang-synth takes { units }
  const egJson = (cmd, obj) => new Promise((resolve) => {
    if (!fs.existsSync(CLI)) return resolve({ ok: false, stderr: `Emerge is not here (${CLI})`, missing: true });
    execFile(process.execPath, [CLI, cmd, '--json', JSON.stringify(obj)], { cwd: path.dirname(CLI), timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      try { return resolve(JSON.parse(String(stdout))); } catch (_) { return resolve({ ok: false, stderr: `${String(stderr || '').trim() || (err && err.message) || 'no answer'}` }); }
    });
  });
  const templTried = new Set();   // EMB7: one template try per gap per run
  const firstLines = (s, n = 8) => _q(s).split('\n').map(l => l.trim()).filter(Boolean).slice(0, n).join('\n');

  async function build({ file, exports = [], expectation = null, context = '', skeleton = true, contract = null } = {}) {
    const f = _q(file).replace(/\\/g, '/'); const dir = path.posix.dirname(f); const base = path.posix.basename(f).replace(/\.[cm]?js$/, '');
    const at = (x) => (dir === '.' ? x : `${dir}/${x}`);
    const names = exports.map(e => (typeof e === 'string' ? e : e.name)).filter(Boolean);
    const tries = []; const gapFiles = []; let feedback = null, source = null;
    // 0.60.607 skeleton first: Nexus writes the structure, the agent fills one body at a time (gaps.eg), Emerge's compiler gates each
    // EMB4: the torrent knows each piece's shape. An export planned by name only (its file is already built) takes its parameters from its piece on disk
    if (tasksDir && skeleton !== false && !skeletonOf(exports)) { const disk = gapStore(taskDirOf(tasksDir, contract, f), f, { contract });
      exports = exports.map(e => { const nm = typeof e === 'string' ? e : e && e.name; if (typeof e !== 'string' && paramsOf(e)) return e; const rec = disk && nm ? disk.read(nm) : null; return rec && Array.isArray(rec.params) ? { name: nm, params: rec.params, does: rec.does || '', signature: rec.signature || '' } : e; }); }
    let skel = skeleton === false ? null : skeletonOf(exports);
    if (skel) {
      const G = _gapsEg(); const does = Object.fromEntries(skel.fns.map(x => [x.name, x.does + ' ' + x.signature]));
      const graph = G.needs(skel.fns.map(x => x.name), does);
      const o = G.order(skel.fns.map(x => ({ id: x.name, depends_on: graph[x.name] || [] })));
      let index = null; if (tasksDir && indexRoot) { try { index = require('../../lib/node-registry.js').storeFor('idearium', { root: indexRoot }); } catch (e) { console.log('[emerge-rung] no node index (gaps still written): ' + e.message); } }
      const filled = {}; let held = null; const store = tasksDir ? gapStore(taskDirOf(tasksDir, contract, f), f, { contract, index }) : null;
      // 0.60.612 — the chain. James, 2026-11-20: "if it can't fill a gap, it needs to understand why it's struggling, and add it to the learning
      // memory, like anything that gets in the way towards filling the gap, becomes a gap in between the current step and the gap it couldn't
      // fill" · "so each problem with filling the gap becomes the next gap, in the link." A held gap gets the gap that stops it linked in just
      // before it (gaps.eg struggle, link, guard); the helper is filled first, then the held gap is tried again with the helper to call.
      let chain = o.order.slice(); const depth = {}; const recs = {}; const rungOf = {};
      // EMB4: the torrent. Every piece passed on disk in this phase's folder is taken as it is, helpers included, and never asked again; only what is missing is made.
      if (store) { try { const pre = require('../../lib/node-export.js').fileIdOf(f + '#'), extra = [];
        for (const fn of fs.readdirSync(store.dir).filter(x => x.startsWith(pre) && x.endsWith('.gap'))) { const nm = fn.slice(pre.length, -4); if (skel.fns.some(x => x.name === nm)) continue; const rec = store.read(nm); if (rec && rec.status === 'passed' && rec.body && Array.isArray(rec.params)) extra.push({ name: nm, params: rec.params, does: rec.does || '', signature: rec.signature || '' }); }
        if (extra.length) { skel = skeletonOf([...extra, ...skel.fns.map(x => ({ name: x.name, params: x.params, does: x.does, signature: x.signature, contract: x.contract || null }))]); chain = extra.map(x => x.name).concat(chain); } } catch (_) { /* no folder yet: nothing kept */ } }
      if (store) { const kept = []; for (const x of skel.fns) { const rec = store.read(x.name); if (rec && rec.status === 'passed' && rec.body) { filled[x.name] = rec.body; recs[x.name] = rec; kept.push(x.name); if (!Array.isArray(rec.params)) { rec.params = x.params; rec.signature = rec.signature || x.signature; rec.does = rec.does || x.does; store.write(x.name, rec); } } }
        if (kept.length) { tries.push({ n: 0, stage: 'resume', why: kept.length + ' piece(s) already passed, taken from disk: ' + kept.join(', ') }); console.log('[emerge-rung] ' + f + ': ' + kept.length + ' passed piece(s) taken from disk'); } }
      // 0.60.613 — the ladder, smallest model first (his "the smaller we can get llms in ollama coding the better"; PC_D16 "ollama first"); his
      // framework per gate (his "My whole framework"): the brief of each gate carries his framework's steps for it, read from his .framework.
      const fillMethod = M('fill'), diagnoseMethod = M('diagnose'), testMethod = M('test');
      let roundsAt = 0, refused = {};   // this run's compiler refusals, per gap and rung; cleared when a helper changes what can compile
      for (let round = 0; ; round++) {
      while (chain.some(x => filled[x] == null) && !held) {
        const name = chain.find(x => filled[x] == null);
        const gap = G.as_gap({ id: name, missingVariable: 'the body of ' + name, affectedConstraint: f + ' compiles in Emerge and passes its expectation', source: 'emerge-rung' });
        const rec = recs[name] || (store && store.read(name)) || { ...gap, status: 'open', attempts: [] }; recs[name] = rec;
        if (!Array.isArray(rec.attempts)) rec.attempts = [];
        const r = rungOf[name] || 0; const who = L[r];
        const note = (a) => { rec.attempts.push({ n: rec.attempts.length + 1, at: new Date().toISOString(), model: who.name || model, ...a }); if (store) store.write(name, rec); };
        let ok = false, repeated = false;
        for (let n = 1; n <= maxTries && !ok; n++) {
          const t0 = Date.now(); let text;
          const lesson = G.lesson(rec.attempts, keep);   // a fresh chat each try, told what every earlier try at this gap met (gaps.eg)
          // EMB7: a gap's first try on the smallest model is a template (CIE rung 2): the 3b picks a shape and fills its holes, Emerge renders it;
          // what it renders goes through every check below like any body. A template that does not fit or does not render falls back to the free body.
          let via = null;
          if (n === 1 && r === 0 && process.env.EMERGE_RUNG_TEMPLATES === '1' && !templTried.has(name)) { templTried.add(name);
            try { const said = await who.ask(briefTemplate({ skel, filled, name, expectation, lesson, method: fillMethod }), { tryNo: 0, gap: name, rung: r, template: true });
              const tp = templateOf(said), sf = skel.fns.find(x => x.name === name);
              if (!tp) note({ body: null, via: 'template', said: 'no template chosen (' + _q(said).split('\n')[0].slice(0, 80) + ')', fix: '', ms: Date.now() - t0 });
              else if (tp.missing) note({ body: null, via: 'template ' + tp.template, said: 'holes left empty: ' + tp.missing.join(', '), fix: '', ms: Date.now() - t0 });
              else { const syn = await egJson('lang-synth', { units: [{ id: name, signature: 'fn ' + name + '(' + ((sf && sf.params) || []).join(', ') + ')', derive: { form: 'template', template: tp.template, holes: tp.holes } }] });
                const code = syn && syn.files && syn.files[name + '.eg'];
                if (code) { text = code; via = 'template ' + tp.template; tries.push({ n, stage: 'template:' + name, why: tp.template + ' ' + JSON.stringify(tp.holes).slice(0, 200), gap, model: who.name }); }
                else note({ body: null, via: 'template ' + tp.template, said: 'Emerge did not render it: ' + firstLines((syn && (syn.stdout + syn.stderr)) || 'no answer', 2), fix: '', ms: Date.now() - t0 }); } }
            catch (e) { tries.push({ n, stage: 'template:' + name, why: 'no answer: ' + e.message, gap }); } }
          if (text == null) try { const small = process.env.EMERGE_RUNG_SMALL !== '0' && (((skel.fns.find(x => x.name === name) || {}).contract || {}).examples || []).length; text = await who.ask(small ? briefPiece({ skel, filled, name, lesson }) : briefGap({ skel, filled, name, expectation, lesson, method: fillMethod }), { tryNo: n, gap: name, rung: r }); } catch (e) { tries.push({ n, stage: 'gap:' + name, why: 'no answer: ' + e.message, ms: Date.now() - t0, gap }); break; }
          let body = bodyOf(text, name);
          if (!body) { note({ body: null, said: 'the reply had no body', fix: 'Reply with only the lines of the body.', ms: Date.now() - t0 }); tries.push({ n, stage: 'gap:' + name, why: 'the reply had no body', ms: Date.now() - t0, gap, model: who.name }); continue; }
          // a body already refused: no more tries on this model, the next one up takes the gap (gaps.eg repeats)
          const seen = refused[name + '@' + r] || (refused[name + '@' + r] = []);
          if (r + 1 < L.length && G.repeats(seen, body)) { repeated = true; tries.push({ n, stage: 'gap:' + name, why: 'the same refused body again', ms: Date.now() - t0, gap, model: who.name }); break; }
          // 0.60.632 — a body that answers the examples instead of the rule is refused before it is compiled (gaps.eg copies_examples)
          const cx = G.copies_examples(body); if (cx.copies) { note({ body, said: cx.why, fix: cx.fix, ms: Date.now() - t0 }); tries.push({ n, stage: 'gap:' + name, why: cx.why + '\nThe fix: ' + cx.fix, ms: Date.now() - t0, gap, model: who.name }); continue; }
          let ck = await eg('lang-check', render(skel, { ...filled, [name]: body }));
          // EMB4: what the compiler refused is first given to autocorrect (the 3b's own EMB3); its repair is kept only if it compiles, or if only a parameter is left to copy
          if (ck && !ck.ok && !ck.missing && process.env.EMERGE_RUNG_REPAIR !== '0') { const AC = _autocorrect(), acr = AC ? AC(body) : null;
            if (acr && acr.fixes.length) { const c2 = await eg('lang-check', render(skel, { ...filled, [name]: acr.body })); if (c2.ok || /is a parameter/.test(String(c2.stderr || ''))) { body = acr.body; ck = c2; tries.push({ n, stage: 'repair:' + name, why: 'autocorrect: ' + acr.fixes.join(' '), gap, model: who.name }); } } }
          for (let k = 0; k < 3 && ck && !ck.ok && !ck.missing && process.env.EMERGE_RUNG_REPAIR !== '0'; k++) { const pm = /"(\w+)" is a parameter/.exec(String(ck.stderr || '')); if (!pm) break; body = _unParam(body, pm[1]); tries.push({ n, stage: 'repair:' + name, why: 'parameter ' + pm[1] + ' copied to a var', gap, model: who.name }); ck = await eg('lang-check', render(skel, { ...filled, [name]: body })); }
          if (ck.missing) { tries.push({ n, stage: 'no-emerge', why: ck.stderr, ms: Date.now() - t0 }); held = 'no-emerge'; break; }
          // EMB7, measured 2026-11-23: a refused template body kept as a lesson was copied into every free try after it ("xs" three times).
          // So a template that does not compile is kept on disk as what it was (tried), but never given to the next try as a body to read.
          if (!ck.ok && via) { const said = firstLines(ck.stderr, 2); note({ body: null, tried: body, via, triedSaid: said, said: 'a template did not fit this function', fix: 'write the body yourself', ms: Date.now() - t0 }); tries.push({ n, stage: 'template:' + name, why: 'did not fit: ' + said, gap, model: who.name }); n--; continue; }   // the template is an extra try: it never takes one of the free ones
          if (!ck.ok) { seen.push({ body }); const said = firstLines(ck.stderr); const hn = String(G.fix_for(String(ck.stderr || ''), body)).trim(); note({ body, said, fix: hn, ms: Date.now() - t0 }); tries.push({ n, stage: 'gap:' + name, why: "Emerge's compiler said: " + said + (hn ? '\nThe fix: ' + hn : ''), ms: Date.now() - t0, gap, model: who.name }); continue; }
          // EMB8 (2026-11-24) — the contract is a gate, not only a hint. His "The dag should create the expectations. Create the check list."
          // A piece that compiles is run against its own examples (Emerge runs the module so far, dependencies first, so they are filled);
          // one that breaks an example is refused with what it gave against what the contract says (measured: add_kind compiled, and
          // replaced the item its three examples say to add).
          { const sf = skel.fns.find(x => x.name === name), exs = ((sf && sf.contract && sf.contract.examples) || []).slice(0, 6);
            if (exs.length && process.env.EMERGE_RUNG_CONTRACT !== '0') {
              const callOf = (l) => _q(l).slice(0, _q(l).search(/\)\s*==/) + 1), wantOf = (l) => _q(l).replace(/^[\s\S]*?\)\s*==\s*/, '');
              // the example's arguments re-written as Emerge literals (2026-11-24: a recorded 'x = y;' in single quotes is JavaScript, Emerge
              // could not parse it, and every example of the piece read as "gave nothing" whatever the body was)
              const egCall = (l) => { const c = callOf(l), at = c.indexOf('('); try { const args = require('vm').runInNewContext(`[${c.slice(at + 1, -1)}]`, {}, { timeout: 50 }); return `${c.slice(0, at)}(${args.map((a) => JSON.stringify(a)).join(', ')})`; } catch (_) { return c; } };
              const run = await eg('lang-run', render(skel, { ...filled, [name]: body }) + '\n' + exs.map(l => `print(json(${egCall(l)}))`).join('\n'));
              const outs = String((run && run.stdout) || '').replace(/\r/g, '').split('\n'), same = (a, b) => { try { return _deq(JSON.parse(a), JSON.parse(b)); } catch (_) { return a === b; } };
              const bad = exs.map((l, i) => (same(outs[i], wantOf(l)) ? null : `${callOf(l)} gave ${outs[i] === undefined || outs[i] === '' ? 'nothing' : outs[i]}, its contract says ${wantOf(l)}`)).filter(Boolean);
              if (bad.length) { seen.push({ body }); const said = 'compiles, but breaks its contract: ' + bad.slice(0, 3).join('; ') + (run && !run.ok ? ' (' + firstLines(run.stderr, 1) + ')' : '');
                note({ body, said, fix: 'make every example of ' + name + ' hold: write the rule they share, not one case', ms: Date.now() - t0 }); tries.push({ n, stage: 'contract:' + name, why: said, ms: Date.now() - t0, gap, model: who.name }); continue; } } }
          // his "as each gap passes, gets logged or tagged in the gate as passed and compiled"
          filled[name] = body; ok = true; rec.status = 'passed'; rec.body = body; { const sf = skel.fns.find(x => x.name === name); if (sf) { rec.params = sf.params; rec.signature = rec.signature || sf.signature; rec.does = rec.does || sf.does; } } /* EMB4: a piece carries its own shape, so a later run can take it */ rec.gate = { passed: true, compiled: true, by: "Emerge's compiler (lang-check)", model: who.name || model, at: new Date().toISOString() };
          if (rec.blockedBy && rec.blockedBy.length) rec.unblockedBy = rec.blockedBy.slice();   // the learning memory: what got it past its struggle
          note({ body, said: 'passed; compiles', fix: '', ok: true, via: via || 'free body', ms: Date.now() - t0 }); tries.push({ n, stage: 'gap:' + name, why: 'passed; compiles', ms: Date.now() - t0, gap, model: who.name });
        }
        if (store && !gapFiles.includes(store.at(name))) gapFiles.push(store.at(name));
        if (ok || held) continue;
        // understand why it is struggling, then link the gap that stops it in between (bounded: §14.4), with the same small model first
        const st = G.struggle(rec.attempts); rec.struggle = st;
        // James, 2026-11-24: "always break it down. i told you that. as retry logic before escalating." The bound (§14.4) counts the helpers
        // this module has linked in, not the module's own functions: a 13-function module may still break a gap down before it climbs the ladder
        // James, 2026-11-24: "i dont see any reason why breaking it down would hit a limit. there isn't really an end to increments. or layers of
        // fractals." No count stops it (maxDepth and maxGaps default to no limit); it stops only where no smaller piece can be named, or the piece
        // named is one already in this module (a loop: nothing new would come of it)
        const g = G.guard(depth[name] || 0, Object.keys(depth).filter((k) => depth[k] > 0).length, maxDepth, maxGaps);
        let helper = g.ok ? await blockerFor({ name, rec, st, skel, filled, index, who, method: diagnoseMethod }) : null;
        if (helper && skel.fns.some((x) => x.name === helper.name)) helper = null;
        if (!helper) {
          if (r + 1 < L.length) {   // nothing smaller to link in: the next model up the ladder takes the gap, told every earlier try
            rungOf[name] = r + 1; rec.status = 'escalated'; if (store) store.write(name, rec);
            tries.push({ n: 0, stage: 'escalate', why: name + ': ' + (who.name || 'rung ' + (r + 1)) + ' → ' + (L[r + 1].name || 'rung ' + (r + 2)) + (g.ok ? ' (no gap in between could be named)' : ' (' + g.why + ')') });
            console.log('[emerge-rung] ' + f + ': ' + name + ' escalated to ' + (L[r + 1].name || 'rung ' + (r + 2)));
            continue;
          }
          rec.status = 'held'; if (store) store.write(name, rec); held = 'gap ' + name + ' did not fill on any rung' + (g.ok ? ', and no gap in between could be named' : '; ' + g.why); break;
        }
        const at2 = skel.fns.findIndex(x => x.name === name); const fns = skel.fns.slice(); fns.splice(at2, 0, helper);
        skel = skeletonOf(fns.map(x => ({ name: x.name, params: x.params, does: x.does, signature: x.signature, contract: x.contract || null })));
        refused = {};
        chain = G.link(chain, name, helper.name); depth[helper.name] = (depth[name] || 0) + 1;
        rec.status = 'blocked'; rec.blockedBy = (rec.blockedBy || []).concat(helper.name); if (store) store.write(name, rec);
        recs[helper.name] = { ...G.as_gap({ id: helper.name, missingVariable: 'the body of ' + helper.name, affectedConstraint: name + ' can be written (it was held: ' + (st.kinds.concat(st.missing.map(m => m + ' is not defined'))).join('; ') + ')', source: 'emerge-rung', causedBy: name }), status: 'open', attempts: [], blocks: name, struggle: st, namedBy: helper.namedBy, signature: helper.signature, does: helper.does };
        if (store) store.write(helper.name, recs[helper.name]);
        tries.push({ n: 0, stage: 'link', why: name + ' held; ' + helper.name + ' linked in before it (' + helper.namedBy + '): ' + helper.signature + ' — ' + helper.does });
        console.log('[emerge-rung] ' + f + ': ' + name + ' held — the gap in between: ' + helper.signature + ' (' + helper.namedBy + ')');
      }
      console.log('[emerge-rung] ' + f + ': skeleton of ' + skel.fns.length + ' (' + o.why + ') — ' + (held ? 'held: ' + held : 'every gap passed'));
      // a held gap stays an open loop with its file and its struggle (IF20: not forced, not faked); the whole-module loop never passed after one
      if (held) return { ok: false, held: true, why: 'held: ' + held, tries, source: render(skel, filled), files: null, skeleton: true, gapFiles };
      source = render(skel, filled);
      const t0 = Date.now(); const b = await eg('lang-build', source, ['--standalone']);
      let why;
      if (b.ok && b.files && b.files['main.js']) {
        const esm = moduleTypeOf(root, f) === 'module';   // 0.60.621: in an ES-module folder the built CommonJS is .eg.cjs and the planned file imports it
        const files = { [at(base + '.eg')]: source, [at(base + (esm ? '.eg.cjs' : '.eg.js'))]: b.files['main.js'], [f]: adapter(f, { esm, names: skel.fns.map(x => x.name) }) };
        for (const [k, v] of Object.entries(b.files)) if (k.startsWith('_emerge/')) files[k] = v;
        const x = typeof expect === 'function' ? await expect({ file: f, files }) : { ok: true, why: 'no expectation given' };
        if (x && x.ok) { tries.push({ n: round + 1, stage: 'pass', why: (x && x.why) || 'passed', ms: Date.now() - t0 }); console.log('[emerge-rung] ' + f + ': passed, skeleton first');
          for (const nm of Object.keys(recs)) if (recs[nm].status === 'passed') { recs[nm].gate = { ...(recs[nm].gate || {}), tested: true }; if (store) store.write(nm, recs[nm]); }
          return { ok: true, why: 'skeleton by Nexus, ' + skel.fns.length + ' bodies filled one at a time, checked by Emerge\'s compiler, passed its expectation', tries, source, files, skeleton: true, gapFiles }; }
        why = (x && x.why) || 'the expectation did not pass'; tries.push({ n: round + 1, stage: 'expect', why, ms: Date.now() - t0 });
      } else { why = 'the filled module did not build: ' + firstLines(b.stderr); tries.push({ n: round + 1, stage: 'build', why, ms: Date.now() - t0 }); }
      // his Section 10, hostile verification: a failed test is not a whole-module retry; it is the next gap. The module's own functions (its
      // exports) are reopened, each told the test's words as a refusal; the helpers that passed stay. Bounded by `rounds` (§14.4).
      // `rounds` reopenings on one rung, then the functions under test climb the ladder (a wrong body is the small model's limit, as a refusal is)
      roundsAt++;
      if (roundsAt > rounds) {
        let climbed = false;
        for (const nm of names) if (recs[nm] && (rungOf[nm] || 0) + 1 < L.length) { rungOf[nm] = (rungOf[nm] || 0) + 1; climbed = true; }
        if (!climbed) {
          for (const nm of names) if (recs[nm]) { recs[nm].status = 'held'; if (store) store.write(nm, recs[nm]); }
          return { ok: false, held: true, why: 'held: the module compiled but its test failed ' + (round + 1) + ' time(s), on every rung: ' + why, tries, source, files: null, skeleton: true, gapFiles };
        }
        roundsAt = 0; const up = L[rungOf[names.find(nm => recs[nm])] || 0];
        tries.push({ n: round + 1, stage: 'escalate', why: 'the test failed ' + (round + 1) + ' time(s): ' + names.join(', ') + ' → ' + ((up && up.name) || 'the next rung') });
        console.log('[emerge-rung] ' + f + ': the test failed — ' + names.join(', ') + ' escalated to ' + ((up && up.name) || 'the next rung'));
      }
      // 2026-11-24 (his: "should only have to code those 11 more right?"): a function that passed its own contract's examples is re-checked by
      // the test, never re-coded; only the ones with no examples of their own are reopened (all of them only when every one has examples)
      const own = (nm) => { const x = skel.fns.find((y) => y.name === nm); return !!(x && x.contract && (x.contract.examples || []).length && recs[nm] && recs[nm].status === 'passed'); };
      const reopen = names.filter((nm) => !own(nm)).length ? names.filter((nm) => !own(nm)) : names;
      for (const nm of reopen) if (recs[nm] && filled[nm] != null) {
        recs[nm].attempts.push({ n: recs[nm].attempts.length + 1, at: new Date().toISOString(), model: recs[nm].gate && recs[nm].gate.model, body: filled[nm], said: "the module's test failed: " + _q(why).split('\n').slice(0, 3).join(' '), fix: testMethod ? testMethod.replace(/\n/g, ' ').slice(0, 400) : '' });
        recs[nm].status = 'open'; delete recs[nm].gate; filled[nm] = null; if (store) store.write(nm, recs[nm]);
      }
      tries.push({ n: round + 1, stage: 'reopen', why: 'the test failed; reopened ' + reopen.join(', ') + ' with its words' });
      console.log('[emerge-rung] ' + f + ': the test failed — reopened ' + names.join(', ') + ' (round ' + (round + 2) + ')');
      }
    }
    if (!skel) {
    for (let n = 1; n <= maxTries; n++) {
      const t0 = Date.now(); const fail = (stage, why) => { tries.push({ n, stage, why: _q(why).slice(0, 1500), ms: Date.now() - t0 }); feedback = `${stage === 'compile' ? "Emerge's compiler said" : stage === 'expect' ? 'The expectation test said' : stage === 'exports' ? 'Missing' : 'Problem'}: ${why}`; };
      let text; try { text = await ask(brief({ file: f, exports, expectation, context, feedback }), { tryNo: n }); } catch (e) { tries.push({ n, stage: 'no-answer', why: e.message, ms: Date.now() - t0 }); break; }
      source = extract(text);
      if (!source) { fail('no-code', 'the reply had no Emerge code block'); continue; }
      const ck = await eg('lang-check', source);
      if (ck.missing) { tries.push({ n, stage: 'no-emerge', why: ck.stderr, ms: Date.now() - t0 }); break; }
      if (!ck.ok) { fail('compile', firstLines(ck.stderr) || 'it did not check'); continue; }
      const missing = names.filter(x => !new RegExp(`^\\s*fn\\s+${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`, 'm').test(source));
      if (missing.length) { fail('exports', `${missing.join(', ')} — define ${missing.length === 1 ? 'it' : 'them'} as top-level fn`); continue; }
      const b = await eg('lang-build', source, ['--standalone']);
      if (!b.ok || !b.files || !b.files['main.js']) { fail('build', firstLines(b.stderr) || 'it did not build'); continue; }
      const esm = moduleTypeOf(root, f) === 'module';
      const files = { [at(`${base}.eg`)]: source, [at(`${base}${esm ? '.eg.cjs' : '.eg.js'}`)]: b.files['main.js'], [f]: adapter(f, { esm, names }) };
      for (const [k, v] of Object.entries(b.files)) if (k.startsWith('_emerge/')) files[k] = v;
      const x = typeof expect === 'function' ? await expect({ file: f, files }) : { ok: true, why: 'no expectation given' };
      if (!x || !x.ok) { fail('expect', (x && x.why) || 'the expectation did not pass'); continue; }
      tries.push({ n, stage: 'pass', why: (x && x.why) || 'passed', ms: Date.now() - t0 });
      return { ok: true, why: `written in Emerge, checked by its compiler and passed its expectation on try ${n}`, tries, source, files };
    }
    }
    const last = tries[tries.length - 1];
    return { ok: false, why: last ? `${last.stage}: ${last.why}` : 'no try', tries, source, files: null, gapFiles };
  }
  return { build, eg };
}

module.exports = { MODULE_ID, VERSION: '1.5.0', CARD, brief, briefPiece, cardFor, briefTemplate, templateOf, TEMPLATE_MENU, extract, adapter, createRung, skeletonOf, paramsOf, bodyOf, briefGap, gapStore, taskDirOf, listGaps, moduleTypeOf };
