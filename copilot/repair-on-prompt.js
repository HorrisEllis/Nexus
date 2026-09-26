'use strict';
/**
 * copilot/repair-on-prompt.js — P11 of the bridge phases (the capstone)
 * UUID: nexus-copilot-repair-on-prompt-v1-0000-2026-0730-001
 *
 * §PHASEMAP P11 (docs/raid-warp-verification-phasemap.spec Part II) — the full
 * bridge: the user asks, co-pilot FIXES — through the verified spine. On a repair
 * prompt, co-pilot diagnoses, proposes a fix, and routes it through raid.verify()
 * (P7: constitution → COS isolate → sigma/drift → compare → rewind-on-fail). The
 * repair is applied ONLY if verification passes. The user prompted; the spine
 * made it safe. "The system is at co-pilot's disposal" — but a repair still
 * passes through constitution, isolation, and comparison before it touches
 * anything real (§1.1 nothing real until proven, §2.1 no mutation before pass).
 *
 * §8.6/§16.5 — drives the EXISTING raid.verify spine (P1-P7) and diagnose; builds
 * no new verification or repair engine. Disposal WITH governance.
 *
 * @param {object} deps
 *   diagnose  — async (target) => { summary, specPath?, ... }  (what's wrong + how to fix)
 *   raidVerify — async (decision) => verdict                    (the P7 spine)
 *   applyRepair — async (repair) => result                      (commit the fix; only called on PASS)
 *   notify    — (message, meta) => void
 */
function createRepairOnPrompt(deps = {}) {
  const { diagnose, raidVerify, applyRepair, notify } = deps;
  if (typeof raidVerify !== 'function') throw new Error('[repair-on-prompt] raidVerify (the raid.verify spine) is required');

  /**
   * repair(prompt, opts) — the prompted-repair entry point.
   *   1. diagnose what's wrong (+ how to fix, e.g. a specPath),
   *   2. route the proposed fix through raid.verify() (isolate + verify),
   *   3. apply ONLY on PASS; on fail, report why (the fix is NOT applied, real
   *      target untouched — §2.1), and the failure is replayable (P6 snapshotId).
   */
  async function repair(prompt, opts = {}) {
    const source = opts.source || 'copilot';
    // 1. diagnose.
    let diagnosis = null;
    if (typeof diagnose === 'function') {
      try { diagnosis = await diagnose(opts.target || prompt); }
      catch (e) { return { ok: false, stage: 'diagnose', error: `diagnosis failed: ${e.message}` }; }
    }
    const specPath = opts.specPath || diagnosis?.specPath;
    if (!specPath) {
      // Nothing to verify/apply — diagnosis only. Honest: co-pilot won't apply a
      // fix it can't verify (§1.1). Report the diagnosis, ask for a spec.
      const msg = diagnosis?.summary
        ? `Here's what I found: ${diagnosis.summary}. I need a concrete fix spec to verify and apply a repair safely.`
        : `I couldn't determine a verifiable fix for that. Can you point me at the spec or file?`;
      if (notify) notify(msg, { diagnosis });
      return { ok: false, stage: 'diagnose', applied: false, diagnosis, message: msg };
    }

    // 2. route the fix through the raid.verify spine (P7).
    const verdict = await raidVerify({
      source, action: 'repair', intent: { action: 'repair', target: opts.target },
      specPath, outputDir: opts.outputDir, testCommand: opts.testCommand,
      opts: { causedBy: opts.causedBy, requestId: opts.requestId },
    });

    // 3. apply ONLY on PASS.
    if (!verdict.approved) {
      const why = verdict.contractBreach ? 'the fix regressed against the contract'
        : `verification failed at '${verdict.stage}'`;
      const msg = `I diagnosed the issue and prepared a fix, but I did NOT apply it — ${why}. Nothing was changed. ${verdict.snapshotId ? `(replayable: ${verdict.snapshotId})` : ''}`;
      if (notify) notify(msg, { verdict });
      return { ok: false, stage: verdict.stage, applied: false, verdict, message: msg };
    }

    // verified — safe to apply.
    let applyResult = null;
    if (typeof applyRepair === 'function') {
      try { applyResult = await applyRepair({ specPath, diagnosis, verdict }); }
      catch (e) { return { ok: false, stage: 'apply', applied: false, verdict, error: `apply failed after passing verify: ${e.message}` }; }
    }
    const msg = `I diagnosed the issue, verified the fix in isolation (constitution + sandbox + contract compare all passed), and applied it.`;
    if (notify) notify(msg, { verdict, applyResult });
    return { ok: true, stage: 'applied', applied: true, verdict, applyResult, message: msg };
  }

  return { repair };
}

module.exports = { createRepairOnPrompt };
