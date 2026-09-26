'use strict';
/**
 * tests/modules/error-capture.test.js
 * Tests for clear-glass/src/diagnostic/error-capture.js, built 2026-06-30
 * in direct response to "the whole point of the diagnostic UI was to find
 * the errors, where are they." Real gap found: diagnostic/engine.js is a
 * test runner, not an error monitor — zero passive error capture existed
 * anywhere in clear-glass before this.
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
let passed = 0, failed = 0;

function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

const { ErrorCapture } = require('../../clear-glass/src/diagnostic/error-capture.js');

test('ECT-01 capture() returns a row with all required fields', () => {
  const ec = new ErrorCapture({ logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  const row = ec.capture({ source: 'main-process', type: 'test', message: 'hello' });
  assert.ok(row.id);
  assert.ok(row.ts);
  assert.ok(row.isoTime);
  assert.strictEqual(row.source, 'main-process');
  assert.strictEqual(row.message, 'hello');
});

test('ECT-02 captured errors are retrievable via getRecent', () => {
  const ec = new ErrorCapture({ logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  ec.capture({ source: 'main-process', type: 'a', message: '1' });
  ec.capture({ source: 'main-process', type: 'b', message: '2' });
  const recent = ec.getRecent(10);
  assert.strictEqual(recent.length, 2);
  assert.strictEqual(recent[1].message, '2');
});

test('ECT-03 ring buffer caps at MAX_RECENT, oldest dropped first', () => {
  const ec = new ErrorCapture({ logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  ec.MAX_RECENT = 5;
  for (let i = 0; i < 10; i++) ec.capture({ source: 'main-process', type: 'x', message: `msg-${i}` });
  const recent = ec.getRecent(100);
  assert.strictEqual(recent.length, 5);
  assert.strictEqual(recent[0].message, 'msg-5'); // first 5 dropped
  assert.strictEqual(recent[4].message, 'msg-9');
});

test('ECT-04 errors actually persist to disk, not just memory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-'));
  const ec = new ErrorCapture({ logDir: dir });
  ec.init();
  ec.capture({ source: 'main-process', type: 'persisttest', message: 'should be on disk' });
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `${today}.jsonl`);
  assert.ok(fs.existsSync(file), 'log file should exist');
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('should be on disk'));
});

test('ECT-05 SSE emit fires with the error.captured event type', () => {
  let emittedType = null, emittedData = null;
  const fakeSse = { emit: (type, data) => { emittedType = type; emittedData = data; } };
  const ec = new ErrorCapture({ sse: fakeSse, logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  ec.capture({ source: 'main-process', type: 'sse-test', message: 'broadcast me' });
  assert.strictEqual(emittedType, 'error.captured');
  assert.strictEqual(emittedData.message, 'broadcast me');
});

test('ECT-06 SSE failure does not crash capture() — logging is best-effort', () => {
  const throwingSse = { emit: () => { throw new Error('SSE is down'); } };
  const ec = new ErrorCapture({ sse: throwingSse, logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  assert.doesNotThrow(() => ec.capture({ source: 'main-process', type: 'x', message: 'still works' }));
});

test('ECT-07 disk write failure does not crash capture() — best-effort persistence', () => {
  // Point logDir at a path that can't be written to (file, not directory)
  const blockerFile = path.join(os.tmpdir(), `ec-blocker-${Date.now()}`);
  fs.writeFileSync(blockerFile, 'blocking');
  const ec = new ErrorCapture({ logDir: path.join(blockerFile, 'impossible-subdir') });
  assert.doesNotThrow(() => ec.capture({ source: 'main-process', type: 'x', message: 'survives bad disk' }));
  const recent = ec.getRecent();
  assert.strictEqual(recent[0].message, 'survives bad disk', 'in-memory capture should still work even if disk fails');
});

test('ECT-08 captureFromRenderer correctly tags source as renderer', () => {
  const ec = new ErrorCapture({ logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  const row = ec.captureFromRenderer({ type: 'window.onerror', message: 'renderer crashed', agentId: 'claude-tab' });
  assert.strictEqual(row.source, 'renderer');
  assert.strictEqual(row.agentId, 'claude-tab');
});

test('ECT-09 each capture gets a unique id even when called rapidly', () => {
  const ec = new ErrorCapture({ logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  const ids = new Set();
  for (let i = 0; i < 50; i++) ids.add(ec.capture({ source: 'main-process', type: 'x', message: 'x' }).id);
  assert.strictEqual(ids.size, 50, 'all 50 ids should be unique');
});

// ── §R8 2026-08-12 — optional gapField reporter, mirroring the existing sse pattern ──
test('ECT-10 a real caught error reports a real gap when gapField is wired, with location and error populated', () => {
  const reported = [];
  const gapField = { report: (g) => { reported.push(g); return { created: true }; } };
  const ec = new ErrorCapture({ gapField, logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  ec.captureFromRenderer({ type: 'rendererError', message: 'real test error', stack: 'Error: x\n  at y:1:1', url: 'app://panel.html' });
  assert.strictEqual(reported.length, 1);
  assert.strictEqual(reported[0].type, 'clear-glass.renderer-error');
  assert.strictEqual(reported[0].location, 'app://panel.html');
  assert.strictEqual(reported[0].error, 'Error: x\n  at y:1:1');
});

test('ECT-11 without gapField wired, capture behaves exactly as before — no error, no attempted report', () => {
  const ec = new ErrorCapture({ logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  assert.doesNotThrow(() => ec.capture({ source: 'main-process', type: 'x', message: 'no gapField wired' }));
});

test('ECT-12 a gapField failure never breaks capture itself — same discipline as the sse push (§1.2)', () => {
  const throwingGapField = { report: () => { throw new Error('simulated gap-field failure'); } };
  const ec = new ErrorCapture({ gapField: throwingGapField, logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ec-test-')) });
  assert.doesNotThrow(() => ec.capture({ source: 'main-process', type: 'x', message: 'must survive a gapField throw' }));
  assert.strictEqual(ec.getRecent()[0].message, 'must survive a gapField throw');
});

console.log(`\n  error-capture: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
