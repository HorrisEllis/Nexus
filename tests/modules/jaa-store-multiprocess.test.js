'use strict';
/**
 * tests/modules/jaa-store-multiprocess.test.js — real regression test for
 * the multi-process write race found and fixed 2026-07-18 (see
 * guardian/jaa-store.js's own _flush() comments for the full account).
 *
 * Spawns real, separate Node processes (not simulated in-process) writing
 * to the same table concurrently, and checks that every row from every
 * process survives — this is the exact scenario that silently destroyed
 * data before the fix (proven: 3 processes writing 11 rows each, only one
 * process's 11 rows survived out of 33 real writes).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaa-race-test-'));

const writerScript = `
const { JaaStore } = require(${JSON.stringify(path.join(__dirname, '../../guardian/jaa-store.js'))});
const store = new JaaStore(${JSON.stringify(testDir)});
const label = process.argv[2];
let i = 0;
function tick() {
  store.insert('race_table', { uuid: label + '-' + i, text: 'from ' + label });
  i++;
  if (i > 10) { store._flush('race_table'); process.exit(0); }
  else setTimeout(tick, 80);
}
tick();
`;
const writerPath = path.join(testDir, 'writer.js');
fs.writeFileSync(writerPath, writerScript);

console.log('  spawning 3 real concurrent processes, each writing 11 rows to one shared table...');
const procs = ['procA', 'procB', 'procC'].map(label =>
  require('child_process').spawn('node', [writerPath, label], { stdio: 'ignore' })
);

let done = 0;
let failed = false;
Promise.all(procs.map(p => new Promise(resolve => p.on('exit', resolve))))
  .then(() => {
    // give the last debounced flush(es) time to land
    setTimeout(() => {
      const rows = JSON.parse(fs.readFileSync(path.join(testDir, 'race_table.json'), 'utf8'));
      const byProc = {};
      for (const r of rows) {
        const proc = r.uuid.split('-')[0];
        byProc[proc] = (byProc[proc] || 0) + 1;
      }
      console.log('  rows found per process:', JSON.stringify(byProc));
      console.log('  total rows:', rows.length, '(expect 33 — 11 from each of 3 processes)');

      const allSurvived = ['procA', 'procB', 'procC'].every(p => byProc[p] === 11);
      if (allSurvived && rows.length === 33) {
        console.log('  ✓ MP-001 all 3 processes\' writes survived concurrent flush — no silent data loss');
      } else {
        console.error('  ✗ MP-001 data loss detected — this is the exact bug class found 2026-07-18');
        failed = true;
      }

      fs.rmSync(testDir, { recursive: true, force: true });
      console.log(`\n  jaa-store-multiprocess: ${failed ? '0 passed, 1 failed' : '1 passed, 0 failed'}\n`);
      process.exitCode = failed ? 1 : 0;
    }, 500);
  });
