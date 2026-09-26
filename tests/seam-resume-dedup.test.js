'use strict';
// Tests the §23.16 fix to _seamLsResumeCheck() in userscript-chatgpt.js.
//
// Reproduces the exact pattern from the screenshot that prompted this fix:
// six interrupted-SEAM localStorage entries under different jobId keys, but
// only two distinct seam_queue_id values (83036522 x3, 05b25fc0 x3) — which
// is what produced six repeated "interrupted SEAM found" log lines for what
// was actually only two real interrupted jobs.
//
// This can run directly in Node — unlike the connection logic, this fix
// only touches localStorage, which is trivial to mock faithfully, no
// GM_xmlhttpRequest/browser dependency to work around.
//
// Run: node tests/seam-resume-dedup.test.js

// ── Minimal localStorage mock — real enough for Object.keys() to work ──────
function makeLocalStorage() {
  const store = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    get length() { return Object.keys(store).length; },
    // Object.keys(localStorage) works in real browsers because localStorage
    // is host-exotic; here we just expose the backing object directly via
    // a getter the test reads through Object.keys(mockLS._store).
    _store: store,
  };
}

// ── Exact fixed logic, copied from userscript-chatgpt.js ──────────────────
function makeSeamLsResumeCheck(localStorage, send, _log) {
  return function _seamLsResumeCheck() {
    try {
      const keys = Object.keys(localStorage._store).filter(k => k.startsWith('nexus_seam_job_'));
      const byQueue = new Map();
      for (const k of keys) {
        let rec; try { rec = JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { rec = null; }
        if (!rec || rec.status === 'complete') { try { localStorage.removeItem(k); } catch (_) {} continue; }
        const qid = rec.seam_queue_id || k;
        const existing = byQueue.get(qid);
        const recTs = rec.interruptedAt ?? rec.savedAt ?? 0;
        if (!existing || recTs > (existing.rec.interruptedAt ?? existing.rec.savedAt ?? 0)) {
          byQueue.set(qid, { key: k, rec });
        }
      }
      for (const [, { key, rec }] of byQueue) {
        _log('sys', `§70.2 interrupted SEAM found · chunk ${(rec.seam_chunk_idx ?? '?')+1}/${rec.seam_total ?? '?'}`, rec.seam_queue_id?.slice(0,8) ?? '?');
        send({ type: 'GUARDIAN_SEAM_RESUME_NEEDED', jobId: rec.jobId, seam_queue_id: rec.seam_queue_id });
      }
      for (const k of keys) { try { localStorage.removeItem(k); } catch (_) {} }
    } catch (_) {}
  };
}

function main() {
  const ls = makeLocalStorage();
  const sent = [];
  const logged = [];
  const send = (msg) => sent.push(msg);
  const _log = (...args) => logged.push(args);

  // Reproduce the exact screenshot pattern: 3 stale entries for queue
  // 83036522, 3 for 05b25fc0, each under a different jobId (simulating
  // three retry attempts each creating a fresh job/localStorage key).
  const queueA = '83036522', queueB = '05b25fc0';
  let t = 1000;
  for (const [queue, n] of [[queueA, 3], [queueB, 3]]) {
    for (let i = 0; i < n; i++) {
      ls.setItem(`nexus_seam_job_job-${queue}-${i}`, JSON.stringify({
        jobId: `job-${queue}-${i}`, seam_queue_id: queue,
        seam_chunk_idx: i, seam_total: n, status: 'interrupted',
        interruptedAt: t++,
      }));
    }
  }

  if (Object.keys(ls._store).length !== 6) throw new Error('FAIL: setup — expected 6 stale entries');

  const check = makeSeamLsResumeCheck(ls, send, _log);
  check();

  if (sent.length !== 2) {
    throw new Error(`FAIL: expected exactly 2 resume-needed sends (one per queue), got ${sent.length}`);
  }
  console.log('PASS: 6 stale entries across 2 queues produce exactly 2 resume sends, not 6');

  const sentQueues = new Set(sent.map(s => s.seam_queue_id));
  if (!sentQueues.has(queueA) || !sentQueues.has(queueB)) {
    throw new Error('FAIL: both queues should be represented exactly once');
  }
  console.log('PASS: both real queues are represented (deduping did not drop a genuine queue)');

  // The sent record per queue should be the MOST RECENT one (highest chunk
  // index in this setup, since interruptedAt increases with i).
  const aRecord = sent.find(s => s.seam_queue_id === queueA);
  if (aRecord.jobId !== `job-${queueA}-2`) {
    throw new Error(`FAIL: expected most-recent record (chunk 2) for queue A, got ${aRecord.jobId}`);
  }
  console.log('PASS: dedup keeps the most recent record per queue, not an arbitrary one');

  if (Object.keys(ls._store).length !== 0) {
    throw new Error(`FAIL: expected all 6 stale keys removed after the pass, ${Object.keys(ls._store).length} remain`);
  }
  console.log('PASS: all stale keys cleaned up — nothing left to re-report on a future pass');

  console.log('\nAll assertions passed.');
}

main();
