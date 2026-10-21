'use strict';
/**
 * tests/modules/test-any-project-tests.test.js — "do the tests pass" for any project, not only Node (0.60.201)
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD18 addendum).
 * James, 2026-10-21: "okay, remember this is for any project. not just mmine"
 *
 *   AP-01  how a project's tests run is read from what it holds: npm script, its own runner, Gradle (wrapper or build), Maven, pytest,
 *          Cargo, Go, a Makefile test target — first match wins, and none found is null
 *   AP-02  real runs: a Go module and a Makefile project pass through proof's "tests" condition, and a failing one fails
 *   AP-03  a project whose tool is not installed is said as such ("tool_missing"), never as a test failure
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { const r = await fn(); if (r === 'skip') { skipped++; return; } console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const has = (t) => { try { execSync(`command -v ${t}`, { stdio: 'ignore' }); return true; } catch (_) { return false; } };
const project = (files) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-')); for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); } return d; };

(async () => {
  console.log('\n⬡  any project\'s tests\n');
  const P = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/proof-run.js')).href);

  await test('AP-01', 'the way is read from what the project holds; first match wins; none is null', () => {
    const cases = [
      [{ 'package.json': JSON.stringify({ scripts: { test: 'jest' } }) }, 'npm test --silent'],
      [{ 'package.json': JSON.stringify({ scripts: { start: 'electron .' } }), 'tests/run-all.js': '' }, 'node tests/run-all.js'],
      [{ 'gradlew': '#!/bin/sh', 'build.gradle': '' }, process.platform === 'win32' ? 'gradlew.bat test' : './gradlew test'],
      [{ 'app/build.gradle.kts': '', 'build.gradle.kts': '' }, 'gradle test'],
      [{ 'pom.xml': '<project/>' }, 'mvn -q test'],
      [{ 'pyproject.toml': '[project]' }, 'python3 -m pytest -q'],
      [{ 'tests/test_title.py': 'def test_x(): pass' }, 'python3 -m pytest -q'],
      [{ 'Cargo.toml': '[package]' }, 'cargo test --quiet'],
      [{ 'go.mod': 'module x' }, 'go test ./...'],
      [{ 'Makefile': 'test:\n\techo ok\n' }, 'make test'],
    ];
    for (const [files, want] of cases) assert.strictEqual((P.testWayOf(project(files)) || {}).cmd, want, JSON.stringify(Object.keys(files)));
    assert.strictEqual(P.testWayOf(project({ 'README.md': 'x', 'Makefile': 'build:\n\techo\n' })), null);
  });

  await test('AP-02', 'real runs: a Go module and a Makefile project pass proof\'s "tests"; a failing one fails', async () => {
    const run = async (dir) => (await P.runProof({ repoDir: dir, write: false, conditions: [{ says: 'All tests pass', check: { kind: 'tests' } }] })).run.results[0];
    if (has('make')) {
      assert.ok((await run(project({ 'Makefile': 'test:\n\t@echo all good\n' }))).met, 'make test passes');
      assert.ok(!(await run(project({ 'Makefile': 'test:\n\t@exit 3\n' }))).met, 'make test fails');
    }
    if (has('go')) {
      const go = project({ 'go.mod': 'module title\n\ngo 1.20\n', 'title.go': 'package title\n\nimport "strings"\n\nfunc Title(s string) string { return strings.TrimSpace(s) }\n',
        'title_test.go': 'package title\n\nimport "testing"\n\nfunc TestTitle(t *testing.T) { if Title(" a ") != "a" { t.Fatal("not trimmed") } }\n' });
      const r = await run(go);
      assert.ok(r.met, JSON.stringify(r).slice(0, 600));
    }
    if (!has('make') && !has('go')) { console.log('  - AP-02 SKIPPED: neither make nor go is installed here'); return 'skip'; }
  });

  await test('AP-03', 'a project whose tool is not here is said as tool_missing, not as failing tests', async () => {
    const d = project({ 'Cargo.toml': '[package]' });
    const PATH = process.env.PATH; process.env.PATH = '/nonexistent';
    try {
      const r = (await P.runProof({ repoDir: d, write: false, conditions: [{ says: 'All tests pass', check: { kind: 'tests' } }] })).run.results[0];
      assert.ok(!r.met && /cargo is not installed here/.test(JSON.stringify(r)) && /tool_missing/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 400));
    } finally { process.env.PATH = PATH; }
  });

  console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
