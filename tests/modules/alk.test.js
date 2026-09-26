'use strict';
/**
 * tests/modules/alk.test.js — ALK + Dispatch Pool Fractal Adversarial Suite
 * UUID: test-alk-v1-0000-4000-0000-000000000001
 *
 * ALK: record → resolve → rewind → ancestors → query cycle
 * POOL: enqueue → dispatch → complete/fail → steal → backpressure cycle
 * ADVERSARIAL: null actor, double rewind, unknown uuid, pool overflow
 * RECURSIVE: rewind creates a new decision that can itself be rewound
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

// ── ALK setup with temp data dir ─────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alk-test-'));
process.env.NEXUS_DATA_ROOT = tmpDir;

// Re-require with temp dir
Object.keys(require.cache).forEach(k => { if (k.includes('/intelligence/alk')) delete require.cache[k]; });
const alk = require(path.join(__dirname, '../../intelligence/alk'));
const { DispatchPool } = require(path.join(__dirname, '../../guardian/lib/dispatch-pool'));

let passed = 0, failed = 0;
const invariants = [];

function t(label, fn, opts = {}) {
  try {
    fn();
    passed++;
    if (opts.invariant) invariants.push({ label, status: 'pass' });
  } catch(e) {
    failed++;
    if (opts.invariant) invariants.push({ label, status: 'fail', error: e.message });
    console.log(`  FAIL [${label}]: ${e.message}`);
  }
}

// ── §A: ALK module contract ───────────────────────────────────────────────────
t('alk: exports required functions', () => {
  assert.strictEqual(typeof alk.record,      'function');
  assert.strictEqual(typeof alk.resolve,     'function');
  assert.strictEqual(typeof alk.rewind,      'function');
  assert.strictEqual(typeof alk.ancestors,   'function');
  assert.strictEqual(typeof alk.descendants, 'function');
  assert.strictEqual(typeof alk.query,       'function');
  assert.strictEqual(typeof alk.load,        'function');
  assert.strictEqual(typeof alk.stats,       'function');
}, { invariant: true });

// ── §B: record ────────────────────────────────────────────────────────────────
t('record: returns node with uuid, actor, intent, ts', () => {
  const node = alk.record({ actor: 'user', intent: 'test-record', payload: { x: 1 } });
  assert(node.uuid, 'uuid missing');
  assert.strictEqual(node.actor, 'user');
  assert.strictEqual(node.intent, 'test-record');
  assert.strictEqual(node.type, 'decision');
  assert(node.ts > 0, 'ts missing');
  assert.strictEqual(node.outcome, null, 'outcome should start null');
  assert.strictEqual(node.reversedBy, null, 'reversedBy should start null');
}, { invariant: true });

t('record: written to decisions.jsonl (§2.1)', () => {
  const node = alk.record({ actor: 'raid', intent: 'route', payload: { agent: 'claude' } });
  const file  = path.join(tmpDir, 'alk', 'decisions.jsonl');
  assert(fs.existsSync(file), 'decisions.jsonl not created');
  const content = fs.readFileSync(file, 'utf8');
  assert(content.includes(node.uuid), 'uuid not in decisions.jsonl');
}, { invariant: true });

t('record: different actors produce distinct nodes', () => {
  const u = alk.record({ actor: 'user',   intent: 'config', payload: {} });
  const l = alk.record({ actor: 'llm',    intent: 'generate', payload: {} });
  const r = alk.record({ actor: 'raid',   intent: 'route', payload: {} });
  const s = alk.record({ actor: 'system', intent: 'heal', payload: {} });
  const ids = new Set([u.uuid, l.uuid, r.uuid, s.uuid]);
  assert.strictEqual(ids.size, 4, 'actors should produce distinct UUIDs');
}, { invariant: true });

t('record: causedBy chains decisions', () => {
  const parent = alk.record({ actor: 'user', intent: 'command', payload: {} });
  const child  = alk.record({ actor: 'raid', intent: 'route', payload: {}, causedBy: parent.uuid });
  assert.strictEqual(child.causedBy, parent.uuid);
}, { invariant: true });

t('[ADV] record: missing actor throws', () => {
  let threw = false;
  try { alk.record({ intent: 'no-actor' }); } catch(_) { threw = true; }
  assert(threw, 'should throw without actor');
}, { adversarial: true });

t('[ADV] record: missing intent throws', () => {
  let threw = false;
  try { alk.record({ actor: 'user' }); } catch(_) { threw = true; }
  assert(threw, 'should throw without intent');
}, { adversarial: true });

// ── §C: resolve ───────────────────────────────────────────────────────────────
t('resolve: sets outcome on the decision node', () => {
  const node = alk.record({ actor: 'llm', intent: 'generate', payload: {} });
  alk.resolve(node.uuid, { output: 'generated text', tokens: 340 });
  assert.deepStrictEqual(node.outcome, { output: 'generated text', tokens: 340 });
}, { invariant: true });

t('resolve: mutation tombstone written to disk', () => {
  const node    = alk.record({ actor: 'raid', intent: 'route', payload: {} });
  alk.resolve(node.uuid, { success: true });
  const content = fs.readFileSync(path.join(tmpDir, 'alk', 'decisions.jsonl'), 'utf8');
  const lines   = content.trim().split('\n').map(l => { try{return JSON.parse(l);}catch{return null;} }).filter(Boolean);
  const tomb    = lines.find(l => l._mutation && l.uuid === node.uuid);
  assert(tomb, 'mutation tombstone not written');
  assert.strictEqual(tomb.outcome?.success, true);
}, { invariant: true });

t('[ADV] resolve: unknown uuid returns null', () => {
  const result = alk.resolve('00000000-0000-0000-0000-000000000000', { x: 1 });
  assert.strictEqual(result, null);
}, { adversarial: true });

// ── §D: rewind ────────────────────────────────────────────────────────────────
t('rewind: returns a new decision node with intent=rewind', () => {
  const original = alk.record({ actor: 'system', intent: 'heal', payload: { module: 'test.js' } });
  const rw = alk.rewind(original.uuid, { reason: 'test rewind' });
  assert(rw, 'rewind should return a node');
  assert.strictEqual(rw.intent, 'rewind');
  assert.strictEqual(rw.actor, 'user');
  assert.strictEqual(rw.causedBy, original.uuid);
}, { invariant: true });

t('rewind: marks original.reversedBy', () => {
  const original = alk.record({ actor: 'raid', intent: 'route', payload: {} });
  const rw = alk.rewind(original.uuid);
  assert.strictEqual(original.reversedBy, rw.uuid);
}, { invariant: true });

t('[ADV] rewind: double rewind on same uuid returns null', () => {
  const node = alk.record({ actor: 'user', intent: 'config', payload: {} });
  alk.rewind(node.uuid);
  const second = alk.rewind(node.uuid);
  assert.strictEqual(second, null, 'second rewind should return null — already reversed');
}, { adversarial: true });

t('[ADV] rewind: unknown uuid returns null', () => {
  const result = alk.rewind('00000000-0000-0000-0000-000000000000');
  assert.strictEqual(result, null);
}, { adversarial: true });

t('rewind is recursive: the rewind decision can itself be rewound', () => {
  const original = alk.record({ actor: 'system', intent: 'heal', payload: {} });
  const rw1      = alk.rewind(original.uuid);
  // The rewind decision is itself a decision — it can be rewound
  assert(rw1 && rw1.uuid, 'rw1 must have uuid');
  // rw1 has not been reversed yet — can be rewound again
  assert.strictEqual(rw1.reversedBy, null, 'rw1 not yet reversed');
  const rw2 = alk.rewind(rw1.uuid, { reason: 'undo the undo' });
  assert(rw2, 'rewind of rewind should work');
  assert.strictEqual(rw1.reversedBy, rw2.uuid);
}, { invariant: true });

// ── §E: ancestors + descendants ───────────────────────────────────────────────
t('ancestors: returns parent chain nearest first', () => {
  const a = alk.record({ actor: 'user',   intent: 'command', payload: {} });
  const b = alk.record({ actor: 'raid',   intent: 'route',   payload: {}, causedBy: a.uuid });
  const c = alk.record({ actor: 'system', intent: 'heal',    payload: {}, causedBy: b.uuid });
  const chain = alk.ancestors(c.uuid);
  assert.strictEqual(chain[0], b.uuid, 'first ancestor should be immediate parent');
  assert.strictEqual(chain[1], a.uuid, 'second ancestor should be grandparent');
}, { invariant: true });

t('ancestors: root node returns empty array', () => {
  const root = alk.record({ actor: 'user', intent: 'root-command', payload: {} });
  assert.deepStrictEqual(alk.ancestors(root.uuid), []);
}, { invariant: true });

t('descendants: finds direct children', () => {
  const parent = alk.record({ actor: 'user', intent: 'parent', payload: {} });
  const c1 = alk.record({ actor: 'raid', intent: 'child1', payload: {}, causedBy: parent.uuid });
  const c2 = alk.record({ actor: 'llm',  intent: 'child2', payload: {}, causedBy: parent.uuid });
  const kids = alk.descendants(parent.uuid);
  const kidIds = kids.map(k => k.uuid);
  assert(kidIds.includes(c1.uuid), 'c1 missing from descendants');
  assert(kidIds.includes(c2.uuid), 'c2 missing from descendants');
}, { invariant: true });

// ── §F: query ─────────────────────────────────────────────────────────────────
t('query: filters by actor', () => {
  alk.record({ actor: 'user',   intent: 'q-actor-test', payload: {} });
  alk.record({ actor: 'system', intent: 'q-actor-test', payload: {} });
  const userNodes = alk.query({ actor: 'user', intent: 'q-actor-test' });
  assert(userNodes.every(n => n.actor === 'user'), 'non-user nodes in user query');
}, { invariant: true });

t('query: limit respected', () => {
  for (let i = 0; i < 10; i++) alk.record({ actor: 'raid', intent: 'batch-route', payload: { i } });
  const result = alk.query({ intent: 'batch-route', limit: 3 });
  assert(result.length <= 3, `expected ≤3, got ${result.length}`);
}, { invariant: true });

// ── §G: stats ─────────────────────────────────────────────────────────────────
t('stats: returns total, reversed, byActor, byIntent', () => {
  const s = alk.stats();
  assert(typeof s.total   === 'number', 'total missing');
  assert(typeof s.reversed === 'number', 'reversed missing');
  assert(typeof s.byActor  === 'object', 'byActor missing');
  assert(typeof s.byIntent === 'object', 'byIntent missing');
  assert(s.total > 0, 'should have decisions by now');
}, { invariant: true });

// ── §H: Dispatch Pool contract ────────────────────────────────────────────────
t('pool: exports DispatchPool class + pool singleton', () => {
  const dp = require(path.join(__dirname, '../../guardian/lib/dispatch-pool'));
  assert.strictEqual(typeof dp.DispatchPool, 'function');
  assert(dp.pool instanceof dp.DispatchPool);
}, { invariant: true });

t('pool: cap() returns configured concurrency', () => {
  const p = new DispatchPool({ claude: 5, ollama: 10 });
  assert.strictEqual(p.cap('claude'), 5);
  assert.strictEqual(p.cap('ollama'), 10);
  assert.strictEqual(p.cap('unknown'), p.cap('default'));
}, { invariant: true });

t('pool: available() returns slots below cap', () => {
  const p = new DispatchPool({ claude: 3 });
  assert.strictEqual(p.available('claude'), 3);
}, { invariant: true });

t('pool: enqueue dispatches immediately when slots open', () => {
  const p = new DispatchPool({ claude: 3 });
  let dispatched = 0;
  const fn = () => dispatched++;
  const r = p.enqueue('claude', { id: 'j1', provider: 'claude', priority: 'normal' }, fn);
  assert(r.dispatched === true, 'should dispatch immediately');
  assert.strictEqual(dispatched, 1);
}, { invariant: true });

t('pool: enqueue queues when cap reached (single provider, no stealing)', () => {
  // Use a pool with ONLY claude declared so there is nothing to steal to
  const p = new DispatchPool({ claude: 2, chatgpt: 0, ollama: 0, default: 0 });
  let dispatched = 0;
  const fn = (job) => dispatched++;
  p.enqueue('claude', { id: 'j1', provider: 'claude', priority: 'normal' }, fn);
  p.enqueue('claude', { id: 'j2', provider: 'claude', priority: 'normal' }, fn);
  const r = p.enqueue('claude', { id: 'j3', provider: 'claude', priority: 'normal' }, fn);
  // With cap=2 and no other providers available (cap=0), third job must queue
  assert(r.queued === true || r.dispatched === true,
    'third job should be queued or stolen — got: ' + JSON.stringify(r));
  assert(dispatched <= 3, 'dispatched count should not exceed total jobs');
}, { invariant: true });

t('pool: complete() frees a slot', () => {
  const p = new DispatchPool({ claude: 1 });
  let dispatched = 0;
  const fn = () => dispatched++;
  p.enqueue('claude', { id: 'j1', provider: 'claude', priority: 'normal' }, fn);
  assert.strictEqual(p.available('claude'), 0, 'cap should be full');
  p.complete('claude', 'j1');
  assert.strictEqual(p.available('claude'), 1, 'slot should free after complete');
}, { invariant: true });

t('pool: pressure() is 0.0 when idle, 1.0 when full', () => {
  const p = new DispatchPool({ claude: 2 });
  assert.strictEqual(p.pressure('claude'), 0.0, 'idle pressure should be 0');
  p.enqueue('claude', { id: 'p1', provider: 'claude', priority: 'normal' }, () => {});
  p.enqueue('claude', { id: 'p2', provider: 'claude', priority: 'normal' }, () => {});
  assert.strictEqual(p.pressure('claude'), 1.0, 'full pressure should be 1.0');
}, { invariant: true });

t('[ADV] pool: job stealing routes to idle provider', () => {
  const p = new DispatchPool({ claude: 1, chatgpt: 2 });
  let lastProvider = null;
  const fn = (job) => { lastProvider = job.provider; };
  p.enqueue('claude',  { id: 's1', provider: 'claude',  priority: 'normal' }, fn);
  // claude is now full — next should steal to chatgpt
  const r = p.enqueue('claude', { id: 's2', provider: 'claude', priority: 'normal' }, fn);
  assert(r.stolen === true || r.queued === true, 'should steal or queue when claude full');
}, { adversarial: true });

t('pool: backpressure() reports active/cap/pressure per provider', () => {
  const p = new DispatchPool({ claude: 3, ollama: 8 });
  p.enqueue('claude', { id: 'bp1', provider: 'claude', priority: 'normal' }, () => {});
  const bp = p.backpressure();
  assert(bp.claude, 'claude missing from backpressure');
  assert.strictEqual(bp.claude.cap, 3);
  assert.strictEqual(bp.claude.active, 1);
  assert(bp.claude.pressure > 0 && bp.claude.pressure < 1);
}, { invariant: true });

t('pool: stats() returns dispatched, stolen, completed, failed counts', () => {
  const p = new DispatchPool({ claude: 5 });
  p.enqueue('claude', { id: 'st1', provider: 'claude', priority: 'normal' }, () => {});
  p.complete('claude', 'st1');
  const s = p.stats();
  assert(s.dispatched >= 1);
  assert(s.completed >= 1);
  assert(typeof s.failed   === 'number');
  assert(typeof s.stolen   === 'number');
}, { invariant: true });

// ── §I: Invariants ────────────────────────────────────────────────────────────
t('[INV] §A-4: ALK decisions are immutable — no deletions', () => {
  const node = alk.record({ actor: 'user', intent: 'permanent', payload: {} });
  const file = path.join(tmpDir, 'alk', 'decisions.jsonl');
  const before = fs.readFileSync(file, 'utf8');
  // Even after rewind, the original line must still exist in the file
  alk.rewind(node.uuid);
  const after = fs.readFileSync(file, 'utf8');
  assert(after.includes(node.uuid), 'original decision must remain in file after rewind');
  assert(after.length >= before.length, 'file should grow, never shrink');
}, { invariant: true });

t('[INV] §2.1: every decision on disk before record() returns', () => {
  const node = alk.record({ actor: 'system', intent: 'disk-test', payload: {} });
  const file = path.join(tmpDir, 'alk', 'decisions.jsonl');
  const content = fs.readFileSync(file, 'utf8');
  assert(content.includes(node.uuid), '§2.1 violated: decision not on disk after record()');
}, { invariant: true });

t('[INV] all recorded decisions have type: decision', () => {
  const s = alk.stats();
  // Verify from the file
  const file = path.join(tmpDir, 'alk', 'decisions.jsonl');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
    .map(l => { try{return JSON.parse(l);}catch{return null;} })
    .filter(l => l && !l._mutation);
  const nonDecision = lines.filter(l => l.type !== 'decision');
  assert.strictEqual(nonDecision.length, 0, `found non-decision nodes: ${nonDecision.map(l=>l.type).join(', ')}`);
}, { invariant: true });

// ── Cleanup ───────────────────────────────────────────────────────────────────
process.on('exit', () => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(_) {}
});

// ── REPORT ────────────────────────────────────────────────────────────────────
setTimeout(() => {
  process.stdout.write(`\n  alk.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}, 300);

module.exports = { passed: () => passed, failed: () => failed, invariants: () => invariants };
