'use strict';
/**
 * idearium/lib/cortex-listeners.js — chunk/artifact persistence into cortex
 * UUID: idearium-lib-cortex-listeners-v1-0000-2026-0715-001
 * Version: 1.1.0
 *
 * §WHAT THIS IS — a pure observer, registered once at boot via
 * lib/seam/stream.js's Stream.on(type, handler) hook, which that file's own
 * header describes as existing for "observers that want to watch without
 * owning a gate (e.g. a UI progress bar)." Nothing here owns a Gate, mutates
 * IdeaOS state, or can block/alter an emit().
 *
 * §STATE vs HISTORY 2026-07-15 — split on review. A chunk can fail, retry
 * from cache, and complete across several attempts; overwriting one row per
 * chunkUuid (the original v1.0.0 of this file) threw away that causal trail.
 * Now:
 *   idearium_spec_chunks        — CURRENT state, one row per chunk, synced
 *                                  by spec-engine/index.js's saveSpec() on
 *                                  every manifest write. This file does not
 *                                  touch that table.
 *   idearium_spec_chunk_events  — APPEND-ONLY history, one row per
 *                                  completion event as it happens, written
 *                                  here via appendRow() (a real single-row
 *                                  jaaDB.insert, not a full-table sync).
 *   idearium_build_artifacts    — APPEND-ONLY, one row per compile attempt,
 *                                  same appendRow() reasoning — a compile
 *                                  result is never mutated after the fact.
 *
 * §IDEMPOTENT REGISTRATION 2026-07-15 — added on review. Guarded per-os-
 * instance (os._cortexListenersRegistered), not a module-level flag: a
 * module-level guard would wrongly block a second, legitimately separate
 * IdeaOS instance (e.g. in a test harness) from ever getting listeners.
 * Per-instance guard still stops the real failure mode — the same `os`
 * object having registerCortexListeners() called on it twice (hot reload,
 * a duplicate boot-sequence call) and ending up with two handlers on
 * Stream's `_handlers` map firing on every event.
 *
 * §1.2 nothing silently fails — a cortex write failure here is logged loudly
 * but never rethrown into the stream; disk (the chunk .md file, the
 * compiled outputDir) is already the durable record by the time these
 * events fire. Cortex rows are a queryable mirror, never the only copy.
 */
import crypto from 'crypto';
import { appendRow } from './db.js';

const CHUNK_EVENTS_TABLE = 'idearium_spec_chunk_events';
const ARTIFACT_TABLE     = 'idearium_build_artifacts';

export function registerCortexListeners(os) {
  if (os._cortexListenersRegistered) return;
  os._cortexListenersRegistered = true;

  // ── chunk completion history (append-only) ────────────────────────────────
  os.stream.on('idearium.spec-engine.chunk.complete', (event) => {
    try {
      const { specUuid, chunkUuid, sectionId, progress, source, reusedFrom, cost, cacheHit } = event.data;
      if (!chunkUuid) return; // malformed/legacy event shape — nothing to key on
      appendRow(CHUNK_EVENTS_TABLE, {
        uuid: crypto.randomUUID(), // event id — distinct from chunkUuid, which repeats across a chunk's retry history
        chunkUuid, specUuid, sectionId, progress,
        source: source || null, reusedFrom: reusedFrom || null,
        cost: cost ?? null, cacheHit: !!cacheHit,
        ts: Date.now(),
      });
    } catch (e) {
      console.error(`[cortex-listeners] chunk.complete append failed: ${e.message}`);
    }
  });

  // ── build artifacts (compile output from _promoteSpecToRepo) ──────────────
  // §RENAMED 2026-07-15 — 'idearium.spec.compiled' described the implementation
  // (compiler-bridge's compile() call) rather than the domain event. Renamed
  // to a verb-shaped name so a future multi-phase build (parse/validate/
  // compile/package) doesn't force a second rename. This is a NEW event this
  // feature introduced, not the pre-existing 'idearium.spec-engine.chunk.
  // complete' — that one has real callers/history already and isn't touched.
  os.stream.on('idearium.spec.build.completed', (event) => {
    try {
      const { specUuid, outputDir, t0, t1, extraction, agent, ok, error } = event.data;
      if (!specUuid) return;
      appendRow(ARTIFACT_TABLE, {
        uuid: crypto.randomUUID(), specUuid, outputDir: outputDir || null,
        t0: t0 ?? null, t1: t1 ?? null,
        extraction: extraction || null, agent: agent || null,
        ok: !!ok, error: error || null,
        ts: Date.now(),
      });
    } catch (e) {
      console.error(`[cortex-listeners] spec.build.completed append failed: ${e.message}`);
    }
  });

  console.log('[cortex-listeners] registered: chunk.complete -> idearium_spec_chunk_events, build.completed -> idearium_build_artifacts');
}

export default { registerCortexListeners };
