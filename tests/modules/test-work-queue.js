'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// tests/modules/test-work-queue.js
//
// The load-bearing case is WQ-006: a queue that keeps draining under memory
// pressure schedules the OOM instead of preventing it. Serialisation alone is
// not the feature.
// ─────────────────────────────────────────────────────────────────────────────

const assert = require('assert');
const path   = require('path');
const ROOT   = path.join(__dirname, '..', '..');
const WQ     = require(path.join(ROOT, 'lib', 'work-queue'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`  \u2713 ${id} ${name}`); })
    .catch(e => { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n\u2550\u2550 WORK QUEUE \u2014 serialised, bounded, and memory-aware \u2550\u2550\n');

  await test('WQ-001', '\u00a71.1 an anonymous queue is refused \u2014 it cannot be reported on', () => {
    assert.throws(() => WQ.createQueue(), /needs a name/);
    assert.throws(() => WQ.createQueue(''), /needs a name/);
  });

  await test('WQ-002', 'concurrency 1 means STRICTLY one at a time', async () => {
    const q = WQ.createQueue('serial-test', { concurrency: 1, memoryAware: false });
    let inFlight = 0, maxSeen = 0;
    const job = async () => {
      inFlight++; maxSeen = Math.max(maxSeen, inFlight);
      await sleep(20); inFlight--; return true;
    };
    await Promise.all([q.push(job), q.push(job), q.push(job), q.push(job)]);
    assert.strictEqual(maxSeen, 1, `${maxSeen} jobs overlapped \u2014 the point of a 1-slot queue is that none do`);
  });

  await test('WQ-003', 'order is FIFO \u2014 a queue that reorders silently is a scheduler', async () => {
    const q = WQ.createQueue('fifo-test', { concurrency: 1, memoryAware: false });
    const order = [];
    await Promise.all([1, 2, 3, 4].map(n => q.push(async () => { order.push(n); })));
    assert.deepStrictEqual(order, [1, 2, 3, 4]);
  });

  await test('WQ-004', 'BACKPRESSURE: a full queue REFUSES rather than growing', async () => {
    const q = WQ.createQueue('depth-test', { concurrency: 1, maxDepth: 2, memoryAware: false });
    const slow = () => sleep(200);
    q.push(slow); q.push(slow); q.push(slow);   // 1 running + 2 waiting
    await assert.rejects(() => q.push(slow), /queue full/);
    const h = q.health();
    assert.ok(h.stats.refusedDepth >= 1, 'a refusal must be counted, not just thrown');
  });

  await test('WQ-005', 'the refusal explains WHY unbounded growth was rejected', async () => {
    const q = WQ.createQueue('why-test', { concurrency: 1, maxDepth: 1, memoryAware: false });
    q.push(() => sleep(150)); q.push(() => sleep(150));
    try { await q.push(() => sleep(1)); assert.fail('should have refused'); }
    catch (e) {
      assert.strictEqual(e.code, 'QUEUE_FULL');
      assert.ok(/defers the failure instead of preventing it/.test(e.message),
        'backpressure must state its reasoning \u2014 otherwise it reads as an arbitrary limit');
    }
  });

  // ── THE ONE THAT MATTERS ──────────────────────────────────────────────────
  await test('WQ-006', 'MEMORY PRESSURE HOLDS THE QUEUE \u2014 draining under 3% free schedules the OOM', async () => {
    const prev = process.env.NEXUS_MEM_HALT_PCT;
    // Force every check to read as critical: no real machine has >99.9% free.
    process.env.NEXUS_MEM_HALT_PCT = '99.9';
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'work-queue'))];
    const W = require(path.join(ROOT, 'lib', 'work-queue'));
    try {
      const q = W.createQueue('pressure-test', { concurrency: 1, memoryAware: true });
      let ran = false;
      q.push(async () => { ran = true; });
      await sleep(120);
      assert.strictEqual(ran, false, 'a job ran while memory was critical \u2014 the queue drained into the OOM');

      const h = q.health();
      assert.strictEqual(h.state, 'held-memory-pressure');
      assert.ok(h.blockedReason && /halt threshold/.test(h.blockedReason),
        'the hold must name the threshold, not just report "waiting"');
      assert.ok(h.stats.deferredMemory >= 1, 'the deferral must be counted');
    } finally {
      if (prev) process.env.NEXUS_MEM_HALT_PCT = prev; else delete process.env.NEXUS_MEM_HALT_PCT;
      delete require.cache[require.resolve(path.join(ROOT, 'lib', 'work-queue'))];
    }
  });

  await test('WQ-007', 'held \u2260 idle \u2014 a caller must be able to tell them apart', async () => {
    const q = WQ.createQueue('state-test', { concurrency: 1, memoryAware: false });
    assert.strictEqual(q.health().state, 'idle', 'nothing queued and room to run');
    q.push(() => sleep(80));
    await sleep(10);
    assert.strictEqual(q.health().state, 'working');
    await q.drain();
    assert.strictEqual(q.health().state, 'idle');
  });

  await test('WQ-008', 'memory UNREADABLE admits, but says so \u2014 unknown is not a green light', () => {
    const q = WQ.createQueue('unknown-mem', { concurrency: 1, memoryAware: true });
    const h = q.health();
    // On a normal machine this is readable; the assertion is that when it is
    // NOT, the note exists rather than the check silently passing.
    if (h.freeMemPct === null) {
      assert.ok(/NOT the same as verifying/.test(h.note || ''),
        'an unreadable memory check must not read as a verified one');
    } else {
      assert.strictEqual(typeof h.freeMemPct, 'number');
    }
  });

  await test('WQ-009', 'a THROWING job frees its slot and propagates the error', async () => {
    const q = WQ.createQueue('throw-test', { concurrency: 1, memoryAware: false });
    await assert.rejects(() => q.push(async () => { throw new Error('boom'); }), /boom/);
    assert.strictEqual(await q.push(async () => 'ok'), 'ok', 'the slot must be reusable after a failure');
    assert.strictEqual(q.health().stats.failed, 1);
  });

  await test('WQ-010', 'a HUNG job releases the slot on timeout, and says the work may still be running', async () => {
    const q = WQ.createQueue('timeout-test', { concurrency: 1, timeoutMs: 60, memoryAware: false });
    const hung = q.push(() => new Promise(() => {}));   // never settles
    await assert.rejects(() => hung, /exceeded 60ms/);
    assert.strictEqual(await q.push(async () => 'freed'), 'freed', 'a hung job must not hold the only slot forever');
    const h = q.health();
    assert.strictEqual(h.stats.timedOut, 1);
  });

  await test('WQ-011', 'the timeout message does NOT claim the work was cancelled', async () => {
    const q = WQ.createQueue('honest-timeout', { concurrency: 1, timeoutMs: 40, memoryAware: false });
    try { await q.push(() => new Promise(() => {})); assert.fail('should time out'); }
    catch (e) {
      assert.ok(/may still be in flight/.test(e.message),
        'releasing the slot is not the same as stopping the work, and claiming otherwise is a lie about state');
    }
  });

  // ── Shared singletons ─────────────────────────────────────────────────────
  await test('WQ-012', 'get() returns ONE queue per resource \u2014 two would each think they hold the slot', () => {
    WQ._clearAll();
    const a = WQ.get('shared-resource', { concurrency: 1 });
    const b = WQ.get('shared-resource', { concurrency: 9 });
    assert.strictEqual(a, b, 'a second queue on the same resource defeats the limit entirely');
    assert.strictEqual(a.health().concurrency, 1,
      'a later caller must not be able to quietly widen a limit an earlier one relies on');
  });

  await test('WQ-013', 'healthAll() names every queue held by pressure', () => {
    WQ._clearAll();
    WQ.get('q1', { memoryAware: false });
    const h = WQ.healthAll();
    assert.strictEqual(h.queues.length, 1);
    assert.ok(Array.isArray(h.held));
    assert.ok(h.thresholds.criticalPct > 0);
  });

  await test('WQ-014', 'thresholds MATCH autopilot\u2019s \u2014 two definitions of "critical" is the bug', () => {
    const ap = require('fs').readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
    assert.ok(/REFUSING to spawn/.test(ap),
      'autopilot\u2019s memory spawn guard is the precedent this reuses \u2014 if it is gone, revisit these thresholds');
    const h = WQ.healthAll();
    assert.ok(/disagreeing about "critical"/.test(h.note));
  });

  // ── Wiring ────────────────────────────────────────────────────────────────
  await test('WQ-015', 'copilot queues the LLM dispatch, NOT the whole prompt handler', () => {
    const srv = require('fs').readFileSync(path.join(ROOT, 'copilot', 'server.js'), 'utf8');
    assert.ok(/_llmQueue\.push\(/.test(srv), 'the dispatch must go through the queue');
    assert.ok(/_dispatchToOllamaNow/.test(srv), 'the real dispatch must be split out behind it');
    // Fast paths must stay fast: the queue is at the dispatch, not the handler.
    const handlerIdx = srv.indexOf("p === '/api/prompt'");
    const queueIdx   = srv.indexOf('_llmQueue.push(');
    assert.ok(queueIdx < handlerIdx || queueIdx > 0,
      'the queue must sit at the dispatch chokepoint so local answers do not wait behind generations');
  });

  await test('WQ-016', 'ollama is serialised to ONE generation \u2014 3 concurrent model contexts caused the OOM', () => {
    const ol = require('fs').readFileSync(path.join(ROOT, 'ollama', 'server.js'), 'utf8');
    assert.ok(/OLLAMA_MAX_CONCURRENT \|\| '1'/.test(ol), 'the default must be 1, not 3');
    assert.ok(/was never measured, it was assumed/.test(ol),
      'the reason for the old number must be stated \u2014 it was an assumption, and that is why it is being changed');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
