'use strict';
/**
 * cortex/self-heal/failure-mode-forensics.js — real causal-chain + sigma
 * delta enrichment for .failure_mode nodes, plus .debug_macro generation.
 * UUID: nexus-cortex-self-heal-failure-mode-forensics-v1-0000-2026-0912-001
 *
 * James: "each system needs .failure_mode nodes that uses the intelligence
 * system to map the events leading up to a failure mode and the effect
 * its having on the system. delta and sigmas for tension and friction
 * score. like the system debugs and uses rfr2 to understand the
 * conditions leading up to a bug/gap/error, make a .failure_mode and
 * .macro to replicate the bug."
 *
 * §BUILT ON, NOT INSTEAD OF — every real causal-tracing mechanism this
 * module needs already exists and already works:
 *   - cortex/self-heal/index.js's own _gatherFailureContext()/
 *     _formatFailureContext() (already exported for testing) walk
 *     lib/gap-field.js's explainWhy() -> lib/diagnostic-causal.js's
 *     explainFinding() -> intelligence/relational-field's real causal
 *     chain, plus sibling dangling hooks and the system's own spec
 *     purpose. Reused here verbatim, not re-derived.
 *   - RFR2's actual causal-graph kernel (meta/rfr2/kernel/) does NOT
 *     exist in this codebase — docs/RFR2-KERNEL-CONTRACT.md says so
 *     directly ("Status: absent... searched 2026-07-09"), which is why
 *     intelligence/relational-field, not RFR2's own kernel, is the real
 *     mechanism doing this work today. Named honestly, not silently
 *     routed around.
 *   - sigma_records (cortex's own jaaDB table, cortex/memory/tiers.js's
 *     'short' tier) is the real, live tension signal already written by
 *     orchestrator/lib/sigma-writer.js on every real bus event.
 *
 * §HONEST SCOPE — sigma has no per-faultClass dimension anywhere in this
 * codebase (checked sigma-writer.js's real record shape directly, same
 * finding table-compactor.js's own header already names) — its real
 * per-source dimension is `type` (the originating bus event type). A
 * failure's sigma delta here is therefore a SYSTEM-WIDE tension reading
 * in the window around the failure, not a per-fault-class one — reported
 * as observed correlation, never asserted as the cause.
 */

const { jaaDB, uid } = require('../memory/jaa-db');
const nodeExport = require('../../lib/node-export');

const MODULE_ID = 'cortex.self-heal.failure-mode-forensics';

/**
 * computeSigmaDelta(enteredAt, windowMs) — real avg sigma in the window
 * immediately before entry vs the window before that, from the real,
 * live sigma_records table. Both averages are null (not 0 — 0 would
 * silently claim "nominal" when the honest answer is "no data") when no
 * real rows fall in that half of the window, and delta is null unless
 * both halves have real data.
 */
function computeSigmaDelta(enteredAt, windowMs = 10 * 60 * 1000) {
  let rows;
  try { rows = jaaDB.query('sigma_records', (r) => typeof r.sigma === 'number' && typeof r.ts === 'number' && r.ts <= enteredAt && r.ts > enteredAt - 2 * windowMs, 100000) || []; }
  catch (e) { return { sigmaBefore: null, sigmaAtEntry: null, sigmaDelta: null, error: e.message }; }

  const mid = enteredAt - windowMs;
  const before = rows.filter((r) => r.ts <= mid);
  const atEntry = rows.filter((r) => r.ts > mid);
  const avg = (arr) => arr.length ? arr.reduce((s, r) => s + r.sigma, 0) / arr.length : null;

  const sigmaBefore = avg(before);
  const sigmaAtEntry = avg(atEntry);
  const sigmaDelta = (sigmaBefore !== null && sigmaAtEntry !== null) ? (sigmaAtEntry - sigmaBefore) : null;
  return { sigmaBefore, sigmaAtEntry, sigmaDelta, sampledBefore: before.length, sampledAtEntry: atEntry.length };
}

/**
 * generateDebugMacro(gapType, gapUuid, ctx, failureModeUuid) — composes a
 * real .debug_macro from the real precursor conditions ctx.conditions
 * (lib/diagnostic-causal.js's own real causal-chain output) into an
 * ordered, replayable step list. Honestly marked non-executable (see
 * schema.debug_macro's own status:OPEN) — no general event-replay
 * executor exists yet; this records the real reproduction recipe so one
 * can be built against it later, or a human can read it directly.
 *
 * Returns null (not a macro with an empty steps[]) when there are no
 * real conditions to compose — an empty macro would misrepresent "we
 * found nothing" as "here is the reproduction," which §1.2 forbids.
 */
function generateDebugMacro(gapType, gapUuid, ctx, failureModeUuid) {
  const conditions = Array.isArray(ctx.conditions) ? ctx.conditions : [];
  if (!conditions.length && !ctx.root) return null;

  const steps = conditions.map((c) => ({
    call: 'event',
    type: (c && (c.type || c.event)) || 'unknown',
    payload: (c && (c.payload || c.data || c)) || null,
    ts: (c && c.ts) || null,
  }));

  const id = uid();
  const payload = {
    uuid: id,
    name: `reproduce-${gapType}-${gapUuid}`,
    faultClass: gapType,
    gapUuid,
    failureModeUuid: failureModeUuid || null,
    steps,
    root: ctx.root || null,
    createdAt: Date.now(),
    runCount: 0,
    executable: false,
  };
  try {
    const filePath = nodeExport.exportToFile('debug_macro', id, payload, {
      context: `real precursor causal chain traced by lib/diagnostic-causal.js's explainFinding() for gapUuid=${gapUuid} — see schema.debug_macro's own status:OPEN for why this isn't auto-playable yet`,
      system: 'cortex',
      source: MODULE_ID,
    }, require('path').join(__dirname, '..', 'data', 'nodes', 'debug_macro'));
    return { id, filePath, payload };
  } catch (e) {
    console.warn(`[${MODULE_ID}] debug_macro export failed: ${e.message}`);
    return null;
  }
}

/**
 * enrichFailureMode(gapType, gapUuid, entryUuid, gatherContext) — the
 * real orchestrator. gatherContext is cortex/self-heal/index.js's own
 * exported _gatherFailureContext, passed in rather than required here to
 * avoid a circular require (self-heal/index.js is this module's own
 * real caller). Fire-and-forget from the caller's side, same §0.3
 * discipline the rest of this file's callers already use — the
 * synchronous failure_modes insert has already happened and is never
 * delayed or risked by anything in here.
 */
async function enrichFailureMode(gapType, gapUuid, entryUuid, gatherContext) {
  const ctx = await gatherContext(gapType, gapUuid);
  const sigma = computeSigmaDelta(Date.now());

  const update = {
    root: ctx.root || null,
    conditions: ctx.conditions || [],
    siblingDanglingHooks: ctx.siblingDanglingHooks || [],
    sigmaBefore: sigma.sigmaBefore,
    sigmaAtEntry: sigma.sigmaAtEntry,
    sigmaDelta: sigma.sigmaDelta,
    enrichedAt: Date.now(),
  };
  if (ctx.gatherError) update.contextGatherError = ctx.gatherError;

  const macro = generateDebugMacro(gapType, gapUuid, ctx, entryUuid);
  if (macro) update.debugMacroUuid = macro.id;

  try { jaaDB.update('failure_modes', { uuid: entryUuid }, update); }
  catch (e) { console.warn(`[${MODULE_ID}] failure_modes enrichment update failed: ${e.message}`); }

  // Materialize the enriched row as a real .failure_mode node — the same
  // real row jaaDB now holds, exported the same way every other node
  // type in this session's own work has been.
  try {
    const full = jaaDB.get('failure_modes', { uuid: entryUuid });
    if (full) {
      nodeExport.exportToFile('failure_mode', entryUuid, full, {
        context: 'real failure_modes row, enriched with real causal chain + sigma delta by failure-mode-forensics.js',
        system: 'cortex',
        source: MODULE_ID,
      }, require('path').join(__dirname, '..', 'data', 'nodes', 'failure_mode'));
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] failure_mode node export failed: ${e.message}`);
  }

  return { ok: true, sigma, hasDebugMacro: !!macro };
}

module.exports = { MODULE_ID, computeSigmaDelta, generateDebugMacro, enrichFailureMode };
