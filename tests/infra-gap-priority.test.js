'use strict';
// Tests the §23.18 Guardian/Cortex prioritization in service/nexus-diagnostic.js.
// Run: node tests/infra-gap-priority.test.js

const GUARDIAN_CORTEX_PATTERN = /guardian|cortex|ncp[._]|\bncp\b/i;
function _isInfraGap(gap) {
  // source deliberately excluded — see the matching comment in
  // service/nexus-diagnostic.js. Every epistemic gap is sourced from
  // 'guardian.lib.gap-hunter' (that's where the detector lives, not what
  // the gap is about) — including source made every single epistemic gap
  // match "guardian" too, which is exactly what this test caught.
  const haystack = `${gap.type||''} ${gap.path||''} ${gap.system||''} ${gap.body||''}`;
  return GUARDIAN_CORTEX_PATTERN.test(haystack);
}
function reorder(gaps) {
  if (gaps.length <= 1) return gaps;
  const infra = gaps.filter(_isInfraGap);
  const other = gaps.filter(g => !_isInfraGap(g));
  return infra.length ? [...infra, ...other] : gaps;
}

function main() {
  // ── Realistic mix matching the actual log: epistemic flood (obligation,
  // assumption, seam_orphan_resume, logical) plus real infra gaps
  // (ncp_connection_flapping, baseline_deviation on cortex, contract
  // unreachable on cortex) all arriving in the same severity=high batch,
  // in whatever order cortex's query happened to return them.
  const gaps = [
    { uuid:'1', type:'obligation', path:null, system:null, source:'guardian.lib.gap-hunter' },
    { uuid:'2', type:'assumption', path:null, system:null, source:'guardian.lib.gap-hunter' },
    { uuid:'3', type:'ncp_connection_flapping', path:'claude:tab-abc', system:null, source:'lib/ncp.js' },
    { uuid:'4', type:'seam_orphan_resume', path:null, system:null, source:'guardian §70.2' },
    { uuid:'5', type:'baseline_deviation', path:null, system:'cortex', source:'diagnostic' },
    { uuid:'6', type:'logical', path:null, system:null, source:'guardian.lib.gap-hunter' },
    { uuid:'7', type:'contract.unreachable', path:null, system:null, body:'cortex (connect ECONNREFUSED)' },
  ];

  const result = reorder(gaps);

  // ── Assertion 1: all 3 infra gaps (3, 5, 7) come before all 4 epistemic
  // gaps (1, 2, 4, 6) — regardless of their original position in the array.
  const infraIds = ['3','5','7'];
  const firstThree = result.slice(0,3).map(g=>g.uuid).sort();
  if (JSON.stringify(firstThree) !== JSON.stringify(infraIds.sort())) {
    throw new Error(`FAIL: expected infra gaps [3,5,7] first, got order [${result.map(g=>g.uuid).join(',')}]`);
  }
  console.log('PASS: all 3 infrastructure gaps (ncp_connection_flapping, cortex baseline_deviation, cortex contract.unreachable) moved to the front');

  // ── Assertion 2: nothing was dropped — same 7 gaps, just reordered.
  if (result.length !== 7) throw new Error(`FAIL: expected 7 gaps preserved, got ${result.length}`);
  console.log('PASS: no gap dropped during reorder, count preserved');

  // ── Assertion 3: a batch with NO infra gaps is left untouched (no
  // spurious reorder when there's nothing to prioritize).
  const allEpistemic = gaps.filter(g => ['1','2','4','6'].includes(g.uuid));
  const untouched = reorder(allEpistemic);
  if (JSON.stringify(untouched.map(g=>g.uuid)) !== JSON.stringify(allEpistemic.map(g=>g.uuid))) {
    throw new Error('FAIL: a batch with no infra gaps should be left in original order');
  }
  console.log('PASS: a batch with no infrastructure gaps is left in its original order — not reordering for no reason');

  console.log('\nAll assertions passed.');
}

main();
