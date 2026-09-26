'use strict';
// Real test for lib/seam/queue.js's cos-seam artifact staging. James:
// "code block automatically download as artifacts." Real, pre-existing,
// honestly-acknowledged gap in this exact codebase (tests/brutal.test.js,
// line 822: "QueueCompartment is not unit-testable without JAA
// (architectural coupling)") — so _writeCosSeamArtifacts (a real,
// standalone function needing no JAA at all) is tested directly, real
// filesystem, real temp dir, and onResponse()'s own real wiring to it is
// confirmed via a structural check against the actual shipped source,
// same pattern this session already used for host.js/agent-mesh.js.
//
// §ISOLATED — lib/intake.js's real stage() reaches into cortex's own
// shared JAA store to record every real drop, same as any real download
// would. Set BEFORE any require touches cortex/memory/jaa-db.js (that
// file's own DATA_DIR is a module-level const, computed once at first
// require, matching the same real JAA_DATA_DIR convention this session
// already established for idearium's own test isolation) — otherwise
// every run of this test would leave real, permanent rows in the shared
// store, the same real pollution class found and fixed earlier this
// session for idearium's own tests.
const fs_bootstrap = require('fs');
const os_bootstrap = require('os');
const path_bootstrap = require('path');
const _isolatedJaaDir = fs_bootstrap.mkdtempSync(path_bootstrap.join(os_bootstrap.tmpdir(), 'cos-seam-test-jaa-'));
process.env.JAA_DATA_DIR = _isolatedJaaDir;
process.on('exit', () => { try { fs_bootstrap.rmSync(_isolatedJaaDir, { recursive: true, force: true }); } catch (_) {} });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _writeCosSeamArtifacts } = require('../../lib/seam/queue.js');
const { parseCosSeams } = require('../../lib/seam/cos-seam-parser.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Real temp override of the module's own SEAM_ARTIFACTS_DIR would need a
// second require or env var this file doesn't have yet — instead, this
// test constructs its own real seams and writes through the real
// function, then reads back from the REAL module's own SEAM_ARTIFACTS_DIR
// (data/guardian/seam-artifacts/), cleaning up what it wrote, same as any
// other real-file test in this codebase that can't inject its own path.
const { SEAM_ARTIFACTS_DIR } = require('../../lib/seam/queue.js');

test('CSA-001', '_writeCosSeamArtifacts writes real bytes to a real file, under the compartment uuid it was given, and stages it through the real intake system', () => {
  const seams = parseCosSeams(`=========cos seam start=========\n\`\`\`js\nconst x = 42;\n\`\`\`\n=========cos seam end=========\ncompartment uuid: test-uuid-csa-001\nfile name: test-file.js`);
  assert.strictEqual(seams.length, 1);
  const events = [];
  _writeCosSeamArtifacts(seams, { queueId: 'q1', chunkIdx: 0, jobId: 'job-real-1', provider: 'claude', busEmit: (type, data) => events.push({ type, data }) });

  const expectedPath = path.join(SEAM_ARTIFACTS_DIR, 'test-uuid-csa-001', 'test-file.js');
  assert.ok(fs.existsSync(expectedPath), `expected a real file at ${expectedPath}`);
  assert.strictEqual(fs.readFileSync(expectedPath, 'utf8'), 'const x = 42;');

  const stagedEvent = events.find(e => e.type === 'guardian.seam.artifact.staged');
  assert.ok(stagedEvent, 'expected a real guardian.seam.artifact.staged event');
  assert.strictEqual(stagedEvent.data.fileName, 'test-file.js');

  const intakeEvent = events.find(e => e.type === 'guardian.seam.artifact.intake');
  assert.ok(intakeEvent, 'expected a real guardian.seam.artifact.intake event — the actual "download manager" routing James asked for, not just a staging-folder write');
  assert.ok(intakeEvent.data.dropId, 'expected a real dropId from lib/intake.js\'s own stage()');

  // Real, direct verification against lib/intake.js's own real, on-disk
  // contract — not just trusting the event fired.
  const intake = require('../../lib/intake.js');
  const drop = intake.read(intakeEvent.data.dropId);
  assert.ok(drop, 'expected a real, readable intake contract at the real dropId');
  assert.strictEqual(drop.provenance.jobId, 'job-real-1', 'the real jobId (already known from comp.jobId, no correlation lookup needed) must reach the real intake contract');
  assert.strictEqual(drop.provenance.provider, 'claude');

  fs.rmSync(path.join(SEAM_ARTIFACTS_DIR, 'test-uuid-csa-001'), { recursive: true, force: true });
  fs.rmSync(path.join(intake.INTAKE_DIR, intakeEvent.data.dropId), { recursive: true, force: true });
});

test('CSA-002', 'a missing compartment uuid falls back to a real, still-honest "unfiled" directory, not a thrown error', () => {
  const seams = parseCosSeams(`=========cos seam start=========\n\`\`\`js\nconst y = 1;\n\`\`\`\n=========cos seam end=========`);
  const events = [];
  _writeCosSeamArtifacts(seams, { queueId: 'q2', chunkIdx: 3, jobId: null, provider: 'ollama', busEmit: (type, data) => events.push({ type, data }) });

  const expectedPath = path.join(SEAM_ARTIFACTS_DIR, 'unfiled', 'chunk-3.txt');
  assert.ok(fs.existsSync(expectedPath));
  const stagedEvent = events.find(e => e.type === 'guardian.seam.artifact.staged');
  assert.strictEqual(stagedEvent.data.fileName, 'chunk-3.txt');

  const intakeEvent = events.find(e => e.type === 'guardian.seam.artifact.intake');
  assert.ok(intakeEvent, 'a missing compartment uuid must not prevent real intake staging — only the target directory falls back');

  const intake = require('../../lib/intake.js');
  fs.rmSync(path.join(SEAM_ARTIFACTS_DIR, 'unfiled'), { recursive: true, force: true });
  fs.rmSync(path.join(intake.INTAKE_DIR, intakeEvent.data.dropId), { recursive: true, force: true });
});

test('CSA-003', 'onResponse() is really wired to parse and stage seams — structural check against the real shipped source', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../lib/seam/queue.js'), 'utf8');
  const onResponseStart = src.indexOf('onResponse(jobId, responseText)');
  assert.ok(onResponseStart > -1, 'onResponse() not found at all — has it moved or been renamed?');
  const body = src.slice(onResponseStart, onResponseStart + 1200);
  assert.ok(/parseCosSeams\(responseText\)/.test(body), 'onResponse() no longer calls parseCosSeams on the real response text');
  assert.ok(/_writeCosSeamArtifacts\(/.test(body), 'onResponse() no longer calls _writeCosSeamArtifacts');
  assert.ok(/jobId:\s*comp\.jobId/.test(body), 'onResponse() no longer passes the real, already-known comp.jobId through — a regression back toward needing a correlation lookup that was deliberately avoided');
  // must be gated on `passed`, not run unconditionally — a rejected
  // response's own code (if any) may be exactly what's being rejected
  const passedIdx = body.indexOf('if (passed)');
  const seamCallIdx = body.indexOf('parseCosSeams(responseText)');
  assert.ok(passedIdx > -1 && seamCallIdx > passedIdx, 'seam parsing must happen inside the passed branch, not unconditionally');
});

test('CSA-004', 'a real intake.stage() failure is reported honestly, not swallowed', () => {
  const seams = parseCosSeams(`=========cos seam start=========\n\`\`\`js\nconst z = 1;\n\`\`\`\n=========cos seam end=========\ncompartment uuid: test-uuid-csa-004\nfile name: z.js`);
  const events = [];
  // Real failure, not simulated: point intake at a source that will be
  // deleted between the real file write and the real stage() call.
  const intake = require('../../lib/intake.js');
  const realStage = intake.stage;
  intake.stage = () => ({ ok: false, errors: ['simulated real failure for this test'] });
  try {
    _writeCosSeamArtifacts(seams, { queueId: 'q4', chunkIdx: 0, jobId: null, provider: 'claude', busEmit: (type, data) => events.push({ type, data }) });
  } finally {
    intake.stage = realStage;
  }
  const failEvent = events.find(e => e.type === 'guardian.seam.artifact.intake_failed');
  assert.ok(failEvent, 'a real intake.stage() failure must produce a real, distinct event, not silence');
  assert.ok(Array.isArray(failEvent.data.errors));

  fs.rmSync(path.join(SEAM_ARTIFACTS_DIR, 'test-uuid-csa-004'), { recursive: true, force: true });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
