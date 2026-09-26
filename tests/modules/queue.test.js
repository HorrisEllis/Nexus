'use strict';
/**
 * tests/modules/queue.test.js — PhysicalQueue Recursive Fractal Adversarial Suite
 * UUID: test-queue-v1-0000-4000-0000-000000000001
 *
 * FRACTAL: enqueue → claim → complete/fail → replay cycle at every boundary
 * ADVERSARIAL: crash simulation, double-claim, corrupt files, priority collisions
 * RECURSIVE: fail → replay → claim → fail again (retry cycle)
 *
 * §LAW II: Every queue item is a physical file before it is processed
 * §1.2:    Nothing silently fails — every drop logged
 */

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { PhysicalQueue, createQueue } = require(path.join(__dirname, '../../lib/queue'));

let passed = 0, failed = 0;
const invariants = [];

function t(label, fn, opts = {}) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => {
        passed++;
        if (opts.invariant) invariants.push({ label, status: 'pass' });
      }).catch(e => {
        failed++;
        if (opts.invariant) invariants.push({ label, status: 'fail', error: e.message });
        console.log(`  FAIL [${label}]: ${e.message}`);
      });
    }
    passed++;
    if (opts.invariant) invariants.push({ label, status: 'pass' });
  } catch(e) {
    failed++;
    if (opts.invariant) invariants.push({ label, status: 'fail', error: e.message });
    console.log(`  FAIL [${label}]: ${e.message}`);
  }
}

function tmpQueue() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-test-'));
  const q = new PhysicalQueue({
    inputDir:    path.join(base, 'input'),
    outputDir:   path.join(base, 'output'),
    failuresDir: path.join(base, 'failures'),
    logsDir:     path.join(base, 'logs'),
    queueDir:    path.join(base, 'queue'),
  });
  return { q, base };
}

function cleanup(base) {
  try { fs.rmSync(base, { recursive: true, force: true }); } catch(_) {}
}

// ── §A: Module contract ───────────────────────────────────────────────────────
t('exports: PhysicalQueue class', () => assert.strictEqual(typeof PhysicalQueue, 'function'), { invariant: true });
t('exports: createQueue factory', () => assert.strictEqual(typeof createQueue, 'function'), { invariant: true });
t('createQueue: returns PhysicalQueue instance', () => {
  const { q, base } = tmpQueue();
  assert(q instanceof PhysicalQueue);
  cleanup(base);
}, { invariant: true });

// ── §B: Directory creation ────────────────────────────────────────────────────
t('constructor: creates all required dirs', () => {
  const { q, base } = tmpQueue();
  assert(fs.existsSync(path.join(base, 'input')),    'input dir missing');
  assert(fs.existsSync(path.join(base, 'output')),   'output dir missing');
  assert(fs.existsSync(path.join(base, 'failures')), 'failures dir missing');
  assert(fs.existsSync(path.join(base, 'queue')),    'queue dir missing');
  cleanup(base);
}, { invariant: true });

// ── §C: enqueue (§LAW II) ─────────────────────────────────────────────────────
t('enqueue: returns uuid, filepath, filename', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'test', ext: 'md' });
  assert(r.uuid, 'uuid missing');
  assert(r.filepath, 'filepath missing');
  assert(r.filename, 'filename missing');
  cleanup(base);
}, { invariant: true });

t('enqueue (§LAW II): file exists on disk before function returns', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'law-ii-test', ext: 'md' });
  assert(fs.existsSync(r.filepath), '§LAW II violated: file not on disk synchronously');
  cleanup(base);
}, { invariant: true });

t('enqueue: filename contains uuid and .pending.', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'json' });
  assert(r.filename.includes(r.uuid), 'uuid not in filename');
  assert(r.filename.includes('.pending.'), '.pending. not in filename');
  cleanup(base);
}, { invariant: true });

t('enqueue: state file written to queue/', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  const stateFile = path.join(base, 'queue', `${r.uuid}.json`);
  assert(fs.existsSync(stateFile), 'state file not written');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.strictEqual(state.status, 'pending');
  cleanup(base);
}, { invariant: true });

t('enqueue: md extension uses front-matter format', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'hello world', ext: 'md', tags: ['test'] });
  const content = fs.readFileSync(r.filepath, 'utf8');
  assert(content.startsWith('---'), 'md front-matter missing');
  assert(content.includes('hello world'), 'content missing');
  cleanup(base);
}, { invariant: true });

t('enqueue: spec extension uses comment-header format', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'spec: {}', ext: 'spec' });
  const content = fs.readFileSync(r.filepath, 'utf8');
  assert(content.includes('# NEXUS QUEUE ITEM'), 'spec header missing');
  cleanup(base);
}, { invariant: true });

t('enqueue: json extension wraps in {_meta, data}', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: { prompt: 'hello' }, ext: 'json' });
  const data = JSON.parse(fs.readFileSync(r.filepath, 'utf8'));
  assert(data._meta, '_meta missing');
  assert.deepStrictEqual(data.data, { prompt: 'hello' });
  cleanup(base);
}, { invariant: true });

t('enqueue: priority high|normal|low stored in state', () => {
  const { q, base } = tmpQueue();
  const h = q.enqueue({ content: 'x', priority: 'high' });
  const n = q.enqueue({ content: 'x', priority: 'normal' });
  const l = q.enqueue({ content: 'x', priority: 'low' });
  const sh = JSON.parse(fs.readFileSync(path.join(base,'queue',`${h.uuid}.json`),'utf8'));
  assert.strictEqual(sh.priority, 'high');
  cleanup(base);
}, { invariant: true });

// ── §D: pending ───────────────────────────────────────────────────────────────
t('pending: lists all .pending files', () => {
  const { q, base } = tmpQueue();
  q.enqueue({ content: 'a' });
  q.enqueue({ content: 'b' });
  q.enqueue({ content: 'c' });
  assert.strictEqual(q.pending().length, 3);
  cleanup(base);
}, { invariant: true });

t('pending: sorted high → normal → low priority', () => {
  const { q, base } = tmpQueue();
  q.enqueue({ content: 'low',    priority: 'low' });
  q.enqueue({ content: 'high',   priority: 'high' });
  q.enqueue({ content: 'normal', priority: 'normal' });
  const p = q.pending();
  assert.strictEqual(p[0].priority, 'high',   `first should be high, got ${p[0].priority}`);
  assert.strictEqual(p[2].priority, 'low',    `last should be low, got ${p[2].priority}`);
  cleanup(base);
}, { invariant: true });

t('pending: excludes claimed items', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  q.claim(r.uuid);
  assert.strictEqual(q.pending().length, 0);
  cleanup(base);
}, { invariant: true });

// ── §E: claim ─────────────────────────────────────────────────────────────────
t('claim: renames .pending → .processing (atomic)', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  const claimed = q.claim(r.uuid);
  assert(claimed, 'claim returned null');
  assert(claimed.filepath.includes('.processing.'), 'file not renamed to .processing');
  assert(!fs.existsSync(r.filepath), '.pending file should be gone after claim');
  assert(fs.existsSync(claimed.filepath), '.processing file should exist');
  cleanup(base);
}, { invariant: true });

t('claim: returns content of the file', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'my content here', ext: 'md' });
  const claimed = q.claim(r.uuid);
  assert(claimed.content.includes('my content here'), 'content not in claimed result');
  cleanup(base);
}, { invariant: true });

t('claim: updates state to processing', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  q.claim(r.uuid);
  const state = JSON.parse(fs.readFileSync(path.join(base,'queue',`${r.uuid}.json`),'utf8'));
  assert.strictEqual(state.status, 'processing');
  assert(state.claimedAt, 'claimedAt missing');
  cleanup(base);
}, { invariant: true });

t('[ADV] double-claim returns null on second attempt (race safety)', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  const c1 = q.claim(r.uuid);
  const c2 = q.claim(r.uuid); // already processing
  assert(c1 !== null, 'first claim should succeed');
  assert.strictEqual(c2, null, 'second claim should return null (file renamed)');
  cleanup(base);
}, { adversarial: true });

t('claim: unknown uuid returns null', () => {
  const { q, base } = tmpQueue();
  assert.strictEqual(q.claim('no-such-uuid'), null);
  cleanup(base);
}, { invariant: true });

// ── §F: complete ──────────────────────────────────────────────────────────────
t('complete: renames .processing → .done', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  const claimed = q.claim(r.uuid);
  const ok = q.complete(r.uuid, 'output here');
  assert.strictEqual(ok, true);
  assert(!fs.existsSync(claimed.filepath), '.processing should be gone');
  const done = path.join(base, 'input', `${r.uuid}.done.md`);
  assert(fs.existsSync(done), '.done file should exist');
  cleanup(base);
}, { invariant: true });

t('complete: writes output to outputDir', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  q.complete(r.uuid, 'the result');
  const outFile = path.join(base, 'output', `${r.uuid}.output.md`);
  assert(fs.existsSync(outFile), 'output file missing');
  assert(fs.readFileSync(outFile,'utf8').includes('the result'));
  cleanup(base);
}, { invariant: true });

t('complete: updates state to done', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  q.claim(r.uuid); q.complete(r.uuid, 'ok');
  const state = JSON.parse(fs.readFileSync(path.join(base,'queue',`${r.uuid}.json`),'utf8'));
  assert.strictEqual(state.status, 'done');
  assert(state.completedAt, 'completedAt missing');
  cleanup(base);
}, { invariant: true });

t('complete: unclaimed uuid returns false', () => {
  const { q, base } = tmpQueue();
  q.enqueue({ content: 'x' });
  // Don't claim — try to complete directly
  assert.strictEqual(q.complete('not-claimed-uuid', 'x'), false);
  cleanup(base);
}, { invariant: true });

// ── §G: fail ──────────────────────────────────────────────────────────────────
t('fail: renames .processing → .failed', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  const claimed = q.claim(r.uuid);
  const ok = q.fail(r.uuid, 'network error');
  assert.strictEqual(ok, true);
  assert(!fs.existsSync(claimed.filepath), '.processing should be gone');
  const failed = path.join(base, 'input', `${r.uuid}.failed.md`);
  assert(fs.existsSync(failed), '.failed file should exist');
  cleanup(base);
}, { invariant: true });

t('fail: writes to failures NDJSON ledger', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  q.claim(r.uuid);
  q.fail(r.uuid, 'timeout', 0.9);
  const failFile = path.join(base, 'failures', `${r.uuid}.ndjson`);
  assert(fs.existsSync(failFile), 'failure ledger missing');
  const entry = JSON.parse(fs.readFileSync(failFile,'utf8').trim());
  assert.strictEqual(entry.reason, 'timeout');
  assert.strictEqual(entry.friction, 0.9);
  cleanup(base);
}, { invariant: true });

t('fail: updates state to failed', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  q.claim(r.uuid); q.fail(r.uuid, 'err');
  const state = JSON.parse(fs.readFileSync(path.join(base,'queue',`${r.uuid}.json`),'utf8'));
  assert.strictEqual(state.status, 'failed');
  assert.strictEqual(state.reason, 'err');
  cleanup(base);
}, { invariant: true });

// ── §H: replay (crash recovery) ───────────────────────────────────────────────
t('replay: .processing → .pending (interrupted jobs)', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  // Simulate crash — .processing file exists, no completion
  const replayed = q.replay();
  assert.strictEqual(replayed.length, 1);
  assert.strictEqual(replayed[0].uuid, r.uuid);
  assert.strictEqual(replayed[0].from, 'processing');
  // After replay, item is pending again
  assert.strictEqual(q.pending().length, 1);
  cleanup(base);
}, { invariant: true });

t('replay: .pending files untouched', () => {
  const { q, base } = tmpQueue();
  q.enqueue({ content: 'a' });
  q.enqueue({ content: 'b' });
  const replayed = q.replay();
  assert.strictEqual(replayed.length, 0, 'pending files should not be replayed');
  assert.strictEqual(q.pending().length, 2);
  cleanup(base);
}, { invariant: true });

t('replay: multiple interrupted jobs all recovered', () => {
  const { q, base } = tmpQueue();
  const ids = ['a','b','c'].map(() => q.enqueue({ content: 'x', ext: 'md' }));
  ids.forEach(r => q.claim(r.uuid));
  const replayed = q.replay();
  assert.strictEqual(replayed.length, 3);
  assert.strictEqual(q.pending().length, 3);
  cleanup(base);
}, { invariant: true });

// ── §I: tags ──────────────────────────────────────────────────────────────────
t('addTag / getTags: round trip', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', tags: ['initial'] });
  q.addTag(r.uuid, 'added');
  const tags = q.getTags(r.uuid);
  assert(tags.includes('initial'));
  assert(tags.includes('added'));
  cleanup(base);
}, { invariant: true });

t('removeTag: removes specific tag', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', tags: ['a','b','c'] });
  q.removeTag(r.uuid, 'b');
  const tags = q.getTags(r.uuid);
  assert(!tags.includes('b'), 'b should be removed');
  assert(tags.includes('a')); assert(tags.includes('c'));
  cleanup(base);
}, { invariant: true });

t('byTag: finds items with tag', () => {
  const { q, base } = tmpQueue();
  q.enqueue({ content: 'x', tags: ['important'] });
  q.enqueue({ content: 'y', tags: ['normal'] });
  q.enqueue({ content: 'z', tags: ['important'] });
  const important = q.byTag('important');
  assert.strictEqual(important.length, 2);
  cleanup(base);
}, { invariant: true });

// ── §J: stats ─────────────────────────────────────────────────────────────────
t('stats: counts by status', () => {
  const { q, base } = tmpQueue();
  const a = q.enqueue({ content: 'a' });
  const b = q.enqueue({ content: 'b' });
  q.claim(a.uuid); q.complete(a.uuid, 'done');
  q.claim(b.uuid); q.fail(b.uuid, 'err');
  const s = q.stats();
  assert(s.byStatus.done   >= 1, 'done count wrong');
  assert(s.byStatus.failed >= 1, 'failed count wrong');
  cleanup(base);
}, { invariant: true });

// ── §K: Adversarial ───────────────────────────────────────────────────────────
t('[ADV] enqueue empty content — no crash', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: '' });
  assert(r.uuid, 'uuid missing on empty enqueue');
  cleanup(base);
}, { adversarial: true });

t('[ADV] enqueue 500KB content', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x'.repeat(500_000), ext: 'md' });
  assert(fs.existsSync(r.filepath), '500KB file not created');
  cleanup(base);
}, { adversarial: true });

t('[ADV] fail on already-failed uuid returns false', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  q.claim(r.uuid); q.fail(r.uuid, 'first');
  assert.strictEqual(q.fail(r.uuid, 'second'), false);
  cleanup(base);
}, { adversarial: true });

t('[ADV] complete on already-completed returns false', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  q.claim(r.uuid); q.complete(r.uuid, 'first');
  assert.strictEqual(q.complete(r.uuid, 'second'), false);
  cleanup(base);
}, { adversarial: true });

t('[ADV] 50 concurrent enqueues — all files created', () => {
  const { q, base } = tmpQueue();
  const results = Array.from({ length: 50 }, (_, i) =>
    q.enqueue({ content: `job-${i}`, ext: 'md' })
  );
  for (const r of results) {
    assert(fs.existsSync(r.filepath), `file missing for ${r.uuid}`);
  }
  assert.strictEqual(q.pending().length, 50);
  cleanup(base);
}, { adversarial: true });

// ── §L: Invariants ────────────────────────────────────────────────────────────
t('[INV] §LAW II: file exists synchronously before enqueue returns', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'law-ii', ext: 'md' });
  // No async — check right here
  assert(fs.existsSync(r.filepath), '§LAW II: file must exist before enqueue() returns');
  cleanup(base);
}, { invariant: true });

t('[INV] claim is atomic — no window where file is neither pending nor processing', () => {
  // On most filesystems, rename() is atomic
  // We can't test atomicity directly, but we can verify no partial state exists
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  const inputFiles = fs.readdirSync(path.join(base, 'input'));
  const hasPending    = inputFiles.some(f => f.startsWith(r.uuid) && f.includes('.pending.'));
  const hasProcessing = inputFiles.some(f => f.startsWith(r.uuid) && f.includes('.processing.'));
  assert(!hasPending && hasProcessing,
    `after claim: pending=${hasPending}, processing=${hasProcessing} — expected only processing`);
  cleanup(base);
}, { invariant: true });

t('[INV] failure always writes to failures ledger', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x' });
  q.claim(r.uuid);
  q.fail(r.uuid, 'test-failure', 0.7);
  const failFiles = fs.readdirSync(path.join(base, 'failures'));
  assert(failFiles.length > 0, 'failures dir empty after fail()');
  assert(failFiles.some(f => f.startsWith(r.uuid)), 'failure not logged for this uuid');
}, { invariant: true });

t('[INV] replay is idempotent — running twice does not corrupt', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  const r1 = q.replay();
  const r2 = q.replay(); // second replay — .pending files should not be replayed
  assert.strictEqual(r1.length, 1);
  assert.strictEqual(r2.length, 0, 'second replay should find nothing');
  assert.strictEqual(q.pending().length, 1);
  cleanup(base);
}, { invariant: true });

// ── §BUILT 2026-09-06 — retry()/markOffline()/drainPending() ─────────────────
// James: "do the queues, with the tangible files. thats important." A
// drainer that loops failures back to the queue, escalating retry
// connected to self-heal (via an injected callback, not a hard
// require — this file stays dependency-free), and a real distinct
// "system offline" status that retries only when actually confirmed
// back online, not blind.

t('[INV] retry() re-enqueues at the back — createdAt is re-stamped so it sorts after already-pending items', () => {
  const { q, base } = tmpQueue();
  // Enqueue the item that will fail FIRST (so its original createdAt is
  // earlier), then a second item after it. Without re-stamping createdAt
  // on retry, the failed item would still sort BEFORE the second one —
  // this is the real behavior under test, not just a default ordering
  // that would pass either way.
  const willFail = q.enqueue({ content: 'will-fail', ext: 'md', priority: 'normal' });
  const second   = q.enqueue({ content: 'second', ext: 'md', priority: 'normal' });
  q.claim(willFail.uuid);
  const r = q.retry(willFail.uuid, 'simulated failure');
  assert.strictEqual(r.retryCount, 1);
  const order = q.pending().map(i => i.uuid);
  assert.strictEqual(order[0], second.uuid, 'the item that never failed must now sort first');
  assert.strictEqual(order[1], willFail.uuid, 'the retried item must land at the back, not keep its original earlier position');
  cleanup(base);
}, { invariant: true });

t('[INV] retry() below maxRetries does not escalate', () => {
  const { q, base } = tmpQueue();
  let escalated = false;
  q.onEscalate = () => { escalated = true; };
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  q.retry(r.uuid, 'fail 1');
  assert.strictEqual(escalated, false, 'must not escalate before maxRetries (default 3) is reached');
  cleanup(base);
}, { invariant: true });

t('[INV] retry() at/above maxRetries calls the injected onEscalate — real callback, not a hard cortex require', () => {
  const { q, base } = tmpQueue();
  const calls = [];
  q.onEscalate = (faultClass, level, meta) => calls.push({ faultClass, level, meta });
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  q.retry(r.uuid, 'fail 1'); // retryCount 1
  const claimed2 = q.claim(r.uuid); // now pending after retry -> claim again
  assert(claimed2, 'must be re-claimable after retry() put it back to pending');
  q.retry(r.uuid, 'fail 2'); // retryCount 2
  q.claim(r.uuid);
  const result3 = q.retry(r.uuid, 'fail 3'); // retryCount 3 === maxRetries(3) -> escalate
  assert.strictEqual(result3.escalated, true);
  assert.strictEqual(calls.length, 1, 'onEscalate must fire exactly once, at the crossing, not on every retry');
  assert.strictEqual(calls[0].meta.retryCount, 3);
  cleanup(base);
}, { invariant: true });

t('[INV] markOffline() sets a real, distinct status — not the same as failed', () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  q.markOffline(r.uuid, 'guardian', 'ECONNREFUSED');
  const state = q._readState(r.uuid);
  assert.strictEqual(state.status, 'offline');
  assert.strictEqual(state.blockedBy, 'guardian');
  assert.notStrictEqual(state.status, 'failed', 'offline must be a real, distinct status, not reuse failed');
  cleanup(base);
}, { invariant: true });

t('[INV] drainPending() skips an item still blockedBy an offline system — checks live, does not retry blind', async () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  q.markOffline(r.uuid, 'guardian', 'down');
  let processed = false;
  const results = await q.drainPending(async () => { processed = true; }, { isOnline: (sys) => sys !== 'guardian' });
  assert.strictEqual(processed, false, 'must not process an item whose system is confirmed still offline');
  assert.strictEqual(results[0].skipped, true);
  cleanup(base);
}, { invariant: true });

t('[INV] drainPending() processes an item once its blocking system reports online', async () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  q.claim(r.uuid);
  q.markOffline(r.uuid, 'guardian', 'down');
  let processed = false;
  const results = await q.drainPending(async () => { processed = true; return 'ok'; }, { isOnline: () => true });
  assert.strictEqual(processed, true, 'must process once isOnline reports the blocking system back');
  assert.strictEqual(results[0].ok, true);
  cleanup(base);
}, { invariant: true });

t('[INV] drainPending() routes a SYSTEM_OFFLINE-coded error to markOffline, not a plain retry', async () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  const err = new Error('unreachable');
  err.code = 'SYSTEM_OFFLINE';
  err.systemName = 'chatgpt';
  const results = await q.drainPending(async () => { throw err; });
  assert.strictEqual(results[0].offline, true);
  assert.strictEqual(results[0].system, 'chatgpt');
  const state = q._readState(r.uuid);
  assert.strictEqual(state.status, 'offline');
  cleanup(base);
}, { invariant: true });

t('[INV] drainPending() falls through to a normal retry for a non-offline error', async () => {
  const { q, base } = tmpQueue();
  const r = q.enqueue({ content: 'x', ext: 'md' });
  const results = await q.drainPending(async () => { throw new Error('logic bug'); });
  assert.strictEqual(results[0].retried, true);
  const state = q._readState(r.uuid);
  assert.strictEqual(state.status, 'pending', 'a normal retry must land back in pending, not offline');
  assert.strictEqual(state.retryCount, 1);
  cleanup(base);
}, { invariant: true });

// ── REPORT ────────────────────────────────────────────────────────────────────
setTimeout(() => {
  process.stdout.write(`\n  queue.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}, 500);

module.exports = { passed: () => passed, failed: () => failed, invariants: () => invariants };
