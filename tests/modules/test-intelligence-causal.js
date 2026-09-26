'use strict';
/**
 * tests/modules/test-intelligence-causal.js — pins the 2026-07-24 wiring of
 * intelligence/cfr/graph.js's CausalGraph into cortex/intelligence/index.js's
 * precursor analysis.
 *
 * THE BUG: precursor detection was pure TEMPORAL ADJACENCY — "what event
 * types appear in the 30s before a failure". Every event in that window was
 * scored as reliably preceding trouble. That is correlation-as-causation, and
 * at this scale it is not subtle: in a busy 30s window dozens of unrelated
 * events all qualify, so the NOISIEST system in the codebase wins every time
 * regardless of whether it caused anything. The intelligence core was
 * switched on this same session, so it would have begun writing those
 * conclusions into bep_patterns as if they were findings.
 *
 * THE GRAPH ALREADY EXISTED. intelligence/cfr/graph.js's CausalGraph offers
 * ancestors() — a real walk over causedBy edges — and mastermind.js has used
 * it since 2026-07-06. cortex/intelligence/index.js simply never wired to it,
 * so "why" was being answered by a clock.
 *
 * THE FIX IS DELIBERATELY NOT "ONLY COUNT CAUSAL ANCESTORS". Adjacency is
 * still counted, because real precursors exist that never carried a causedBy
 * — dropping them would trade one blindness for another. What changed is that
 * the two are now DISTINGUISHABLE: causal:true / evidence:'causal-ancestor'
 * versus evidence:'temporal-adjacency'. A conclusion known by evidence and one
 * known by coincidence must not look identical (§0.1).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
// §BUGFIX 2026-08-25 — this checked cortex/intelligence/index.js, which
// no longer exists: the real file moved to intelligence/index.js (a
// separate, earlier real migration than the one this test's own regex
// assumed). The regex below was ALSO stale for a second, distinct
// reason — it checked for require('../../meta/cfr/graph'), predating
// this codebase's own real meta/ -> intelligence/ migration. Both
// updated together to match the real, current file and its real,
// current (if slightly redundant-looking but correct) relative require.
const SRC = fs.readFileSync(path.join(ROOT, 'intelligence/index.js'), 'utf8');

test('IC-001', 'intelligence now builds a real CausalGraph from the events it scans', () => {
  assert.ok(/require\('\.\.\/intelligence\/cfr\/graph'\)/.test(SRC), 'must use the EXISTING graph, not a new one');
  assert.ok(/new CausalGraph\(\)/.test(SRC));
  assert.ok(/_graph\.ingest\(e\)/.test(SRC), 'and feed it the same events the scan sees');
});

test('IC-002', 'precursors are walked with ancestors() — a real causedBy walk, not a timestamp comparison', () => {
  assert.ok(/_graph\.ancestors\(fid, 8\)/.test(SRC), 'must walk real causal ancestry');
  assert.ok(/ancestorIds\.has\(pid\)/.test(SRC), 'and test membership against it');
});

test('IC-003', 'ancestors() returns NODE ENTRIES — the handler matches the real shape, verified in intelligence/cfr/graph.js', () => {
  const g = fs.readFileSync(path.join(ROOT, 'intelligence/cfr/graph.js'), 'utf8');
  const fn = g.slice(g.indexOf('  ancestors(id'), g.indexOf('descendants(id'));
  assert.ok(/result\.unshift\(entry\)/.test(fn), 'the graph returns full entries, not bare ids');
  assert.ok(/a\.uuid \|\| a\.id/.test(SRC), 'so the consumer must read .uuid/.id off each entry');
});

test('IC-004', 'ADJACENCY IS STILL COUNTED — the fix distinguishes, it does not discard', () => {
  assert.ok(/e\.ts > failure\.ts - 30_000/.test(SRC),
    'the 30s window must remain: real precursors exist that never carried a causedBy, and dropping them would trade one blindness for another');
  assert.ok(/causalCount/.test(SRC), 'but causal hits must be counted separately');
});

test('IC-005', 'every precursor now CARRIES ITS EVIDENCE — coincidence and causation cannot look the same', () => {
  assert.ok(/evidence = pc\.causalCount > 0 \? 'causal-ancestor' : 'temporal-adjacency'/.test(SRC.replace(/\s+/g, ' ')),
    'each precursor must state how it was known');
  assert.ok(/pc\.causal = pc\.causalCount > 0/.test(SRC));
});

test('IC-006', 'REAL: the graph separates a genuine causal chain from a coincidence in the same window', () => {
  const { CausalGraph } = require('../../intelligence/cfr/graph');
  const g = new CausalGraph();
  const now = Date.now();
  g.ingest({ uuid: 'root',  type: 'db.slow',       ts: now - 20000 });
  g.ingest({ uuid: 'mid',   type: 'queue.backlog', ts: now - 10000, causedBy: 'root' });
  g.ingest({ uuid: 'fail',  type: 'job.error',     ts: now - 1000,  causedBy: 'mid' });
  g.ingest({ uuid: 'noise', type: 'ui.render',     ts: now - 5000 });   // same window, unrelated

  const ids = g.ancestors('fail', 8).map(a => a.uuid || a.id);
  assert.ok(ids.includes('root'), 'the true root cause must be found through the chain');
  assert.ok(ids.includes('mid'), 'and the intermediate link');
  assert.ok(!ids.includes('noise'),
    'a coincidental event in the same 30s window must NOT be causal — this is the entire point');
});

test('IC-007', 'losing the graph degrades LOUDLY back to adjacency — a silent downgrade would be worse than the original bug', () => {
  assert.ok(/causal graph unavailable/.test(SRC), 'the fallback must announce itself');
  assert.ok(/fall back to temporal adjacency only/.test(SRC), 'and name exactly what fidelity was lost');
});

test('IC-008', 'one unwalkable failure cannot kill the whole scan', () => {
  const block = SRC.slice(SRC.indexOf('let ancestorIds'), SRC.indexOf('const window = events.filter'));
  assert.ok(/catch \(_\)/.test(block), 'a single bad node must be contained');
  assert.ok(/must not kill the scan/.test(block), 'and the reason recorded where it happens');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
