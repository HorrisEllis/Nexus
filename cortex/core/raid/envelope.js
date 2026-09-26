'use strict';
/**
 * cortex/core/raid/envelope.js — the universal request envelope
 * UUID: nexus-raid-envelope-v1-0000-2026-0721-001
 * Version: 1.0.0
 *
 * THE PRINCIPLE (James, 2026-07-21): "the request comes from co-pilot or one
 * of the UIs, but goes to RAID — that way the start point doesn't matter, as
 * long as it goes to RAID."
 *
 * Every surface (Co-pilot, any UI, CLI, an SSE-triggered flow) wraps its
 * request in this ONE shape and hands it to RAID. No surface knows about any
 * fulfilling system. RAID routes. Cortex logs every hop. That makes the entry
 * point irrelevant and every fulfilling system hot-swappable — swap the
 * provider, RAID routes to the new one, no surface changes.
 *
 * The envelope is also the ledger record: it accumulates a `trail` — every
 * system it passed through, tagged with status and timestamp — which is the
 * "input → tagged → output, every hop logged" pipe James described.
 *
 * §14.2 — make() is pure given its inputs (id/ts injectable for tests).
 */

const crypto = require('crypto');

const MODULE_ID = 'cortex/core/raid/envelope';
const VERSION = '1.0.0';

const STATUS = Object.freeze({
  CREATED:   'created',    // surface built it
  ROUTED:    'routed',     // RAID decided a target
  ACCEPTED:  'accepted',   // target system picked it up
  FULFILLED: 'fulfilled',  // target produced a result
  FAILED:    'failed',     // target errored
  NO_ROUTE:  'no_route',   // RAID found no system for it
});

/**
 * make(intent, opts) — build an envelope.
 *   intent   : what's being asked ("find gaps", "render slide", free text)
 *   opts.from    : origin surface id (copilot / ui:idearium / cli / sse:...)
 *   opts.payload : the actual request body the fulfilling system needs
 *   opts.capability : optional explicit capability id (skips RAID's guess)
 *   opts.causedBy   : upstream event/session id for chain continuity (§9.6)
 */
function make(intent, opts = {}) {
  const now = opts.ts || Date.now();
  return {
    envelopeId: opts.id || crypto.randomUUID(),
    intent:     intent || '',
    from:       opts.from || 'unknown',
    capability: opts.capability || null,
    payload:    opts.payload || {},
    causedBy:   opts.causedBy || null,
    status:     STATUS.CREATED,
    target:     null,          // filled by RAID
    result:     null,          // filled by the fulfilling system
    trail:      [{ system: opts.from || 'unknown', status: STATUS.CREATED, ts: now }],
    createdAt:  now,
    updatedAt:  now,
  };
}

/**
 * stamp(envelope, system, status, extra) — append a hop to the trail and
 * advance status. Pure: returns a new envelope, never mutates in place, so
 * the ledger keeps every prior state (§0.3 — nothing lost).
 */
function stamp(envelope, system, status, extra = {}) {
  const now = extra.ts || Date.now();
  return {
    ...envelope,
    status,
    ...(extra.target !== undefined ? { target: extra.target } : {}),
    ...(extra.result !== undefined ? { result: extra.result } : {}),
    trail: [...envelope.trail, { system, status, ts: now, ...(extra.note ? { note: extra.note } : {}) }],
    updatedAt: now,
  };
}

function isValid(envelope) {
  return !!(envelope && envelope.envelopeId && typeof envelope.intent === 'string'
    && envelope.from && Array.isArray(envelope.trail));
}

module.exports = { MODULE_ID, VERSION, STATUS, make, stamp, isValid };
