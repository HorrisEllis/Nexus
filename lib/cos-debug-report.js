'use strict';
/**
 * lib/cos-debug-report.js — what a failed COS run tells you, pointed at the code (0.39.271 T3).
 * UUID: nexus-cos-debug-report-v1-0000-2026-0927-jamesbrooks-001
 * comp_id: nexus.lib.cos-debug-report
 * Map: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (T3)
 *
 * James: "i want cos to be able to run test envirements that can test any codebase,
 * with the debugging and testing tools." A failed run used to be an exit code and
 * the last 600 characters of stderr. report() reads the run's output the way a
 * person debugging it would:
 *
 *   the error    the first assertion / thrown error / failing test line
 *                (node:assert, node --test "not ok", jest/vitest "●", mocha, pytest
 *                "E   ", Go "--- FAIL", Rust "panicked at", Ruby/PHPUnit failures)
 *   the frames   every stack frame that lands in the repo — Node "at … (f:l:c)",
 *                Python 'File "f", line n', Go/Rust "f.go:12", PHP/Ruby "f:12"
 *                — outside frames (node:internal, node_modules, site-packages) are
 *                counted, not listed
 *   the code     for each repo frame, the source lines around it, read from the
 *                run's own directory BEFORE it is cleaned up (so it is the code that ran)
 *
 * Pure: a run in, a report out. Nothing is guessed — a frame whose file is not in
 * the run directory is listed without an excerpt, and says so.
 */

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'cos-debug-report';
const VERSION = '1.0.0';
const MAX_FRAMES = 8;
const CONTEXT = 3;

const FRAME_RES = [
  // Node / V8:  at fn (/abs/file.js:12:5)   at /abs/file.js:12:5   at file:///abs/file.mjs:12:5
  // (node --test prints its stack frames without the "at")
  { lang: 'js', re: /^\s*(?:at\s+)?(?:(.+?)\s+\()?((?:file:\/\/)?[^\s()'"]+?\.[cm]?[jt]sx?):(\d+):(\d+)\)?\s*$/ },
  // Python:  File "/abs/x.py", line 12, in fn
  { lang: 'py', re: /^\s*File "([^"]+\.py)", line (\d+)(?:, in (.+))?\s*$/, map: (m) => ({ file: m[1], line: +m[2], fn: m[3] || null }) },
  // Go / Rust / Ruby / PHP / generic:  path/x.go:12  src/lib.rs:12:5  x.rb:12:in `fn'  x.php:12
  { lang: 'other', re: /(?:^|\s)((?:\.{0,2}\/)?[\w./-]+\.(?:go|rs|rb|php|c|cc|cpp|h|java|kt|cs|swift)):(\d+)(?::(\d+))?/ },
];

const ERROR_RES = [
  /^\s*(AssertionError(?: \[[A-Z_]+\])?:.*)$/,
  /^\s*((?:[A-Z]\w*)?Error(?: \[[A-Z_]+\])?: .+)$/,
  /^\s*(not ok \d+ .+)$/,                         // TAP / node --test
  /^\s*(● .+)$/,                                    // jest / vitest
  /^\s*(\d+\) .+)$/,                                // mocha
  /^E\s{3}(.+)$/,                                   // pytest
  /^\s*(FAILED .+)$/,                               // pytest summary
  /^\s*(--- FAIL: .+)$/,                            // go test
  /(thread '.+' panicked at .+)$/,                  // rust
  /^\s*(Failure\/Error: .+)$/,                      // rspec
  /^\s*(\d+\) \S+::\S+)$/,                          // phpunit
  /^\s*(✗ .+)$/,                                    // Nexus's own test runners
];

function _rel(cwd, file) {
  let f = String(file || '').replace(/^file:\/\//, '');
  if (cwd && path.isAbsolute(f)) {
    const r = path.relative(cwd, f);
    if (!r.startsWith('..') && !path.isAbsolute(r)) return { rel: r.split(path.sep).join('/'), inRepo: true };
    return { rel: f, inRepo: false };
  }
  return { rel: f.replace(/^\.\//, ''), inRepo: !!cwd && fs.existsSync(path.join(cwd, f)) };
}

const _outside = (f) => /^node:|(^|\/)node_modules\/|site-packages|dist-packages|\/usr\/lib\/|\/rustc\/|<anonymous>|internal\//.test(f);

function _excerpt(cwd, rel, line) {
  if (!cwd || !rel || !line) return null;
  const abs = path.join(cwd, rel);
  let text; try { const st = fs.statSync(abs); if (!st.isFile() || st.size > 2 * 1024 * 1024) return null; text = fs.readFileSync(abs, 'utf8'); } catch (_) { return null; }
  const lines = text.split('\n');
  const from = Math.max(1, line - CONTEXT), to = Math.min(lines.length, line + CONTEXT);
  const out = [];
  for (let n = from; n <= to; n++) out.push({ n, text: lines[n - 1].slice(0, 240), at: n === line });
  return out;
}

/**
 * report(run, { cwd }) -> null for a passing run, else
 *   { file, error, errorLines:[], frames:[{file,line,col,fn,lang,excerpt}], outside, timedOut, exitCode, hint }
 */
function report(run, { cwd = null } = {}) {
  if (!run || run.passed) return null;
  const text = `${run.stderr || ''}\n${run.stdout || ''}\n${run.error || ''}`;
  const lines = text.split('\n');
  const errorLines = [];
  for (const l of lines) {
    for (const re of ERROR_RES) { const m = l.match(re); if (m) { errorLines.push(m[1].trim().slice(0, 400)); break; } }
    if (errorLines.length >= 6) break;
  }
  // TAP (node --test): the message is a block under `error: |-`; actual/expected follow it
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*error:\s*\|-?\s*$/.test(lines[i])) continue;
    const msg = lines.slice(i + 1, i + 8).map(x => x.trim()).filter(Boolean).slice(0, 3).join(' ');
    const near = lines.slice(i, i + 20);
    const pick = (k) => { const m = near.map(x => x.match(new RegExp(`^\\s*${k}:\\s*(.+)$`))).find(Boolean); return m ? m[1].trim() : null; };
    const act = pick('actual'), exp = pick('expected'), op = pick('operator');
    errorLines.unshift(`${msg}${act !== null || exp !== null ? ` (actual ${act} · expected ${exp}${op ? ` · ${op.replace(/'/g, '')}` : ''})` : ''}`.slice(0, 400));
    break;
  }
  const frames = []; let outside = 0; const seen = new Set();
  for (const l of lines) {
    for (const fr of FRAME_RES) {
      const m = l.match(fr.re); if (!m) continue;
      const f = fr.map ? fr.map(m) : fr.lang === 'js' ? { file: m[2], line: +m[3], col: +m[4], fn: m[1] || null } : { file: m[1], line: +m[2], col: m[3] ? +m[3] : null, fn: null };
      if (_outside(f.file)) { outside++; break; }
      const { rel, inRepo } = _rel(cwd, f.file);
      const key = `${rel}:${f.line}`;
      if (seen.has(key)) break;
      seen.add(key);
      if (frames.length < MAX_FRAMES) frames.push({ file: rel, line: f.line, col: f.col || null, fn: f.fn, lang: fr.lang, inRepo, excerpt: inRepo ? _excerpt(cwd, rel, f.line) : null });
      break;
    }
  }
  const timedOut = !!run.killedByTimeout;
  const hint = timedOut ? 'the run was stopped at its time limit — something waits forever (an open server, a timer, a pending promise) or the limit is too short'
    : run.killedByOutputLimit ? 'the run printed past the output limit and was stopped — a loop is logging'
    : /Cannot find module|ERR_MODULE_NOT_FOUND|ModuleNotFoundError|No module named/.test(text) ? 'a module does not resolve — a missing dependency (process runs install nothing; the VM installs) or a broken relative path (Resolve dependencies lists them)'
    : /EADDRINUSE/.test(text) ? 'a port is taken — COS shifts ports for its own runs; this one was bound outside the shift'
    : /COS_NET_ISOLATED|network isolation/i.test(text) ? 'the code tried to reach the network — COS runs have none'
    : /SyntaxError/.test(text) ? 'the file does not parse — Syntax check shows every such file'
    : !frames.some(f => f.inRepo) && errorLines.length ? 'the failure has no frame in this repo — it surfaced in a dependency or the runtime; the error line is the lead'
    : null;
  return { file: run.file || null, exitCode: run.exitCode ?? null, error: errorLines[0] || (run.error ? String(run.error).slice(0, 400) : null), errorLines, frames, outside, timedOut, hint };
}

/** compact(r) — a report small enough to keep in a run history row */
function compact(r) {
  if (!r) return null;
  return { ...r, frames: r.frames.slice(0, 4).map(f => ({ ...f, excerpt: f.excerpt ? f.excerpt.filter(x => Math.abs(x.n - f.line) <= 2) : null })) };
}

module.exports = { MODULE_ID, VERSION, report, compact };
