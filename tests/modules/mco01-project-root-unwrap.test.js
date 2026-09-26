'use strict';

/**
 * tests/modules/mco01-project-root-unwrap.test.js
 *
 * §MCO01 2026-09-18 — James: "I want it to reflect the actual file
 * structure of the project." Real tests for buildSeedFromDrop()'s new
 * root-unwrapping behavior.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

function freshIntakeDir() {
  process.env.JAA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mco01-jaa-'));
  delete require.cache[require.resolve('../../lib/intake.js')];
  delete require.cache[require.resolve('../../lib/project-compartment.js')];
  return { intake: require('../../lib/intake.js'), pc: require('../../lib/project-compartment.js') };
}

function makeZip(files) {
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mco01-src-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  const zipPath = srcDir + '.zip';
  const { execSync } = require('child_process');
  execSync(`cd "${srcDir}/.." && zip -qr "${zipPath}" "${path.basename(srcDir)}"`);
  return zipPath;
}

test('MCO01-001: a single-archive drop unwraps to the real project root — clean relative paths', () => {
  const { intake, pc } = freshIntakeDir();
  const zip = makeZip({ 'proj/package.json': '{}', 'proj/src/app.js': 'x' });
  const staged = intake.stage({ source: zip, provenance: { filename: path.basename(zip) } });
  intake.expandArchive(staged.dropId);
  const seed = pc.buildSeedFromDrop(staged.dropId);
  assert.strictEqual(seed.ok, true);
  assert.deepStrictEqual(seed.fileTree.sort(), ['package.json', 'src/app.js']);
  assert.ok(seed.rootPrefixStripped, 'rootPrefixStripped should report what was unwrapped');
});

test('MCO01-002: a deeply nested single-child chain fully unwraps (not just one level)', () => {
  const { intake, pc } = freshIntakeDir();
  const zip = makeZip({ 'a/b/c/real.js': 'y' });
  const staged = intake.stage({ source: zip, provenance: { filename: path.basename(zip) } });
  intake.expandArchive(staged.dropId);
  const seed = pc.buildSeedFromDrop(staged.dropId);
  assert.deepStrictEqual(seed.fileTree, ['real.js']);
});

test('MCO01-003: a flat zip (files at top level, no wrapper folder) is left as-is, no false unwrap', () => {
  const { intake, pc } = freshIntakeDir();
  const flatDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mco01-flat-'));
  fs.writeFileSync(path.join(flatDir, 'one.js'), '1');
  fs.writeFileSync(path.join(flatDir, 'two.js'), '2');
  const zipPath = path.join(os.tmpdir(), `mco01-flat-${Date.now()}.zip`);
  require('child_process').execSync(`cd "${flatDir}" && zip -qr "${zipPath}" .`);
  const staged = intake.stage({ source: zipPath, provenance: { filename: path.basename(zipPath) } });
  intake.expandArchive(staged.dropId);
  const seed = pc.buildSeedFromDrop(staged.dropId);
  assert.deepStrictEqual(seed.fileTree.sort(), ['one.js', 'two.js']);
  assert.ok(seed.rootPrefixStripped, 'the intake .expanded/ wrapper is still real bookkeeping to strip, even with no nested project folder inside it');
});

test('MCO01-004: a non-archive (loose files) drop is completely unaffected — old behavior preserved', () => {
  const { intake, pc } = freshIntakeDir();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mco01-loose-'));
  fs.writeFileSync(path.join(dir, 'loose.js'), 'z');
  const staged = intake.stage({ source: dir, provenance: { filename: 'loose' } });
  const seed = pc.buildSeedFromDrop(staged.dropId);
  assert.strictEqual(seed.ok, true);
  assert.strictEqual(seed.rootPrefixStripped, null);
});

console.log(`\n  mco01-project-root-unwrap: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
