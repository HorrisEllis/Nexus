'use strict';
/**
 * tests/modules/test-mock-data-finder.js — real test for loom/scanners/
 * mock-data-finder.js, using real, isolated fixture files (not mocked
 * fs), same discipline test-stub-finder.js already uses.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan } = require('../../loom/scanners/mock-data-finder.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function makeFixtureTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-data-finder-test-'));
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return root;
}

test('MDF-001', 'finds a real placeholder email', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "const contact = 'support@example.com';\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  const hit = result.flagged.find(f => f.kind === 'placeholderEmail');
  assert.ok(hit, 'a real example.com email must be flagged');
});

test('MDF-002', 'finds a real placeholder name', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "const user = { name: 'John Doe' };\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  const hit = result.flagged.find(f => f.kind === 'placeholderName');
  assert.ok(hit, 'a real "John Doe" placeholder name must be flagged');
});

test('MDF-003', 'finds real lorem ipsum text', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "const body = 'Lorem ipsum dolor sit amet';\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  const hit = result.flagged.find(f => f.kind === 'loremIpsum');
  assert.ok(hit, 'real lorem ipsum text must be flagged');
});

test('MDF-004', 'finds a real reserved placeholder phone number', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "const phone = '555-0142';\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  const hit = result.flagged.find(f => f.kind === 'placeholderPhone');
  assert.ok(hit, 'a real reserved 555-01xx placeholder phone number must be flagged');
});

test('MDF-005', 'placeholder data in a real test file is excluded by default', () => {
  const root = makeFixtureTree({ 'tests/thing.test.js': "const email = 'a@example.com';\n" });
  const result = scan({ rootDir: root, dirs: ['tests'] });
  assert.strictEqual(result.flagged.length, 0, 'placeholder data in a real test file must be excluded by default');
});

test('MDF-006', 'includeTests:true does scan test files', () => {
  const root = makeFixtureTree({ 'tests/thing.test.js': "const email = 'a@example.com';\n" });
  const result = scan({ rootDir: root, dirs: ['tests'], includeTests: true });
  const hit = result.flagged.find(f => f.kind === 'placeholderEmail');
  assert.ok(hit, 'includeTests:true must scan test files too');
});

test('MDF-007', 'a real, legitimate email is not flagged', () => {
  const root = makeFixtureTree({ 'lib/thing.js': "const contact = 'support@real-company.com';\n" });
  const result = scan({ rootDir: root, dirs: ['lib'] });
  assert.strictEqual(result.flagged.length, 0, 'a real, non-placeholder email must not be flagged');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
