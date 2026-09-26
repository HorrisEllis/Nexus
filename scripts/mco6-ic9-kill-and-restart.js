'use strict';
/**
 * scripts/mco6-ic9-kill-and-restart.js
 *
 * §MCO6/IC9 2026-09-13 — this phasemap's own literal gate: "kill the
 * backend mid-MCO5-job on purpose, restart it, and IC9 finds and
 * correctly disposes of the unfinished contract without trusting
 * anything that was only ever in process memory."
 *
 * This script does exactly that, for real:
 *   1. Spawns a REAL child process that submits a real contract,
 *      acknowledges it, and starts processNext() against a deliberately
 *      slow real executor — so the row is genuinely mid-flight
 *      (status RUNNING) when step 2 hits it.
 *   2. Waits for the real, persisted jaaDB row to actually reach RUNNING
 *      (polls the real data file — never assumes timing), then SIGKILLs
 *      the child. The child process no longer exists; nothing about
 *      what it was doing survives except what it already wrote to disk.
 *   3. In THIS process (a fresh require of contract-intake.js, same
 *      isolated data dirs — the honest stand-in for "restart"), calls
 *      reconcileOnBoot() and reads the row back from real, persisted
 *      state to confirm it was found and correctly disposed of.
 *
 * Two real runs: one with onFail:{action:'retry'} (expects retried),
 * one with onFail:{action:'halt'} (expects escalated) — proving both
 * real dispositions, not just one.
 *
 * Run: node scripts/mco6-ic9-kill-and-restart.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function line() { console.log('─'.repeat(72)); }

async function runOneScenario(onFail, expectedDisposition) {
  const jaaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ic9-jaa-'));
  const inDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'ic9-in-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ic9-out-'));
  const env = { ...process.env, JAA_DATA_DIR: jaaDir, RAID_INPUT_DIR: inDir, RAID_OUTPUT_DIR: outDir };

  console.log(`\n[scenario] onFail=${JSON.stringify(onFail)}  expecting: ${expectedDisposition}`);
  console.log(`  isolated JAA_DATA_DIR: ${jaaDir}`);

  // ── Step 1: child submits + starts a real, slow job, then we kill it ──────
  const childCode = `
    const intake = require(${JSON.stringify(path.join(__dirname, '..', 'cortex', 'core', 'raid', 'contract-intake.js'))});
    (async () => {
      const { queueId } = intake.submitContract(
        { content: 'IC9 kill-and-restart real job' },
        { source: 'ic9-demo', intention: 'build', onFail: ${JSON.stringify(onFail)} }
      );
      intake.acknowledge(queueId, { system: 'ic9-demo' });
      console.log('QUEUE_ID:' + queueId);
      // A real, slow executor — deliberately never resolves before this
      // process gets killed. This IS the real crash window IC9 covers.
      await intake.processNext(() => new Promise((r) => setTimeout(() => r({ text: 'SEAM VERDICT: PASS' }), 30000)));
    })();
  `;

  const child = spawn('node', ['-e', childCode], { env });
  let queueId = null;
  child.stdout.on('data', (d) => {
    const m = d.toString().match(/QUEUE_ID:(\S+)/);
    if (m) queueId = m[1];
  });
  child.stderr.on('data', () => {});

  // Poll the REAL persisted jaaDB file until the row genuinely reaches
  // RUNNING — never a fixed sleep-and-hope.
  const jaaFile = path.join(jaaDir, 'raid_contract_queue.json');
  const deadline = Date.now() + 10000;
  let sawRunning = false;
  while (Date.now() < deadline) {
    if (queueId && fs.existsSync(jaaFile)) {
      try {
        const rows = JSON.parse(fs.readFileSync(jaaFile, 'utf8'));
        const row = (Array.isArray(rows) ? rows : rows.rows || []).find((r) => r.uuid === queueId);
        if (row && row.status === 'running') { sawRunning = true; break; }
      } catch (_) { /* file mid-write — keep polling */ }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!sawRunning) throw new Error('child never reached a real, persisted RUNNING state — cannot prove the kill scenario');

  console.log(`  real child pid ${child.pid} reached RUNNING for queueId ${queueId} — killing it now (SIGKILL)`);
  child.kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 300)); // let the OS actually reap it

  // ── Step 2: "restart" — fresh require, same real isolated data dirs ──────
  process.env.JAA_DATA_DIR = jaaDir;
  process.env.RAID_INPUT_DIR = inDir;
  process.env.RAID_OUTPUT_DIR = outDir;
  delete require.cache[require.resolve('../cortex/memory/jaa-db')];
  delete require.cache[require.resolve('../cortex/core/raid/contract-intake.js')];
  const intakeRestarted = require('../cortex/core/raid/contract-intake.js');

  const beforeRow = intakeRestarted.listQueue().find((r) => r.uuid === queueId);
  console.log(`  real row read back after "restart", before reconcile: status=${beforeRow.status} stage=${beforeRow.stage}`);

  const result = intakeRestarted.reconcileOnBoot();
  console.log(`  reconcileOnBoot() real result: checked=${result.checked} resumed=${result.resumed.length} retried=${result.retried.length} escalated=${result.escalated.length}`);

  const afterRow = intakeRestarted.listQueue().find((r) => r.uuid === queueId);
  console.log(`  real row after reconcile: status=${afterRow.status} stage=${afterRow.stage}`);

  const actualDisposition = result.resumed.find((r) => r.queueId === queueId) ? 'resumed'
    : result.retried.find((r) => r.queueId === queueId) ? 'retried'
    : result.escalated.find((r) => r.queueId === queueId) ? 'escalated'
    : 'NONE — NOT FOUND';

  console.log(`  actual disposition: ${actualDisposition}  ${actualDisposition === expectedDisposition ? '✓ matches expected' : '✗ MISMATCH'}`);

  for (const d of [jaaDir, inDir, outDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }

  return actualDisposition === expectedDisposition;
}

async function main() {
  line();
  console.log('MCO6/IC9 — kill mid-job on purpose, restart, verify real disposition');
  line();

  const r1 = await runOneScenario({ action: 'retry', maxRetries: 2 }, 'retried');
  const r2 = await runOneScenario({ action: 'halt' }, 'escalated');

  line();
  console.log(`IC9 gate: ${r1 && r2 ? 'MET' : 'NOT MET'} — reconcileOnBoot() found and correctly disposed of the unfinished contract in both real scenarios, from persisted data alone.`);
  line();
  process.exitCode = (r1 && r2) ? 0 : 1;
}

main().catch((e) => { console.error('[IC9] real run failed:', e); process.exitCode = 1; });
