'use strict';
/**
 * lib/agent-confidence-gate.js — before an agent does anything, if confidence
 * is below 75%, obtain context: build worksurface, compile dependencies, find
 * the context, and ask the user LAST.
 *
 * James, 2026-10-24: "before an agent does anything. if confidence is lower
 * than 75%, context must be obtained. build worksurface, compile list of
 * dependancies, find the context, ask user last."
 *
 * §REUSE BEFORE BUILD (§8.6). This gate is mostly assembly — the pieces exist:
 *   - find the context   → lib/repo-agent.js contextFor() + lib/context-atlas.js
 *   - compile deps       → lib/phase-graph.js / loom impact / lib/code-intel
 *   - the worksurface    → idearium/ui/js/work-surface.js (its server route)
 *   - the confidence read → cortex/core/raid/snr-filter.js (tiered resolution)
 * The NEW part is the LADDER (his exact order), the ask-user-LAST escalation,
 * and the record of what it did (§1.2 — nothing silently skipped; every rung
 * and why it stopped is in steps[]). Dependency-injected (the repo-agent.js
 * pattern) so it runs in a test without a live backend; the defaults compose
 * the real pieces, best-effort (a piece that is unavailable lowers the signal,
 * it does not throw).
 *
 * Map:  docs/2026-10-24-agent-orchestration-phasemap.spec (CG1).
 * Spec: docs/brainos-in-idearium.spec.
 */

const CONFIDENCE_THRESHOLD = 0.75; // James: "if confidence is lower than 75%"
const VERSION = '1.0.0';
const MODULE_ID = 'lib/agent-confidence-gate';

// ── default rungs: compose the real pieces, lazily and defensively ────────────
// Each rung takes (input, state) and returns { context, confidence? }: the
// context it found, and optionally a new confidence read. A rung that cannot
// run returns null context and leaves confidence unchanged — the ladder moves
// on and records it, never throws (§1.2).

function _lazy(path) { try { return require(path); } catch (_) { return null; } }

// How much a found context raises confidence. Deliberately bounded and additive
// so the ladder is monotone and a real find always helps, but no single rung can
// vault a blind call straight past the threshold on its own (that is what the
// three rungs together, and then the user, are for).
const RUNG_LIFT = { worksurface: 0.08, dependencies: 0.10, context: 0.14 };

function _raise(confidence, rung, found) {
  if (!found) return confidence;
  return Math.min(1, confidence + (RUNG_LIFT[rung] || 0));
}

function _defaultDeps() {
  return {
    // 1) build the worksurface: the files/lines relevant to the message. Reuses
    // the repo-agent's own context read as the server-side worksurface source.
    async buildWorksurface(input, state) {
      const RA = _lazy('./repo-agent.js');
      if (!RA || !input.repo || !input.repoDir) return { context: null };
      try {
        const c = RA.contextFor({ repo: input.repo, repoDir: input.repoDir, message: input.message, bare: true });
        const found = c && (c.chunks || c.block);
        return { context: found ? { kind: c.kind, chunks: c.chunks || null, chars: c.chars || null } : null,
                 confidence: _raise(state.confidence, 'worksurface', found) };
      } catch (_) { return { context: null }; }
    },
    // 2) compile the dependency list: what the worksurface's files use and who
    // uses them. Reuses loom impact when a component id is known, else the
    // caller-supplied deps.
    async compileDeps(input, state) {
      const found = Array.isArray(input.deps) && input.deps.length ? input.deps : null;
      let deps = found;
      if (!deps && input.componentId) {
        const impact = _lazy('./loom-impact.js') || _lazy('../loom/impact.js');
        try { const r = impact && impact.impact && impact.impact(input.componentId); if (r) deps = r.consumers || r.uses || null; } catch (_) {}
      }
      return { context: deps ? { count: deps.length, items: deps.slice(0, 50) } : null,
               confidence: _raise(state.confidence, 'dependencies', deps) };
    },
    // 3) find the context: memory and every store's graphs (context-atlas).
    async findContext(input, state) {
      const CA = _lazy('./context-atlas.js');
      if (!CA || !CA.block) return { context: null };
      try {
        const m = await CA.block(input.message, { repoDir: input.repoDir, repoUuid: input.repo && input.repo.uuid, budget: 1200 });
        const found = m && m.text;
        return { context: found ? { hits: m.hits || null, chars: (m.text || '').length } : null,
                 confidence: _raise(state.confidence, 'context', found) };
      } catch (_) { return { context: null }; }
    },
    // 4) ask the user — LAST. No default: a surface wires its own asker (the
    // Code tab's docked agent, the CLI prompt). Without one, the gate records
    // that the user could not be asked and proceeds with what it gathered.
    askUser: null,
    // the confidence read when the caller gives none: reuse RAID's SNR tier.
    async estimate(input) {
      if (typeof input.confidence === 'number') return input.confidence;
      const snr = input.snr;
      if (snr && typeof snr.snr === 'number') return snr.snr;      // a resolved SNR result
      if (snr && snr.type === 'invariant') return 1;
      if (snr && snr.type === 'pattern') return 0.9;
      return 0.5; // genuine unknown — below threshold, so the ladder runs
    },
  };
}

function _summary(ctx) {
  if (!ctx) return null;
  if (ctx.count != null) return `${ctx.count} deps`;
  if (ctx.chunks != null) return `${ctx.chunks} chunks`;
  if (ctx.hits != null) return `${ctx.hits} hits`;
  if (ctx.chars != null) return `${ctx.chars} chars`;
  return 'obtained';
}

/**
 * gate(input, deps?) — run the §CG_D3 ladder before an agent acts.
 * input: { confidence?, threshold?, repo, repoDir, message, snr?, deps?, componentId? }
 * returns { proceed, confident, confidence, context:{worksurface,dependencies,found,user}, asked, steps[], reason }
 */
async function gate(input = {}, deps = {}) {
  const d = { ..._defaultDeps(), ...deps };
  const threshold = typeof input.threshold === 'number' ? input.threshold : CONFIDENCE_THRESHOLD;
  let confidence = typeof input.confidence === 'number' ? input.confidence : await d.estimate(input);
  const steps = [];
  const context = { worksurface: null, dependencies: null, found: null, user: null };

  // His rule is a floor, not a tax: at or above the threshold the agent proceeds
  // with no context obtained.
  if (confidence >= threshold) {
    steps.push({ rung: 'confidence', confidence, action: 'proceed', reason: `confidence ${round(confidence)} ≥ ${threshold}` });
    return { proceed: true, confident: true, confidence, context, asked: false, steps, reason: 'confident enough', threshold };
  }

  // The ladder, his exact order. Re-read confidence after each rung; stop the
  // moment it reaches the threshold (don't ask the user if the context sufficed).
  const ladder = [
    ['worksurface',  d.buildWorksurface, 'worksurface'],
    ['dependencies', d.compileDeps,      'dependencies'],
    ['context',      d.findContext,      'found'],
  ];
  for (const [rung, fn, key] of ladder) {
    try {
      const r = await fn(input, { context, confidence });
      if (r && r.context !== undefined && r.context !== null) context[key] = r.context;
      if (r && typeof r.confidence === 'number') confidence = r.confidence;
      steps.push({ rung, confidence, action: context[key] ? 'obtained' : 'empty', got: _summary(context[key]) });
    } catch (e) {
      steps.push({ rung, confidence, action: 'error', error: e.message }); // §1.2 recorded, not thrown
    }
    if (confidence >= threshold) {
      return { proceed: true, confident: true, confidence, context, asked: false, steps,
               reason: `context raised confidence to ${round(confidence)}`, threshold };
    }
  }

  // Ask the user — LAST, only after worksurface + deps + context did not reach
  // the threshold.
  let asked = false;
  if (typeof d.askUser === 'function') {
    try {
      const a = await d.askUser(input, { context, confidence });
      asked = true;
      if (a && typeof a.confidence === 'number') confidence = a.confidence;
      if (a && a.context != null) context.user = a.context;
      steps.push({ rung: 'ask-user', confidence, action: a && a.answered ? 'answered' : 'asked' });
    } catch (e) {
      steps.push({ rung: 'ask-user', confidence, action: 'error', error: e.message });
    }
  } else {
    steps.push({ rung: 'ask-user', confidence, action: 'unavailable', reason: 'no asker wired on this surface' });
  }

  const confident = confidence >= threshold;
  return {
    proceed: true,              // the mandate — obtain context before acting — is satisfied; the agent proceeds with what was gathered
    confident,                  // whether it actually reached the threshold
    confidence, context, asked, steps, threshold,
    reason: confident ? 'threshold reached' : 'proceeding with gathered context; still below threshold after asking',
  };
}

function round(n) { return Math.round(n * 100) / 100; }

module.exports = { gate, CONFIDENCE_THRESHOLD, VERSION, MODULE_ID, _defaultDeps };
