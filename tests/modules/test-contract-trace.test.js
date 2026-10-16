'use strict';
/**
 * tests/modules/test-contract-trace.test.js — GW3 (docs/2026-10-15-gate-held-work-phasemap.spec)
 * James: "each contract tracked through the system using the event ledger, tagging and each gate" (2026-10-15) · "Yes. It’s
 * analysis. The bricks." (2026-10-16: the brick is the unit). The trace on a fixture contract, where each hole is planted
 * so the test fails if the trace stops naming it.
 */
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CT = require(path.join(ROOT, 'cortex/core/raid/contract-trace.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const contract = () => ({
  uuid: 'c-1',
  gates: [{ id: 'phase', type: 'phase' }, { id: 'b1', type: 'build', file: 'a.js' }, { id: 'b2', type: 'build', file: 'b.js', depends_on: ['b1'] }, { id: 'b3', type: 'build', file: 'c.js' }],
  state: {
    gates: { b1: { status: 'PASSED', attempts: 2 }, b2: { status: 'PASSED', attempts: 1 }, b3: { status: 'FAILED', attempts: 1 } },
    evidence: { 'b1.commit': 'abc', 'b1.rewound': JSON.stringify({ to: 'base', ok: true, files: ['a.js'] }) },
    evidence_log: [
      { key: 'b1.class', value: 'capability', by: 'scheduler:classify', at: 20 },
      { key: 'b1.rewound', value: '{"to":"base"}', by: 'scheduler:rewind', at: 25 },
      { key: 'b1.commit', value: 'abc', by: 'scheduler:versioning', at: 40 },
    ],
    checkpoints: [{ gate: 'b1', at: 41, commit: 'abc', agent: 'chatgpt', hashes: { 'a.js': 'h1' } }, { gate: 'b2', at: 61, agent: 'ollama' }],
  },
});
const runs = [
  { ts: 10, state: 'building', runId: 'r' },
  { ts: 21, state: 'brick-failed', brick: 'b1', file: 'a.js', provider: 'ollama', failureClass: 'capability', runId: 'r' },
  { ts: 40, state: 'brick-passed', brick: 'b1', file: 'a.js', provider: 'chatgpt', commit: 'abc', runId: 'r' },
  { ts: 60, state: 'brick-passed', brick: 'b2', file: 'b.js', provider: null, runId: 'r' },
  { ts: 70, state: 'contract-incomplete', runId: 'r', raidQueueId: 'q1' },
];

test('CT-01', 'one ordered story: the contract log, checkpoints, ledger moves and RAID\'s row, oldest first', () => {
  const t = CT.trace(contract(), { runs, raid: { uuid: 'q1', status: 'PASS', updatedAt: 80, forAgent: 'auto', dispatchedJobId: 'j9' } });
  const ats = t.steps.map(s => s.at); assert.deepStrictEqual(ats, [...ats].sort((a, b) => a - b));
  assert.deepStrictEqual([...new Set(t.steps.map(s => s.source))].sort(), ['checkpoint', 'contract', 'ledger', 'raid']);
  assert.strictEqual(t.steps[t.steps.length - 1].detail, 'job j9');
});

test('CT-02', 'per brick: who built it (not the scheduler), its files (a rewound file too), its commits, its attempts', () => {
  const t = CT.trace(contract(), { runs });
  const b1 = t.bricks.find(b => b.id === 'b1');
  assert.deepStrictEqual(b1.agents.sort(), ['chatgpt', 'ollama']);
  assert.deepStrictEqual(b1.files, ['a.js']); assert.deepStrictEqual(b1.commits, ['abc']); assert.strictEqual(b1.attempts, 2);
  assert.ok(b1.rewound && b1.rewound.to === 'base');
  assert.ok(!t.bricks.some(b => b.id === 'phase'), 'the phase gate is not a brick');
});

test('CT-03', 'holes are named, never filled: a pass with no commit, a move with no agent, a brick that ran with no move', () => {
  const t = CT.trace(contract(), { runs });
  const w = t.holes.map(h => `${h.gate}: ${h.what}`);
  assert.ok(w.includes('b2: PASSED with no commit recorded: it cannot be rewound to'), w.join(' | '));
  assert.ok(w.includes('b2: a passed move with no agent named'), w.join(' | '));
  assert.ok(w.includes('b3: ran 1 time(s) by its state, but no move of it is on the ledger'), w.join(' | '));
  assert.ok(!w.some(x => x.startsWith('b1:')), 'b1 is whole: ' + w.join(' | '));
});

test('CT-04', 'with no ledger rows, the trace does not invent ledger holes (it only says what it can see)', () => {
  const t = CT.trace(contract(), { runs: [] });
  assert.ok(!t.holes.some(h => /ledger/.test(h.what)));
  assert.ok(t.holes.some(h => /no commit/.test(h.what)), 'the contract alone still shows a pass with no commit');
});

test('CT-05', 'lines(): the CLI\'s and an agent\'s plain view, one per step', () => {
  const t = CT.trace(contract(), { runs });
  const l = CT.lines(t);
  assert.strictEqual(l.length, t.steps.length);
  assert.ok(l.some(x => /b1\s+brick-passed\s+chatgpt/.test(x) && /@abc/.test(x)), l.join('\n'));
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
