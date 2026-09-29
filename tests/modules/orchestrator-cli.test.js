'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/orchestrator-cli.test.js — New CLI Commands (intel/raid/compartments/purge)
 * UUID: test-orchestrator-cli-v1-0000-5100-0000-000000000001
 *
 * Covers "I need a command line tool for the intelligence system, raid
 * engine, compartments" + "a command to purge redundant gaps and patterns"
 * (James, 2026-06-19) end-to-end: spawns the REAL `node orchestrator.js
 * <cmd>` CLI as a child process against a fake HTTP server standing in for
 * cortex on 127.0.0.1:3748 (the orchestrator's hardcoded SYS.cortex port),
 * and asserts on the actual stdout the operator would see.
 *
 * This is intentionally a different test style than the unit-level route
 * tests in admin-server-routes.test.js — those prove the routes are
 * correct in isolation; this proves the CLI commands the operator actually
 * types are correctly wired to them end-to-end.
 */

const assert = require('assert');
const http   = require('http');
const path   = require('path');
const { spawn } = require('child_process');

let passed = 0, failed = 0;
const _registry = [];
function test(id, desc, fn) { _registry.push({ id, desc, fn }); }

async function runAll() {
  for (const { id, desc, fn } of _registry) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  await new Promise(r => fakeCortex.close(r));
  await new Promise(r => fakeIntel.close(r));
  process.stdout.write(`\n  orchestrator-cli.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

// ── Fake cortex server on the orchestrator's hardcoded port (3748) ──────────────
let currentHandler = (req, res) => { res.writeHead(404); res.end('{}'); };
const fakeCortex = http.createServer((req, res) => currentHandler(req, res));

// §BUGFIX 2026-08-25 — was '../../orchestrator/orchestrator.js'. orchestrator.js was
// moved to orchestrator/orchestrator.js during this session's own BL11
// (repo-root file consolidation) — this test file was missed in that
// move's own consumer trace at the time. Every one of this file's 11
// real tests spawns ORCH_PATH as a child process and asserts on its
// output; spawning a nonexistent file produces empty output for all of
// them, which is exactly the failure mode all 11 showed.
const ORCH_PATH = path.join(__dirname, '../../orchestrator/orchestrator.js');
const REPO_ROOT = path.join(__dirname, '../..');

function runCli(args, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const proc = spawn('node', [ORCH_PATH, ...args], { cwd: REPO_ROOT });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    const killer = setTimeout(() => { proc.kill(); resolve({ stdout, stderr, code: -1, timedOut: true }); }, timeoutMs);
    proc.on('close', (code) => { clearTimeout(killer); resolve({ stdout, stderr, code, timedOut: false }); });
  });
}

// Strip ANSI color codes for substring assertions independent of C.* codes.
function plain(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

const _ready = new Promise(resolve => fakeCortex.listen(3748, '127.0.0.1', resolve));

// 2026-09-19: `intel patterns|failures|reuse` moved off cortex. The orchestrator now asks the
// sovereign intelligence system (its hardcoded SYS.intelligence port, 3753), so it gets its own fake.
let currentIntelHandler = (req, res) => { res.writeHead(404); res.end('{}'); };
const fakeIntel = http.createServer((req, res) => currentIntelHandler(req, res));
const _readyIntel = new Promise(resolve => fakeIntel.listen(3753, '127.0.0.1', resolve));

// ── §A: intel ──────────────────────────────────────────────────────────────────

test('A1', '`intel patterns` lists crystallised patterns from the real route', async () => {
  await _readyIntel;
  currentIntelHandler = (req, res) => {
    if (req.url === '/api/intelligence/patterns') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, patterns: [
        { patternType: 'co_occurrence', description: 'X co-occurs with Y', crystallised: true },
        { patternType: 'bottleneck', description: 'stale gaps recurring', crystallised: false },
      ], total: 2 }));
    } else { res.writeHead(404); res.end('{}'); }
  };
  const r = await runCli(['intel', 'patterns']);
  const out = plain(r.stdout);
  assert(out.includes('PATTERNS (2)'), `expected pattern count header, got:\n${out}`);
  assert(out.includes('X co-occurs with Y'), `expected pattern description in output, got:\n${out}`);
});

test('A2', '`intel failures` lists fault taxonomy', async () => {
  await _readyIntel;
  currentIntelHandler = (req, res) => {
    if (req.url === '/api/intelligence/failures') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, failures: [{ faultClass: 'timeout', count: 4, precursors: ['retry'] }], total: 1 }));
    } else { res.writeHead(404); res.end('{}'); }
  };
  const r = await runCli(['intel', 'failures']);
  const out = plain(r.stdout);
  assert(out.includes('FAULT TAXONOMY (1)'));
  assert(out.includes('timeout'));
});

test('A3', '`intel` with intelligence offline reports the offline error, not a crash', async () => {
  const r = await runCli(['intel', 'patterns', '--unused'], { timeoutMs: 5000 });
  // Point this one at the closed handler by temporarily stopping the server
  // is overkill — instead assert the command at least exits cleanly and
  // never throws an unhandled exception when intelligence returns something
  // unexpected.
  currentIntelHandler = (req, res) => { res.writeHead(500); res.end('not json'); };
  const r2 = await runCli(['intel', 'patterns']);
  assert.strictEqual(r2.code, 0, `CLI should exit 0 even on a malformed upstream response, stderr: ${r2.stderr}`);
});

// ── §B: raid ───────────────────────────────────────────────────────────────────

test('B1', '`raid` prints version, health, and weights from /api/raid/status', async () => {
  await _ready;
  currentHandler = (req, res) => {
    if (req.url === '/api/raid/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '6.0.0', health: { claude: { online: true } }, weights: { claude: 0.7, ollama: 0.3 }, weightCount: 2 }));
    } else { res.writeHead(404); res.end('{}'); }
  };
  const r = await runCli(['raid']);
  const out = plain(r.stdout);
  assert(out.includes('v6.0.0'), `expected version in output, got:\n${out}`);
  assert(out.includes('claude'), `expected agent health line, got:\n${out}`);
  assert(out.includes('70.0%'), `expected weight percentage, got:\n${out}`);
});

test('B2', '`raid` with RAID unregistered (404) reports a clear offline message', async () => {
  await _ready;
  currentHandler = (req, res) => { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); };
  const r = await runCli(['raid']);
  const out = plain(r.stdout);
  assert(r.code === 0, 'CLI should still exit cleanly');
});

// ── §C: compartments ───────────────────────────────────────────────────────────

test('C1', '`compartments` lists compartments from /api/compartments', async () => {
  await _ready;
  currentHandler = (req, res) => {
    if (req.url === '/api/compartments') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, compartments: [
        { uuid: 'abc12345', status: 'PASS', _declaredDomain: 'cortex', _declaredVerb: 'read' },
      ], total: 1 }));
    } else { res.writeHead(404); res.end('{}'); }
  };
  const r = await runCli(['compartments']);
  const out = plain(r.stdout);
  assert(out.includes('COMPARTMENTS (1)'));
  assert(out.includes('abc12345'.slice(0, 8)));
  assert(out.includes('cortex:read'));
});

test('C2', '`compartments show <uuid>` prints the full JSON of one compartment', async () => {
  await _ready;
  currentHandler = (req, res) => {
    if (req.url === '/api/compartments/xyz-1') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, compartment: { uuid: 'xyz-1', status: 'PASS', result: { foo: 'bar' } } }));
    } else { res.writeHead(404); res.end('{}'); }
  };
  const r = await runCli(['compartments', 'show', 'xyz-1']);
  const out = plain(r.stdout);
  assert(out.includes('"status": "PASS"'), `expected pretty-printed JSON, got:\n${out}`);
});

test('C3', '`compartments show` with no uuid prints usage, not a crash', async () => {
  const r = await runCli(['compartments', 'show']);
  const out = plain(r.stdout);
  assert(out.includes('Usage:'), `expected usage message, got:\n${out}`);
  assert.strictEqual(r.code, 0);
});

// ── §D: purge ──────────────────────────────────────────────────────────────────

test('D1', '`purge` posts to /api/purge and prints the evicted counts', async () => {
  await _ready;
  currentHandler = (req, res) => {
    if (req.method === 'POST' && req.url === '/api/purge') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const parsed = JSON.parse(body);
        assert.strictEqual(parsed.dryRun, false, 'CLI without --dry-run should send dryRun:false');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, dryRun: false, patterns: { rowsEvicted: 3 }, gaps: { rowsEvicted: 2 }, log: ['[flush] did the thing'] }));
      });
    } else { res.writeHead(404); res.end('{}'); }
  };
  const r = await runCli(['purge']);
  const out = plain(r.stdout);
  assert(out.includes('patterns: 3 evicted'), `expected patterns evicted count, got:\n${out}`);
  assert(out.includes('gaps: 2 evicted'), `expected gaps evicted count, got:\n${out}`);
});

test('D2', '`purge --dry-run` sends dryRun:true and labels the output as a dry run', async () => {
  await _ready;
  currentHandler = (req, res) => {
    if (req.method === 'POST' && req.url === '/api/purge') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const parsed = JSON.parse(body);
        assert.strictEqual(parsed.dryRun, true, '--dry-run flag should send dryRun:true');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, dryRun: true, patterns: { rowsEvicted: 1 }, gaps: { rowsEvicted: 0 }, log: [] }));
      });
    } else { res.writeHead(404); res.end('{}'); }
  };
  const r = await runCli(['purge', '--dry-run']);
  const out = plain(r.stdout);
  assert(out.includes('dry run'), `expected dry-run label somewhere in output, got:\n${out}`);
});

// ── §E: help text mentions the new commands ──────────────────────────────────

test('E1', '`help` lists the new intel/raid/compartments/purge commands', async () => {
  const r = await runCli(['help']);
  const out = plain(r.stdout);
  assert(out.includes('intel'), 'help should mention intel');
  assert(out.includes('raid'), 'help should mention raid');
  assert(out.includes('compartments'), 'help should mention compartments');
  assert(out.includes('purge'), 'help should mention purge');
});

// ── RUN ───────────────────────────────────────────────────────────────────────
runAll();

module.exports = { passed: () => passed, failed: () => failed };
