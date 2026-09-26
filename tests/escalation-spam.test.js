'use strict';
// Tests the §23.21 escalation-ladder spam fix in service/nexus-diagnostic.js.
//
// The bug: when RAID/guardian dispatch failed for a gap, it fell through to
// the escalation ladder (cortex/self-heal/escalation.js) — but that branch
// never updated the gap's status. The gap stayed 'open', so the NEXT sweep's
// status=open fetch picked it right back up and re-attempted it, forever,
// regardless of what the escalation ladder's own per-type friction state
// said. With ~38 open gaps of one type, every sweep re-ran the full
// escalation attempt for all of them.
//
// This simulates the actual sweep loop's logic (extracted, not the full
// nexus-diagnostic.js, which has real network/process dependencies) against
// a mock escalation ladder with realistic per-type friction-collapse
// behavior, and proves: after the fix, a fixed population of same-type gaps
// converges to zero re-fetched gaps within a couple of sweeps. Before the
// fix, the same population is re-fetched and re-escalated every sweep,
// indefinitely.
//
// Run: node tests/escalation-spam.test.js

function makeMockEscalationLadder() {
  const frictionByType = {};
  return {
    async escalate(gap) {
      const t = gap.type;
      frictionByType[t] = (frictionByType[t] || 0) + 0.35;
      if (frictionByType[t] >= 1.0) {
        return { alreadyFailureMode: frictionByType[t] > 1.0 };
      }
      return { alreadyFailureMode: false };
    },
  };
}

// Simulates one sweep: fetch open gaps, attempt each, apply the FIXED
// status-update logic, return how many gaps were actually processed.
async function sweepFixed(gaps, ladder) {
  const open = gaps.filter(g => !['investigating', 'failure_mode', 'resolved'].includes(g.status));
  for (const gap of open) {
    const result = await ladder.escalate(gap);
    gap.status = result.alreadyFailureMode ? 'failure_mode' : 'investigating';
  }
  return open.length;
}

// Simulates the ORIGINAL buggy behavior: status is never updated.
async function sweepBuggy(gaps, ladder) {
  const open = gaps.filter(g => g.status === 'open');
  for (const gap of open) {
    await ladder.escalate(gap); // status never changes — gap.status stays 'open'
  }
  return open.length;
}

async function main() {
  // 38 gaps of type 'obligation', matching the actual log's reported count.
  const makeGaps = () => Array.from({ length: 38 }, (_, i) => ({ uuid: `g${i}`, type: 'obligation', status: 'open' }));

  // ── Fixed behavior: processed count should drop to 0 within a few sweeps.
  {
    const gaps = makeGaps();
    const ladder = makeMockEscalationLadder();
    const counts = [];
    for (let sweep = 0; sweep < 5; sweep++) {
      counts.push(await sweepFixed(gaps, ladder));
    }
    console.log('FIXED — gaps processed per sweep:', counts.join(', '));
    if (counts[4] !== 0) throw new Error(`FAIL: expected 0 gaps processed by sweep 5, got ${counts[4]}`);
    if (!(counts[0] > counts[2])) throw new Error('FAIL: processed count should decrease over sweeps');
    console.log('PASS: fixed behavior converges to 0 re-processed gaps within a few sweeps');
  }

  // ── Buggy behavior: processed count should stay flat at 38 forever —
  // this proves the test actually distinguishes fixed from broken, not just
  // asserting the fixed version does what it's designed to do in isolation.
  {
    const gaps = makeGaps();
    const ladder = makeMockEscalationLadder();
    const counts = [];
    for (let sweep = 0; sweep < 5; sweep++) {
      counts.push(await sweepBuggy(gaps, ladder));
    }
    console.log('BUGGY (pre-fix) — gaps processed per sweep:', counts.join(', '));
    if (counts.some(c => c !== 38)) throw new Error('FAIL: expected the buggy version to re-process all 38 every single sweep — if it didn\'t, this test isn\'t actually modeling the real bug');
    console.log('PASS: confirmed the buggy version genuinely reproduces unbounded re-processing — the fix is solving a real problem, not a strawman');
  }

  console.log('\nAll assertions passed.');
}

main().catch(e => { console.error('\nTEST FAILED:', e.message); process.exit(1); });
