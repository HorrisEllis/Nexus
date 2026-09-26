// ── idearium/core/index.js ────────────────────────────────────────────────────
// Re-exports from idearium/index.js (the actual IdeaOS implementation).
// This file was deleted during the audit cleanup but is required by api/index.js.
// §M1 compliant — no logic lives here, all in ../index.js.
export { getIdeaOS, VERSION, NAMESPACE, PORT,
         IDEA_PHASES, GAP_STATUSES, GAP_SEVERITIES, LINK_TYPES,
         SNR_WEIGHTS } from '../index.js';
