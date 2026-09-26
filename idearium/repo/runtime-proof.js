/**
 * idearium/repo/runtime-proof.js — which chunks actually RAN under a passing test.
 * UUID: nexus-idearium-repo-runtime-proof-v1-0000-2026-0921-jamesbrooks-001
 *
 * James (2026-09-21): prioritise runtime proof. A chunk that is merely "covered" by a test that
 * imports its file has not been shown to work. This runs each runnable test file under V8 coverage
 * (NODE_V8_COVERAGE), maps the executed source ranges onto the chunks' line ranges, and records per
 * chunk whether a PASSING test executed it, tied to the chunk's content hash so a later edit marks
 * the proof stale instead of letting it vouch for code it never ran.
 *
 * States per chunk:
 *   passed       a test that exited 0 executed the chunk
 *   failed       the chunk executed, but only under tests that failed
 *   none         JS repo with runnable tests, and no test executed this chunk
 *   no_tests     no runnable test file in the repo at all
 *   unsupported  not JavaScript: there is no runner here, which is not a failure
 *   test         the chunk is inside a test file (a test is not proven by itself)
 *   (stale is a flag computed on read: the chunk's hash differs from the one proven)
 *
 * §HONEST SCOPE. A chunk that contains a function is judged by V8's own count for that function (was it
 * ENTERED). A chunk with no function (top-level code) is judged by its lines: a candidate line (not blank,
 * not a comment) whose innermost coverage range has count > 0, ignoring the first line of a multi-line
 * chunk. Line-level judging is a heuristic, and function-level is used where it exists because a chunk can
 * hold a function plus a load-time statement (a trailing `module.exports`), and the statement must not
 * vouch for a function nothing called. Either way it proves the code RAN under a passing test. It does not
 * prove the test asserts anything about it, nor that the result was checked.
 * §RUNS REPO CODE, exactly as L6 does (same test selection, same 15s limit, cwd = the repo).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import { isTestPath } from './verify-lazy.js';

export const MODULE_ID = 'nexus-idearium-repo-runtime-proof-v1-0000-2026-0921-jamesbrooks-001';
export const PROOF_FILE = 'proof.json';
export const PROOF_VERSION = 1;

const readJson = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fb; } };

// candidate lines: 1-based -> { text offset of first non-space char } for lines that are code
function candidateLines(text) {
  const out = []; let off = 0; let inBlock = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]; const t = raw.trim();
    const lead = raw.length - raw.trimStart().length;
    let code = t.length > 0;
    if (inBlock) { code = false; if (t.includes('*/')) inBlock = false; }
    else if (t.startsWith('/*')) { code = false; if (!t.includes('*/')) inBlock = true; }
    else if (t.startsWith('//')) code = false;
    if (code) out.push({ line: i + 1, offset: off + lead });
    off += raw.length + 1;
  }
  return out;
}

// innermost range covering `offset` -> its count, across every function in one script's coverage
function countAt(ranges, offset) {
  let best = null;
  for (const r of ranges) {
    if (r.startOffset <= offset && offset < r.endOffset && (!best || (r.endOffset - r.startOffset) <= (best.endOffset - best.startOffset))) best = r;
  }
  return best ? best.count : 0;
}

/** executedLines(text, scriptCoverage) -> Set of 1-based line numbers that ran */
export function executedLines(text, scriptCoverage) {
  const ranges = [];
  for (const fn of scriptCoverage.functions || []) for (const r of fn.ranges || []) ranges.push(r);
  const ran = new Set(); const cand = candidateLines(text);
  for (const c of cand) if (countAt(ranges, c.offset) > 0) ran.add(c.line);
  return { ran, candidates: cand.map(c => c.line) };
}

/** functionEntries(text, scriptCoverage) -> [{ startLine, count }] for every function V8 reports, except the file's own top-level wrapper */
export function functionEntries(text, scriptCoverage) {
  const starts = [0]; for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  const lineOf = (off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; };
  const out = [];
  for (const fn of scriptCoverage.functions || []) {
    const r = (fn.ranges || [])[0]; if (!r) continue;
    if (r.startOffset === 0 && r.endOffset >= text.length - 1) continue; // the module's own top level: it always runs on load
    out.push({ startLine: lineOf(r.startOffset), count: r.count });
  }
  return out;
}

function runOneTest(repoDir, rel, timeoutMs) {
  const covDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rproof-'));
  const started = Date.now(); let status = 'passed'; let error = null;
  try {
    execFileSync(process.execPath, [path.join(repoDir, rel)], { cwd: repoDir, timeout: timeoutMs, stdio: 'pipe', env: { ...process.env, NODE_V8_COVERAGE: covDir } });
  } catch (e) {
    status = 'failed';
    error = e.code === 'ETIMEDOUT' || e.killed ? `timed out after ${timeoutMs}ms` : ((e.stderr && e.stderr.toString()) || e.message || '').slice(0, 1500);
  }
  const scripts = [];
  try {
    for (const f of fs.readdirSync(covDir)) {
      const j = readJson(path.join(covDir, f), null);
      for (const s of (j && j.result) || []) scripts.push(s);
    }
  } catch (_) { /* a killed process may leave nothing: reported as no coverage, not invented */ }
  fs.rmSync(covDir, { recursive: true, force: true });
  return { file: rel, status, error, ms: Date.now() - started, scripts };
}

/**
 * computeRuntimeProof({ repoDir, repository, timeoutMs }) -> the proof object, also written to proof.json.
 * Reads chunks/index.json and indexes/files.json (the pipeline's own output); writes only proof.json.
 */
export function computeRuntimeProof({ repoDir, repository = null, timeoutMs = 15000 } = {}) {
  const chunks = readJson(path.join(repoDir, 'chunks', 'index.json'), null);
  const files = readJson(path.join(repoDir, 'indexes', 'files.json'), null);
  if (!Array.isArray(chunks) || !Array.isArray(files)) return { ok: false, error: 'repo has not been indexed (no chunks/index.json or indexes/files.json)' };

  const lang = new Map(files.map(f => [f.path, f.language || null]));
  const runnable = files.filter(f => isTestPath(f.path) && f.language === 'javascript' && fs.existsSync(path.join(repoDir, f.path)));
  const skippedTests = files.filter(f => isTestPath(f.path) && !runnable.includes(f))
    .map(f => ({ file: f.path, status: 'skipped', reason: f.language ? `no standalone runner for ${f.language}` : 'unknown language' }));

  const root = path.resolve(repoDir);
  const tests = []; const execByFile = new Map(); // file -> [{ test, status, ran:Set, candidates:[] }]
  for (const t of runnable) {
    const r = runOneTest(repoDir, t.path, timeoutMs);
    tests.push({ file: r.file, status: r.status, ms: r.ms, error: r.error, scriptsCovered: r.scripts.length });
    for (const sc of r.scripts) {
      let abs; try { abs = sc.url.startsWith('file:') ? new URL(sc.url).pathname : null; } catch (_) { abs = null; }
      if (!abs || !(abs === root || abs.startsWith(root + path.sep)) || abs.includes(`${path.sep}node_modules${path.sep}`)) continue;
      const rel = path.relative(root, abs).split(path.sep).join('/');
      let text; try { text = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
      const { ran, candidates } = executedLines(text, sc);
      if (!execByFile.has(rel)) execByFile.set(rel, []);
      execByFile.get(rel).push({ test: r.file, status: r.status, ran, candidates, fns: functionEntries(text, sc) });
    }
  }

  const out = []; const summary = { passed: 0, failed: 0, none: 0, no_tests: 0, unsupported: 0, test: 0 };
  for (const c of chunks) {
    const start = c.range && c.range.start_line, end = c.range && c.range.end_line;
    const rec = { chunkId: c.id, file: c.file, range: c.range || null, hashAtRun: (c.hash && c.hash.content) || null };
    if (isTestPath(c.file)) rec.proof = 'test';
    else if (lang.get(c.file) !== 'javascript') { rec.proof = 'unsupported'; rec.reason = lang.get(c.file) ? `no runner for ${lang.get(c.file)}` : 'language not detected'; }
    else if (!runnable.length) rec.proof = 'no_tests';
    else {
      const per = [];
      for (const e of execByFile.get(c.file) || []) {
        const inChunk = e.candidates.filter(l => l >= start && l <= end);
        // A chunk that contains a function is judged by whether V8 says that function was ENTERED. Judging by
        // lines alone let a trailing `module.exports = ...` in the same chunk (which runs on load) vouch for an
        // uncalled function. A chunk with no function (top-level code) falls back to its lines.
        const fnsHere = e.fns.filter(f => f.startLine >= start && f.startLine <= end);
        const judged = inChunk.length > 1 ? inChunk.slice(1) : inChunk; // see §HONEST SCOPE
        const entered = fnsHere.length ? fnsHere.some(f => f.count > 0) : judged.some(l => e.ran.has(l));
        if (entered) per.push({ test: e.test, result: e.status, linesRan: inChunk.filter(l => e.ran.has(l)).length, linesTotal: inChunk.length });
      }
      rec.executedBy = per;
      rec.proof = per.some(p => p.result === 'passed') ? 'passed' : per.length ? 'failed' : 'none';
    }
    summary[rec.proof]++; out.push(rec);
  }
  const proof = { version: PROOF_VERSION, repository, generatedAt: Date.now(), node: process.version, tests: [...tests, ...skippedTests], summary, chunks: out };
  try { fs.writeFileSync(path.join(repoDir, PROOF_FILE), JSON.stringify(proof, null, 2), 'utf8'); }
  catch (e) { return { ok: false, error: `computed but could not write ${PROOF_FILE}: ${e.message}`, proof }; }
  return { ok: true, proof };
}

/** readRuntimeProof(repoDir) -> the stored proof with `stale` set per chunk against the CURRENT chunk index, or null. */
export function readRuntimeProof(repoDir) {
  const proof = readJson(path.join(repoDir, PROOF_FILE), null);
  if (!proof) return null;
  const now = readJson(path.join(repoDir, 'chunks', 'index.json'), []);
  const byId = new Map(now.map(c => [c.id, (c.hash && c.hash.content) || null]));
  const chunks = proof.chunks.map(c => {
    const cur = byId.get(c.chunkId);
    return { ...c, stale: cur === undefined ? true : cur !== c.hashAtRun, ...(cur === undefined ? { staleReason: 'chunk no longer exists' } : {}) };
  });
  return { ...proof, chunks, staleCount: chunks.filter(c => c.stale).length };
}
