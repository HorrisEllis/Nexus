'use strict';
/**
 * lib/chunk-service.js — chunking consolidated through the RAID engine (James)
 * UUID: nexus-chunk-service-v1-0000-2026-0807-001
 *
 * James: "RAID engine consolidate chunking." Chunking was scattered across FOUR
 * places with overlapping concerns:
 *   - lib/chunker            — boundary detection (canonical, 22 fns)
 *   - emerge/chunk           — a token-payload FORMAT for small LLMs (distinct)
 *   - idearium/chunk-dispatch — retry/verification for chunk BUILDS (distinct)
 *   - lib/seam/chunk-lifecycle — chunk STATE machine (distinct)
 *
 * The distinct concerns (format, dispatch, lifecycle) stay — but the actual
 * BOUNDARY DETECTION consolidates to lib/chunker as the ONE core, exposed here as
 * a single 'chunk' capability that governed callers route THROUGH RAID. So
 * chunking becomes a tracked, governed decision (RAID is the decision/governance
 * system) rather than four independent code paths (§10.3 one source of truth).
 *
 * §8.6 wraps lib/chunker (no new chunking logic). §1.2 honest degrade. Governed
 * path optional: chunk() works directly; chunkGoverned() routes via RAID for
 * callers that need the decision recorded.
 */

const chunker = require('./chunker');

/**
 * chunk(input, opts) — THE canonical entry. Delegates to lib/chunker's
 * boundary-aware chunkDocument. Every chunker in NEXUS should call this rather
 * than re-implementing boundary detection.
 */
function chunk(input, opts = {}) {
  if (chunker.chunkDocument) return chunker.chunkDocument(input, opts);
  if (typeof chunker === 'function') return chunker(input, opts);
  throw new Error('lib/chunker has no chunkDocument entry');
}

/**
 * chunkGoverned(input, opts) — route the chunk request through RAID as an intent,
 * so the decision is recorded/governed. Falls back to a direct chunk if RAID is
 * unavailable (§1.2 — chunking must not hard-fail when RAID is down; it's a
 * governance layer, not a gate that can block basic tokenization).
 */
async function chunkGoverned(input, opts = {}) {
  // §WIRED 2026-08-22 — James: "wire it all." Real chunk_input/
  // chunk_output on the canonical, governed chunking entry.
  let et = null, blockId = null;
  try {
    et = require('./event-types.js');
    blockId = require('crypto').randomUUID();
    require('../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
      type: et.INTENT.CHUNK_INPUT, blockId,
      inputSize: typeof input === 'string' ? input.length : null, ts: Date.now(),
    });
  } catch (_) { /* event pipeline unreachable — chunking proceeds regardless */ }

  let out;
  try {
    const raid = opts.raid || require('../cortex/core/raid/router');
    if (raid && raid.route) {
      const envelope = raid.route('chunk.document', { input: typeof input === 'string' ? `<${input.length} chars>` : '<data>', opts });
      // The router records the intent/trail; the actual chunk is done here (the
      // capability's fulfillment), keeping one implementation.
      const result = chunk(input, opts);
      out = { chunks: result, governed: true, trail: envelope && (envelope.id || envelope.trailId) || null };
    }
  } catch (_) { /* RAID unavailable — fall through to direct */ }
  if (!out) out = { chunks: chunk(input, opts), governed: false };

  try {
    if (et && blockId) {
      require('../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
        type: et.INTENT.CHUNK_OUTPUT, blockId,
        chunkCount: Array.isArray(out.chunks) ? out.chunks.length : null,
        governed: out.governed, ts: Date.now(),
      });
    }
  } catch (_) { /* §1.2 — the real result is unaffected either way */ }
  return out;
}

/**
 * CAPABILITY — the descriptor other systems/RAID resolve. One capability, one
 * implementation (lib/chunker), governed routing available.
 */
const CAPABILITY = Object.freeze({
  id: 'nexus.lib.chunk-service',
  intent: 'chunk.document',
  provides: 'boundary-aware document chunking (the ONE canonical chunker)',
  delegates_to: 'lib/chunker',
  consolidates: ['emerge/chunk (format)', 'idearium/chunk-dispatch (dispatch)', 'lib/seam/chunk-lifecycle (state)'],
});

module.exports = { chunk, chunkGoverned, CAPABILITY, MODULE_ID: 'chunk-service', VERSION: '1.0.0' };
