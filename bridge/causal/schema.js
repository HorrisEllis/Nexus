'use strict';
/**
 * bridge/causal/schema.js — Canonical Causal Event Schema
 * UUID: nexus-bridge-causal-schema-v1-0000-4000-000000000001
 * Status: pre-release
 *
 * Every service emits one of these per meaningful action.
 * Distinct from bridge/types.js (cross-system request shape).
 * This is the event trace shape — what every action leaves behind.
 *
 * §1.2  Nothing silently fails — schema violations throw.
 * §5.1  UUID on every event.
 * §3.2  eventTs is the ordering axis. ts is display metadata.
 * §2.3  All state must be observable — stateDiff captures deltas only.
 */

const { randomUUID } = require('crypto');

// ── Valid sources — must match SOURCES in bridge/types.js ────────────────────
const CAUSAL_SOURCES = new Set([
  'cli', 'userscript', 'orchestrator', 'cortex',
  'guardian', 'idearium', 'emerge', 'bridge', 'internal', 'architect',
]);

// ── Valid edge types ──────────────────────────────────────────────────────────
const EDGE_TYPES = new Set([
  'triggered_by',    // this event was triggered by the parent
  'fallback_from',   // this event is a fallback path from the parent
  'follows',         // this event immediately follows the parent (session order)
  'caused_failure',  // this event caused the parent to fail
  'resolved_by',     // this event resolved the parent gap/failure
]);

// ── Action format validator — verb.noun, lowercase, no spaces ────────────────
const ACTION_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/**
 * createCausalEvent — build a validated causal event.
 * Called by services before POSTing to /bridge/causal/emit.
 *
 * @param {object} opts
 * @param {string}   opts.source      — must be in CAUSAL_SOURCES
 * @param {string}   opts.action      — verb.noun format, e.g. 'job.dispatched'
 * @param {string}   [opts.sessionId] — which session context
 * @param {Array}    [opts.causalEdges] — [{ type, eventId }] — empty if root event
 * @param {object}   [opts.input]     — what came in (trimmed, no prompts >200 chars)
 * @param {object}   [opts.output]    — what went out
 * @param {object}   [opts.stateDiff] — deltas only: { jobs: +1 }, not full state
 * @param {string[]} [opts.tags]
 * @returns {object} causal event
 */
function createCausalEvent({
  source,
  action,
  sessionId   = null,
  causalEdges = [],
  input       = {},
  output      = {},
  stateDiff   = {},
  tags        = [],
} = {}) {
  const errs = validateCausalEvent({ source, action, causalEdges });
  if (errs.length) throw new Error(`[bridge/causal/schema §1.2] ${errs.join('; ')}`);

  // Trim input fields to prevent prompt bleed (§4.3)
  const safeInput = _trimInput(input);

  return {
    uuid:        randomUUID(),
    ts:          Date.now(),          // wall clock — display metadata only (§3.2)
    source,
    action,
    sessionId,
    causalEdges: causalEdges.map(e => ({ type: e.type, eventId: e.eventId })),
    input:       safeInput,
    output,
    stateDiff,
    tags:        [...tags],
    sig:         null,               // Bridge fills this after ingestion (Ed25519)
  };
}

/**
 * validateCausalEvent — returns array of error strings (empty = valid).
 */
function validateCausalEvent({ source, action, causalEdges = [] }) {
  const errs = [];
  if (!source)                    errs.push('source required');
  else if (!CAUSAL_SOURCES.has(source)) errs.push(`unknown source: ${source}`);
  if (!action)                    errs.push('action required');
  else if (!ACTION_RE.test(action)) errs.push(`action must be verb.noun lowercase: ${action}`);
  for (const edge of causalEdges) {
    if (!edge.type)    errs.push('causalEdge.type required');
    else if (!EDGE_TYPES.has(edge.type)) errs.push(`unknown edge type: ${edge.type}`);
    if (!edge.eventId) errs.push('causalEdge.eventId required');
  }
  return errs;
}

/**
 * canonicalize — deterministic JSON for signing.
 * Key order is fixed so Ed25519 signature is stable.
 */
function canonicalize(event) {
  const keys = ['uuid','ts','source','action','sessionId','causalEdges','input','output','stateDiff','tags'];
  const ordered = {};
  for (const k of keys) ordered[k] = event[k] ?? null;
  return JSON.stringify(ordered);
}

/**
 * _trimInput — strip prompt bodies >200 chars (§4.3 privacy).
 * Keeps structural metadata, removes large text blobs.
 */
function _trimInput(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && v.length > 200) {
      out[k] = v.slice(0, 200) + '…[trimmed]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = { createCausalEvent, validateCausalEvent, canonicalize, CAUSAL_SOURCES, EDGE_TYPES };
