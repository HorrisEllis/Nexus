'use strict';
/**
 * lib/autonomous-repair.js — R3: co-pilot notices, and fixes the same safe way
 * UUID: nexus-autonomous-repair-v1-0000-2026-0812-001
 *
 * docs/repair-contract-and-loom-hub-phasemap.spec R3. James: "loom is
 * supposed to be the system to do what your doing... editing, building,
 * expanding nexus." This is the actual wire: copilot/repair-on-prompt.js
 * (real, correct, zero callers all session) fired from a detected gap
 * instead of only from a typed prompt.
 *
 * §SCOPE, stated honestly — repair-on-prompt.js requires a specPath to
 * verify/apply anything (it's built for spec-verifiable code/build
 * repairs, not arbitrary settings drift — checked its real contract
 * before wiring, not assumed generic). The one gap type that genuinely
 * carries a real specPath right now is 'chunk-build.exhausted' /
 * 'chunk-build.all-agents-unreachable' from lib/chunk-build-orchestrator.js
 * (fixed earlier this pass to actually include it in meta). Starting
 * here, narrow and real, rather than wiring "every gap" to a repair
 * mechanism that can't act on most of them (§0.5 — complexity earns its
 * existence).
 *
 * §8.6 — composes copilot/repair-on-prompt.js, cortex/core/raid/index.js's
 * verify() (fixed this pass — see the runPipeline signature bugfix),
 * lib/gap-field.js, and lib/triggers.js (CA2, the exact detect->fire
 * mechanism already proven live earlier this session with the
 * config-drift scenario).
 */

const { createRepairOnPrompt } = require('../copilot/repair-on-prompt');

const REPAIRABLE_GAP_TYPES = ['chunk-build.exhausted', 'chunk-build.all-agents-unreachable'];

/**
 * _diagnose(gap) — real diagnose() built from R1's contract, already on
 * the gap: no re-derivation, the why/systemsInvolved/location/error are
 * already there from gap-field.report().
 */
async function _diagnose(gap) {
  const meta = gap.meta || {};
  if (!meta.specPath) {
    return { summary: gap.body || gap.type, specPath: null };
  }
  return {
    summary: gap.why?.finding ? `${gap.type}: ${gap.body}` : (gap.body || gap.type),
    specPath: meta.specPath,
    outputDir: meta.outputDir,
    testCommand: meta.testCommand,
  };
}

/**
 * _applyRepair({specPath, diagnosis, verdict}) — honest, not redundant.
 * verify()'s own isolation stage already ran the real pipeline and, on
 * PASS, already promoted the result to golden (lib/execution-pipeline.js's
 * own success flow) — that IS the repair. This confirms/records it rather
 * than re-running or re-promoting anything (§16.5 — don't duplicate work
 * that already happened).
 */
async function _applyRepair({ specPath, diagnosis, verdict }) {
  return { ok: true, alreadyPromoted: true, specPath, note: 'runPipeline\'s own success path already promoted this to golden during verification — nothing further to apply' };
}

/**
 * wireAutonomousRepair(opts) — registers the real CA2 trigger. Call once
 * at boot (or in a test with injected deps).
 */
function wireAutonomousRepair(opts = {}) {
  const triggers = opts.triggers || require('./triggers');
  const gapField = opts.gapField || require('./gap-field');
  const raid = opts.raid || require('../cortex/core/raid/index');
  const notify = opts.notify || (() => {});

  const repairOnPrompt = createRepairOnPrompt({
    diagnose: opts.diagnose || _diagnose,
    raidVerify: opts.raidVerify || raid.verify,
    applyRepair: opts.applyRepair || _applyRepair,
    notify,
  });

  return triggers.registerTrigger({
    name: 'autonomous-repair-on-chunk-build-exhaustion',
    // §BUGFIX 2026-08-13 — registerTrigger's own default is `once: true`
    // (maxFires: 1 follows from that, confirmed in lib/triggers.js). Left
    // unset, this trigger would fire for the FIRST chunk-build-exhaustion
    // gap ever detected, then call disarmTrigger() on itself and never fire
    // again — a self-healing loop that heals exactly once per process
    // lifetime, discovered while wiring this into boot for real. A
    // recurring gap TYPE needs an ongoing trigger, not a one-shot.
    once: false,
    condition: {
      type: 'event', matchType: 'gap-field.found',
      predicate: (row) => REPAIRABLE_GAP_TYPES.includes(row.gapType),
    },
    fn: async (row) => {
      const gaps = gapField.openGaps({ domain: 'system', limit: 50 });
      const gap = gaps.find(g => g.uuid === row.uuid) || gaps.find(g => g.type === row.gapType && g.source === row.source);
      if (!gap) return;
      const result = await repairOnPrompt.repair(gap.body, { target: gap, specPath: gap.meta?.specPath, outputDir: gap.meta?.outputDir, testCommand: gap.meta?.testCommand, source: 'autonomous-repair', causedBy: gap.uuid });
      try {
        gapField.report({
          type: result.applied ? 'autonomous-repair.applied' : 'autonomous-repair.declined',
          body: result.message || (result.applied ? 'repair applied' : 'repair not applied'),
          source: 'autonomous-repair', domain: 'system', severity: 'low',
          meta: { causedBy: gap.uuid, verdict: result.verdict, stage: result.stage },
        });
      } catch (_) {}
    },
  });
}

module.exports = { wireAutonomousRepair, REPAIRABLE_GAP_TYPES, _diagnose, _applyRepair, MODULE_ID: 'autonomous-repair', VERSION: '1.0.0' };
