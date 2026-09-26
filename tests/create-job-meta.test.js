'use strict';
// Tests the §23.13 createJob meta-threading fix in guardian/server.js.
//
// guardian/server.js is a full HTTP server module with real side effects on
// load (binds :7820, starts intervals) — it can't be required in isolation
// for a unit test without actually starting a server. What's verified here
// instead, honestly: createJob's exact logic, copied verbatim from the
// fixed file, run against the precise failure case that was broken before
// — a meta object containing gapUuid/contractUuid/diagnosisOnly arriving
// the same way service/nexus-diagnostic.js's HTTP dispatch sends it.
//
// Run: node tests/create-job-meta.test.js

function createJob({ command, provider, prompt, content, meta }) {
  const id = 'fake-uuid-' + Math.random().toString(36).slice(2);
  const job = {
    id, command, provider, prompt, content: content || null,
    status: 'pending', response: '', ts: Date.now(), updatedAt: Date.now(),
    ...(meta || {}),
  };
  return job;
}

function main() {
  // ── This is the exact shape service/nexus-diagnostic.js sends ─────────
  const job = createJob({
    command: 'diagnose_and_repair',
    provider: 'ollama',
    prompt: 'NEXUS DIAGNOSTIC ESCALATION...',
    meta: {
      gapUuid: 'gap-abc123', gapType: 'obligation', source: 'diagnostic.escalation',
      raidAgent: 'ollama', diagnosisOnly: true, contractUuid: 'contract-xyz789',
    },
  });

  // ── Assertion: every meta field must be readable as job.<field>, ──────
  // because that's exactly how guardian/server.js reads it back at
  // completion time (jobRec2?.gapUuid, jobRec2?.contractUuid, etc — flat
  // field access on the object jobs.get(jobId) returns, not job.meta.x).
  const checks = {
    gapUuid: 'gap-abc123', gapType: 'obligation', source: 'diagnostic.escalation',
    raidAgent: 'ollama', diagnosisOnly: true, contractUuid: 'contract-xyz789',
  };
  for (const [field, expected] of Object.entries(checks)) {
    if (job[field] !== expected) {
      throw new Error(`FAIL: job.${field} = ${JSON.stringify(job[field])}, expected ${JSON.stringify(expected)} — meta was dropped`);
    }
  }
  console.log('PASS: all 6 meta fields (gapUuid, gapType, source, raidAgent, diagnosisOnly, contractUuid) survive onto the job object');

  // ── Sanity: a job created WITHOUT meta must not throw or get junk fields.
  const plainJob = createJob({ command: 'code', provider: 'claude', prompt: 'hi' });
  if (plainJob.gapUuid !== undefined) throw new Error('FAIL: plain job unexpectedly has a gapUuid field');
  console.log('PASS: a job created without meta has no stray fields — the fix is additive, not a behavior change for existing callers');

  console.log('\nAll assertions passed.');
}

main();
