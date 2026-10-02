'use strict';
/**
 * lib/agent-facts-hash.js — GA1: one definition of an agent fact's canonical form and its hash, shared by the side that
 * states the facts (guardian/lib/agent-facts.js) and the side that caches them (clear-glass/src/providers/registry.js),
 * so the stamp a cache carries and the hash Guardian serves are computed one way. Pure; no I/O.
 * component_id: lib.agent-facts-hash
 */
const crypto = require('crypto');

const FIELDS = Object.freeze(['id', 'name', 'url', 'hosts', 'userscriptFile', 'color', 'autostart', 'version', 'strengths']);

/** canonical(p) → only the fact fields, in one fixed order (envelope timestamps and anything else are not facts) */
function canonical(p) {
  const out = {};
  for (const k of FIELDS) if (p && p[k] !== undefined && p[k] !== null) out[k] = p[k];
  return out;
}

/** hash(providers) → sha256 hex of the canonical facts, sorted by id */
function hash(providers) {
  const rows = (providers || []).map(canonical).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

module.exports = { FIELDS, canonical, hash, MODULE_ID: 'lib.agent-facts-hash', VERSION: '1.0.0' };
