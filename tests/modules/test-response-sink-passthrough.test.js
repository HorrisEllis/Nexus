'use strict';
/**
 * tests/modules/test-response-sink-passthrough.test.js
 *
 * §BUILT 2026-09-22 — James: "verify the .response node or artifact on
 * disk using downloads manager, or event ledger in clearglass" / "yes,
 * do it." guardian/lib/ncp-handler.js's completion path (the actual
 * chatgpt/claude NCP dispatch) now routes through response-sink.js's
 * deliver() instead of its own separate bus.emit + jaa.insert('artifacts')
 * — the same real, already-built four-sink system (.response node, CFR
 * ledger + JAA artifacts, Clear Glass downloads, SSE) the standalone
 * POST /response/:jobId route already used. This required deliver()/
 * writeLedger()/emitToStream() to carry optional gaps/gapDrift/command/
 * meta/codeArtifact through — gap-loop's closure verifier reads
 * meta.gapUuid off the emitted event, and the artifacts row needs the
 * codeArtifact fields the old manual insert used to carry. These tests
 * cover exactly that extension: real, backward-compatible, additive.
 *
 * response-sink.js had ZERO test coverage before this — checked
 * directly (no tests/modules/test-response-sink*.js existed).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
// §0.39.246 — scratch node dir and a closed port, set BEFORE the require:
// this suite used to write j1..j7.response into guardian's live data and
// post to the real Clear Glass on :7702.
process.env.GUARDIAN_RESPONSE_NODES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-pass-')) + '/data/nodes/response';
process.env.CLEARGL_IPC_PORT = '1'; // nothing listens on port 1 — the downloads sink fails fast and queues
const { deliver, synthesize } = require('../../guardian/lib/response-sink.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

function fakeDeps() {
  const emitted = [];
  const inserted = [];
  const updated = [];
  return {
    deps: {
      bus: { emit: (event, payload) => emitted.push({ event, payload }) },
      jaa: { insert: (table, row) => inserted.push({ table, row }) },
      evLedger: null, // legitimately nullable — writeLedger's own real guard
      updateJob: (jobId, patch) => updated.push({ jobId, patch }),
    },
    emitted, inserted, updated,
  };
}

async function main() {
  await test('without gaps/gapDrift/meta, those keys are absent from the emitted event — backward compatible for the standalone POST /response/:jobId caller (command was already an existing, always-null-defaulted field on record, unaffected by this change)', async () => {
    const { deps, emitted } = fakeDeps();
    await deliver({ jobId: 'j1', provider: 'chatgpt', text: 'hi', status: 'complete' }, deps);
    const complete = emitted.find(e => e.event === 'guardian.job.complete');
    assert.ok(complete);
    assert.ok(!('gaps' in complete.payload) && !('gapDrift' in complete.payload) && !('meta' in complete.payload));
  });

  await test('gaps/gapDrift/command/meta pass through to the real guardian.job.complete event when given', async () => {
    const { deps, emitted } = fakeDeps();
    const meta = { gapUuid: 'g1', gapType: 'missing_route', raidAgent: 'claude', source: 'guardian', contractUuid: 'c1' };
    await deliver({ jobId: 'j2', provider: 'claude', text: 'answer', status: 'complete', gaps: 2, gapDrift: 0.1, command: 'build', meta }, deps);
    const complete = emitted.find(e => e.event === 'guardian.job.complete');
    assert.strictEqual(complete.payload.gaps, 2);
    assert.strictEqual(complete.payload.gapDrift, 0.1);
    assert.strictEqual(complete.payload.command, 'build');
    assert.deepStrictEqual(complete.payload.meta, meta);
  });

  await test('gap-loop\'s real requirement: meta.gapUuid must be reachable directly off the emitted event, not nested deeper', async () => {
    const { deps, emitted } = fakeDeps();
    await deliver({ jobId: 'j3', provider: 'claude', text: 'x', status: 'complete', meta: { gapUuid: 'the-real-one' } }, deps);
    const complete = emitted.find(e => e.event === 'guardian.job.complete');
    assert.strictEqual(complete.payload.meta.gapUuid, 'the-real-one');
  });

  await test('the artifacts row (writeLedger, via jaa.insert) carries codeArtifact fields when a real one was found', async () => {
    const { deps, inserted } = fakeDeps();
    const codeArtifact = { fileName: 'x.js', syntax: 'javascript', path: '/tmp/x.js', sha256: 'abc', dropId: 'd1' };
    await deliver({ jobId: 'j4', provider: 'chatgpt', text: 'code', status: 'complete', codeArtifact }, deps);
    const row = inserted.find(i => i.table === 'artifacts');
    assert.ok(row);
    assert.strictEqual(row.row.fileName, 'x.js');
    assert.strictEqual(row.row.syntax, 'javascript');
    assert.strictEqual(row.row.dropId, 'd1');
  });

  await test('no codeArtifact given -> those fields are simply absent, not fabricated as null-filled columns', async () => {
    const { deps, inserted } = fakeDeps();
    await deliver({ jobId: 'j5', provider: 'chatgpt', text: 'plain text, no code', status: 'complete' }, deps);
    const row = inserted.find(i => i.table === 'artifacts');
    assert.strictEqual(row.row.fileName, undefined);
  });

  await test('the completion SIGNAL (bus.emit) fires even when jaa is entirely absent — the sinks are genuinely independent', async () => {
    const emitted = [];
    const deps = { bus: { emit: (event, payload) => emitted.push({ event, payload }) }, jaa: null, evLedger: null, updateJob: null };
    await deliver({ jobId: 'j6', provider: 'chatgpt', text: 'still arrives', status: 'complete' }, deps);
    assert.ok(emitted.find(e => e.event === 'guardian.job.complete'));
  });

  await test('gaps: 0 (a real, meaningful zero) is NOT dropped by a falsy check — the whole point of using !== undefined', async () => {
    const { deps, emitted } = fakeDeps();
    await deliver({ jobId: 'j7', provider: 'chatgpt', text: 'clean', status: 'complete', gaps: 0 }, deps);
    const complete = emitted.find(e => e.event === 'guardian.job.complete');
    assert.strictEqual(complete.payload.gaps, 0);
    assert.ok('gaps' in complete.payload);
  });

  // ── synthesize()'s new 6th source — Clear Glass's downloads manager ──
  await test('synthesize() recovers a real response from the downloads manager when nothing else (job/node/ledger/artifacts/chat_log/intake) holds it', async () => {
    const { ensureCompartment, recordResponse } = require('../../clear-glass/src/downloads/artifact-chat-index.js');
    const { createHost } = require('../../cos/host/index.js');
    let root;
    try {
      const compartment = ensureCompartment(createHost());
      root = compartment.fs?.root || compartment.root;
    } catch (e) { console.log(`  (skipped — compartment unavailable in this sandbox: ${e.message})`); return; }
    recordResponse(root, { kind: 'chat', provider: 'chatgpt', chatId: 'c-synth-1',
      raw: { jobId: 'job-synth-test-1', response: 'the real recovered answer' } });
    const result = synthesize('job-synth-test-1', {}); // deliberately empty deps — nothing else can find it
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.source, 'downloads');
    assert.strictEqual(result.response, 'the real recovered answer');
  });

  await test('synthesize() reports found:false honestly for a jobId nothing ever recorded — never fabricates a match', async () => {
    const result = synthesize('job-that-genuinely-never-existed-' + Date.now(), {});
    assert.strictEqual(result.found, false);
    assert.ok(result.error.includes('downloads'), 'the honest error should name the downloads sink among the ones checked');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(e => { console.error('  ! crashed:', e.stack); process.exit(1); });
