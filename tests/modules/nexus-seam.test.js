'use strict';
/**
 * tests/modules/nexus-nerve.test.js already tests nerve.
 * This tests the SEAM sovereignty move: lib/seam/ is now the
 * canonical location, accessible to any provider (guardian/ollama/future).
 * guardian/lib/ retains the original files for backward compat but
 * all live paths go through lib/seam/.
 */

const assert = require('assert');
let passed = 0, failed = 0;

function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

const seam = require('../../lib/seam/index.js');
const { Detector } = require('../../lib/seam/detector.js');

// ── lib/seam exports ─────────────────────────────────────────────────────────

test('SEAM-01 lib/seam exports SEAMQueue constructor', () => {
  assert.strictEqual(typeof seam.SEAMQueue, 'function');
});

test('SEAM-02 lib/seam exports all state constants', () => {
  const required = ['QUEUED','INJECTING','GENERATING','DETECTING','VERIFIED','RETRYING','ESCALATED','FAILED'];
  for (const s of required) {
    assert.ok(seam.STATE[s], `missing STATE.${s}`);
  }
});

test('SEAM-03 lib/seam exports Watchdog factory', () => {
  assert.strictEqual(typeof seam.Watchdog, 'function');
});

test('SEAM-04 lib/seam exports Detector', () => {
  assert.ok(seam.Detector, 'Detector must be exported');
});

test('SEAM-05 lib/seam exports spec parsing functions', () => {
  assert.strictEqual(typeof seam.parseSpec, 'function');
  assert.strictEqual(typeof seam.parseSpecFile, 'function');
  assert.strictEqual(typeof seam.extractPrerequisite, 'function');
});

// ── Detector functionality ────────────────────────────────────────────────────

test('SEAM-06 Detector.profile returns expected shape', () => {
  const p = Detector.profile('Hello world. This is a test response.');
  assert.ok(typeof p.words === 'number');
  assert.ok(typeof p.chars === 'number');
  assert.ok(typeof p.codeBlocks === 'number');
  assert.ok(typeof p.hasSeamContract === 'boolean');
});

test('SEAM-07 SEAM VERDICT line not flagged as truncated', () => {
  // Detector.truncation requires response >= 200 chars OR >= 40% of profile.chars.
  // minResponseChars = Math.max(200, chunk.length * 0.4) — use a realistic response.
  const text = 'This response covers the requested topic thoroughly. It includes a clear explanation '
    + 'of the approach taken, the reasoning behind each decision, and confirmation that '
    + 'all stated requirements have been addressed in the implementation above.\n\nSEAM VERDICT: PASS';
  const p = Detector.profile(text);
  const t = Detector.truncation(text, p);
  assert.ok(!t.truncated, `SEAM VERDICT line should not flag truncation: ${t.reason}`);
});

test('SEAM-08 very short response flagged as truncated', () => {
  const text = 'ok';
  const p = Detector.profile(text);
  const t = Detector.truncation(text, p);
  assert.ok(t.truncated, 'tiny response should be flagged as truncated');
});

test('SEAM-09 Detector.sigma returns score 0-1', () => {
  const text = 'A solid, well-formed response with good content and structure.';
  const p = Detector.profile(text);
  const s = Detector.sigma(text, p);
  assert.ok(typeof s.score === 'number', 'score must be a number');
  assert.ok(s.score >= 0 && s.score <= 1, `score ${s.score} out of range`);
  assert.ok(Array.isArray(s.signals), 'signals must be an array');
  assert.ok(typeof s.deviating === 'boolean', 'deviating must be boolean');
});

test('SEAM-10 Detector.delta returns score for axiom checking', () => {
  const text = 'Response that mentions MUST and SHALL requirements.';
  const d = Detector.delta(text, text, ['§1.1', '§2.1']);
  assert.ok(typeof d.score === 'number', 'delta score must be a number');
});

// ── Sovereign access — same module reachable from multiple paths ──────────────

test('SEAM-11 guardian server imports from lib/seam (not its own lib/)', () => {
  const src = require('fs').readFileSync(
    '/home/claude/nexus_fixed/guardian/server.js', 'utf8');
  assert.ok(src.includes("require('../lib/seam/queue.js')"),
    'guardian must require SEAM from lib/seam/queue.js');
  assert.ok(!src.includes("require('./lib/seam-queue')"),
    'guardian must not use old local seam-queue path');
});

test('SEAM-12 ollama server has SEAM Detector integration', () => {
  const src = require('fs').readFileSync(
    '/home/claude/nexus_fixed/ollama/server.js', 'utf8');
  assert.ok(src.includes("require('../lib/seam/detector.js')"),
    'ollama must require SEAM detector from lib/seam/');
  assert.ok(src.includes('seamScore'), 'ollama must write seamScore on jobs');
});

test('SEAM-13 SEAMQueue accepts provider:ollama as a valid provider', () => {
  const MockJaa = {
    insert: () => ({ id: 'mock' }),
    get: () => null,
    update: () => {},
    all: () => [],
  };
  // SEAMQueue is the queue-level wrapper — requires chunks array
  assert.doesNotThrow(() => {
    const q = new seam.SEAMQueue({
      title: 'test queue',
      provider: 'ollama',
      chunks: [{ title: 'Chunk 1', content: 'test content', builtPrompt: 'test', axioms: [] }],
      jaa: MockJaa,
      busEmit: () => {},
      ncpPush: (_, data) => { /* ollama deliverFn would replace this */ },
      onComplete: () => {},
    });
    assert.strictEqual(q.provider, 'ollama');
    // Verify all compartments got provider:'ollama'
    for (const comp of q.compartments) {
      assert.strictEqual(comp.provider, 'ollama', 'all compartments must inherit provider');
    }
  });
});

console.log(`\n  nexus-seam: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
