'use strict';
/**
 * lib/seam/adapters/cortex-persist.js — Cortex as one possible PersistGate backend
 * UUID: nexus-seam-adapter-cortex-v1-0000-2026-0705-jamesbrooks-001
 * Version: 1.0.0
 *
 * Not required by lib/seam/gates.js or any other core seam file. A caller
 * that wants results kept only in process memory, or written to its own
 * store, never imports this — it writes its own persist(kind, record,
 * payload) function instead.
 *
 * Uses the same lib/cortex-write.js every other system (ollama, eravos,
 * copilot, loom, now bridge) already uses — one more system tag, not a
 * new write path.
 *
 * Usage:
 *   const { createCortexPersist } = require('lib/seam/adapters/cortex-persist');
 *   const persist = createCortexPersist('idearium', { buildId: 'build-42' });
 *   registerPersistGates(stream, persist);
 */
const createCortexWriter = require('../../cortex-write');

function createCortexPersist(system, { buildId = null } = {}) {
  if (!system) throw new Error('[seam/adapters/cortex-persist] system name is required');
  const cw = createCortexWriter(system);

  return async function persist(kind, record, payload) {
    // seam_ledger — one row per terminal event (blocked/skipped/mechanical/
    // generated/rejected). seam_artifacts — only for kinds that actually
    // produced output worth querying later (Idearium's torrent-style
    // reassembly reads this table).
    cw.insert('seam_ledger', {
      system, buildId, kind,
      seam_id: record?.seam_id ?? null,
      ts: Date.now(),
      detail: safeJson(payload),
    });

    if (kind === 'generated' || kind === 'mechanical') {
      cw.insert('seam_artifacts', {
        system, buildId,
        seam_id:    record.seam_id,
        comp_id:    record.comp_id,
        seam_uuid:  record.seam_uuid,
        tier:       record.decision?.tier ?? null,
        deps:       record.deps,
        downstream: record.downstream,
        output:     safeJson(payload.result?.output ?? payload.output),
        ts: Date.now(),
      });
    }
  };
}

function safeJson(v) {
  try { return JSON.stringify(v).slice(0, 8000); }
  catch (_) { return String(v); }
}

module.exports = { createCortexPersist };
