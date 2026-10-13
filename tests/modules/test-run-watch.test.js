'use strict';
/**
 * tests/modules/test-run-watch.test.js — 0.60.21 — no run left in limbo.
 * James: "needs to retry when you reject it. what if you have copilot monitor repos every now and again if they stall? or
 * have an agent check in? the diagnostic system when it expierences a stall or gate not fire?"
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
console.log('\ntest-run-watch\n');
const RW = require(path.join(ROOT, 'lib/run-watch.js'));
const now = Date.now(), m = 60000;
const row = (runId, state, ago, extra = {}) => ({ runId, state, ts: now - ago, repoUuid: 'R', targetRepo: 'T', map: 'docs/x-phasemap.spec', phase: 'BL30', ...extra });
const rows = [
  row('r1', 'building', 30 * m), row('r1', 'replied', 25 * m, { file: 'lib/a.js', injects: { injected: ['lib/a.js'] } }),     // went quiet
  row('r2', 'building', 30 * m), row('r2', 'proven', 20 * m),                                                                  // ended
  row('r1-review', 'reviewing', 22 * m), row('r1-review', 'incomplete', 20 * m),                                               // a review that ended
  row('r3', 'building', 30 * m), row('r3', 'paused', 29 * m),                                                                  // a person paused it
  row('r4', 'building', 2 * m),                                                                                                // still fresh
];
const st = RW.stalled(rows, { now, stallMs: 10 * m });
check('RW-01 a run with no step for the stall time is found, with the state it stopped after; ended, paused and fresh runs are not',
  st.length === 1 && st[0].runId === 'r1' && st[0].state === 'replied' && st[0].kind === 'build', JSON.stringify(st));
check('RW-02 a draft review ends on its own last step (the BL30 review that read "running" 12 min after it ended incomplete)',
  RW.isFinal(RW.runsOf(rows).get('r1-review')) && !RW.isFinal(RW.runsOf(rows).get('r1')));
const info = RW.runForInject(rows, { path: 'lib/a.js', repoUuid: 'T' });
check('RW-03 a rejected file leads back to the run, map and phase that made it', info && info.runId === 'r1' && info.phase === 'BL30' && info.map === 'docs/x-phasemap.spec' && info.repoUuid === 'R');
check('RW-04 automatic retries are counted per phase, so they are capped', RW.retriesFor([...rows, row('auto-1', 'auto-retry', 5 * m), row('auto-2', 'auto-retry', 25 * 3600 * 1000)], { phase: 'BL30', now }) === 1);
const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
const act = fs.readFileSync(path.join(ROOT, 'lib/repo-activity.js'), 'utf8');
check('RW-05 wired: the watchdog runs every minute, closes a stall, reports a gap diagnostic sees, retries once; a reject retries its phase; the task panel ends a finished review',
  /setInterval\(\(\) => \{ _watchRuns\(\)/.test(api) && /type: 'phase\.run\.stalled'/.test(api) && /_autoRetry\(s, 'stall'/.test(api) && /_autoRetry\(info, 'reject'/.test(api)
  && /-review\$\/\.test\(runId\) && \['reviewed', 'incomplete', 'skipped'\]/.test(act));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
