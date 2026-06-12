'use strict';
/**
 * bridge/types.js — Canonical Request Schema
 * UUID: nexus-bridge-types-v1-0000-4000-0000-000000000001
 *
 * One shape. Used by Bridge, Cortex projection, Guardian queue, CLI, userscript.
 * No system may define its own request shape. Require this file.
 *
 * §5.1  UUID on everything — assigned by Bridge at creation, never by caller.
 * §1.2  Nothing silently fails — schema violations throw, not warn.
 * §2.1  Persistence is the golden rule — ledger write before dispatch.
 */

const { randomUUID } = require('crypto');

// ── Request status lifecycle ──────────────────────────────────────────────────
const STATUS = {
  PENDING:     'pending',      // received by Bridge, not yet dispatched
  DISPATCHED:  'dispatched',   // forwarded to target
  FULFILLED:   'fulfilled',    // target confirmed completion
  FAILED:      'failed',       // target returned error or retries exhausted
  HELD:        'held',         // target offline — sits in queue, never dropped
  CANCELLED:   'cancelled',    // explicitly cancelled by source
  QUARANTINED: 'quarantined',  // failed provenance check
};

// ── Request types — every cross-system call must be one of these ──────────────
const TYPES = new Set([
  'job.dispatch',        // userscript/CLI → Guardian → AI provider
  'job.complete',        // Guardian → Bridge (completion notification)
  'memory.ingest',       // any system → Cortex
  'artifact.store',      // Guardian → Cortex
  'spec.build',          // Idearium → Guardian
  'gap.open',            // any system → Idearium/Cortex
  'gap.resolve',         // any system → Idearium/Cortex
  'idea.create',         // CLI/UI → Idearium
  'snapshot.push',       // Idearium → Versionium
  'seam.deliver',        // Guardian SEAM pipeline → target
  'event.emit',          // any system → SISO bus relay
  'health.check',        // Bridge internal
  'intake.file',         // replaces dropzone — external file → Cortex
  'bridge.handshake',    // system boot → Bridge identity
  'bridge.ping',         // heartbeat probe
  'bridge.sync',         // registry sync request
]);

// ── Source types — who is making the call ────────────────────────────────────
const SOURCES = new Set([
  'cli', 'userscript', 'orchestrator', 'cortex',
  'guardian', 'idearium', 'emerge', 'bridge', 'internal',
]);

// ── Routing constants ─────────────────────────────────────────────────────────
const MAX_ROUTE_DEPTH = 3;   // max fallback hops before FAILED
const MAX_ATTEMPTS    = 5;   // max dispatch attempts before FAILED

// ── Canonical request factory ────────────────────────────────────────────────
/**
 * createRequest — build a canonical request object.
 * Bridge calls this. Nothing else creates requests.
 *
 * @param {object} opts
 * @param {string} opts.type    — must be in TYPES
 * @param {string} opts.source  — must be in SOURCES
 * @param {string} opts.target  — system name
 * @param {object} opts.payload — arbitrary, caller-defined
 * @param {string[]} [opts.tags]
 * @param {string}   [opts.causedBy] — uuid of parent request
 * @returns {object} canonical request
 */
function createRequest({ type, source, target, payload = {}, tags = [], causedBy = null } = {}) {
  if (!TYPES.has(type))    throw new Error(`[bridge/types §1.2] unknown request type: ${type}`);
  if (!source)             throw new Error(`[bridge/types §1.2] source required`);
  if (!target)             throw new Error(`[bridge/types §1.2] target required`);

  const uuid = randomUUID();
  const now  = Date.now();

  return {
    uuid,
    bridgeUuid:   uuid,       // stamped on forwarded headers for provenance checks
    type,
    source,
    target,
    payload,
    status:       STATUS.PENDING,
    attempts:     0,
    tags:         [...tags],
    routeHistory: [],         // populated by router on each hop — max MAX_ROUTE_DEPTH
    causedBy,
    createdAt:    now,
    updatedAt:    now,
    dispatchedAt: null,
    heldAt:       null,
    completedAt:  null,
    failedAt:     null,
    error:        null,
  };
}

// ── Request patch — immutable update, always sets updatedAt ─────────────────
function patchRequest(req, patch) {
  return { ...req, ...patch, updatedAt: Date.now() };
}

// ── Validation — used by server.js before accepting any request ───────────────
function validateRequest(body) {
  const errs = [];
  if (!body.type)             errs.push('type required');
  else if (!TYPES.has(body.type)) errs.push(`unknown type: ${body.type}`);
  if (!body.source)           errs.push('source required');
  if (!body.target)           errs.push('target required');
  return errs;
}

module.exports = { STATUS, TYPES, SOURCES, MAX_ROUTE_DEPTH, MAX_ATTEMPTS, createRequest, patchRequest, validateRequest };
