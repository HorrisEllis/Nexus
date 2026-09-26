'use strict';
// .injection node type (lib/node-schemas/schema.injection, status:REAL).
// Proves copilot/tool-runtime.js's makeNcpCallModel writes a real, schema-
// valid .injection node on every real call — primed (skipped) and not
// (full context) — matching the exact fields the v0.39.122 "mountain" fix
// measured. Redirects writes to a real temp dir first (§ never pollute the
// real data dir during a test run), same convention as test-node-index.js's
// JAA_DATA_DIR redirect.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const injTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-injection-'));
process.env.COPILOT_INJECTION_DIR = injTmp;

const rt = require(path.join(ROOT, 'copilot/tool-runtime.js'));
const nodeExport = require(path.join(ROOT, 'lib/node-export.js'));
const nodeSchemas = require(path.join(ROOT, 'lib/node-schemas.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function readInjections() {
  // readdirSync order is not creation order (alphabetical by uuid) — sort by
  // the real exported_at timestamp so "latest" below means what it says.
  return fs.readdirSync(injTmp)
    .filter(f => f.endsWith('.injection'))
    .map(f => nodeExport.importFromFile(path.join(injTmp, f)))
    .sort((a, b) => a.exported_at - b.exported_at);
}

(async () => {
  await test('INJ-001', 'schema.injection is registered and REAL', () => {
    const s = nodeSchemas.get('injection');
    assert.ok(s, 'schema.injection must be loadable');
    assert.strictEqual(s.status, 'REAL');
    assert.ok(nodeExport.KNOWN_TYPES.includes('injection'));
  });

  await test('INJ-002', 'a full-context dispatch (not primed) writes a real, schema-valid .injection node', async () => {
    const before = readInjections().length;
    const fakeDispatch = async () => ({ ok: true, text: 'hello', jobId: 'j1' });
    await rt.runViaAgent('claude', fakeDispatch, 'first turn', {});
    const rows = readInjections();
    assert.strictEqual(rows.length, before + 1, 'exactly one new .injection node');
    const p = rows[rows.length - 1].payload;
    const check = nodeSchemas.checkPayload('injection', p);
    assert.ok(check.ok, `payload must pass schema check: ${JSON.stringify(check)}`);
    assert.strictEqual(p.provider, 'claude');
    assert.strictEqual(p.primed, false);
    assert.strictEqual(p.injectedSystemPrompt, true);
    assert.strictEqual(p.injectedToolGuide, true);
    assert.ok(p.promptLength > 0, 'a real full-context call must have nonzero promptLength');
    assert.strictEqual(p.idleMsThreshold, 120000);
  });

  await test('INJ-003', 'a second dispatch to the same still-fresh provider writes primed:true with a smaller promptLength', async () => {
    const fakeDispatch = async () => ({ ok: true, text: 'hi again', jobId: 'j2' });
    const before = readInjections();
    const beforeFull = before.filter(r => r.payload.provider === 'claude' && !r.payload.primed).slice(-1)[0];
    await rt.runViaAgent('claude', fakeDispatch, 'second turn', {});
    const rows = readInjections();
    const latest = rows[rows.length - 1].payload;
    assert.strictEqual(latest.provider, 'claude');
    assert.strictEqual(latest.primed, true, 'still within PROVIDER_IDLE_MS — must skip re-injection');
    assert.strictEqual(latest.injectedSystemPrompt, false);
    assert.strictEqual(latest.injectedToolGuide, false);
    assert.ok(typeof latest.msSinceLastPrimed === 'number', 'primed record must carry real evidence, not just the flag');
    assert.ok(latest.promptLength < beforeFull.payload.promptLength, 'skipped call must be measurably smaller than the full one');
  });

  await test('INJ-004', 'a genuinely different provider is not treated as already primed', async () => {
    const fakeDispatch = async () => ({ ok: true, text: 'hi from gemini', jobId: 'j3' });
    await rt.runViaAgent('gemini', fakeDispatch, 'first turn for gemini', {});
    const rows = readInjections();
    const latest = rows[rows.length - 1].payload;
    assert.strictEqual(latest.provider, 'gemini');
    assert.strictEqual(latest.primed, false, 'a different provider must get full context regardless of another provider\'s recent activity');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
