'use strict';
/**
 * lib/verify-first.js — VF1 (0.60.171): a file that already exists is checked as it is, with no model, before any agent is asked.
 * comp_id: nexus.lib.verify-first
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec VF1, VF5
 *
 * James, 2026-10-19: "what do you think about agents to check previous chunks as is and only change if they don't match
 * coniditions?" · "need verify first, and everything else to solidify the pipeline."
 *
 * His log, 17:19–21:06: lib/title.js existed and passed, yet every run asked an agent to "Write ONE file: lib/title.js" again
 * (attempt 14 at 21:05), each attempt four jobs behind Guardian's 15 s gap. The file loop in idearium/api/index.js runPlanned
 * now asks this first:
 *
 *   check({ root, file, plan, testPath, timeoutMs }) → { verdict, checks:[{ name, ok, why }], key, cached }
 *     verdict  'pass'     the file parses, has every planned export, and the phase's test (frozen) passes against it → hands
 *                         off: no agent is asked, it is recorded as verified as is
 *              'fail'     a check failed → only this file goes to an agent, and the brief is what failed (feedback())
 *              'shallow'  it parses and exports, but there is no test to run → it is NOT called done; the agent is asked,
 *                         with the existing code, to return it unchanged if it already meets the contract
 *              'missing'  no file yet → the normal build
 *   feedback(result)    → the failing checks as a brief section, each with its evidence
 *   No model is called here. The test runs in COS's process sandbox (cos/testenv/run-target.js: clean env, timeout, output cap).
 *   Verdicts are cached in this process by a key of the file, the test, the file's plan entry and the Node version (VF5); a
 *   change to any of them checks again. The cache is in memory: a restart checks again (cheap: one parse, one test run).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const MODULE_ID = 'nexus.lib.verify-first';
const VERSION = '1.0.0';
const _cache = new Map();
const JS_RX = /\.[cm]?js$/;

const _sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const _read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
const _tail = (s, n = 600) => { s = String(s || '').trim(); return s.length > n ? '…' + s.slice(-n) : s; };
// the lines of a test run that say WHAT failed (TAP 'not ok', the assertion, expected/actual), not just the last bytes
function _failLines(out) {
  const keep = String(out || '').split('\n').filter(l => /^\s*not ok\b|error:|expected:|actual:|AssertionError|TypeError|ReferenceError|SyntaxError|Cannot find module/.test(l)).map(l => l.trim());
  return keep.length ? keep.slice(0, 14).join(' | ') : _tail(out);
}

function _parse(abs) {
  if (!JS_RX.test(abs)) return { ok: true, why: 'not a JS file — no parse check' };
  const r = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8', timeout: 15000 });
  return r.status === 0 ? { ok: true, why: 'parses' } : { ok: false, why: `does not parse: ${_tail(r.stderr, 400)}` };
}

async function check({ root, file, plan = null, testPath = null, timeoutMs = 30000, runTarget = null } = {}) {
  if (!root || !file) return { verdict: 'missing', checks: [{ name: 'input', ok: false, why: 'root and file are required' }] };
  const abs = path.join(root, file);
  const code = _read(abs);
  if (code == null) return { verdict: 'missing', checks: [{ name: 'exists', ok: false, why: `${file} is not on disk` }] };
  const testAbs = testPath ? path.join(root, testPath) : null;
  const testCode = testAbs ? _read(testAbs) : null;
  const entry = plan && plan.files ? plan.files.find(f => f.path === file) || null : null;
  const key = _sha([file, _sha(code), testCode == null ? '-' : _sha(testCode), JSON.stringify(entry), process.version].join('\n'));
  if (_cache.has(key)) return { ..._cache.get(key), key, cached: true };

  const checks = [{ name: 'exists', ok: true, why: `${file} is on disk (${code.length} chars)` }];
  const p = _parse(abs); checks.push({ name: 'parse', ...p });
  let exp = { ok: true, why: 'no planned exports to check' };
  if (p.ok && entry && entry.exports && entry.exports.length) {
    const c = require('./phase-plan.js').checkChunk(code, plan, file);
    exp = c.ok ? { ok: true, why: `exports ${entry.exports.map(e => e.name).join(', ')}` } : { ok: false, why: `planned exports missing: ${c.missing.join(', ')} (found: ${c.found.join(', ') || 'none'})` };
  }
  checks.push({ name: 'exports', ...exp });
  let ran = false;
  if (p.ok && exp.ok && testCode != null) {
    // 0.60.244 SV0 — the runner is the caller's to give (idearium passes COS's: cos/testenv runTarget). Core does not reach into COS's
    // folder for it: that was an upward crossing the ratchet had flagged since 0.60.170.
    const RT = runTarget;
    if (typeof RT !== 'function') { checks.push({ name: 'test', ok: false, why: `${testPath} was not run: no test runner was given (the caller passes COS's runTarget)` }); ran = true; }
    else try {
      const r = await RT({ root, testFile: testPath, timeoutMs });
      ran = true;
      checks.push(r.passed
        ? { name: 'test', ok: true, why: `${testPath} passes (${r.durationMs ?? '?'} ms, ${r.backend || 'process'} sandbox)` }
        : { name: 'test', ok: false, why: `${testPath} fails${r.killedByTimeout ? ' (timed out)' : ''}: ${_failLines((r.stdout || '') + '\n' + (r.stderr || ''))}` });
    } catch (e) { checks.push({ name: 'test', ok: false, why: `${testPath} could not run: ${e.message}` }); ran = true; }
  }
  const failed = checks.filter(c => !c.ok);
  const verdict = failed.length ? 'fail' : ran ? 'pass' : 'shallow';
  if (verdict === 'shallow') checks.push({ name: 'test', ok: null, why: testPath ? `${testPath} is not on disk — only parse and exports were checked` : 'the phase has no test — only parse and exports were checked' });
  const res = { verdict, checks, file, testPath };
  _cache.set(key, res);
  return { ...res, key, cached: false };
}

function feedback(res) {
  if (!res || !res.checks) return '';
  const bad = res.checks.filter(c => c.ok === false);
  if (!bad.length) return '';
  return `What failed when ${res.file} was checked as it is (fix exactly these; keep everything that already works):\n${bad.map(c => `- ${c.name}: ${c.why}`).join('\n')}`;
}

function _clear() { _cache.clear(); }

module.exports = { MODULE_ID, VERSION, check, feedback, _clear };
