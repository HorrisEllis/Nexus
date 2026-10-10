'use strict';
// guardian/event-taxonomy.js — ET2_guardian_event_taxonomy.
// Conforms to lib/event-taxonomy-pattern.js's real ET1 shape.
//
// §CORRECTED against the phasemap's own summary — ET2's phasemap entry
// named the job-lifecycle events as "job.created, job.dispatched,
// job.acked, job.completed, job.failed... guardian/server.js already
// logs all of these as free-text console lines... this phase just
// gives them governed names." Checked directly before trusting that
// summary: guardian/server.js already has 6 REAL, governed bus.emit()
// calls for job lifecycle (guardian.job.queued, .dispatched, .confirmed,
// .chunk, .complete, .error) — not free-text console lines needing a
// name invented for them, and not the 5 names the phasemap guessed at.
// Documented the real, current vocabulary instead of the phase's own
// (inaccurate, in this one respect) description of it.

module.exports = Object.freeze({
  // ── NCP client connection state — guardian/lib/ncp.js ──────────────────────
  NCP_CLIENT_CONNECTED: {
    description: 'A provider tab (claude/chatgpt/gemini/perplexity) established a real NCP connection to guardian.',
    payloadShape: ['provider', 'tabId', 'key'],
    severity: 'info',
  },
  NCP_CLIENT_DISCONNECTED: {
    description: 'A previously-connected provider tab deliberately dropped its NCP connection.',
    payloadShape: ['provider', 'tabId', 'key'],
    severity: 'notable',
  },
  NCP_CLIENT_STALE: {
    description: 'A connected provider tab missed enough real heartbeats to be considered stale (not a clean disconnect).',
    payloadShape: ['provider', 'tabId', 'key', 'lastHeartbeat'],
    severity: 'warning',
  },
  NCP_MESSAGE_RECEIVED: {
    description: 'Guardian received a real message from a connected NCP client.',
    payloadShape: ['type', 'provider'],
    severity: 'info',
  },
  NCP_STREAM_CHUNK: {
    description: 'One real streamed token/chunk arrived from a provider tab mid-response.',
    payloadShape: ['jobId', 'token', 'done', 'seq', 'provider', 'tabId', 'ts'],
    severity: 'info',
  },

  // ── Job lifecycle — guardian/server.js — real, already-governed events,
  //    not free-text console lines needing a name (see the correction
  //    note above this export) ────────────────────────────────────────────
  GUARDIAN_JOB_QUEUED: {
    description: 'A real job was accepted and placed on the real queue.',
    payloadShape: ['jobId', 'provider', 'filename'],
    severity: 'info',
  },
  GUARDIAN_JOB_DISPATCHED: {
    description: 'A real, queued job was sent to its real target provider.',
    payloadShape: ['jobId', 'provider'],
    severity: 'info',
  },
  GUARDIAN_JOB_CONFIRMED: {
    description: 'The target provider acknowledged receiving a real dispatched job.',
    payloadShape: ['jobId', 'provider'],
    severity: 'info',
  },
  GUARDIAN_JOB_CHUNK: {
    description: "One real chunk of a job's streamed response arrived.",
    payloadShape: ['jobId', 'text', 'full', 'provider'],
    severity: 'info',
  },
  GUARDIAN_JOB_COMPLETE: {
    description: 'A real job finished successfully. Real payload varies by dispatch path (browser/mistral/ollama/replay) — this documents the richest real shape, from the real gap-loop-aware completion path.',
    payloadShape: ['jobId', 'provider', 'chars', 'gaps', 'gapDrift', 'command', 'meta'],
    severity: 'info',
  },
  GUARDIAN_JOB_ERROR: {
    description: 'A real job failed — RAID unavailable, approval denied, a dispatch exception, or a real gate failure.',
    payloadShape: ['jobId', 'error', 'provider', 'gate'],
    severity: 'failure',
  },
  // §HP16 0.55.2 — guardian/lib/dispatcher.js cancel(): askSync stopped waiting on a job nothing was typed for
  GUARDIAN_JOB_CANCELLED: {
    description: 'A job nobody waits for any more (its caller gave up and the tab never typed it) was taken off every queue and will not be sent.',
    payloadShape: ['jobId', 'provider', 'agentId', 'reason'],
    severity: 'notable',
  },
  // §OP1 0.57.0 — POST /api/options: one of guardian's options was set or reset (guardian/options.js)
  GUARDIAN_OPTIONS_CHANGED: {
    description: 'One of guardian\'s options was set or reset through its options route; the change is also in guardian/data/options-ledger.jsonl.',
    payloadShape: ['id', 'value', 'old', 'actor'],
    severity: 'notable',
  },

  // ── Code artifacts — guardian/lib/code-artifact.js — real, governed,
  //    emitted from the ncp-handler completion path only when the job
  //    itself declared a fileName (see guardian/spec/guardian.code-artifact.spec)
  GUARDIAN_ARTIFACT_CAPTURED: {
    description: "A real fenced code block from a completed job's reply was written to the file name that job declared, and staged through lib/intake.js. Never applied into the tree — staged only.",
    payloadShape: ['jobId', 'provider', 'fileName', 'syntax', 'fenceSyntax', 'matchedBy', 'blockIndex', 'blockCount', 'path', 'bytes', 'sha256', 'dropId'],
    severity: 'info',
  },
  GUARDIAN_ARTIFACT_REFUSED: {
    description: "A job declared a fileName but no artifact was written, and why: no-code-block (no fence in the reply), syntax-mismatch (fences exist, none in the declared/implied language — deliberately NOT falling back to another block), unsafe-filename, or a real write failure. A refusal never fails the job.",
    payloadShape: ['jobId', 'provider', 'fileName', 'reason', 'syntax', 'blockCount', 'found'],
    severity: 'notable',
  },

  GUARDIAN_BLOCKS_CAPTURED: {
    description: "EVERY fenced code block in an agent's reply was written as a real file with its own syntax, not just the one matching a declared fileName. nameSource says where each name came from: 'job-declared' (the job named it), 'fence-declared' (the agent named it in its own info string), or 'derived' (block-<n><ext>, invented here) — derivedName:true marks the last so an invented name is never read as a stated one.",
    payloadShape: ['jobId', 'provider', 'captured', 'blockCount', 'blocks'],
    severity: 'info',
  },

  GUARDIAN_RESPONSE_CAPTURED: {
    description: "Every completed agent response is recorded as a real .response node in the ClearGlass downloads index (a COS compartment), with its fenced code blocks and their resolved syntax. indexed:false means the .response file — the source of truth — was written and fsync'd but the disposable SQLite index was unavailable; rebuildIndexFromResponses() recovers it.",
    payloadShape: ['jobId', 'provider', 'responseId', 'responsePath', 'indexed', 'codeBlocks'],
    severity: 'info',
  },

  // ── §HONEST GAP — gate.checked / gate.failed, named in ET2's own
  //    phasemap entry for ET6's sigma work, deliberately not included.
  //    Confirmed directly (grepped guardian/server.js for both strings):
  //    neither exists anywhere yet. ET6 hasn't been built. Documenting
  //    an event that can't fire would be worse than the honest gap.
});
