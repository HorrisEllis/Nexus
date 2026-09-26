'use strict';
/**
 * cos/playground/compare.js  -  Iteration Comparison Engine
 * UUID: cos-compare-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Compares two or more branch iterations across multiple dimensions:
 *
 *   FILE DIFF        -  which files changed between branches
 *   RUN METRICS      -  test pass rates, exit codes, durations
 *   OUTPUT DIFF      -  line-by-line diff of stdout between branches
 *   REGRESSION MAP   -  did something that passed now fail?
 *
 * This is the "playground vs playground" layer  -  you run branch A,
 * run branch B with the same command, then compare the outputs,
 * metrics, and file changes in a single report.
 *
 * Reports are stored in .nex/comparisons/<reportId>.json
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { compartmentPaths } = require('../foundation/constants.js');
const { BranchEngine }     = require('./branch.js');
const { SandboxRunner }    = require('./sandbox.js');

class CompareEngine {
  /**
   * Run the same command in two branches and compare everything.
   *
   * @param {object} compartment
   * @param {string} branchA
   * @param {string} branchB
   * @param {object} opts
   * @param {string}   opts.command      -  entry file to run
   * @param {string[]} opts.args         -  args passed to both
   * @param {string}   opts.runtimeId    -  runtime override
   * @param {number}   opts.timeoutMs    -  per-run timeout
   * @param {object}   opts.bus          -  event bus
   * @param {string}   opts.label        -  human label for this comparison
   * @returns {Promise<CompareReport>}
   */
  static async runCompare(compartment, branchA, branchB, opts = {}) {
    const reportId  = `cmp-${crypto.randomUUID().slice(0, 8)}`;
    const startedAt = Date.now();
    const bus       = opts.bus || null;

    const emit = (type, payload) => {
      if (bus) try { bus.emit(type, payload); } catch {}
    };

    emit('comp:compare:started', {
      compartmentId: compartment.id, reportId, branchA, branchB,
    });

    // Run both branches
    const [runA, runB] = await Promise.all([
      SandboxRunner.run(compartment, branchA, { ...opts, bus: null }),
      SandboxRunner.run(compartment, branchB, { ...opts, bus: null }),
    ]);

    // File diff
    const fileDiff = (() => {
      try { return BranchEngine.diff(compartment, branchA, branchB); }
      catch (e) { return { error: e.message }; }
    })();

    // Output diff (stdout)
    const outputDiff = _diffOutput(runA.stdout, runB.stdout, branchA, branchB);

    // Regression analysis
    const regression = _analyseRegression(runA, runB);

    const report = {
      id:        reportId,
      label:     opts.label || `${branchA} vs ${branchB}`,
      branchA, branchB,
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,

      runs: {
        [branchA]: {
          ok:        runA.ok,
          exitCode:  runA.exitCode,
          durationMs: runA.durationMs,
          passed:    runA.passed,
          failed:    runA.failed,
          stdout:    runA.stdout,
          stderr:    runA.stderr,
          metrics:   runA.metrics || {},
        },
        [branchB]: {
          ok:        runB.ok,
          exitCode:  runB.exitCode,
          durationMs: runB.durationMs,
          passed:    runB.passed,
          failed:    runB.failed,
          stdout:    runB.stdout,
          stderr:    runB.stderr,
          metrics:   runB.metrics || {},
        },
      },

      fileDiff:   fileDiff,
      outputDiff: outputDiff,
      regression: regression,

      verdict: _verdict(runA, runB, regression, fileDiff),
    };

    // Persist report
    try {
      const { nexDir } = compartmentPaths(compartment.id);
      const cmpDir = path.join(nexDir, 'comparisons');
      fs.mkdirSync(cmpDir, { recursive: true });
      fs.writeFileSync(
        path.join(cmpDir, `${reportId}.json`),
        JSON.stringify(report, null, 2)
      );
    } catch { /* non-fatal */ }

    emit('comp:compare:done', {
      compartmentId: compartment.id, reportId,
      verdict: report.verdict.summary,
    });

    return report;
  }

  /**
   * Load a saved comparison report.
   */
  static loadReport(compartment, reportId) {
    const { nexDir } = compartmentPaths(compartment.id);
    const p = path.join(nexDir, 'comparisons', `${reportId}.json`);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { return null; }
  }

  /**
   * List all comparison reports for a compartment.
   */
  static listReports(compartment) {
    const { nexDir } = compartmentPaths(compartment.id);
    const cmpDir = path.join(nexDir, 'comparisons');
    if (!fs.existsSync(cmpDir)) return [];

    return fs.readdirSync(cmpDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(cmpDir, f), 'utf8'));
          return {
            id:        r.id,
            label:     r.label,
            branchA:   r.branchA,
            branchB:   r.branchB,
            verdict:   r.verdict?.summary || 'unknown',
            durationMs: r.durationMs,
            finishedAt: r.finishedAt,
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  }

  /**
   * Compare run metrics across N branches without re-running.
   * Uses previously recorded run results from branch manifests.
   */
  static compareBranches(compartment, branchIds) {
    return BranchEngine.compareRuns(compartment, branchIds);
  }
}

// ── Output diff ────────────────────────────────────────────────────────────────

function _diffOutput(outA, outB, labelA, labelB) {
  const linesA = (outA || '').split('\n');
  const linesB = (outB || '').split('\n');

  if (outA === outB) {
    return { identical: true, labelA, labelB, hunks: [] };
  }

  // Reuse simple diff from branch.js logic (LCS + hunks)
  const added    = [];
  const removed  = [];
  const changed  = [];

  const setA = new Set(linesA.filter(Boolean));
  const setB = new Set(linesB.filter(Boolean));

  for (const l of setB) { if (!setA.has(l)) added.push(l); }
  for (const l of setA) { if (!setB.has(l)) removed.push(l); }

  // Find test result lines (common pattern: ✓ / ✗ / PASS / FAIL)
  const testPatterns = [/^\s*[✓✗✖✔×]\s/, /PASS|FAIL|ERROR|passed|failed/i];
  const testLinesA   = linesA.filter(l => testPatterns.some(p => p.test(l)));
  const testLinesB   = linesB.filter(l => testPatterns.some(p => p.test(l)));

  return {
    identical:  false,
    labelA, labelB,
    linesA:     linesA.length,
    linesB:     linesB.length,
    added:      added.slice(0, 50),
    removed:    removed.slice(0, 50),
    testLinesA: testLinesA.slice(0, 30),
    testLinesB: testLinesB.slice(0, 30),
  };
}

// ── Regression analysis ────────────────────────────────────────────────────────

function _analyseRegression(runA, runB) {
  const regressions = [];
  const improvements = [];

  // Exit code changed
  if (runA.exitCode !== runB.exitCode) {
    if (runA.ok && !runB.ok) {
      regressions.push({ type: 'exit-code', detail: `${runA.exitCode} -> ${runB.exitCode}`, severity: 'high' });
    } else if (!runA.ok && runB.ok) {
      improvements.push({ type: 'exit-code', detail: `${runA.exitCode} -> ${runB.exitCode}` });
    }
  }

  // Test counts (parse from stdout)
  const parseTests = stdout => {
    const passMatch = stdout?.match(/(\d+)\s+pass(?:ed|ing)?/i);
    const failMatch = stdout?.match(/(\d+)\s+fail(?:ed|ure)?/i);
    return {
      passed: passMatch ? parseInt(passMatch[1]) : null,
      failed: failMatch ? parseInt(failMatch[1]) : null,
    };
  };

  const testsA = parseTests(runA.stdout);
  const testsB = parseTests(runB.stdout);

  if (testsA.passed !== null && testsB.passed !== null) {
    if (testsB.passed < testsA.passed) {
      regressions.push({
        type: 'test-count',
        detail: `passed: ${testsA.passed} -> ${testsB.passed} (−${testsA.passed - testsB.passed})`,
        severity: 'high',
      });
    } else if (testsB.passed > testsA.passed) {
      improvements.push({
        type: 'test-count',
        detail: `passed: ${testsA.passed} -> ${testsB.passed} (+${testsB.passed - testsA.passed})`,
      });
    }
  }

  if (testsA.failed !== null && testsB.failed !== null) {
    if (testsB.failed > testsA.failed) {
      regressions.push({
        type: 'test-failures',
        detail: `failed: ${testsA.failed} -> ${testsB.failed} (+${testsB.failed - testsA.failed})`,
        severity: 'high',
      });
    }
  }

  // Duration change (>2x slower = regression)
  if (runA.durationMs && runB.durationMs) {
    const ratio = runB.durationMs / runA.durationMs;
    if (ratio > 2.0) {
      regressions.push({
        type: 'performance',
        detail: `${runA.durationMs}ms -> ${runB.durationMs}ms (${ratio.toFixed(1)}x slower)`,
        severity: 'medium',
      });
    } else if (ratio < 0.5) {
      improvements.push({
        type: 'performance',
        detail: `${runA.durationMs}ms -> ${runB.durationMs}ms (${(1/ratio).toFixed(1)}x faster)`,
      });
    }
  }

  return { regressions, improvements };
}

// ── Verdict ────────────────────────────────────────────────────────────────────

function _verdict(runA, runB, regression, fileDiff) {
  const hasRegressions  = regression.regressions.length > 0;
  const hasImprovements = regression.improvements.length > 0;
  const filesChanged    = fileDiff?.summary?.modified || 0;
  const filesAdded      = fileDiff?.summary?.added    || 0;
  const filesRemoved    = fileDiff?.summary?.removed  || 0;
  const totalChanges    = filesChanged + filesAdded + filesRemoved;

  let summary;
  if (!runA.ok && runB.ok)         summary = 'fixed';
  else if (runA.ok && !runB.ok)    summary = 'regression';
  else if (hasRegressions)         summary = 'degraded';
  else if (hasImprovements)        summary = 'improved';
  else if (totalChanges > 0)       summary = 'changed';
  else                             summary = 'identical';

  return {
    summary,
    hasRegressions,
    hasImprovements,
    regressionCount:  regression.regressions.length,
    improvementCount: regression.improvements.length,
    filesChanged:     totalChanges,
    bothPassed:       runA.ok && runB.ok,
    bothFailed:       !runA.ok && !runB.ok,
  };
}

module.exports = { CompareEngine };
