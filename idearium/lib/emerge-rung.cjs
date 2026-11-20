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
Never x.value = v, never xs[i] = v. Compare with ==, !=, and, or, not (never !, &&, ||).`;   // 0.60.607: the two refusals DeepSeek 16b met filling rename (throw; a loop variable changed), 2026-11-19

const _q = (s) => String(s == null ? '' : s);
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

/** the planned file: Emerge's runtime, then the built module's top-level functions as plain exports */
function adapter(file) {
  const dir = path.posix.dirname(file); const base = path.posix.basename(file).replace(/\.[cm]?js$/, '');
  const up = dir === '.' ? '.' : dir.split('/').map(() => '..').join('/');
  return `'use strict';
// built by Emerge from ${base}.eg (EMB1) — edit the .eg, not this file
const { createRuntime } = require('${up}/_emerge/lang/runtime.js');
module.exports = require('./${base}.eg.js')(createRuntime({ file: '${base}.eg', loadModule: (abs, r) => require(abs.replace(/\\.eg$/, '.js'))(r) }));
`;
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
    fns.push({ name, params: ps, does: _q(e.does || ''), signature: _q(e.signature || '') }); }
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
function briefGap({ skel, filled, name, expectation = null, feedback = null }) {
  return [CARD, '', 'Nexus wrote this Emerge module. Fill ONLY the body marked ___ (in fn ' + name + '). The other functions are done or stubbed; do not change them.',
    '', render(skel, filled, name), '',
    expectation ? 'The module must pass this test (run against its exports):\n' + _q(expectation).slice(0, 2500) : '',
    feedback ? '\nYOUR LAST BODY WAS REFUSED — fix exactly this:\n' + _q(feedback).slice(0, 1200) : '',
    '\nReply with only the body of ' + name + ' (the lines that replace ___), no fn line, no explanation.'].filter(x => x !== '').join('\n');
}

function createRung({ root = path.resolve(__dirname, '..', '..'), ask, expect, maxTries = 3, timeoutMs = 60000, cli = null } = {}) {
  if (typeof ask !== 'function') throw new Error('ask(message) is required: the agent that writes the Emerge');
  const CLI = cli || path.join(root, 'emerge', 'emerge', 'cli.js');
  // Emerge's door, its command line: { ok, code, stdout, stderr, files }
  const eg = (cmd, source, extra = []) => new Promise((resolve) => {
    if (!fs.existsSync(CLI)) return resolve({ ok: false, stderr: `Emerge is not here (${CLI})`, missing: true });
    execFile(process.execPath, [CLI, cmd, '--source', source, ...extra], { cwd: path.dirname(CLI), timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      try { return resolve(JSON.parse(String(stdout))); } catch (_) { return resolve({ ok: false, stderr: `${String(stderr || '').trim() || (err && err.message) || 'no answer'}` }); }
    });
  });
  const firstLines = (s, n = 8) => _q(s).split('\n').map(l => l.trim()).filter(Boolean).slice(0, n).join('\n');

  async function build({ file, exports = [], expectation = null, context = '', skeleton = true } = {}) {
    const f = _q(file).replace(/\\/g, '/'); const dir = path.posix.dirname(f); const base = path.posix.basename(f).replace(/\.[cm]?js$/, '');
    const at = (x) => (dir === '.' ? x : `${dir}/${x}`);
    const names = exports.map(e => (typeof e === 'string' ? e : e.name)).filter(Boolean);
    const tries = []; let feedback = null, source = null;
    // 0.60.607 skeleton first: Nexus writes the structure, the agent fills one body at a time (gaps.eg), Emerge's compiler gates each
    const skel = skeleton === false ? null : skeletonOf(exports);
    if (skel) {
      const G = _gapsEg(); const does = Object.fromEntries(skel.fns.map(x => [x.name, x.does + ' ' + x.signature]));
      const graph = G.needs(skel.fns.map(x => x.name), does);
      const o = G.order(skel.fns.map(x => ({ id: x.name, depends_on: graph[x.name] || [] })));
      const filled = {}; let held = null;
      for (const name of o.order) {
        const gap = G.as_gap({ id: name, missingVariable: 'the body of ' + name, affectedConstraint: f + ' compiles in Emerge and passes its expectation', source: 'emerge-rung' });
        let fb = null, ok = false;
        for (let n = 1; n <= maxTries && !ok; n++) {
          const t0 = Date.now(); let text;
          try { text = await ask(briefGap({ skel, filled, name, expectation, feedback: fb }), { tryNo: n, gap: name }); } catch (e) { tries.push({ n, stage: 'gap:' + name, why: 'no answer: ' + e.message, ms: Date.now() - t0, gap }); break; }
          const body = bodyOf(text, name);
          if (!body) { fb = 'the reply had no body'; tries.push({ n, stage: 'gap:' + name, why: fb, ms: Date.now() - t0, gap }); continue; }
          const ck = await eg('lang-check', render(skel, { ...filled, [name]: body }));
          if (ck.missing) { tries.push({ n, stage: 'no-emerge', why: ck.stderr, ms: Date.now() - t0 }); held = 'no-emerge'; break; }
          if (!ck.ok) { const hn = G.hint(String(ck.stderr || '')); fb = "Emerge's compiler said: " + firstLines(ck.stderr) + (hn ? '\nThe fix: ' + hn : ''); tries.push({ n, stage: 'gap:' + name, why: fb, ms: Date.now() - t0, gap }); continue; }
          filled[name] = body; ok = true; tries.push({ n, stage: 'gap:' + name, why: 'filled; compiles', ms: Date.now() - t0, gap });
        }
        if (!ok) { held = held || ('gap ' + name + ' did not fill in ' + maxTries + ' tries'); break; }
      }
      console.log('[emerge-rung] ' + f + ': skeleton of ' + skel.fns.length + ' (' + o.why + ') — ' + (held ? 'held: ' + held : 'every gap filled'));
      if (!held) {
        source = render(skel, filled);
        const t0 = Date.now(); const b = await eg('lang-build', source, ['--standalone']);
        if (b.ok && b.files && b.files['main.js']) {
          const files = { [at(base + '.eg')]: source, [at(base + '.eg.js')]: b.files['main.js'], [f]: adapter(f) };
          for (const [k, v] of Object.entries(b.files)) if (k.startsWith('_emerge/')) files[k] = v;
          const x = typeof expect === 'function' ? await expect({ file: f, files }) : { ok: true, why: 'no expectation given' };
          if (x && x.ok) { tries.push({ n: 1, stage: 'pass', why: (x && x.why) || 'passed', ms: Date.now() - t0 }); console.log('[emerge-rung] ' + f + ': passed, skeleton first');
            return { ok: true, why: 'skeleton by Nexus, ' + skel.fns.length + ' bodies filled one at a time, checked by Emerge\'s compiler, passed its expectation', tries, source, files, skeleton: true }; }
          feedback = 'The module (skeleton by Nexus, bodies filled) compiled but its expectation failed: ' + ((x && x.why) || 'it did not pass') + '\nThe module was:\n' + source;
          tries.push({ n: 1, stage: 'expect', why: (x && x.why) || 'the expectation did not pass', ms: Date.now() - t0 });
        } else { feedback = 'The filled module did not build: ' + firstLines(b.stderr); tries.push({ n: 1, stage: 'build', why: feedback, ms: Date.now() - t0 }); }
      }
    }
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
      const files = { [at(`${base}.eg`)]: source, [at(`${base}.eg.js`)]: b.files['main.js'], [f]: adapter(f) };
      for (const [k, v] of Object.entries(b.files)) if (k.startsWith('_emerge/')) files[k] = v;
      const x = typeof expect === 'function' ? await expect({ file: f, files }) : { ok: true, why: 'no expectation given' };
      if (!x || !x.ok) { fail('expect', (x && x.why) || 'the expectation did not pass'); continue; }
      tries.push({ n, stage: 'pass', why: (x && x.why) || 'passed', ms: Date.now() - t0 });
      return { ok: true, why: `written in Emerge, checked by its compiler and passed its expectation on try ${n}`, tries, source, files };
    }
    const last = tries[tries.length - 1];
    return { ok: false, why: last ? `${last.stage}: ${last.why}` : 'no try', tries, source, files: null };
  }
  return { build, eg };
}

module.exports = { MODULE_ID, VERSION: '1.1.0', CARD, brief, extract, adapter, createRung, skeletonOf, paramsOf, bodyOf, briefGap };
