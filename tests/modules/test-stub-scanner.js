'use strict';
// §stub-scanner — "no stubs," checked. Tests the checker itself, including two real bugs caught while building it.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const scanner = require(path.join(__dirname, '../..', 'lib/stub-scanner'));

function tmpFile(content) {
  const p = path.join(os.tmpdir(), `stub-scan-test-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(p, content);
  return p;
}

(async () => {
  await test('T-001', 'detects a real TODO comment', async () => {
    const f = tmpFile('// TODO: finish this later\nfunction real() { return 1; }');
    const findings = scanner.scanFile(f);
    assert.ok(findings.some(x => x.type === 'stub-comment'));
    fs.unlinkSync(f);
  });

  await test('T-002', 'detects a trivially-empty function body (return null)', async () => {
    const f = tmpFile('function doesSomethingImportant() {\n  return null;\n}');
    const findings = scanner.scanFile(f);
    assert.ok(findings.some(x => x.type === 'trivial-body' && x.function === 'doesSomethingImportant'));
    fs.unlinkSync(f);
  });

  await test('T-003', 'does NOT flag a real, non-trivial function body', async () => {
    const f = tmpFile('function realWork(x) {\n  const y = x * 2;\n  if (y > 10) return y;\n  return y + 1;\n}');
    const findings = scanner.scanFile(f);
    assert.strictEqual(findings.filter(x => x.type === 'trivial-body').length, 0);
    fs.unlinkSync(f);
  });

  await test('T-004', 'flags private-property access as a candidate to verify — the exact pattern from this session\'s real bug', async () => {
    const f = tmpFile('function readIt(jaa) { return jaa._tables; }');
    const findings = scanner.scanFile(f);
    assert.ok(findings.some(x => x.type === 'private-property-access' && x.text === 'jaa._tables'));
    fs.unlinkSync(f);
  });

  await test('T-005', 'REGRESSION — scanning multiple files gives correct, independent results (the stateful-regex bug caught while building this)', async () => {
    // §BUGFIX 2026-08-12 — PRIVATE_PROPERTY_ACCESS is a /g regex; .exec()
    // in a loop without resetting lastIndex between files meant the SECOND
    // file scanned would silently start matching from wherever the first
    // file's scan left off, corrupting results. Caught by actually testing
    // multi-file scans, not by reading the code and assuming it was fine.
    const f1 = tmpFile('function a(x) { return x._one; }');
    const f2 = tmpFile('function b(y) { return y._two; }');
    const r = scanner.scanFiles([f1, f2]);
    assert.ok(r.files[f1].some(x => x.text === 'x._one'), 'file 1 must find its own match, not be skipped due to leftover regex state');
    assert.ok(r.files[f2].some(x => x.text === 'y._two'), 'file 2 must find its OWN match, not continue from file 1\'s scan position');
    fs.unlinkSync(f1); fs.unlinkSync(f2);
  });

  await test('T-006', 'a missing/unreadable file returns a finding, never throws (§1.2)', async () => {
    const findings = scanner.scanFile('/definitely/does/not/exist.js');
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].type, 'unreadable');
  });

  await test('T-007', 'scanFiles() aggregates totals correctly across a real batch', async () => {
    const f1 = tmpFile('// TODO fix\nfunction x() { return null; }');
    const f2 = tmpFile('function y(a) { return a + 1; }');   // clean, real
    const r = scanner.scanFiles([f1, f2]);
    assert.strictEqual(r.filesScanned, 2);
    assert.ok(r.filesWithFindings >= 1);
    fs.unlinkSync(f1); fs.unlinkSync(f2);
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
