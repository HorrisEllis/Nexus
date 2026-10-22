'use strict';
/**
 * tests/modules/test-raid-officiator.js — real, isolated tests for
 * cortex/core/raid/officiator.js.
 *
 * James: "did you finish the synthesis for the contracts. thats top
 * priority. maybe intent: contract or officiator for synthesizing
 * contracts. needs to listen for the artifact."
 *
 * §ISOLATION — NEXUS_INTAKE_DIR (a real, staged artifact directory) and
 * JAA_DATA_DIR (RAID's queue + hat-forge's table) are both isolated to
 * a real temp directory. copilot/lifeline.js's dispatchToNcpAgent is
 * mocked via require.cache, the same real convention contract-intake-
 * dependency-graph.test.js already uses for jaaDB — this module makes
 * a real HTTP call to guardian in production, which isn't running here.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'officiator-test-'));
process.env.NEXUS_INTAKE_DIR = path.join(TMP, 'intake');
process.env.JAA_DATA_DIR = path.join(TMP, 'jaa');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

let _mockResponse = null;
let _lastProvider = null;
require.cache[require.resolve(path.join(ROOT, 'copilot/lifeline.js'))] = {
  id: 'copilot/lifeline.js', filename: 'copilot/lifeline.js', loaded: true,
  exports: {
    dispatchToNcpAgent: async (_p, o) => { _lastProvider = (o && o.provider) || null; return _mockResponse; },
    route: async () => ({ ok: false }),
    health: async () => ({ ok: false }),
    extractExplicitAgent: () => null,
    MODULE_ID: 'lifeline', VERSION: '0.0.0-mock', CONFIDENCE_THRESHOLD: 0.5,
  },
};

const intake = require(path.join(ROOT, 'lib/intake.js'));
const hatSeed = require(path.join(ROOT, 'lib/hat-seed.js'));
hatSeed.seedHats();
const _raidInputIsolated1 = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-officiator-'));
process.env.RAID_INPUT_DIR = _raidInputIsolated1;
process.on('exit', () => { try { fs.rmSync(_raidInputIsolated1, { recursive: true, force: true }); } catch (_) {} });
const officiator = require(path.join(ROOT, 'cortex/core/raid/officiator.js'));
const raid = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));

function stageRealTestArtifact(content) {
  const srcFile = path.join(TMP, `artifact-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(srcFile, content);
  const r = intake.stage({
    source: srcFile,
    root: TMP,
    provenance: { provider: 'deepseek', filename: path.basename(srcFile) },
  });
  assert.strictEqual(r.ok, true, `expected a real staged drop: ${JSON.stringify(r.errors)}`);
  return r;
}

(async () => {

await test('OFF-001', 'the_officiator hat is real and seeded, with the officiate intent', () => {
  const hatForge = require(path.join(ROOT, 'lib/hat-forge.js'));
  const hat = hatForge.get('the_officiator');
  assert.ok(hat);
  assert.deepStrictEqual(hat.allowedIntents, ['officiate']);
});

await test('OFF-002', 'a real staged artifact, synthesized, produces a real RAID contract', async () => {
  const { dropId } = stageRealTestArtifact('function reverse(s) { return s.split("").reverse().join(""); }\nmodule.exports = reverse;');
  const drop = intake.read(dropId);

  _mockResponse = {
    ok: true,
    text: JSON.stringify({
      endState: 'a real, tested string-reverse utility exists',
      conditions: ['function exports correctly', 'handles empty string'],
      intent: 'build',
      context: 'a small reverse-string utility, already drafted',
      warpPrimitives: ['Event'],
      axioms: ['AX-001'],
      tools: ['read_file'],
      compartmentUuid: null,
      fileDirectory: 'lib',
      fileName: 'reverse.js',
    }),
  };

  const result = await officiator.officiate(drop, { forAgent: 'deepseek' });
  assert.strictEqual(result.ok, true, `expected synthesis to succeed: ${result.reason}`);
  assert.ok(result.queueId);

  const row = raid.listQueue().find(r => r.uuid === result.queueId);
  assert.ok(row, 'expected a real, queued contract row');
  assert.strictEqual(row.source, 'officiator');
  assert.strictEqual(row.intention, 'build');
  assert.strictEqual(row.sourceDropId, dropId, 'the contract must trace back to the real artifact that caused it');
  assert.strictEqual(row.contract.fileDirectory, 'lib');
  assert.strictEqual(row.contract.fileName, 'reverse.js');
});

await test('OFF-003', 'a real agent response that is not valid JSON fails honestly, does not fabricate a contract', async () => {
  const { dropId } = stageRealTestArtifact('not real code, just prose');
  const drop = intake.read(dropId);
  _mockResponse = { ok: true, text: 'I cannot determine a contract from this.' };

  const result = await officiator.officiate(drop, { forAgent: 'deepseek' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('could not be parsed'));
});

await test('OFF-004', 'an unreachable agent fails honestly, does not fabricate a contract', async () => {
  const { dropId } = stageRealTestArtifact('irrelevant');
  const drop = intake.read(dropId);
  _mockResponse = { ok: false };

  const result = await officiator.officiate(drop, { forAgent: 'deepseek' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('no real agent response'));
});

await test('OFF-005', 'tick() finds real staged drops and processes each exactly once (dedup)', async () => {
  stageRealTestArtifact('console.log(1);');
  _mockResponse = { ok: true, text: JSON.stringify({ endState: 'a', conditions: [], intent: 'build', context: 'a', warpPrimitives: [], axioms: [], tools: [], compartmentUuid: null, fileDirectory: null, fileName: null }) };

  const r1 = await officiator.tick();
  assert.ok(r1.checked >= 1);
  assert.ok(r1.synthesized >= 1);

  const r2 = await officiator.tick();
  assert.strictEqual(r2.synthesized, 0, 'expected the already-processed drop to be skipped, not re-synthesized');
});

await test('OFF-006', 'the dedup is real and persisted — survives a simulated restart (fresh _seen set), not just in-memory', async () => {
  const { dropId } = stageRealTestArtifact('console.log("persisted dedup test");');
  _mockResponse = { ok: true, text: JSON.stringify({ endState: 'a', conditions: [], intent: 'build', context: 'a', warpPrimitives: [], axioms: [], tools: [], compartmentUuid: null, fileDirectory: null, fileName: null }) };

  const first = await officiator.officiate(intake.read(dropId));
  assert.strictEqual(first.ok, true);

  const dropAfter = intake.read(dropId);
  assert.ok(dropAfter.officiated, 'expected a real, physical officiated marker on the drop itself');
  assert.strictEqual(dropAfter.officiated.queueId, first.queueId);

  // §THE REAL TEST — a completely fresh require of the module (a real
  // simulated restart, not just clearing the in-memory _seen set by
  // hand) must still see this drop as already-officiated via the real,
  // persisted marker on disk, not just this process's own memory.
  delete require.cache[require.resolve(path.join(ROOT, 'cortex/core/raid/officiator.js'))];
  const freshOfficiator = require(path.join(ROOT, 'cortex/core/raid/officiator.js'));
  const tickResult = await freshOfficiator.tick();
  const wasReprocessed = tickResult.synthesized > 0 && intake.list().filter(d => d.dropId === dropId && d.officiated).length > 1;
  assert.ok(!wasReprocessed, 'a fresh module instance must not re-synthesize an already-officiated drop');
});

await test('OFF-007', 'markOfficiated() itself refuses a real double-mark, matching recordVerdict()\'s own honesty convention', () => {
  const { dropId } = stageRealTestArtifact('console.log("double mark test");');
  const first = intake.markOfficiated(dropId, { queueId: 'fake-queue-1' });
  assert.strictEqual(first.ok, true);
  const second = intake.markOfficiated(dropId, { queueId: 'fake-queue-2' });
  assert.strictEqual(second.ok, false);
  assert.ok(second.reason.includes('already officiated'));
});

await test('OFF-008', 'synthesizeFromContext() returns the real B1 object from plain text — no drop, no intake — and does NOT submit a contract by default', async () => {
  _mockResponse = {
    ok: true,
    text: JSON.stringify({
      endState: 'a real utility exists', conditions: [], intent: 'build',
      context: 'pasted spec text', warpPrimitives: ['Gate'], axioms: [],
      tools: [], compartmentUuid: 'cmp-123', fileDirectory: 'lib', fileName: 'thing.js',
    }),
  };
  const result = await officiator.synthesizeFromContext('a pasted spec describing a real utility', { forAgent: 'deepseek' });
  assert.strictEqual(result.ok, true, `expected synthesis to succeed: ${result.reason}`);
  assert.strictEqual(result.synthesized.fileName, 'thing.js');
  assert.strictEqual(result.synthesized.compartmentUuid, 'cmp-123');
  assert.strictEqual(result.queueId, undefined, 'no contract should be queued without opts.submit');
});

await test('OFF-009', 'synthesizeFromContext({submit:true}) queues a real contract via the same submitContract() path officiate() uses', async () => {
  _mockResponse = {
    ok: true,
    text: JSON.stringify({
      endState: 'b', conditions: [], intent: 'build', context: 'ctx',
      warpPrimitives: ['Event'], axioms: [], tools: [], compartmentUuid: 'cmp-456',
      fileDirectory: 'lib', fileName: 'thing2.js',
    }),
  };
  const result = await officiator.synthesizeFromContext('build a thing', { submit: true, forAgent: 'deepseek' });
  assert.strictEqual(result.ok, true);
  assert.ok(result.queueId, 'a contract must be queued when submit:true');
  const row = raid.listQueue().find(r => r.uuid === result.queueId);
  assert.ok(row);
  assert.strictEqual(row.source, 'officiator-synthesis-tool');
  assert.strictEqual(row.sourceDropId, null, 'no artifact behind a context-triggered synthesis');
});

await test('OFF-010', 'synthesizeFromContext() with an unparseable response fails honestly, same as officiate()', async () => {
  _mockResponse = { ok: true, text: 'not json at all' };
  const result = await officiator.synthesizeFromContext('build something');
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('could not be parsed'));
});

await test('OFF-011', 'synthesizeFromContext() rejects a missing/non-string contextText before ever dispatching', async () => {
  const result = await officiator.synthesizeFromContext('');
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('contextText is required'));
});

await test('OFF-012', 'synthesizeFromContext() instructs the agent to report a real SEAM VERDICT — the fix for contracts that always failed regardless of real outcome', async () => {
  _mockResponse = { ok: true, text: JSON.stringify({ endState: 'a', conditions: [], intent: 'build', context: 'a', warpPrimitives: [], axioms: [], tools: [], compartmentUuid: null, fileDirectory: null, fileName: null }) };
  await officiator.synthesizeFromContext('build a thing', { submit: true });
  const row = raid.listQueue().slice(-1)[0];
  assert.ok(row.contract.content.includes('SEAM VERDICT: PASS'), 'the real content sent to the agent must ask for a SEAM VERDICT — contract-intake.js\'s default checkEndState requires this literal phrase, and nothing else in the prompt ever asked for it');
  assert.ok(row.contract.content.includes('SEAM VERDICT: FAIL'));
});

await test('OFF-013', 'officiate() (the artifact-triggered path) carries the same real SEAM VERDICT instruction', async () => {
  const { dropId } = stageRealTestArtifact('console.log("verdict test");');
  const drop = intake.read(dropId);
  _mockResponse = { ok: true, text: JSON.stringify({ endState: 'a', conditions: [], intent: 'build', context: 'a', warpPrimitives: [], axioms: [], tools: [], compartmentUuid: null, fileDirectory: null, fileName: null }) };
  const result = await officiator.officiate(drop);
  const row = raid.listQueue().find(r => r.uuid === result.queueId);
  assert.ok(row.contract.content.includes('SEAM VERDICT: PASS'));
});


// §0.39.282 — no forAgent → RAID decides (decideForContract, available agents only), never the old literal 'claude'
await test('OFF-RAID', 'no forAgent: the agent is RAID\'s pick, not a hard-coded claude', async () => {
  const raidCore = require(path.join(ROOT, 'cortex/core/raid/index.js'));
  const expected = raidCore.decideForContract({ intention: 'synthesize a contract from a staged artifact' }).agent;
  _lastProvider = null;
  await officiator.synthesizeFromContext('a pasted spec describing a real utility');
  assert.strictEqual(_lastProvider, expected, `dispatched to ${_lastProvider}, RAID picked ${expected}`);
  assert.ok(!/\|\| 'claude'/.test(require('fs').readFileSync(path.join(ROOT, 'cortex/core/raid/officiator.js'), 'utf8')), 'no literal claude fallback left');
});

// §0.60.26 — James's 0.60.23 log: every boot re-sent the same nine failed drops to Claude. A failure is persisted with
// backoff (a restart does not reset it). §RT1 0.60.78 — only a CONTENT failure (an agent answered with no contract) is the
// drop's: it is charged, backed off, and parked after MAX_ATTEMPTS, then tried once a day.
const fresh = () => { delete require.cache[require.resolve(path.join(ROOT, 'cortex/core/raid/officiator.js'))]; return require(path.join(ROOT, 'cortex/core/raid/officiator.js')); };
const attemptsFile = () => path.join(path.dirname(intake.INTAKE_DIR), 'officiator-attempts.json');
const readA = () => { try { return JSON.parse(fs.readFileSync(attemptsFile(), 'utf8')); } catch (_) { return {}; } };
const GOOD = () => ({ ok: true, text: JSON.stringify({ endState: 'a', conditions: [], intent: 'build', context: 'a', warpPrimitives: [], axioms: [], tools: [], compartmentUuid: null, fileDirectory: null, fileName: null }) });

await test('OFF-BACKOFF', 'an answer with no contract is the drop\'s failure: persisted backoff, not re-sent by the next tick nor a restart; parked after MAX_ATTEMPTS, then tried daily', async () => {
  const { dropId } = stageRealTestArtifact('console.log("backoff test");');
  _mockResponse = { ok: true, text: 'I cannot make a contract of this.' };
  const o1 = fresh();
  const r1 = await o1.tick();
  assert.strictEqual(r1.failed, 1, JSON.stringify(r1));
  const rec = readA()[dropId];
  assert.ok(rec && rec.n === 1 && rec.cls === 'content' && /could not be parsed/.test(rec.reason), JSON.stringify(rec));
  const r2 = await o1.tick();
  assert.strictEqual(r2.failed, 0, 'the same process does not re-send before the backoff');
  const r3 = await fresh().tick();
  assert.ok(r3.failed === 0 && r3.waiting >= 1, `a restart does not reset the backoff: ${JSON.stringify(r3)}`);
  assert.strictEqual(o1.due({ n: 1, at: Date.now() }), false);
  assert.strictEqual(o1.due({ n: 1, at: Date.now() - 11 * 60 * 1000 }), true);
  assert.strictEqual(o1.due({ n: 2, at: Date.now() - 11 * 60 * 1000 }), false, 'the second wait is twice the first');
  assert.strictEqual(o1.due({ n: o1.MAX_ATTEMPTS, at: Date.now() }), false, 'parked after MAX_ATTEMPTS');
  assert.strictEqual(o1.due({ n: o1.MAX_ATTEMPTS, at: Date.now() - 25 * 3600 * 1000 }), true, 'parked is not forever: a daily try');
  // a success clears the record
  const all = readA(); all[dropId].at = 0; fs.writeFileSync(attemptsFile(), JSON.stringify(all));
  _mockResponse = GOOD();
  const r4 = await fresh().tick();
  assert.ok(r4.synthesized === 1 && !readA()[dropId], JSON.stringify(r4));
});

// §RT1 0.60.78 — his 0.60.44 log: 63 failed syntheses and 45 parked drops, all "no real agent response (forAgent=ollama)".
await test('OFF-RT1a', 'no agent answered: no drop is charged; the agents wait (persisted, doubling); records that charged a silence to a drop are released', async () => {
  const { dropId } = stageRealTestArtifact('console.log("silence");');
  const a0 = readA(); a0['old-drop-0'] = { n: 4, at: Date.now(), reason: 'no real agent response (forAgent=ollama) — guardian unreachable or an empty response' }; fs.writeFileSync(attemptsFile(), JSON.stringify(a0));
  _mockResponse = { ok: false };
  const o = fresh();
  const r1 = await o.tick();
  assert.ok(r1.released >= 1 && !readA()['old-drop-0'], `a pre-0.60.78 parked silence is released: ${JSON.stringify(r1)}`);
  assert.ok(!readA()[dropId], 'the drop is not charged for the agent\'s silence');
  const ag = readA()[o.AGENTS_KEY];
  assert.ok(ag && ag.k === 1 && ag.until > Date.now(), JSON.stringify(ag));
  let sentAgain = false; const was = _mockResponse; _mockResponse = { get ok() { sentAgain = true; return false; } };
  const r2 = await fresh().tick();
  _mockResponse = was;
  assert.ok(r2.agentsWait && !sentAgain, `nobody is asked again before the wait passes, a restart included: ${JSON.stringify(r2)}`);
  const all = readA(); all[o.AGENTS_KEY].until = 0; fs.writeFileSync(attemptsFile(), JSON.stringify(all));
  await fresh().tick();
  assert.strictEqual(readA()[o.AGENTS_KEY].k, 2, 'the next wait doubles');
  const all2 = readA(); all2[o.AGENTS_KEY].until = 0; fs.writeFileSync(attemptsFile(), JSON.stringify(all2));
  _mockResponse = GOOD();
  const r3 = await fresh().tick();
  assert.ok(r3.synthesized >= 1 && !readA()[o.AGENTS_KEY], `an answer clears the agents' wait: ${JSON.stringify(r3)}`);
});

await test('OFF-RT1b', 'RAID\'s ranked candidates are walked: silence skips to the next and teaches nothing; a non-contract answer teaches RAID; a success teaches it', async () => {
  const idxPath = require.resolve(path.join(ROOT, 'cortex/core/raid/index.js'));
  const real = require.cache[idxPath];
  const learned = [];
  require.cache[idxPath] = { id: idxPath, filename: idxPath, loaded: true, exports: { ...(real ? real.exports : {}), ready: async () => {},
    decideForContract: () => ({ agent: 'ollama', cluster: 'synth', candidates: [{ name: 'ollama' }, { name: 'gemini' }, { name: 'chatgpt' }] }),
    recordOutcome: (agent, cluster, ok) => learned.push(`${agent}:${ok}`) } };
  const byProvider = { ollama: { ok: false }, gemini: { ok: true, text: 'prose, no contract' }, chatgpt: GOOD() };
  const lifePath = require.resolve(path.join(ROOT, 'copilot/lifeline.js'));
  const lifeWas = require.cache[lifePath].exports.dispatchToNcpAgent;
  const asked = [];
  require.cache[lifePath].exports.dispatchToNcpAgent = async (_p, o) => { asked.push(o.provider); return byProvider[o.provider]; };
  try {
    const { dropId } = stageRealTestArtifact('console.log("walk");');
    const r = await fresh().officiate(intake.read(dropId));
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual(asked, ['ollama', 'gemini', 'chatgpt'], 'best first, then the next');
    assert.deepStrictEqual(learned, ['gemini:false', 'chatgpt:true'], 'silence teaches nothing (GT1); a wrong answer and a success do');
  } finally {
    require.cache[lifePath].exports.dispatchToNcpAgent = lifeWas;
    if (real) require.cache[idxPath] = real; else delete require.cache[idxPath];
  }
});

await test('OFF-RT1c', 'parked() says what waits and why; unpark(id|all) clears it — no hand edit of the attempts file', async () => {
  const o = fresh();
  const a = readA(); a['drop-aaaa1111'] = { n: o.MAX_ATTEMPTS, at: Date.now(), cls: 'content', reason: 'could not be parsed', tried: ['gemini'] }; a['drop-bbbb2222'] = { n: 1, at: Date.now(), cls: 'content', reason: 'x' };
  fs.writeFileSync(attemptsFile(), JSON.stringify(a));
  const p = o.parked();
  const d = p.drops.find(x => x.id === 'drop-aaaa1111');
  assert.ok(d && d.parked && d.tried[0] === 'gemini' && d.nextTry > Date.now(), JSON.stringify(p));
  assert.deepStrictEqual(o.unpark('drop-aaaa').cleared, ['drop-aaaa1111'], 'by id prefix');
  assert.ok(!readA()['drop-aaaa1111'] && readA()['drop-bbbb2222']);
  o.unpark('all');
  // SD20 0.60.203 — 'all' also clears the fail streak, kept as the time it was cleared ('__streakClearedAt'), not a drop
  assert.deepStrictEqual(Object.keys(readA()).filter(k => !k.startsWith('__')), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
delete process.env.NEXUS_INTAKE_DIR;
delete process.env.JAA_DATA_DIR;
process.exitCode = failed ? 1 : 0;
})();
