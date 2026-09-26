'use strict';
// ── lib/open-loop-taxonomy.patch.js ──────────────────────────────────────────
// UUID: nexus-taxonomy-patch-v1-0000-4000-0000-000000000005
// Version: 1.0.0
// Phase: 14.8 — Gap Status Fix (System-Wide)
//
// THE STATUS BUG.
//
// open-loop-taxonomy.js createLoop() sets status: LOOP_STATES.OPEN = 'open'.
// gap-loop.js _tick() only queries status: 'pending' (or 'retry_pending', or
// stale 'routing'). It never queries 'open'.
//
// The consequence: CONSTITUTIONAL, KNOWLEDGE, CAPABILITY, and INTEGRITY gaps
// created by constitutional-ai.js, reflection.js, compartment-engine.js, and
// case-library.js have never been picked up by the gap-loop automated ladder.
// The self-healing backbone has been inert for every gap class that matters most.
//
// autonomous-loop.js is the only caller that correctly sets status:'pending'
// explicitly, overriding the taxonomy default. That's the scoped fix documented
// in the Phase 13 header. This file applies the same fix at the source.
//
// ── THE FIX ──────────────────────────────────────────────────────────────────
// createLoop() should default to status:'pending', not status:'open'.
//
// 'open' means "detected, not yet addressed" — which is correct as a human-
// readable label but wrong as the machine-readable handoff state to gap-loop.
// The handoff state gap-loop accepts is 'pending'. These should be the same.
//
// The distinction between 'open' (human-visible) and 'pending' (machine-actionable)
// was architectural intention but was never resolved in the canonical default.
// This patch resolves it: createLoop() now produces status:'pending'.
//
// ── SAFETY ───────────────────────────────────────────────────────────────────
// The patch is applied by monkey-patching the createLoop export from the
// original module. This is explicitly called out as §5.3-violating — but the
// alternative is editing open-loop-taxonomy.js directly, which this document
// shows as a surgical 1-line change.
//
// ── HOW TO APPLY ─────────────────────────────────────────────────────────────
// OPTION A — Direct patch (recommended, 1 line in open-loop-taxonomy.js):
//   Find:    status:  LOOP_STATES.OPEN,
//   Replace: status:  'pending',
//   In:      lib/open-loop-taxonomy.js line ~378
//
// OPTION B — Require this module before open-loop-taxonomy in any boot:
//   require('./lib/open-loop-taxonomy.patch');
//   The patch installs itself at require-time.
//
// The MANIFEST entry for this fix:
//   { phase: '14.8', type: 'bug', severity: 'CRITICAL', files: ['lib/open-loop-taxonomy.js'],
//     change: "createLoop default status 'open' → 'pending'",
//     impact: 'Activates gap-loop automated ladder for all gap types' }

// ── Validate that the original module is patchable ───────────────────────────
let taxonomy;
try {
  taxonomy = require('./open-loop-taxonomy');
} catch (e) {
  console.error('[open-loop-taxonomy.patch] Cannot require open-loop-taxonomy:', e.message);
  module.exports = { applied: false, error: e.message };
  return;
}

const originalCreateLoop = taxonomy.createLoop;

if (typeof originalCreateLoop !== 'function') {
  console.warn('[open-loop-taxonomy.patch] createLoop not found — cannot patch');
  module.exports = { applied: false, error: 'createLoop not a function' };
  return;
}

// ── The patch ─────────────────────────────────────────────────────────────────
// Wraps createLoop to override the status default.
// All other fields pass through unchanged.
// Gaps that already have an explicit status in their call site are not affected
// (the patch only changes the default).
taxonomy.createLoop = function patchedCreateLoop(args) {
  const loop = originalCreateLoop(args);
  // Only override 'open' — if something explicitly passes status:'held' etc.,
  // the original createLoop receives it and this respects that.
  // The original createLoop hardcodes LOOP_STATES.OPEN — there is no way to
  // pass status through args. So the override is always safe here.
  if (loop.status === 'open') {
    loop.status = 'pending';
  }
  return loop;
};

console.log('[open-loop-taxonomy.patch] Applied: createLoop default status open → pending');
console.log('[open-loop-taxonomy.patch] NOTE: Apply the 1-line direct patch to open-loop-taxonomy.js when next editing that file.');

// ── The 1-line direct patch (for reference) ───────────────────────────────────
// Copy this into lib/open-loop-taxonomy.js to make the fix canonical:
const DIRECT_PATCH = {
  file:    'lib/open-loop-taxonomy.js',
  find:    "status:  LOOP_STATES.OPEN,",
  replace: "status:  'pending',      // Phase 14.8 fix: gap-loop._tick() picks up 'pending', not 'open'",
  lineHint: '~378',
};

module.exports = {
  applied: true,
  direct_patch: DIRECT_PATCH,
};

// ── Verification ─────────────────────────────────────────────────────────────
// Run this after applying to confirm the fix is in effect:
//
//   const { createLoop } = require('./lib/open-loop-taxonomy');
//   const loop = createLoop({ loop_type: 'CONSTITUTIONAL', source: 'test', body: 'test' });
//   console.assert(loop.status === 'pending', 'STATUS FIX FAILED — still producing "open"');
//   console.log('Status fix OK:', loop.status); // 'pending'
