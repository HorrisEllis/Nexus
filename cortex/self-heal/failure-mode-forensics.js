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

const COMPOUND_TIMEOUT_MS = 2500;

/**
 * fetchCompoundViaOrchestrator(anchor) — default compound fetcher (C1, D2=a).
 * The per-system ledgers and their CausalGraphs live in the ORCHESTRATOR
 * process; cortex reaches them through GET /cfr/compound/:uuid?system=<s>.
 * Resolves to the route's JSON body, or { ok:false, error } — never throws
 * and never hangs past COMPOUND_TIMEOUT_MS (I8: the hook must not delay or
 * risk the failure_modes row).
 */
function fetchCompoundViaOrchestrator(anchor, timeoutMs = COMPOUND_TIMEOUT_MS, baseUrl) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const http = require('http');
      const base = new URL(baseUrl || require('../config').OR_URL);
      const q = `/cfr/compound/${encodeURIComponent(anchor.entryUuid)}?system=${encodeURIComponent(anchor.ledgerSystem)}`;
      const req = http.request({ hostname: base.hostname, port: base.port, path: q, method: 'GET', timeout: timeoutMs }, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { buf += d; });
        res.on('end', () => {
          try { finish(JSON.parse(buf)); }
          catch (e) { finish({ ok: false, error: `unparseable response (HTTP ${res.statusCode}): ${e.message}` }); }
        });
      });
      req.on('timeout', () => { req.destroy(); finish({ ok: false, error: `orchestrator did not answer within ${timeoutMs}ms` }); });
      req.on('error', (e) => finish({ ok: false, error: `orchestrator unreachable: ${e.message}` }));
      req.end();
    } catch (e) { finish({ ok: false, error: e.message }); }
  });
}

/**
 * computeCompound(anchor, fetcher) — the chain-scoped reading (I8/I9/I10).
 * Returns the `compound` object stored on the failure_modes row:
 *   status 'analyzed'    → class ripple|wave|tidal (+ factors/progressions for
 *                          wave/tidal; a ripple has NO CausalRecord by design,
 *                          so those are null and the ripple is carried by class)
 *   status 'unavailable' → reason; class/factors stay null. NEVER a ripple.
 */
async function computeCompound(anchor, fetcher = fetchCompoundViaOrchestrator) {
  const unavailable = (reason) => ({
    status: 'unavailable', reason, class: null, factors: null,
    sigmaProgression: null, deltaProgression: null, peakSigma: null,
    rootUuid: null, anchor: anchor || null,
  });
  if (!anchor || !anchor.ledgerSystem || !anchor.entryUuid) {
    return unavailable('no anchor: gap carries no (ledgerSystem, entryUuid) pair');
  }
  let r;
  try { r = await fetcher(anchor); }
  catch (e) { return unavailable(`compound lookup failed: ${e.message}`); }
  if (!r || r.ok !== true) return unavailable((r && r.error) || 'compound lookup returned no result');
  if (!r.class) return unavailable('compound engine returned no class');
  const rec = r.record || null;
  return {
    status: 'analyzed',
    reason: null,
    class: r.class,
    factors: rec ? (rec.compoundingFactors || []) : null,
    sigmaProgression: rec ? (rec.sigmaProgression || null) : null,
    deltaProgression: rec ? (rec.deltaProgression || null) : null,
    peakSigma: rec && typeof rec.peakSigma === 'number' ? rec.peakSigma : null,
    // analyzeChain walks to the TRUE ROOT and analyzes from there — the
    // record describes that root's chain, which may not be the anchor entry.
    rootUuid: rec ? ((rec.rootCause && rec.rootCause.uuid) || rec.rootUuid || null) : null,
    anchor,
  };
}

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
function generateDebugMacro(gapType, gapUuid, ctx, failureModeUuid, compound) {
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
  // §C1 — class annotated ONLY when analyzed; unavailable adds nothing (I8).
  if (compound && compound.status === 'analyzed') payload.compoundClass = compound.class;
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
async function enrichFailureMode(gapType, gapUuid, entryUuid, gatherContext, compoundFetcher) {
  const ctx = await gatherContext(gapType, gapUuid);
  const sigma = computeSigmaDelta(Date.now());
  // §C1 — chain-scoped reading, stored under its OWN key (I10), never
  // merged into the system-wide sigma keys below. computeCompound never throws.
  const compound = await computeCompound(ctx.anchor, compoundFetcher);

  const update = {
    root: ctx.root || null,
    conditions: ctx.conditions || [],
    siblingDanglingHooks: ctx.siblingDanglingHooks || [],
    sigmaBefore: sigma.sigmaBefore,
    sigmaAtEntry: sigma.sigmaAtEntry,
    sigmaDelta: sigma.sigmaDelta,
    compound,
    enrichedAt: Date.now(),
  };
  if (ctx.gatherError) update.contextGatherError = ctx.gatherError;

  const macro = generateDebugMacro(gapType, gapUuid, ctx, entryUuid, compound);
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

  return { ok: true, sigma, compound, hasDebugMacro: !!macro };
}

module.exports = { MODULE_ID, computeSigmaDelta, generateDebugMacro, enrichFailureMode, computeCompound, fetchCompoundViaOrchestrator };
