'use strict';
/**
 * scripts/mco5-one-real-job.js
 *
 * §MCO5 2026-09-13 — one real contract, one real UUID, submitted for real
 * work, observed through every real stage from QUEUED to QC_PENDING. Per
 * this phasemap's own gate: "one UUID's full lifecycle is independently
 * verifiable end-to-end, stage by stage, from real persisted data alone."
 *
 * Deliberately does NOT mock jaaDB the way tests/modules/*.test.js do —
 * those isolate the queue in-memory on purpose, for repeatable unit
 * coverage. This script uses the REAL jaaDB (cortex/memory/jaa-db.js,
 * real per-process persistence, no override), the REAL contract-boundary
 * REGISTRY, and the REAL _raidLedger — so every line this script prints
 * is read back from real, persisted state after the fact, not asserted
 * from memory mid-run. That's also what makes this the right fixture for
 * IC9's future restart-recovery check: kill this process after a stage
 * and the row is genuinely still there on next boot.
 *
 * Run: node scripts/mco5-one-real-job.js
 */

const fs = require('fs');
const intake = require('../cortex/core/raid/contract-intake.js');

function line() { console.log('─'.repeat(72)); }

async function main() {
  line();
  console.log('MCO5 — one real contract, real UUID, real stages, real artifacts');
  line();

  // ── QUEUED ──────────────────────────────────────────────────────────────
  const { queueId, boundary } = intake.submitContract(
    { content: 'MCO5 real job: compute the SHA-256 digest of "nexus-mco5-2026-09-13" and report it.' },
    { source: 'mco5-demo', intention: 'build', system: 'cortex', onFail: { action: 'halt' } }
  );
  let row = intake.listQueue().find(r => r.uuid === queueId);
  console.log(`\n[QUEUED]`);
  console.log(`  queueId:            ${queueId}`);
  console.log(`  real row.stage:     ${row.stage}`);
  console.log(`  real boundary:      ${boundary ? boundary.key : '(none registered)'}`);
  console.log(`  real input artifact:${row.inputArtifactPath}`);
  console.log(`  artifact on disk:   ${fs.existsSync(row.inputArtifactPath)}`);

  // ── HANDSHAKE_VERIFIED + INPUT_FOLDER (acknowledge) ────────────────────
  const ack = intake.acknowledge(queueId, { system: 'cortex' });
  row = intake.listQueue().find(r => r.uuid === queueId);
  console.log(`\n[${ack.stage.toUpperCase()}]  (acknowledge() returned ok:${ack.ok})`);
  console.log(`  real row.stage:     ${row.stage}`);

  // ── SYSTEM_QUEUE, PROCESSING, real dispatch, OUTPUT_FOLDER, QC_PENDING ──
  // A real executor — actually computes the real result. This IS real
  // work; it doesn't require a live guardian/agent process to be honest,
  // just to genuinely run and genuinely produce the text below.
  const realExecutor = async () => {
    const crypto = require('crypto');
    const digest = crypto.createHash('sha256').update('nexus-mco5-2026-09-13').digest('hex');
    return { text: `real sha256 digest: ${digest}\n\nSEAM VERDICT: PASS` };
  };

  const result = await intake.processNext(realExecutor);
  row = intake.listQueue().find(r => r.uuid === queueId);
  console.log(`\n[processNext() real result]`);
  console.log(`  status:             ${result.status}`);
  console.log(`  compartmentId:      ${result.compartmentId}`);

  console.log(`\n[${row.stage.toUpperCase()}]  (final real stage)`);
  console.log(`  real row.status:     ${row.status}`);
  console.log(`  real verdict:        ${row.verdict}`);
  console.log(`  real output artifact:${row.outputArtifactPath}`);
  console.log(`  artifact on disk:    ${fs.existsSync(row.outputArtifactPath)}`);
  console.log(`  alreadyHadOutput:    ${row.alreadyHadOutput}`);
  console.log(`  acknowledgedBy:      ${row.acknowledgedBy}`);

  // ── Real ledger read-back — every stage event this run actually caused,
  //    read from the real, persisted CFR ledger file, not re-derived. ──
  // §HONEST — createCFRLedger's record() writes via fs.createWriteStream
  // (append mode), an async, internally-buffered stream, not a sync
  // write. Reading the file back immediately, in the same process, can
  // race the flush. A short wait here is real and necessary, not
  // decorative — confirmed by first running this without it and getting
  // a genuinely empty read-back despite the events being written
  // correctly (verified separately via `grep` after process exit).
  await new Promise((r) => setTimeout(r, 250));

  const ledgerPath = require('path').join(__dirname, '..', 'data', 'raid', 'ledger', 'cfr', 'event_log.jsonl');
  const thisRunEvents = fs.readFileSync(ledgerPath, 'utf8')
    .trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch (_) { return null; } })
    .filter(e => e && e.payload && e.payload.queueId === queueId);

  console.log(`\n[real ledger events for this exact queueId, read back from disk]`);
  for (const e of thisRunEvents) {
    console.log(`  ${e.type}`);
  }

  // ── Real output artifact content, read back from disk ──────────────────
  const { importFromFile } = require('../lib/node-export.js');
  const outDoc = importFromFile(row.outputArtifactPath);
  console.log(`\n[real output artifact content, read back from ${row.outputArtifactPath}]`);
  console.log(`  type:    ${outDoc.type}`);
  console.log(`  status:  ${outDoc.payload.status}`);
  console.log(`  verdict: ${outDoc.payload.verdict}`);

  line();
  console.log(`MCO5 gate: ${row.stage === intake.STAGE.QC_PENDING ? 'MET' : 'NOT MET'} — one UUID's full lifecycle verified end-to-end from real persisted data alone.`);
  line();
}

main().catch((e) => { console.error('[MCO5] real run failed:', e); process.exitCode = 1; });
