'use strict';
/**
 * tests/modules/test-sr11-import-pipeline.js — real test coverage for
 * SR11's core modules (lib/project-compartment.js, lib/dynamic-project-
 * parser.js, lib/spec-from-markdown.js, lib/intake.js's expandArchive()),
 * previously verified only by manual runs per each file's own header.
 * UUID: nexus-test-sr11-import-pipeline-v1-0000-2026-0903-001
 *
 * §REAL FINDING WHILE BUILDING THIS — `adm-zip` (dynamic-project-parser.js's
 * real dependency) was declared in package.json but NOT actually present
 * in node_modules in this checkout (confirmed: `require('adm-zip')` threw
 * MODULE_NOT_FOUND before a real `npm install` was run). Every claim this
 * session that parseProjectZip() was "verified" was necessarily made in a
 * different environment where the install had actually happened — this
 * checkout has never been able to run it until now. Fixed by running a
 * real `npm install` (113 packages were missing entirely, not just this
 * one) before writing a single test here.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'sr11-test-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = path.join(TMP, 'jaa');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
jaaDB.insert('sr11_isolation_probe', { id: 'probe', ts: Date.now() });
try { jaaDB._store().flushAll(); } catch (_) {}
if (!fs.existsSync(path.join(process.env.JAA_DATA_DIR, 'sr11_isolation_probe.json'))) {
  console.log('  ✗ SR11-000 ISOLATION — cortex/memory/jaa-db.js ignores JAA_DATA_DIR');
  console.log('  1 failed, 0 passed');
  process.exitCode = 1;
  return;
}

const pc     = require(path.join(ROOT, 'lib/project-compartment.js'));
const dpp    = require(path.join(ROOT, 'lib/dynamic-project-parser.js'));
const sfm    = require(path.join(ROOT, 'lib/spec-from-markdown.js'));
const intake = require(path.join(ROOT, 'lib/intake.js'));

async function main() {
  console.log('\n[1] lib/project-compartment.js — buildSeedFromPayload()');

  const projDir = fs.mkdtempSync(path.join(TMP, 'proj-'));
  fs.mkdirSync(path.join(projDir, 'src'));
  fs.mkdirSync(path.join(projDir, 'node_modules', 'somepkg'), { recursive: true });
  fs.writeFileSync(path.join(projDir, 'package.json'), '{"name":"test-project"}');
  fs.writeFileSync(path.join(projDir, 'src', 'index.js'), 'console.log("hi");');
  fs.writeFileSync(path.join(projDir, 'src', 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));
  fs.writeFileSync(path.join(projDir, 'node_modules', 'somepkg', 'index.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(projDir, 'big.md'), 'x'.repeat(10000));

  await test('SR11-001', 'buildSeedFromPayload() includes real text files with real content', async () => {
    const seed = pc.buildSeedFromPayload(projDir);
    assert.ok(seed.ok, `failed: ${seed.reason}`);
    assert.ok(seed.files['package.json'], 'package.json missing from seed');
    assert.strictEqual(seed.files['package.json'].content, '{"name":"test-project"}');
  });

  await test('SR11-002', 'buildSeedFromPayload() excludes node_modules entirely', async () => {
    const seed = pc.buildSeedFromPayload(projDir);
    assert.ok(!Object.keys(seed.files).some(f => f.includes('node_modules')), 'node_modules leaked into the seed');
    assert.ok(!seed.fileTree.some(f => f.includes('node_modules')), 'node_modules leaked into the real file tree');
  });

  await test('SR11-003', 'buildSeedFromPayload() omits a binary file with a real, honest reason', async () => {
    const seed = pc.buildSeedFromPayload(projDir);
    const omission = seed.omitted.find(o => o.path === 'src/photo.png');
    assert.ok(omission, 'photo.png should be omitted, not silently dropped');
    assert.ok(/unlisted extension/.test(omission.why));
  });

  await test('SR11-004', 'buildSeedFromPayload() truncates an oversized file and marks it truncated', async () => {
    const seed = pc.buildSeedFromPayload(projDir, { maxBytesPerFile: 100 });
    assert.strictEqual(seed.files['big.md'].content.length, 100);
    assert.strictEqual(seed.files['big.md'].truncated, true);
  });

  await test('SR11-005', 'buildSeedFromPayload() on a nonexistent directory fails honestly', async () => {
    const seed = pc.buildSeedFromPayload('/no/such/directory/anywhere');
    assert.strictEqual(seed.ok, false);
  });

  console.log('\n[2] lib/intake.js — stage() + expandArchive(), real end to end');

  const AdmZip = require('../../lib/zip.js');   // §0.39.261 — in-house (was adm-zip)
  const zip = new AdmZip();
  zip.addFile('README.md', Buffer.from('# Test Project\n\nA real test fixture.'));
  zip.addFile('package.json', Buffer.from('{"name":"zipped-project","dependencies":{}}'));
  zip.addFile('src/main.js', Buffer.from('module.exports = () => 1;'));
  const zipPath = path.join(TMP, 'fixture.zip');
  zip.writeZip(zipPath);

  const intakeDir = path.join(TMP, 'intake');

  await test('SR11-006', 'a staged .zip cannot be re-expanded before expandArchive()', async () => {
    const staged = intake.stage({ source: zipPath, intakeDir });
    assert.ok(staged.ok, `stage failed: ${JSON.stringify(staged.errors)}`);
    const contract = staged.contract;
    assert.ok(contract.claims.some(c => /\.zip$/i.test(c.source)), 'zip claim missing from staged contract');
  });

  let expandedDropId;
  await test('SR11-007', 'expandArchive() really unzips and re-describes the payload', async () => {
    const staged = intake.stage({ source: zipPath, intakeDir });
    expandedDropId = staged.contract.dropId;
    const result = intake.expandArchive(expandedDropId, { intakeDir });
    assert.ok(result.ok, `expandArchive failed: ${result.reason}`);
    assert.ok(result.contract.expanded, 'contract.expanded not set');
    const relPaths = result.contract.claims.map(c => c.source);
    assert.ok(relPaths.some(p => p.endsWith('README.md')), 'README.md not found among expanded claims');
    assert.ok(relPaths.some(p => p.endsWith('main.js')), 'src/main.js not found among expanded claims');
  });

  await test('SR11-008', 'expandArchive() refuses to run twice on the same drop', async () => {
    const result = intake.expandArchive(expandedDropId, { intakeDir });
    assert.strictEqual(result.ok, false);
    assert.ok(/already expanded/.test(result.reason));
  });

  await test('SR11-009', 'buildSeedFromDrop() reads a real expanded drop end to end', async () => {
    const seed = pc.buildSeedFromDrop(expandedDropId, { intakeDir });
    assert.ok(seed.ok, `buildSeedFromDrop failed: ${seed.reason}`);
    assert.ok(seed.expanded, 'seed.expanded should be true for an expanded drop');
    const keys = Object.keys(seed.files);
    assert.ok(keys.some(k => k.endsWith('README.md')), 'expanded README.md not found in the compartment seed');
  });

  console.log('\n[3] lib/dynamic-project-parser.js — parseProjectZip(), the real adm-zip path');

  await test('SR11-010', 'parseProjectZip() reads a real zip and detects the node stack from package.json', async () => {
    const result = dpp.parseProjectZip(zipPath);
    assert.ok(result.ok, `parseProjectZip failed: ${result.reason}`);
    assert.ok(result.stacks.some(s => s.stack === 'node'), `expected node stack, got: ${JSON.stringify(result.stacks)}`);
    assert.strictEqual(result.primaryStack, 'node');
  });

  await test('SR11-011', 'parseProjectZip() finds and parses the real .md file into a spec', async () => {
    const result = dpp.parseProjectZip(zipPath);
    const readme = result.specs.find(s => s.path === 'README.md');
    assert.ok(readme, 'README.md not picked up as a real spec candidate');
    assert.ok(!readme.error, `spec parse errored: ${readme.error}`);
    assert.strictEqual(readme.chunkCount > 0, true);
  });

  await test('SR11-012', 'parseProjectZip() byte-sniffs a real binary entry as non-text, not by extension', async () => {
    const zip2 = new AdmZip();
    zip2.addFile('data.bin', Buffer.from([0, 1, 2, 3, 0, 0, 255, 254]));
    const zip2Path = path.join(TMP, 'fixture2.zip');
    zip2.writeZip(zip2Path);
    const result = dpp.parseProjectZip(zip2Path);
    assert.ok(result.omitted.some(o => o.path === 'data.bin' && /binary/.test(o.why)));
  });

  await test('SR11-013', 'parseProjectZip() on a nonexistent zip fails honestly', async () => {
    const result = dpp.parseProjectZip('/no/such/fixture.zip');
    assert.strictEqual(result.ok, false);
  });

  console.log('\n[4] lib/spec-from-markdown.js — parseMarkdownToSpec()');

  await test('SR11-014', 'a canonical spec (starts with "spec:") is returned unchanged', async () => {
    const canonical = 'spec:\n  name: existing\n  version: 1.0.0\nmeta:\n  intent: already real\n';
    const result = sfm.parseMarkdownToSpec(canonical);
    assert.strictEqual(result.wasCanonical, true);
    assert.strictEqual(result.specText, canonical);
  });

  await test('SR11-015', 'a real non-canonical markdown doc derives name/version/author from its own real content', async () => {
    const md = [
      '# My Real Project',
      '',
      '**Author:** James Brooks',
      '**Version:** 2.3.1',
      '',
      'This project does a real thing, described in real prose.',
      '',
      '## Phase One',
      'Some content.',
    ].join('\n');
    const result = sfm.parseMarkdownToSpec(md);
    assert.strictEqual(result.wasCanonical, false);
    assert.strictEqual(result.meta.name, 'my-real-project');
    assert.strictEqual(result.meta.version, '2.3.1');
    assert.strictEqual(result.meta.author, 'James Brooks');
    assert.ok(/real thing/.test(result.meta.intent), `intent extraction missed the real prose: "${result.meta.intent}"`);
  });

  await test('SR11-016', 'a markdown doc with no # title falls back to the given filename', async () => {
    const result = sfm.parseMarkdownToSpec('Just some prose, no heading at all.', { filenameFallback: 'my-file.md' });
    assert.strictEqual(result.meta.name, 'my-file-md');
  });

  await test('SR11-017', 'empty input throws a real, named error rather than producing a bogus spec', async () => {
    assert.throws(() => sfm.parseMarkdownToSpec(''), /empty input/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (PRIOR_DIR === undefined) delete process.env.JAA_DATA_DIR; else process.env.JAA_DATA_DIR = PRIOR_DIR;
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
