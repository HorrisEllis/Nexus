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
return value     break     skip (continue)
comparisons: == != < <= > >=      arithmetic: + - * / %
lists: [1, 2, 3]   xs[i]   len(xs)   push(xs, v) returns a NEW list (use: xs = push(xs, v))
maps: { ok: true, n: 3 }   m.ok   (== compares lists and maps by value)
strings: "text"   s + t   len(s)
No semicolons. No classes. No imports. Blocks use { }. Every top-level fn is exported.`;

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

  async function build({ file, exports = [], expectation = null, context = '' } = {}) {
    const f = _q(file).replace(/\\/g, '/'); const dir = path.posix.dirname(f); const base = path.posix.basename(f).replace(/\.[cm]?js$/, '');
    const at = (x) => (dir === '.' ? x : `${dir}/${x}`);
    const names = exports.map(e => (typeof e === 'string' ? e : e.name)).filter(Boolean);
    const tries = []; let feedback = null, source = null;
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

module.exports = { MODULE_ID, VERSION: '1.0.0', CARD, brief, extract, adapter, createRung };
