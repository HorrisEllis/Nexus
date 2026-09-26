'use strict';
// lib/event-taxonomy-pattern.js — ET1: the shared SHAPE every system's own
// event-taxonomy.js conforms to. NOT a shared implementation, NOT a shared
// write authority — see docs/2026-08-27-event-taxonomy-and-brainstorm-
// phasemap.spec's own ET1 entry for the full reasoning. Same precedent this
// codebase already uses for config (ollama/config.js / intelligence/
// config.js): one agreed convention, each system's own file, no cross-
// system requires between them.
//
// A system's event-taxonomy.js exports exactly one thing:
//   module.exports = Object.freeze({ EVENT_NAME: { description, payloadShape, severity }, ... })
//
// - EVENT_NAME: SCREAMING_SNAKE_CASE key, matches the real dotted event
//   string it documents (e.g. NCP_CLIENT_CONNECTED for 'ncp.client.connected')
//   so a human reading the taxonomy file and a human reading a log line can
//   find the same thing without translating between two naming schemes.
// - description: one sentence, plain language, what actually happened.
// - payloadShape: an array of the real field names the event's data object
//   carries — not types, not validation, just "what's actually on here" so
//   a reader doesn't have to go find a real example in a log to know.
// - severity: one of SEVERITIES below — what a human should feel seeing it
//   in a live log, not a technical log-level mapping.
//
// This module owns ONLY the shape check. It never sees, imports, or knows
// about any system's real taxonomy content — that stays each system's own,
// same as guardian's config never importing intelligence's.

const SEVERITIES = Object.freeze(['info', 'notable', 'warning', 'failure']);

const MODULE_ID = 'lib/event-taxonomy-pattern';
const VERSION = '1.0.0';

/**
 * validateTaxonomy(taxonomy, opts) — checks a system's own event-taxonomy.js
 * export against ET1's shape. Returns { ok, errors[] } — never throws, so a
 * system can call this at its own boot and decide for itself whether a shape
 * violation should be fatal or just logged (same fail-open/fail-closed
 * judgment call this codebase already makes per-caller elsewhere, e.g.
 * copilot/lifeline.js's own real fail-open/fail-closed distinction).
 *
 * opts.systemName — used only to make error messages point at the right
 * file; never changes what's validated.
 */
function validateTaxonomy(taxonomy, opts = {}) {
  const errors = [];
  const label = opts.systemName ? `${opts.systemName}'s event-taxonomy.js` : 'this event-taxonomy.js';

  if (!taxonomy || typeof taxonomy !== 'object') {
    return { ok: false, errors: [`${label} must export a plain object, got ${typeof taxonomy}`] };
  }
  if (!Object.isFrozen(taxonomy)) {
    errors.push(`${label}'s top-level export must be Object.freeze()'d — a taxonomy that can be mutated at runtime isn't a real source of truth`);
  }

  const keys = Object.keys(taxonomy);
  if (keys.length === 0) {
    errors.push(`${label} exports zero event classes — an empty taxonomy documents nothing`);
  }

  for (const key of keys) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      errors.push(`${label}: "${key}" is not SCREAMING_SNAKE_CASE`);
      continue;
    }
    const entry = taxonomy[key];
    if (!entry || typeof entry !== 'object') {
      errors.push(`${label}: "${key}" must be an object, got ${typeof entry}`);
      continue;
    }
    if (typeof entry.description !== 'string' || !entry.description.trim()) {
      errors.push(`${label}: "${key}".description must be a non-empty string`);
    }
    if (!Array.isArray(entry.payloadShape)) {
      errors.push(`${label}: "${key}".payloadShape must be an array of field-name strings`);
    } else if (entry.payloadShape.some(f => typeof f !== 'string' || !f.trim())) {
      errors.push(`${label}: "${key}".payloadShape must contain only non-empty field-name strings`);
    }
    if (!SEVERITIES.includes(entry.severity)) {
      errors.push(`${label}: "${key}".severity must be one of ${SEVERITIES.join(', ')}, got ${JSON.stringify(entry.severity)}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * exampleTaxonomy() — a tiny, real, valid example any system can copy as a
 * starting point. Kept honest: this is genuinely what guardian's
 * event-taxonomy.js (ET2) is expected to look like for its two real,
 * already-emitted events, not an invented illustration.
 */
function exampleTaxonomy() {
  return Object.freeze({
    NCP_CLIENT_CONNECTED: {
      description: 'A provider tab (claude/chatgpt/gemini/perplexity) established a real NCP connection to guardian.',
      payloadShape: ['provider', 'tabId', 'connectedAt'],
      severity: 'info',
    },
    NCP_CLIENT_DISCONNECTED: {
      description: 'A previously-connected provider tab dropped its NCP connection.',
      payloadShape: ['provider', 'tabId', 'reason'],
      severity: 'notable',
    },
  });
}

module.exports = { validateTaxonomy, exampleTaxonomy, SEVERITIES, MODULE_ID, VERSION };
