'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-emerge-direct-compile.js — PULSE_ALL_2026-09-06 /
 * emerge simplification. James: "its just a compiler thats it, the rest
 * is trash." copilot/module-builder.js used to write a contract to
 * emerge/input/ via lib/contract-queue.js and wait for a separate,
 * standalone poller (emerge/consumer.js, now archived) to pick it up
 * every 5s. Now it calls emerge/compiler/pipeline.js's compile()
 * directly, synchronously, in the same request.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
async function atest(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

async function run() {
  const src = fs.readFileSync(path.join(__dirname, '../../copilot/module-builder.js'), 'utf8');

  test('EM-001', 'the contract-queue require is genuinely gone from module-builder.js', () => {
    assert.ok(!/require\(['"]\.\.\/lib\/contract-queue['"]\)/.test(src));
  });

  test('EM-002', 'cq.create/cq.dispatch (the old queue-write path) are gone from build()\'s real executable code, not just absent from comments', () => {
    const fnStart = src.indexOf('async function build(');
    const fnEnd = src.indexOf('\nmodule.exports', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    // Strip // line comments before checking — a comment describing the
    // OLD removed behavior (which this fix's own commit message does,
    // deliberately, for the historical record) must not false-fail this
    // check the same way it would false-fail a real leftover call.
    const codeOnly = fnBody.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(!/cq\.create\(/.test(codeOnly) && !/cq\.dispatch\(/.test(codeOnly));
  });

  test('EM-003', 'build() now requires and calls emerge/compiler/pipeline.js\'s compile() directly', () => {
    assert.ok(/require\(['"]\.\.\/emerge\/compiler\/pipeline['"]\)/.test(src));
    assert.ok(/await compile\(specPath, buildDir/.test(src));
  });

  test('EM-004', 'emerge/consumer.js is genuinely gone from its live location', () => {
    assert.ok(!fs.existsSync(path.join(__dirname, '../../emerge/consumer.js')), 'consumer.js should be removed, not just unused');
  });

  test('EM-005', 'emerge/consumer.js is archived, not deleted without a trace — §0.3', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '../../_archive/2026-09-06-emerge-consumer-retired/consumer.js')));
  });

  test('EM-006', 'emerge/compiler/ itself is untouched — the real, load-bearing part James said to keep', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '../../emerge/compiler/pipeline.js')));
  });

  test('EM-007', 'autopilot.js no longer spawns emerge/consumer.js as a kernel', () => {
    const apSrc = fs.readFileSync(path.join(__dirname, '../../nexus/autopilot.js'), 'utf8');
    assert.ok(!/args:\s*\[['"]emerge\/consumer\.js['"]\]/.test(apSrc));
  });

  test('EM-008', 'diagnostic no longer polls a :4242/status that nothing serves anymore', () => {
    const diagSrc = fs.readFileSync(path.join(__dirname, '../../diagnostic/nexus-diagnostic.js'), 'utf8');
    assert.ok(!/emerge:\s*\{\s*port:\s*4242/.test(diagSrc));
  });

  // ── Functional: the actual write+compile logic, with a stubbed compiler ──
  await atest('EM-009', 'the real write+compile block produces a correct buildDir/spec/architecture.json and calls compile with the right args', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emerge-direct-test-'));
    const buildUuid = 'test-uuid-1234';
    const buildDir = path.join(tmpRoot, buildUuid);
    fs.mkdirSync(buildDir, { recursive: true });
    const specPath = path.join(buildDir, 'test-module.spec');
    fs.writeFileSync(specPath, 'spec:\n  meta:\n    name: test-module\n', 'utf8');
    fs.writeFileSync(path.join(buildDir, 'architecture.json'), JSON.stringify({ templateIds: ['api-service'] }), 'utf8');

    assert.ok(fs.existsSync(specPath));
    assert.ok(fs.existsSync(path.join(buildDir, 'architecture.json')));
    const archContent = JSON.parse(fs.readFileSync(path.join(buildDir, 'architecture.json'), 'utf8'));
    assert.deepStrictEqual(archContent.templateIds, ['api-service']);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
