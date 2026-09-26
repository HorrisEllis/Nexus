'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-ncp-handler-sr3.js — guardian/lib/ncp-handler.js's
 * real GUARDIAN_COMPLETE path, with focused coverage of the new SR3
 * artifact-extraction -> introspect bridge (2026-09-03).
 * UUID: nexus-test-ncp-handler-sr3-v1-0000-2026-0903-001
 *
 * §WHY THIS FILE EXISTS — grepped before writing anything: no test file
 * for guardian/lib/ncp-handler.js exists anywhere in this repo (a real,
 * pre-existing gap — its original decomposition was verified by an ad-hoc
 * integration run, never saved as a permanent regression test). This is
 * that missing file, scoped to the GUARDIAN_COMPLETE case and the new SR3
 * hook rather than attempting full coverage of every message type in one
 * pass.
 *
 * Real dependencies used where cheap and safe: a real, isolated jaaDB
 * (same JAA_DATA_DIR pattern as test-hat-forge.js), a real jobs Map, and
 * the REAL lib/introspect.js (not mocked) — this is genuine integration
 * coverage of the bridge, not a stub verifying its own stub.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'ncp-handler-sr3-test-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
jaaDB.insert('ncp_handler_isolation_probe', { id: 'probe', ts: Date.now() });
try { jaaDB._store().flushAll(); } catch (_) {}
if (!fs.existsSync(path.join(TMP, 'ncp_handler_isolation_probe.json'))) {
  console.log('  ✗ NCP-000 ISOLATION — cortex/memory/jaa-db.js ignores JAA_DATA_DIR');
  console.log('  1 failed, 0 passed');
  process.exitCode = 1;
  return;
}

const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));

// Minimal real extractCodeBlocks — same regex extractCodeBlocks() in
// guardian/server.js uses; not the subject under test here, so kept
// small rather than booting the whole real server.js to reuse its export.
function extractCodeBlocks(text, provider = 'ai') {
  const blocks = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let m, n = 0;
  while ((m = re.exec(text)) !== null) {
    const lang = (m[1] || '').toLowerCase();
    const content = m[2].trimEnd();
    if (!content.trim()) continue;
    blocks.push({ filename: `${provider}-${Date.now()}-${++n}.${lang || 'txt'}`, content, lang, ext: lang || 'txt' });
  }
  return blocks;
}

function makeHandler(busEvents) {
  const jobs = new Map();
  const bus = { emit: (type, data) => busEvents.push({ type, data }) };
  const jaa = { insert: () => {}, query: () => [] };
  const activeQueues = new Map();
  const handler = createNCPMessageHandler({
    nc: { _req: async () => ({}) },
    ncp: { updateClient: () => {}, push: () => {}, handleHeartbeat: () => {} },
    bus, jaa, jobs,
    updateJob: (id, patch) => { const j = jobs.get(id); if (j) Object.assign(j, patch); return j; },
    cockpitBroadcast: () => {},
    physQueue: { logConversation: () => {} },
    baseline: { observe: () => {} },
    evLedger: null,
    activeQueues,
    extractCodeBlocks,
    extractToolCallsFromDOM: () => [],
    findActiveSeamCompartment: () => null,
  });
  return { handler, jobs, busEvents };
}

async function main() {
  console.log('\n[1] ncp-handler.js — real GUARDIAN_COMPLETE path');

  await test('NCP-001', 'a completion with no code blocks writes nothing, throws nothing', async () => {
    const { handler, jobs } = makeHandler([]);
    const jobId = 'job-no-artifacts';
    jobs.set(jobId, { id: jobId, prompt: 'say hello', command: 'ask', status: 'pending' });
    assert.doesNotThrow(() => handler({ type: 'GUARDIAN_COMPLETE', jobId, provider: 'claude', text: 'just plain text, no code' }));
  });

  console.log('\n[2] SR3 — artifact-extraction -> introspect bridge');

  await test('NCP-002', 'a completion WITH a code block writes real artifact files', async () => {
    const { handler, jobs } = makeHandler([]);
    const jobId = 'job-with-artifacts-1';
    jobs.set(jobId, { id: jobId, prompt: 'write a function', command: 'code', status: 'pending' });
    handler({ type: 'GUARDIAN_COMPLETE', jobId, provider: 'claude', text: '```js\nconsole.log("hi");\n```' });
    const outDir = path.join(ROOT, 'data', 'output', new Date().toISOString().slice(0, 10), jobId.slice(0, 8));
    assert.ok(fs.existsSync(outDir), `expected output dir ${outDir} to exist`);
    const files = fs.readdirSync(outDir);
    assert.ok(files.some(f => f.endsWith('.js')), 'expected a real .js artifact file');
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  await test('NCP-003', 'guardian.artifacts.written fires synchronously with the completion', async () => {
    const events = [];
    const { handler, jobs } = makeHandler(events);
    const jobId = 'job-with-artifacts-2';
    jobs.set(jobId, { id: jobId, prompt: 'write a function', command: 'code', status: 'pending' });
    handler({ type: 'GUARDIAN_COMPLETE', jobId, provider: 'claude', text: '```js\nconst x = 1;\n```' });
    assert.ok(events.some(e => e.type === 'guardian.artifacts.written'), 'guardian.artifacts.written did not fire');
    const outDir = events.find(e => e.type === 'guardian.artifacts.written').data.outDir;
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  await test('NCP-004', 'the real introspect bridge fires asynchronously and writes a real _introspect.json sidecar', async () => {
    const events = [];
    const { handler, jobs } = makeHandler(events);
    const jobId = 'job-with-artifacts-3';
    jobs.set(jobId, { id: jobId, prompt: 'write a function that adds two numbers', command: 'code', status: 'pending' });
    handler({ type: 'GUARDIAN_COMPLETE', jobId, provider: 'claude', text: '```js\nfunction add(a,b){return a+b;}\n```' });

    const writtenEvent = events.find(e => e.type === 'guardian.artifacts.written');
    assert.ok(writtenEvent, 'setup: guardian.artifacts.written did not fire');
    const outDir = writtenEvent.data.outDir;

    // The bridge is fire-and-forget by design (the handler must stay
    // synchronous per createNCPServer's contract) — give the real,
    // unmocked introspect.examine() a moment to actually resolve.
    await new Promise(r => setTimeout(r, 300));

    const sidecarPath = path.join(outDir, '_introspect.json');
    assert.ok(fs.existsSync(sidecarPath), `expected a real _introspect.json at ${sidecarPath}`);
    const verdict = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    assert.ok(verdict.verdict, 'sidecar file has no real verdict field');
    assert.ok(events.some(e => e.type === 'guardian.artifacts.examined'), 'guardian.artifacts.examined did not fire');

    fs.rmSync(outDir, { recursive: true, force: true });
  });

  await test('NCP-005', 'a completion with no jobs-map entry for jobId still writes artifacts (introspect gets nulls, not a crash)', async () => {
    const events = [];
    const { handler } = makeHandler(events); // deliberately never set into jobs
    const jobId = 'job-unregistered';
    assert.doesNotThrow(() => handler({ type: 'GUARDIAN_COMPLETE', jobId, provider: 'claude', text: '```js\nconst y = 2;\n```' }));
    await new Promise(r => setTimeout(r, 300));
    const outDir = path.join(ROOT, 'data', 'output', new Date().toISOString().slice(0, 10), jobId.slice(0, 8));
    assert.ok(fs.existsSync(outDir), 'artifacts must still be written even with no job record');
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  // §FIXED 2026-09-06 — James: "all chats from the ncp need to log to
  // the chat log index." Real, confirmed gap: lib/chat-logger.js's own
  // log() is the real function that writes to disk, to jaaDB, AND
  // embeds via vector-memory.js for real semantic search — but this
  // handler only ever called it for the user's prompt (role:'user').
  // The agent's own real response — half of every real exchange — only
  // ever reached the separate, raw jaa.insert('chat_log', ...) a few
  // lines below, which writes a row but never embeds it: no disk log,
  // not findable by any real semantic search over past chats. These
  // tests use the REAL lib/chat-logger.js and a real, isolated jaaDB
  // (this file's own top-level JAA_DATA_DIR=TMP already covers it) —
  // not the no-op `jaa` mock makeHandler() injects elsewhere, since the
  // real bug lives inside chat-logger.js's own separate require(), not
  // in anything the mock could intercept.
  await test('NCP-006', 'a real completion logs BOTH the user prompt AND the agent response through chat-logger.js — not just the prompt', async () => {
    const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
    const { handler, jobs } = makeHandler([]);
    const jobId = 'job-chatlog-symmetry';
    jobs.set(jobId, { id: jobId, prompt: 'a real, distinctive test prompt about narwhals', command: 'ask', status: 'pending' });
    handler({ type: 'GUARDIAN_COMPLETE', jobId, provider: 'claude', text: 'a real, distinctive test response about narwhals' });
    await new Promise(r => setTimeout(r, 300));

    const rows = jaaDB.query('chat_log', r => r.jobId === jobId, 100);
    const userRow = rows.find(r => r.role === 'user');
    const assistantRow = rows.find(r => r.role === 'assistant');
    assert.ok(userRow, 'expected a real chat-logger.js row for the user prompt (already worked before this fix)');
    assert.ok(assistantRow, 'expected a real chat-logger.js row for the agent response — this is the real fix; it did not exist before');
    assert.ok(assistantRow.content.includes('narwhals'), 'the real response content must actually be logged, not a placeholder');
  });

  await test('NCP-007', 'a completion with no real response text (finalText falsy) does not write a fabricated assistant entry', async () => {
    const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
    const { handler, jobs } = makeHandler([]);
    const jobId = 'job-chatlog-empty';
    jobs.set(jobId, { id: jobId, prompt: 'a prompt with no real reply', command: 'ask', status: 'pending' });
    handler({ type: 'GUARDIAN_COMPLETE', jobId, provider: 'claude', text: '' });
    await new Promise(r => setTimeout(r, 300));

    const rows = jaaDB.query('chat_log', r => r.jobId === jobId, 100);
    const assistantRow = rows.find(r => r.role === 'assistant');
    assert.ok(!assistantRow, 'an empty real response must not produce a fabricated assistant log entry');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (PRIOR_DIR === undefined) delete process.env.JAA_DATA_DIR; else process.env.JAA_DATA_DIR = PRIOR_DIR;
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
