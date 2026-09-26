'use strict';
// §FIX 2026-09-02 regression test — guardian/ask.js's askSync() used to store
// opts.tools verbatim (plain name strings, e.g. ESCALATION_TOOLS from
// copilot/lifeline.js) on job.tools, while ALSO injecting its own separate
// TOOL_CALL: manifest into the prompt text. The userscripts' own
// _buildToolsHeader (phase 1/2, commits 100fe02 + 40e3de7) expects job.tools
// to be {name, description} objects and reads job.tools directly — a plain
// string produced `- undefined` in the header, while ask.js's own manifest
// (a second, conflicting syntax: TOOL_CALL: not [[TOOL: ...]]) still landed
// correctly later in the same prompt. Net result for any NCP-dispatched
// job: one broken tools list + one working-but-differently-syntaxed one, in
// the same message — a model declining to act on that is not a model bug.
//
// This test calls the real askSync() with injected deps (it's designed to
// be testable standalone) and asserts job.tools carries resolved
// {name, description} objects, and that the prompt sent to the job is
// unchanged (no second, conflicting TOOL_CALL: instruction baked in) —
// leaving the userscript's own [[TOOL: ...]] header as the single real
// instruction for NCP/browser-tab providers.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const { askSync } = require(path.join(__dirname, '../../guardian/ask.js'));

async function run() {
  await test('T-001', 'job.tools carries resolved {name, description} objects, not raw name strings', async () => {
    let capturedJob = null;
    const jobs = new Map();
    const deps = {
      createJob: (opts) => {
        const job = { id: 'test-job-1', status: 'complete', responseText: 'ok', ...opts };
        capturedJob = job;
        jobs.set(job.id, job);
        return job;
      },
      dispatchJob: () => {},
      getJob: (id) => jobs.get(id),
      isProviderConnected: () => true,
    };

    await askSync('hello', { provider: 'chatgpt', tools: ['read_file', 'diagnose'] }, deps);

    assert.ok(Array.isArray(capturedJob.tools), 'job.tools must be an array');
    assert.strictEqual(capturedJob.tools.length, 2, 'both real tool names should resolve');
    for (const t of capturedJob.tools) {
      assert.strictEqual(typeof t, 'object', 'each tool must be an object, not a raw string');
      assert.ok(typeof t.name === 'string' && t.name.length, 'each tool object needs a real .name');
    }
  });

  await test('T-002', 'the prompt sent to the job is unchanged when tools are set — no second, conflicting TOOL_CALL: instruction', async () => {
    let capturedJob = null;
    const jobs = new Map();
    const deps = {
      createJob: (opts) => {
        const job = { id: 'test-job-2', status: 'complete', responseText: 'ok', ...opts };
        capturedJob = job;
        jobs.set(job.id, job);
        return job;
      },
      dispatchJob: () => {},
      getJob: (id) => jobs.get(id),
      isProviderConnected: () => true,
    };

    await askSync('hello there', { provider: 'chatgpt', tools: ['read_file'] }, deps);

    assert.strictEqual(capturedJob.prompt, 'hello there', 'prompt must stay byte-identical — the userscript header is the single source of truth now');
    assert.ok(!/TOOL_CALL:/.test(capturedJob.prompt), 'the old TOOL_CALL: convention must not be re-injected into the prompt');
  });

  await test('T-003', 'a job with no tools still gets job.tools === null (no regression for the plain ask path)', async () => {
    let capturedJob = null;
    const jobs = new Map();
    const deps = {
      createJob: (opts) => {
        const job = { id: 'test-job-3', status: 'complete', responseText: 'ok', ...opts };
        capturedJob = job;
        jobs.set(job.id, job);
        return job;
      },
      dispatchJob: () => {},
      getJob: (id) => jobs.get(id),
      isProviderConnected: () => true,
    };

    await askSync('plain ask, no tools', { provider: 'chatgpt' }, deps);
    assert.strictEqual(capturedJob.tools, null, 'no opts.tools means job.tools stays null, exactly as before');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
