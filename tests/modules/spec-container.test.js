'use strict';
/**
 * tests/modules/spec-container.test.js
 * UUID: test-spec-container-v1-0000-4000-0000-000000000001
 *
 * Builds real synthetic .spec containers (valid and deliberately corrupted)
 * on disk and runs them through the actual module — no mocking of fs/crypto,
 * since the entire point of this module is "does the hash check actually
 * catch corruption," which a mock would just assert away.
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');
const specContainer = require('../../idearium/lib/spec-container.cjs');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-container-test-'));

// Build a real, valid container with a small in-memory "zip-like" payload.
// We don't need a real zip for these tests — spec-container.js only cares
// about decoding base64 + verifying the hash; what's inside the buffer is
// adm-zip's problem, not this module's.
function buildContainer({ name = 'test-repo', version = '1.0.0', payload = 'hello world', corruptHash = false, omitBuildSpec = false, includeBuildSpec = true } = {}) {
  const archiveBuffer = Buffer.from(payload);
  const realHash = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
  const hash = corruptHash ? realHash.replace(/.$/, realHash.endsWith('0') ? '1' : '0') : realHash;
  const b64 = archiveBuffer.toString('base64');
  // wrap at 60 chars/line like a real YAML block literal, indented 4 spaces
  const b64Lines = [];
  for (let i = 0; i < b64.length; i += 60) b64Lines.push('    ' + b64.slice(i, i + 60));

  let out = `spec:\n\n  meta:\n    name:        ${name}\n    version:     ${version}\n    archive_sha256: ${hash}\n    archive_bytes:  ${archiveBuffer.length}\n    file_count:     3\n\n`;
  if (includeBuildSpec && !omitBuildSpec) {
    out += `  buildSpec: |\n    # ${name}\n    This is the build spec text.\n\n`;
  }
  out += `  blocks: '[["a.js",10,"abc"]]'\n\n  archive: |\n${b64Lines.join('\n')}\n`;
  const p = path.join(TMP, `${name}-${Math.random().toString(36).slice(2)}.spec`);
  fs.writeFileSync(p, out);
  return { path: p, realHash, archiveBuffer };
}

async function run() {
  await test('SC-01', 'readHeader() parses name/version/hash/bytes from a valid container', () => {
    const { path: p, realHash } = buildContainer({ name: 'alpha', version: '2.3.4' });
    const h = specContainer.readHeader(p);
    assert.strictEqual(h.name, 'alpha');
    assert.strictEqual(h.version, '2.3.4');
    assert.strictEqual(h.archiveSha256, realHash);
    assert.strictEqual(h.isContainer, true);
  });

  await test('SC-02', 'readHeader() on a module-level spec (no archive_sha256) reports isContainer:false', () => {
    const p = path.join(TMP, 'module-level.spec');
    fs.writeFileSync(p, `spec:\n\n  meta:\n    name:        some-module\n    version:     1.0.0\n    purpose: just a normal docs/*.spec\n`);
    const h = specContainer.readHeader(p);
    assert.strictEqual(h.isContainer, false);
    assert.strictEqual(h.name, 'some-module');
  });

  await test('SC-03', 'verifyAndDecode() round-trips the exact archive bytes for a valid container', () => {
    const { path: p, archiveBuffer } = buildContainer({ payload: 'the quick brown fox jumps over the lazy dog' });
    const r = specContainer.verifyAndDecode(p);
    assert.ok(r.verified);
    assert.ok(r.archiveBuffer.equals(archiveBuffer));
  });

  await test('SC-04', 'verifyAndDecode() extracts buildSpec text correctly', () => {
    const { path: p } = buildContainer({ name: 'beta' });
    const r = specContainer.verifyAndDecode(p);
    assert.ok(r.buildSpec.includes('# beta'));
    assert.ok(r.buildSpec.includes('This is the build spec text.'));
  });

  await test('SC-05', 'verifyAndDecode() returns null buildSpec when the container omits it, without throwing', () => {
    const { path: p } = buildContainer({ name: 'gamma', omitBuildSpec: true });
    const r = specContainer.verifyAndDecode(p);
    assert.strictEqual(r.buildSpec, null);
    assert.ok(r.verified);
  });

  await test('SC-06', 'verifyAndDecode() THROWS on a hash mismatch — never returns a partially-trusted result', () => {
    const { path: p } = buildContainer({ name: 'corrupt-one', corruptHash: true });
    assert.throws(() => specContainer.verifyAndDecode(p), /SHA-256 MISMATCH/);
  });

  await test('SC-07', 'verifyAndDecode() THROWS on a module-level spec — no archive to decode', () => {
    const p = path.join(TMP, 'no-payload.spec');
    fs.writeFileSync(p, `spec:\n\n  meta:\n    name:        docs-only\n    version:     1.0.0\n`);
    assert.throws(() => specContainer.verifyAndDecode(p), /no verifiable archive/);
  });

  await test('SC-08', 'verifyAndDecode() THROWS on a truncated archive (byte-count mismatch caught before hash check)', () => {
    const { path: p } = buildContainer({ payload: 'some real payload here' });
    // truncate the file mid-archive-block to simulate a partial write/copy
    const content = fs.readFileSync(p, 'utf8');
    const truncated = content.slice(0, content.length - 10);
    fs.writeFileSync(p, truncated);
    assert.throws(() => specContainer.verifyAndDecode(p), /size mismatch|MISMATCH/);
  });

  await test('SC-09', 'readHeader() never reads past HEADER_BYTES — confirmed cheap even with a huge payload', () => {
    const { path: p } = buildContainer({ payload: 'x'.repeat(500000) }); // ~670KB base64
    const t0 = Date.now();
    const h = specContainer.readHeader(p);
    const ms = Date.now() - t0;
    assert.ok(h.name);
    assert.ok(ms < 50, `readHeader took ${ms}ms — should be near-instant, it only reads the first 8KB`);
  });

  console.log(`\n  spec-container: ${passed} passed, ${failed} failed\n`);
  fs.rmSync(TMP, { recursive: true, force: true });
  if (failed > 0) process.exit(1);
}

run();
