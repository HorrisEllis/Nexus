'use strict';
const assert = require('assert');

// Mock copilot's own intuition/analysis modules so pingIntuition/pingAnalysis
// return controlled results without needing a real Ollama/stream.
let _intuitionAnswer = async () => ({ text: 'default' });
let _analysisAnswer  = async () => ({ text: 'default' });

require.cache[require.resolve('../../copilot/intuition')] = {
  id: '../copilot/intuition', filename: '../copilot/intuition', loaded: true,
  exports: { answer: (...args) => _intuitionAnswer(...args) },
};
require.cache[require.resolve('../../copilot/analysis')] = {
  id: '../copilot/analysis', filename: '../copilot/analysis', loaded: true,
  exports: { answer: (...args) => _analysisAnswer(...args) },
};

const adversarial = require('../../copilot/adversarial');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

(async () => {
  await test('T-001', '_normalizeCopilotAnswer: text with no online/offline mention is not comparable', async () => {
    const n = adversarial._normalizeCopilotAnswer('intuition', { text: 'hello there', intent: 'greeting' });
    assert.strictEqual(n.comparable, false);
  });

  await test('T-002', '_normalizeCopilotAnswer: "online" maps to no_issue', async () => {
    const n = adversarial._normalizeCopilotAnswer('intuition', { text: '5/5 systems online.' });
    assert.strictEqual(n.comparable, true);
    assert.strictEqual(n.claims[0].type, 'no_issue');
  });

  await test('T-003', '_normalizeCopilotAnswer: "offline" maps to issue_detected', async () => {
    const n = adversarial._normalizeCopilotAnswer('analysis', { text: 'guardian appears offline right now.' });
    assert.strictEqual(n.comparable, true);
    assert.strictEqual(n.claims[0].type, 'issue_detected');
  });

  await test('T-004', 'pingBoth: real contradiction (one online, one offline) — same case the old crude check caught', async () => {
    _intuitionAnswer = async () => ({ text: '5/5 systems online.', intent: 'status' });
    _analysisAnswer  = async () => ({ text: 'Guardian is offline based on recent telemetry.' });
    const r = await adversarial.pingBoth('what is the current system status');
    assert.strictEqual(r.contradiction, true);
    assert.strictEqual(r.verdict.verdict, 'contradiction');
  });

  await test('T-005', 'pingBoth: both say online — agreement, no contradiction', async () => {
    _intuitionAnswer = async () => ({ text: '5/5 systems online.' });
    _analysisAnswer  = async () => ({ text: 'All systems online and healthy.' });
    const r = await adversarial.pingBoth('what is the current system status');
    assert.strictEqual(r.contradiction, false);
    assert.strictEqual(r.verdict.verdict, 'agreement');
  });

  await test('T-006', 'pingBoth: neither mentions online/offline — not comparable, no false contradiction', async () => {
    _intuitionAnswer = async () => ({ text: 'hello!' });
    _analysisAnswer  = async () => ({ text: 'Here are the top CLI commands.' });
    const r = await adversarial.pingBoth('hello');
    assert.strictEqual(r.contradiction, false);
    assert.strictEqual(r.verdict.comparable, false);
  });

  await test('T-007', 'pingBoth: one faculty errored — no crash, contradiction stays false', async () => {
    _intuitionAnswer = async () => { throw new Error('boom'); };
    _analysisAnswer  = async () => ({ text: 'all online' });
    const r = await adversarial.pingBoth('x');
    assert.strictEqual(r.intuition.ok, false);
    assert.strictEqual(r.contradiction, false);
  });

  console.log(`\n  copilot-adversarial-consolidation: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
