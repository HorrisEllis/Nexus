'use strict';
/**
 * tests/modules/changelog.test.js
 * UUID: test-changelog-v1-0000-0000-0000-000000000001
 *
 * Covers: first run treats every spec as new, second run with no changes
 * writes nothing (idempotent), a real version bump gets detected and
 * formatted correctly, missing purpose line is flagged not silently
 * dropped, and CHANGELOG.md gets the new section prepended after the
 * top header, not appended at the end or overwriting history.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'lib', 'changelog.js'),
    fs.readFileSync(path.join(__dirname, '..', '..', 'orchestrator', 'lib', 'changelog.js'), 'utf8')
      .replace("path.join(__dirname, '..', '..', 'docs')", "process.env.TEST_DOCS_DIR")
      .replace("path.join(__dirname, '..', '..', 'data', 'changelog-snapshot.json')", "process.env.TEST_SNAPSHOT_PATH")
      .replace("path.join(__dirname, '..', '..', 'docs', 'CHANGELOG.md')", "process.env.TEST_CHANGELOG_PATH")
  );
  return dir;
}

function writeSpec(dir, file, name, version, purpose) {
  fs.writeFileSync(path.join(dir, 'docs', file), `spec:\n  meta:\n    name:        ${name}\n    version:     ${version}\n    purpose: >\n      ${purpose}\n`);
}

async function run() {
  function fresh(dir) {
    process.env.TEST_DOCS_DIR = path.join(dir, 'docs');
    process.env.TEST_SNAPSHOT_PATH = path.join(dir, 'data', 'snapshot.json');
    process.env.TEST_CHANGELOG_PATH = path.join(dir, 'CHANGELOG.md');
    delete require.cache[require.resolve(path.join(dir, 'lib', 'changelog.js'))];
    return require(path.join(dir, 'lib', 'changelog.js'));
  }

  await test('CL-01', 'first run treats every spec as new', async () => {
    const dir = makeFixture();
    writeSpec(dir, 'a.spec', 'module-a', '1.0.0', 'Does thing A.');
    writeSpec(dir, 'b.spec', 'module-b', '2.1.0', 'Does thing B.');
    const cl = fresh(dir);
    const r = cl.update({ date: new Date('2026-06-21') });
    assert.strictEqual(r.written, true);
    assert.strictEqual(r.entries, 2);
    const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
    assert.ok(changelog.includes('module-a'));
    assert.ok(changelog.includes('v1.0.0'));
    assert.ok(changelog.includes('Does thing A.'));
  });

  await test('CL-02', 'second run with no changes writes nothing — idempotent', async () => {
    const dir = makeFixture();
    writeSpec(dir, 'a.spec', 'module-a', '1.0.0', 'Does thing A.');
    const cl = fresh(dir);
    cl.update({ date: new Date('2026-06-21') });
    const r2 = cl.update({ date: new Date('2026-06-22') });
    assert.strictEqual(r2.written, false);
    assert.strictEqual(r2.reason, 'no spec version changes since last snapshot');
  });

  await test('CL-03', 'a real version bump is detected and formatted as from -> to', async () => {
    const dir = makeFixture();
    writeSpec(dir, 'a.spec', 'module-a', '1.0.0', 'Does thing A.');
    const cl = fresh(dir);
    cl.update({ date: new Date('2026-06-21') });

    writeSpec(dir, 'a.spec', 'module-a', '1.1.0', 'Does thing A, better now.');
    const r2 = cl.update({ date: new Date('2026-06-22') });
    assert.strictEqual(r2.written, true);
    assert.strictEqual(r2.entries, 1);
    const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
    assert.ok(changelog.includes('v1.0.0 → v1.1.0'));
  });

  await test('CL-04', 'missing purpose line is flagged, not silently dropped', async () => {
    const dir = makeFixture();
    fs.writeFileSync(path.join(dir, 'docs', 'noPurpose.spec'), `spec:\n  meta:\n    name:        bare-module\n    version:     1.0.0\n`);
    const cl = fresh(dir);
    const r = cl.update({ date: new Date('2026-06-21') });
    assert.strictEqual(r.written, true);
    const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
    assert.ok(changelog.includes('undocumented'));
  });

  await test('CL-05', 'new section is prepended after the top header, not appended or overwriting history', async () => {
    const dir = makeFixture();
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# NEXUS Changelog\n\n## v0.9.0 — old entry\n- ancient history\n');
    writeSpec(dir, 'a.spec', 'module-a', '1.0.0', 'New thing.');
    const cl = fresh(dir);
    cl.update({ date: new Date('2026-06-21') });
    const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
    const newIdx = changelog.indexOf('2026-06-21');
    const oldIdx = changelog.indexOf('v0.9.0');
    const headerIdx = changelog.indexOf('# NEXUS Changelog');
    assert.ok(headerIdx < newIdx, 'header must come before new entry');
    assert.ok(newIdx < oldIdx, 'new entry must come before old history, not after');
    assert.ok(changelog.includes('ancient history'), 'old history must survive, not be overwritten');
  });

  console.log(`\n  changelog: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
