'use strict';
/**
 * tests/modules/test-guardian-job-persistence.js
 * §2026-09-23 — handoff item 5: "guardian jobs physically in the jobs
 * directory ... the .job file is written FIRST and is the source of truth
 * (a failed write fails the job loudly)", with the stated gate: kill
 * guardian mid-job → restart → the .job on disk is re-queued ONCE, never
 * duplicated.
 *
 * Uses the real createJobStore against a temp GUARDIAN_JOBS_DIR. The
 * restart is real: a second store is created over the same directory, the
 * way a fresh guardian process does.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

function freshStore(dir) {
  process.env.GUARDIAN_JOBS_DIR = dir;
  delete require.cache[require.resolve(path.join(ROOT, 'guardian', 'lib', 'jobs.js'))];
  return require(path.join(ROOT, 'guardian', 'lib', 'jobs.js'));
}

function main() {
  console.log('\ntest-guardian-job-persistence\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gjobs-'));

  const m1 = freshStore(dir);
  const store1 = m1.createJobStore ? m1.createJobStore() : null;
  check('the jobs module exposes a store and a nameable jobs directory',
    !!store1 && m1.JOBS_DIR === dir, `${Object.keys(m1).join(',')} · ${m1.JOBS_DIR}`);
  if (!store1) { console.log(`\n  ${pass} passed, ${fail + 1} failed\n`); process.exitCode = 1; return; }

  const { createJob, updateJob, jobs } = store1;
  const job = createJob({ provider: 'chatgpt', prompt: 'the real prompt', command: 'ask' });
  const file = path.join(dir, `${job.id}.job`);
  check('creating a job writes its .job file', fs.existsSync(file));
  check('the file carries the real prompt, not a stub', fs.readFileSync(file, 'utf8').includes('the real prompt'));
  check('a new job starts pending', job.status === 'pending');

  // Mid-flight: dispatched, then the process "dies" with no response.
  updateJob(job.id, { status: 'dispatched' });
  check('a status update is written through to the file',
    /status:\s*dispatched/.test(fs.readFileSync(file, 'utf8')));

  // Real restart: a fresh store over the same directory.
  const m2 = freshStore(dir);
  const store2 = m2.createJobStore();
  const recovered = [...store2.jobs.values()];
  check('a fresh process recovers the job from disk', recovered.length === 1 && recovered[0].id === job.id);
  check('…and sees it exactly as it was left', recovered[0].status === 'dispatched' && recovered[0].prompt === 'the real prompt');
  check('recovery does not duplicate the file', fs.readdirSync(dir).filter(f => f.endsWith('.job')).length === 1);

  // The gate: requeue-once. server.js's _redispatchRecoveredJobs turns a
  // dispatched job back to pending, then dispatches each pending job once.
  const seen = [];
  for (const j of store2.jobs.values()) if (j.status === 'dispatched') store2.updateJob(j.id, { status: 'pending' });
  for (const j of store2.jobs.values()) if (j.status === 'pending') seen.push(j.id);
  check('an in-flight job is requeued exactly once on restart', seen.length === 1 && seen[0] === job.id);
  check('the requeue is a real state change on disk, not in memory only',
    /status:\s*pending/.test(fs.readFileSync(file, 'utf8')));

  // Completed jobs are history: recovered, never re-dispatched.
  store2.updateJob(job.id, { status: 'complete', response: 'the answer' });
  const m3 = freshStore(dir);
  const store3 = m3.createJobStore();
  const again = [...store3.jobs.values()].filter(j => j.status === 'pending');
  check('a completed job is recovered as history and never requeued', again.length === 0);
  check('its answer survives the restart',
    [...store3.jobs.values()][0].response === 'the answer');

  // Source of truth: an unwritable directory must REFUSE the job, loudly.
  const blocked = path.join(dir, 'blocked');
  fs.writeFileSync(blocked, 'not a directory');   // mkdir over a file fails
  const m4 = freshStore(blocked);
  let threw = null;
  try { m4.createJobStore().createJob({ provider: 'chatgpt', prompt: 'x' }); }
  catch (e) { threw = e.message; }
  check('a job whose .job file cannot be written is REFUSED, not accepted', !!threw, 'it was accepted');
  check('…and the refusal says why, naming recoverability', /would not survive a restart/.test(threw || ''));

  const JS = fs.readFileSync(path.join(ROOT, 'guardian', 'lib', 'jobs.js'), 'utf8');
  check('later status writes stay non-fatal, so a status write cannot kill live work',
    // v0.39.227: updateJob gained an opt-in { required } for the mesh CLAIM only; its DEFAULT stays non-fatal.
    /required:\s*false/.test(JS) && /function updateJob\(id, patch, \{ required = false \} = \{\}\)/.test(JS) && /_persistJob\(job, \{ required \}\);/.test(JS));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}
main();
