'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-decompose.js — real tests for cli/decompose.js,
 * using a real, isolated temp directory of fixture files (not mocked),
 * run through the actual CLI via child_process — same discipline every
 * other scanner test in this folder uses.
 *
 * Covers the 2026-09-13 generalization: James wanted the tool usable on
 * any monolith (it had only ever been proven against cortex/boot.js).
 * Checked ollama/copilot/guardian directly before writing these —
 * copilot uses `p` in BOTH condition orders, guardian uses a different
 * path variable (`url.pathname`) entirely, and guardian's real
 * /version handler exposed a genuine pre-existing brace-walker bug
 * (a regex literal with a quote inside a character class was misread
 * as a string delimiter) — all three are covered here, not just the
 * generalization's happy path.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const DECOMPOSE = path.join(ROOT, 'cli/decompose.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function writeFixture(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decompose-fixture-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

function analyze(file) {
  return execFileSync(process.execPath, [DECOMPOSE, 'analyze', file], { encoding: 'utf8' });
}

(() => {
  test('DC-001', 'cortex-style p === convention still matches (regression)', () => {
    const file = writeFixture('a.js', [
      "function handle(req, res, p, method) {",
      "  if (p === '/health') {",
      "    res.end('ok');",
      "    return;",
      "  }",
      "}",
    ].join('\n'));
    const out = analyze(file);
    assert.ok(/1 extractable route block/.test(out), out);
    assert.ok(out.includes('/health'), out);
  });

  test('DC-002', 'guardian-style url.pathname convention now matches (was 0 before generalization)', () => {
    const file = writeFixture('b.js', [
      "function handle(req, res, url, method) {",
      "  if (method === 'GET' && url.pathname === '/queue') {",
      "    res.end('ok');",
      "    return;",
      "  }",
      "}",
    ].join('\n'));
    const out = analyze(file);
    assert.ok(/1 extractable route block/.test(out), out);
    assert.ok(out.includes('/queue'), out);
    assert.ok(out.includes('[GET]'), out);
  });

  test('DC-003', 'copilot-style method-first p order now matches (old regex was path-first only)', () => {
    const file = writeFixture('c.js', [
      "function handle(req, res, p, method) {",
      "  if (method === 'POST' && p === '/api/axioms/add') {",
      "    res.end('ok');",
      "    return;",
      "  }",
      "}",
    ].join('\n'));
    const out = analyze(file);
    assert.ok(/1 extractable route block/.test(out), out);
    assert.ok(out.includes('/api/axioms/add'), out);
    assert.ok(out.includes('[POST]'), out);
  });

  test('DC-004', 'GATE: a quote inside a regex character class no longer corrupts brace depth and swallows subsequent real routes', () => {
    // Reproduces guardian/server.js:1678 exactly — a bare `'` inside a
    // regex character class, previously misread as a string delimiter.
    const file = writeFixture('d.js', [
      "function handle(req, res, url, method) {",
      "  if (method === 'GET' && url.pathname === '/version') {",
      "    const m = content.match(/version['\":\\s]+['\"v]?(\\d+\\.\\d+\\.\\d+)/i);",
      "    res.end(m ? m[1] : '');",
      "    return;",
      "  }",
      "  if (method === 'GET' && url.pathname === '/after') {",
      "    res.end('should still be found');",
      "    return;",
      "  }",
      "}",
    ].join('\n'));
    const out = analyze(file);
    assert.ok(/2 extractable route block/.test(out), `expected both blocks found, got:\n${out}`);
    assert.ok(out.includes('/version'), out);
    assert.ok(out.includes('/after'), 'the route AFTER the regex-containing block must not be swallowed');
    // The /version block itself must be small (a handful of lines), not
    // sprawled to the rest of the file the way the pre-fix bug produced.
    const versionLine = out.split('\n').find(l => l.includes('/version'));
    const sizeMatch = versionLine.match(/\((\d+) lines\)/);
    assert.ok(sizeMatch && Number(sizeMatch[1]) < 10, `/version block size should be small, got: ${versionLine}`);
  });

  test('DC-005', 'dynamic (.startsWith/.test) routes are still correctly excluded, not falsely matched', () => {
    const file = writeFixture('e.js', [
      "function handle(req, res, url, method) {",
      "  if (method === 'GET' && url.pathname.startsWith('/open/')) {",
      "    res.end('ok');",
      "    return;",
      "  }",
      "  if (method === 'POST' && /^\\/queue\\/retry\\//.test(url.pathname)) {",
      "    res.end('ok');",
      "    return;",
      "  }",
      "}",
    ].join('\n'));
    const out = analyze(file);
    assert.ok(/0 extractable route block/.test(out), `dynamic routes must not be matched as static: ${out}`);
  });

  test('DC-006', 'extract on a url.pathname-convention file reuses the verbatim condition, never introduces an undefined p', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decompose-extract-'));
    const file = path.join(dir, 'server.js');
    fs.writeFileSync(file, [
      "'use strict';",
      "function handle(req, res, url, method) {",
      "  if (method === 'GET' && url.pathname === '/baseline') {",
      "    res.end(JSON.stringify({ ok: true }));",
      "    return;",
      "  }",
      "}",
      "module.exports = { handle };",
    ].join('\n'));
    // extract() always writes new node files under decompose.js's own
    // ROOT/<system>/ (the real repo root), regardless of the target
    // file's own location — a real, deliberate design choice (extracted
    // nodes belong to a real system in this repo, not beside an
    // arbitrary fixture) — so the route file lands in the real tree,
    // under a throwaway system name, cleaned up immediately after.
    const routeFile = path.join(ROOT, 'testsys-decompose-fixture', 'routes', 'baseline.route.js');
    try {
      execFileSync(process.execPath, [DECOMPOSE, 'extract', file, '--route=/baseline', '--system=testsys-decompose-fixture'], { encoding: 'utf8' });
      const rewritten = fs.readFileSync(file, 'utf8');
      assert.ok(rewritten.includes("url.pathname === '/baseline'"), `rewritten delegate must preserve url.pathname, got:\n${rewritten}`);
      assert.ok(!/\bp === '\/baseline'/.test(rewritten), 'must never introduce an undefined `p` variable for a url.pathname-convention file');
      assert.ok(fs.existsSync(routeFile), 'extracted route file must exist');
      execFileSync(process.execPath, ['--check', file]);
      execFileSync(process.execPath, ['--check', routeFile]);
    } finally {
      fs.rmSync(path.join(ROOT, 'testsys-decompose-fixture'), { recursive: true, force: true });
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
