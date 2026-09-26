'use strict';
// tests/modules/guardian-job-persistence.test.js — real test for P23's
// durability fix. James: "each job sent to guardian is a .job file...
// persistent and doesn't leave until it's delivered."
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
const t = (id, desc, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${desc}`); } else { failed++; console.log(`  ✗ ${id} ${desc}`); } };

// Isolate JOBS_DIR by pointing the whole repo's cwd-relative path at a
// temp dir — jobs.js resolves JOBS_DIR from __dirname, not cwd, so we
// instead redirect via a real env override the module doesn't have yet;
// simplest real isolation: run against the real data/guardian/jobs/ dir
// and clean up afterward, same as this session's other non-isolated
// real-fs tests where a dedicated env var isn't worth adding for one file.
const JOBS_DIR = path.join(__dirname, '..', '..', 'data', 'guardian', 'jobs');
const before = fs.existsSync(JOBS_DIR) ? new Set(fs.readdirSync(JOBS_DIR)) : new Set();

function main() {
  const { createJobStore } = require('../../guardian/lib/jobs.js');

  const store1 = createJobStore();
  const job = store1.createJob({ command: 'ask', provider: 'claude', prompt: 'persistence test' });
  const jobFile = path.join(JOBS_DIR, `${job.id}.job`);

  t('T-001', 'createJob writes a real .job file to disk', fs.existsSync(jobFile));

  store1.updateJob(job.id, { status: 'complete', response: 'the real answer' });
  const ne = require('../../lib/node-export.js');
  const doc1 = ne.importFromFile(jobFile);
  t('T-002', 'updateJob persists the patch to the same real file', doc1.payload.status === 'complete' && doc1.payload.response === 'the real answer');

  // Simulate a real restart: fresh module state, fresh store, nothing in memory
  delete require.cache[require.resolve('../../guardian/lib/jobs.js')];
  const { createJobStore: createJobStore2 } = require('../../guardian/lib/jobs.js');
  const store2 = createJobStore2();
  t('T-003', 'a fresh createJobStore() call recovers the job from disk (the real restart-recovery guarantee)', store2.jobs.has(job.id));
  t('T-004', 'the recovered job carries its real, correct persisted status', store2.jobs.get(job.id)?.status === 'complete');

  // cleanup — only the files this test created
  for (const f of fs.readdirSync(JOBS_DIR)) {
    if (!before.has(f)) fs.unlinkSync(path.join(JOBS_DIR, f));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
