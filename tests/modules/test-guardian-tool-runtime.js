'use strict';
// P4 — guardian tool-runtime (docs/copilot-omniscience-phasemap.spec). The proof
// of B/non-linear: the SAME lib/agent-tools loop runs inside Guardian with
// Guardian's OWN job-based provider backend (NCP → browser tabs), zero copilot
// dependency. Same tools, different model — nobody owns the loop.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const grt = require(path.join(ROOT, 'guardian/tool-runtime.js'));

(async () => {
  await test('T-001', 'Guardian loads the SAME 10 tools as copilot (one sovereign module)', () => {
    assert.ok(grt.toolCount() >= 10, `expected >=10 tools, got ${grt.toolCount()}`);
  });

  await test('T-002', 'GATE: a guardian tool-loop uses a tool via its job backend, no copilot', async () => {
    let turn = 0;
    const createAndDispatch = async () => `job-${++turn}`;
    const resolveJob = async (jobId) => {
      if (jobId === 'job-1') return { text: 'checking', toolCalls: [{ name: 'nexus_status', arguments: '{}' }] };
      return { text: 'nominal', toolCalls: null };
    };
    const r = await grt.run({ userPrompt: 'health?', createAndDispatch, resolveJob, provider: 'claude' });
    assert.strictEqual(r.toolCallLog[0].name, 'nexus_status');
    assert.ok(r.toolCallLog[0].result, 'the tool must execute for real');
    assert.strictEqual(r.iterations, 2);
  });

  await test('T-003', 'Guardian tool-runtime has NO copilot require (truly independent — the mesh, not a hub)', () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'guardian/tool-runtime.js'), 'utf8');
    assert.ok(!/require\(['"]\.\.\/copilot/.test(src), 'guardian must not require copilot');
  });

  await test('T-004', 'run() fails loud without a dispatch + resolve backend (§1.2)', async () => {
    await assert.rejects(async () => grt.run({ userPrompt: 'x' }), /createAndDispatch and resolveJob are required/);
  });

  await test('T-005', 'Guardian gets the shared stream but NOT the user-model (different caller, different purpose)', async () => {
    let capturedSystem = null;
    const createAndDispatch = async (p) => { capturedSystem = p; return 'j1'; };
    const resolveJob = async () => ({ text: 'ok', toolCalls: null });
    await grt.run({ userPrompt: 'x', createAndDispatch, resolveJob, streamDigest: 'cortex opened a gap' });
    assert.ok(/cortex opened a gap/.test(capturedSystem), 'guardian must get the live stream');
    assert.ok(!/USER MODEL|remembers/.test(capturedSystem), 'guardian must NOT carry copilot user-memory');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
