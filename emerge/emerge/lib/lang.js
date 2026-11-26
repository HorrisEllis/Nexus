'use strict';
// lib/lang.js — component emerge.lang, capability emerge.lang.code: Emerge's language through the system's door (EAS2).
// Nexus docs/emerge-system.spec MOD-EAS-LANG-DOOR. Its commands are nodes (data/nodes/command/emerge.lang.*.command), served at
// POST /lang/check|run|test|build|say|synth; this file is only what they run.
//
// Each call writes its request into a fresh work folder and runs the eg command line there in a child process (EAS_D3): the exact,
// tested CLI, no model, and a program that never ends kills its child, not the door. The timeout is emerge.config.json's
// lang.timeoutMs; a caller may ask for less, never more. Every answer is a LangResult: { ok, code, stdout, stderr, files, ms, timedOut }.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const EG = path.join(__dirname, '..', 'lang', 'eg.js');
const SYNTH = path.join(__dirname, '..', 'lang', 'cie', 'synth.eg');
const DEFAULT_TIMEOUT_MS = 20000;

function _bad(field) { return Object.assign(new Error(`missing ${field}`), { status: 400 }); }

function _timeout(args, ctx) {
  const cap = (ctx && ctx.config && ctx.config.lang && Number(ctx.config.lang.timeoutMs)) || DEFAULT_TIMEOUT_MS;
  const ask = Number(args.timeoutMs);
  return ask > 0 ? Math.min(ask, cap) : cap;
}

/** every file under dir, as { relative/path: text } */
function _files(dir, base = dir, out = {}) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) _files(p, base, out);
    else out[path.relative(base, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

/** run eg with argv in a fresh work folder; prepare(work) writes the request's files first; collect names the folder whose files come back */
function _eg(argv, { args, ctx, prepare, collect, cwd }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'emerge-lang-'));
  const t0 = Date.now();
  if (prepare) prepare(work);
  return new Promise((resolve) => {
    execFile(process.execPath, [EG, ...argv], { cwd: cwd || work, timeout: _timeout(args, ctx), maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const timedOut = !!(err && err.killed);
        const code = err ? (typeof err.code === 'number' ? err.code : null) : 0;
        const files = collect ? _files(path.join(work, collect)) : {};
        try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) { /* a temp folder left behind is not an error of the call */ }
        resolve({ ok: !err, code, stdout: String(stdout), stderr: String(stderr) + (timedOut ? `\n[emerge.lang] timed out after ${_timeout(args, ctx)} ms; the child was killed` : ''), files, ms: Date.now() - t0, timedOut });
      });
  });
}

// 2026-11-26 — James: "The compiler needs to be a step also in the pipeline." A pipeline step names the file ({ path }, an .eg inside Nexus,
// relative to its root); the door reads it, so the compiler is a node on the canvas with no new code of its own.
const NEXUS_ROOT = path.resolve(__dirname, '..', '..', '..');
const _source = (args) => {
  if (typeof args.path === 'string' && args.path) {
    const abs = path.resolve(NEXUS_ROOT, args.path);
    if (!/\.eg$/.test(abs) || path.relative(NEXUS_ROOT, abs).startsWith('..')) throw Object.assign(new Error('path must be an .eg file inside Nexus'), { status: 400 });
    if (!fs.existsSync(abs)) throw Object.assign(new Error(`no file ${args.path}`), { status: 404 });
    return fs.readFileSync(abs, 'utf8');
  }
  if (typeof args.source !== 'string' || !args.source) throw _bad('source (Emerge source text) or path (an .eg file in Nexus)'); return args.source;
};
const _main = (src) => (work) => fs.writeFileSync(path.join(work, 'main.eg'), src);

/** POST /lang/check { source } — parse and check; errors with line and column, nothing runs */
// a pipeline step ({ path }) is judged by its HTTP status: a failed check or test answers 422 with the compiler's own words
const _judged = (args, p) => (typeof args.path === 'string' && args.path) ? p.then((r) => { if (r && r.ok === false) throw Object.assign(new Error(`${args.path}: ${String(r.stderr || r.stdout || '').trim().slice(0, 1500)}`), { status: 422 }); return r; }) : p;
// a named file is checked where it lives (its imports are its neighbours), read only
const _at = (verb, args, ctx) => { _source(args); const abs = path.resolve(NEXUS_ROOT, args.path); return _eg([verb, abs], { args, ctx, cwd: path.dirname(abs) }); };
function check(args, ctx) { return _judged(args, args.path ? _at('check', args, ctx) : _eg(['check', 'main.eg'], { args, ctx, prepare: _main(_source(args)) })); }

/** POST /lang/run { source, args? } — interpret the program */
function run(args, ctx) {
  const extra = Array.isArray(args.args) ? args.args.map(String) : [];
  return _eg(['run', 'main.eg', ...extra], { args, ctx, prepare: _main(_source(args)) });
}

/** POST /lang/test { source } — its test "…" blocks */
function test(args, ctx) { return _judged(args, args.path ? _at('test', args, ctx) : _eg(['test', 'main.eg'], { args, ctx, prepare: _main(_source(args)) })); }

/** POST /lang/build { source, standalone? } — compile to CommonJS; files are the built modules */
function build(args, ctx) {
  return _eg(['build', 'main.eg', '-o', 'out', ...(args.standalone ? ['--standalone'] : [])], { args, ctx, prepare: _main(_source(args)), collect: 'out' });
}

/** POST /lang/say { sentence, json? } — his words to Emerge, no model; files are what it wrote (json: the reading, as data) */
function say(args, ctx) {
  if (typeof args.sentence !== 'string' || !args.sentence.trim()) throw _bad('sentence (his words)');
  // { json: true } (RD9, 2026-11-14): the reading as data — what it is, its end state, gates, fields, gaps — and nothing written
  if (args.json) return _eg(['say', args.sentence, '--json'], { args, ctx });
  return _eg(['say', args.sentence, 'out'], { args, ctx, prepare: (w) => fs.mkdirSync(path.join(w, 'out')), collect: 'out' });
}

/** POST /lang/synth { units } — synth.eg (no model): each unit's derive block to code; files are <id>.eg */
function synth(args, ctx) {
  if (!Array.isArray(args.units) || !args.units.length) throw _bad('units ([{ id, signature, derive }])');
  return _eg(['run', SYNTH, 'units.json', 'out'], {
    args, ctx, collect: 'out',
    prepare: (w) => { fs.writeFileSync(path.join(w, 'units.json'), JSON.stringify(args.units)); fs.mkdirSync(path.join(w, 'out')); },
  });
}

module.exports = { check, run, test, build, say, synth, EG, SYNTH };
