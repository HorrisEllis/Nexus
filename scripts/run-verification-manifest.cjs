'use strict';
/**
 * scripts/run-verification-manifest.cjs — execute the real manifest
 * UUID: nexus-scripts-run-verification-manifest-v1-0000-2026-0714-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-14 — the machine-readable half of VERIFICATION-LOG.md.
 * Runs every claim's real command, records the genuine result, never
 * conflates "the command produced this output" with "the claim is true" —
 * the manifest's own rawCheck/claim split is preserved through to
 * storage and console output, not collapsed into one pass/fail label.
 *
 * §WHY THIS DOESN'T UPDATE ITS OWN CONFIDENCE AUTOMATICALLY — a real,
 * deliberate boundary, not an oversight. A system that runs its own
 * checks and silently raises its own confidence from the result is
 * circular in exactly the way RAID's approval gate can't be self-
 * approved. This script does the honest, bounded thing: run the real
 * command, record the real result, declare a real LOOM concern on
 * failure. It does not write to anything resembling "system confidence"
 * — that would need the same governance any other self-modifying path
 * needs, and doesn't have it yet. Left as a real, named gap rather than
 * quietly built in.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MANIFEST_PATH = path.join(__dirname, '..', 'verification-manifest.json');
const MODULE_ID = 'scripts.run-verification-manifest';

function _gitCommitHash() {
  try { return execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..') }).toString().trim(); }
  catch (e) { return null; } // not a git repo, or git unavailable — honest null, not a fabricated hash
}

function _runClaim(entry, rootDir) {
  const startedAt = Date.now();
  let actualOutput = '';
  let ranOk = true;
  let runError = null;

  try {
    actualOutput = execSync(entry.command, { cwd: rootDir, timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // A command that exits non-zero is a real, honest failure signal —
    // captured, not treated as a crash of the runner itself.
    ranOk = false;
    runError = e.message;
    actualOutput = (e.stdout || '') + (e.stderr || '');
  }

  const matched = ranOk && actualOutput.includes(entry.expectedPattern);

  return {
    claimId: entry.id,
    claim: entry.claim,
    rawCheck: entry.rawCheck,
    command: entry.command,
    expectedPattern: entry.expectedPattern,
    actualOutputTrimmed: actualOutput.slice(0, 500),
    ranOk,
    runError,
    passed: matched,
    failureSeverity: entry.failureSeverity,
    durationMs: Date.now() - startedAt,
    ts: Date.now(),
    commitHash: _gitCommitHash(),
  };
}

function run({ rootDir = path.join(__dirname, '..'), declareConcern = null, jaaDB = null } = {}) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const results = [];

  for (const entry of manifest.claims) {
    const result = _runClaim(entry, rootDir);
    results.push(result);

    // §HONEST OUTPUT — rawCheck and claim printed as two distinct lines,
    // never merged into one "X is true" statement the raw command didn't
    // actually establish on its own.
    console.log(`\n[${result.passed ? 'PASS' : 'FAIL'}] ${result.claimId}`);
    console.log(`  rawCheck: ${result.rawCheck}`);
    console.log(`  claim (interpretation, not identical to the raw result): ${result.claim}`);
    if (!result.passed) {
      console.log(`  actual output: ${result.actualOutputTrimmed.slice(0, 200)}`);
    }

    if (jaaDB) {
      try { jaaDB.insert('verification_results', result); }
      catch (e) { console.warn(`[${MODULE_ID}] could not log result for ${result.claimId}: ${e.message}`); }
    }

    // §CONNECTS TO THE REAL ROADMAP — a failed claim becomes a real LOOM
    // concern, same kind built 2026-07-14 for exactly this: something
    // detected, not a category tag. declareConcern is passed in, same
    // pattern as loom/scanners/closed-door.js — this stays testable
    // without a live LOOM instance and doesn't assume one particular way
    // of reaching the registry.
    if (!result.passed && typeof declareConcern === 'function') {
      try {
        declareConcern('concern', {
          id: `concern-verification-failed-${result.claimId}`,
          kind: 'verification-failure',
          title: `Claim failed: ${result.claim}`,
          severity: result.failureSeverity === 'critical' ? 'high' : result.failureSeverity,
          source: MODULE_ID,
          relatesTo: [],
          detail: { claimId: result.claimId, command: result.command, actualOutput: result.actualOutputTrimmed, commitHash: result.commitHash },
        });
      } catch (e) {
        console.warn(`[${MODULE_ID}] could not declare concern for failed claim ${result.claimId}: ${e.message}`);
      }
    }
  }

  const passCount = results.filter(r => r.passed).length;
  console.log(`\n${passCount}/${results.length} claims verified against real, freshly-run commands.\n`);

  return { results, passCount, totalCount: results.length };
}

if (require.main === module) {
  let declareConcern = null;
  try {
    const { LoomDriver } = require('../loom/schema/index.js');
    const driver = new LoomDriver({ dataDir: path.join(__dirname, '..', 'data', 'loom') });
    declareConcern = (kind, payload) => driver.declare(kind, payload);
  } catch (e) {
    console.warn(`[${MODULE_ID}] LOOM unavailable — failures will be reported but not declared as concerns: ${e.message}`);
  }
  const { results, passCount, totalCount } = run({ declareConcern });
  process.exit(passCount === totalCount ? 0 : 1);
}

module.exports = { run };
