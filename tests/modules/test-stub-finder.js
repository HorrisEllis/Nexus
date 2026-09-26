'use strict';
/**
 * tests/modules/test-stub-finder.js — real test for loom/scanners/
 * stub-finder.js, using a real, isolated temp directory of fixture
 * files rather than mocking fs — same discipline dispatcher tests in
 * this session already use for jaaDB (real behavior, not a stand-in).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan } = require('../../loom/scanners/stub-finder.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function makeFixtureTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-finder-test-'));
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return root;
}

test('SF-001', 'finds a real TODO marker', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "function real() {\n  // TODO: handle the edge case\n  return 1;\n}\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  const hit = result.flagged.find(f => f.kind === 'marker' && f.text.includes('TODO'));
  assert.ok(hit, 'a real TODO comment must be flagged as a marker');
});

test('SF-002', 'finds a real throw-not-implemented body', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "function notDone() {\n  throw new Error('not implemented yet');\n}\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  const hit = result.flagged.find(f => f.kind === 'throwNotImpl');
  assert.ok(hit, 'a real throw(\'not implemented\') must be flagged');
});

test('SF-003', 'finds a real mock-named function outside tests', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "async function mockGenerate() {\n  return { ok: true };\n}\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  const hit = result.flagged.find(f => f.kind === 'mockIdentifier');
  assert.ok(hit, 'a real mock-named function in non-test source must be flagged');
});

test('SF-004', 'a negated claim ("not a stub") is NOT flagged as a stub — the real false positive found on this codebase\'s own first run', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "// this function is not a stub: it does the real work directly\nfunction real() { return 2; }\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  assert.strictEqual(result.flagged.length, 0, `a negated "not a stub" claim must not be flagged, got: ${JSON.stringify(result.flagged)}`);
});

test('SF-005', 'mock-named identifiers inside a real test file are excluded by default', () => {
  const root = makeFixtureTree({ 'tests/thing.test.js': "function mockProvider() { return { ok: true }; }\n" });
  const result = scan({ rootDir: root, dirs: ['tests'] });
  const hit = result.flagged.find(f => f.kind === 'mockIdentifier');
  assert.strictEqual(hit, undefined, 'a mock-named identifier inside a real test file must be excluded by default (expected there)');
});

test('SF-006', 'includeTests:true still excludes mock identifiers in tests (only markers/throw apply there)', () => {
  const root = makeFixtureTree({ 'tests/thing.test.js': "// TODO: fix this test\nfunction mockProvider() { return { ok: true }; }\n" });
  const result = scan({ rootDir: root, dirs: ['tests'], includeTests: true });
  const markerHit = result.flagged.find(f => f.kind === 'marker');
  assert.ok(markerHit, 'a real TODO in a test file must be flagged when includeTests:true');
  const mockHit = result.flagged.find(f => f.kind === 'mockIdentifier');
  assert.strictEqual(mockHit, undefined, 'mock-named identifiers stay excluded in tests even with includeTests:true — expected there by design');
});

test('SF-007', 'clean, real code with none of the three signals is not flagged', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "function add(a, b) {\n  return a + b;\n}\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  assert.strictEqual(result.flagged.length, 0, 'genuinely clean code must not be flagged');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
