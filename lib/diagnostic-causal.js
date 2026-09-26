'use strict';
/**
 * lib/diagnostic-causal.js — the causal layer of the diagnostic kernel (§P3)
 * UUID: nexus-diagnostic-causal-v1-0000-2026-0807-001
 *
 * James: the diagnostic tool uses RFR2 + CFR + registry + loom + the intelligence
 * system to find gaps, tension, friction AND THE CONDITIONS THAT CREATED THEM.
 *
 * The existing service/nexus-diagnostic.js already finds gaps/tension/friction
 * (it just crash-looped — fixed in P3). This adds the missing layer: for each
 * finding, trace the CONDITIONS via the relational-field reader (RFR2), and join
 * it to the live substrate — fan-in coverage (which systems are silent), the
 * snapshot timeline (when regimes shifted), and loom's self-model.
 *
 * §8.6 composes what P1/P2 + the loom scanners already built; no new detection.
 * §1.2 every sub-read degrades honestly (a missing piece is stated, not fatal).
 */

/**
 * explainFinding(finding, opts) — given a gap/tension/friction finding, return
 * the conditions that created it (RFR2 causality) + its deviation classification.
 * @param finding { type, system, severity, uuid?, entry? }
 */
async function explainFinding(finding = {}, opts = {}) {
  const out = { finding: finding.type, system: finding.system, severity: finding.severity, root: null, conditions: [], available: false, reason: null };
  try {
    const rf = opts.relationalField || require('../intelligence/relational-field');
    const id = finding.uuid || finding.entry?.uuid || finding.entry?.type || finding.type;
    const field = await rf.readFieldForFriction({ id, causalStore: opts.causalStore }, opts);
    out.root = field.root; out.conditions = field.conditions || []; out.available = field.available;
    out.deviation = field.deviation || null;
    if (!field.available) out.reason = field.reason || 'no causal chain traced';
  } catch (e) { out.reason = `relational-field unavailable: ${e.message}`; }
  return out;
}

/**
 * diagnoseDeep(findings, opts) — the full picture: every finding explained with
 * its conditions, plus the live-system context that says whether the diagnostic
 * is even seeing everything.
 *
 * §2026-08-09 UNIFIED — findings now defaults to the real, live open gaps
 * from lib/gap-field.js (both domain:'system' and domain:'user-model')
 * instead of silently defaulting to []. Before this fix, diagnoseDeep's one
 * live caller (copilot/lib/nexus-awareness.js) passed opts.findings || [] —
 * meaning the "diagnostic kernel" P3 marked DONE had never actually
 * explained a single real gap by default. An explicit findings array still
 * overrides this (a caller investigating something specific isn't forced
 * to see everything else).
 */
async function diagnoseDeep(findings, opts = {}) {
  if (findings === undefined) {
    try { const gf = opts.gapField || require('./gap-field'); findings = gf.asFindings(opts.gapOpts); }
    catch (e) { findings = []; }
  }
  findings = findings || [];
  const explained = [];
  for (const f of findings) explained.push(await explainFinding(f, opts));

  // Live context from the substrate — honest-degrade each.
  const context = {};
  try { const fan = opts.fanin || require('./ledger-fanin'); context.coverage = fan.coverage(opts.expectedSystems || []); }
  catch (e) { context.coverage = { error: e.message }; }
  try { const st = opts.snapshotTrigger || require('../intelligence/snapshot-trigger'); context.snapshotTimeline = st.timeline({ sigmaOnly: true, limit: 10 }); }
  catch (e) { context.snapshotTimeline = { error: e.message }; }
  try {
    const cap = opts.capabilityMap || require('../loom/scanners/capability-map');
    const decls = cap.loadAll(); const { unserved } = cap.verifyRoutes(decls);
    context.selfModel = { capabilities: decls.length, servedByNothing: unserved.length, staleDuplicates: (decls.duplicates || []).length };
  } catch (e) { context.selfModel = { error: e.message }; }

  const withConditions = explained.filter(e => e.available).length;
  return {
    findings: explained,
    total: explained.length,
    withTracedConditions: withConditions,
    context,
    summary: `${explained.length} findings, ${withConditions} with traced causal conditions` +
             (context.coverage?.missing?.length ? `; ${context.coverage.missing.length} systems silent (blind spots)` : '') +
             (context.selfModel?.servedByNothing ? `; ${context.selfModel.servedByNothing} declared capabilities served by nothing` : ''),
    ts: Date.now(),
  };
}

module.exports = { explainFinding, diagnoseDeep, MODULE_ID: 'diagnostic-causal', VERSION: '1.0.0' };
