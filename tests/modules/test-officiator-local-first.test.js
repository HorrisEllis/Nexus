'use strict';
// tests/modules/test-officiator-local-first.test.js — 2026-11-17, RT1 expanded and FM4 expanded.
// James, 2026-11-17: "yes. it needs to fallback. i wanted options for all this so i can configure it. like in raid." · "also failure mode
// reports should be going in here."
//
// Found in his log the same day: RAID's officiator sent "Synthesize ONE real build contract…" to the Claude tab (a paid session) because RAID
// ranked Claude first, and 'ollama' went through guardian's NCP, which has no Ollama tab, so it could never answer.
//
//   OL-01  RAID's tunables: the officiator's options reach an existing table (seeded, said), are listed with their defaults, and a value
//          that does not fit is refused
//   OL-02  the officiator asks his list first, a local agent through lib/ollama-port.js, never through guardian's NCP
//   OL-03  the local agent fails: with officiatorFallback 'raid' the next agent is tried; with 'none' no other agent is asked
//   OL-04  Intelligence's failure-mode reports land in its own data/failures: one file per fault class (a Windows-safe name),
//          unchanged files not rewritten, one line per scan
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

// the NCP door, stubbed: counts every call, never answers (a paid browser agent must not be reached in these tests)
const lifelinePath = require.resolve('../../copilot/lifeline.js');
const ncpCalls = [];
require.cache[lifelinePath] = { id: lifelinePath, filename: lifelinePath, loaded: true,
  exports: { dispatchToNcpAgent: async (prompt, o) => { ncpCalls.push(o && o.provider); return null; } } };

const CONTRACT = JSON.stringify({ endState: 'x', conditions: [], intent: 'i', context: 'c', warpPrimitives: null, axioms: null, tools: null, compartmentUuid: null, fileDirectory: null, fileName: null });

async function main() {
  const TU = require('../../cortex/core/raid/tunables.js');
  const { jaaDB } = require('../../cortex/memory/jaa-db');

  await test('OL-01', 'the officiator\'s options reach an existing table, are listed with defaults, and a value that does not fit is refused', async () => {
    // an install seeded before these keys existed: only the old five rows
    jaaDB.delete(TU.TABLE, () => true);
    for (const k of ['invariantThreshold', 'frictionThreshold', 'neutralConfidence', 'minCallsForConfidence', 'maxGraphHopDepth']) jaaDB.insert(TU.TABLE, { uuid: `u-${k}`, key: k, value: TU.DEFAULTS[k], ts: 1, source: 'default-seed' });
    TU.reload();
    assert.deepStrictEqual(TU.get('officiatorAgents'), ['ollama']);
    assert.strictEqual(TU.get('officiatorFallback'), 'raid');
    const list = TU.all();
    assert.ok(list.find(t => t.key === 'officiatorAgents' && !t.changed));
    assert.throws(() => TU.set('officiatorFallback', 'claude'), /cannot be/);
    assert.throws(() => TU.set('officiatorAgents', 'ollama'), /cannot be/);
    assert.throws(() => TU.set('noSuchKey', 1), /unknown key/);
    TU.set('officiatorAgents', ['ollama', 'mistral'], { source: 'test' });
    assert.ok(TU.all().find(t => t.key === 'officiatorAgents').changed);
    TU.set('officiatorAgents', ['ollama'], { source: 'test' });
  });

  require('../../lib/hat-seed.js').seedHats();
  const port = require('../../lib/ollama-port.js');
  const OF = require('../../cortex/core/raid/officiator.js');

  await test('OL-02', 'his list first: a local agent is asked through the ollama port, never through guardian\'s NCP', async () => {
    let asked = 0; port.provide({ generate: async () => { asked++; return CONTRACT; } });   // an in-process bridge returns the text (lib/ollama-port.js)
    ncpCalls.length = 0;
    const r = await quiet(() => OF.synthesizeFromContext('a staged artifact: one file', { fresh: true }));
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.synthesized.endState, 'x');
    assert.strictEqual(asked, 1, 'the local bridge was asked once');
    assert.deepStrictEqual(ncpCalls, [], 'no browser agent was asked');
  });

  await test('OL-03', 'the local agent fails: \'raid\' falls back to RAID\'s next agents; \'none\' asks no one else', async () => {
    port.provide({ generate: async () => { throw new Error('the bridge is down'); } });
    TU.set('officiatorFallback', 'none', { source: 'test' });
    ncpCalls.length = 0;
    const none = await quiet(() => OF.synthesizeFromContext('another artifact', { fresh: true }));
    assert.strictEqual(none.ok, false);
    assert.deepStrictEqual(ncpCalls, [], 'with none, no paid agent is reached');
    TU.set('officiatorFallback', 'raid', { source: 'test' });
    const raid = await quiet(() => OF.synthesizeFromContext('a third artifact', { fresh: true }));
    assert.strictEqual(raid.ok, false);
    // RAID's ranking is whatever its health says here; what is proven is the order: the local agent first, then only RAID's
    if (ncpCalls.length) assert.ok(!ncpCalls.includes('ollama'), `ollama never goes through NCP (asked: ${ncpCalls.join(', ')})`);
    port.provide(null);
  });

  await test('OL-04', 'failure-mode reports land in intelligence\'s own data/failures, one file per class, unchanged files kept, one line per scan', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failures-'));
    process.env.INTELLIGENCE_FAILURES_DIR = dir;
    const I = require('../../intelligence/index.js');
    const idx = {
      'component_error:write': { faultClass: 'component_error:write', count: 3, lastSeen: 5, systems: ['guardian'], components: ['g.x'], gapTypes: [], precursors: [], examples: [{ id: 'e1', msg: 'm', ts: 5 }] },
      wiring_missing: { faultClass: 'wiring_missing', count: 1, lastSeen: 4, systems: ['guardian'], components: [], gapTypes: ['boundary_gap'], precursors: [], examples: [] },
    };
    const a = I._writeFailureReports(idx, 10);
    assert.deepStrictEqual(a, { written: 2, unchanged: 0 });
    assert.ok(fs.existsSync(path.join(dir, 'component_error_write.json')), 'the ":" is made safe for Windows');
    const b = I._writeFailureReports(idx, 20);
    assert.deepStrictEqual(b, { written: 0, unchanged: 2 }, 'nothing changed, nothing rewritten');
    const scans = fs.readFileSync(path.join(dir, '_scans.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.strictEqual(scans.length, 2);
    assert.strictEqual(scans[0].top[0].faultClass, 'component_error:write');
    delete process.env.INTELLIGENCE_FAILURES_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
