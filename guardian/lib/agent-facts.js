'use strict';
/**
 * guardian/lib/agent-facts.js — GA1: Guardian states the browser agents Clear Glass runs (map invariant E13).
 * component_id: guardian.lib.agent-facts
 * Map: docs/2026-10-02-emerge-field-memory-build-phasemap.spec (GA1_guardian_source_of_truth)
 *
 * The facts are Guardian's provider nodes (guardian/data/nodes/provider/<id>.provider, schema lib/node-schemas/
 * schema.provider): id, name, url, hosts, userscriptFile, color, autostart, version, strengths. Before this, four places
 * kept them and disagreed — clear-glass/src/providers/registry.js (the only one with deepseek), guardian's own
 * /providers (hard-coded, no deepseek), and two copies of guardian.spec (no deepseek). Now a provider is added or changed
 * here, as a node, and Clear Glass caches what Guardian serves, stamped with hash() — a cache whose content no longer
 * matches its stamp is a gap, never a silent second truth.
 *
 * list() reads the nodes from disk each call (five small files); hash(list) is the sha256 of the canonical payloads,
 * sorted by id — the envelope's timestamps are not facts and are not hashed.
 */
const fs = require('fs');
const path = require('path');
const NE = require('../../lib/node-export.js');
const H = require('../../lib/agent-facts-hash.js');   // the one canonical form + hash, shared with Clear Glass's cache

const MODULE_ID = 'guardian.lib.agent-facts';
const VERSION = '1.0.0';
const { FIELDS, canonical, hash } = H;

function dir() { return process.env.GUARDIAN_PROVIDER_NODES || path.join(__dirname, '..', 'data', 'nodes', 'provider'); }

/** list() → [{ id, name, url, hosts, userscriptFile, … }] sorted by id; a node that does not parse is skipped and said */
function list({ onSkip = null } = {}) {
  let files = [];
  try { files = fs.readdirSync(dir()).filter(f => f.endsWith('.provider')); } catch (_) { return []; }
  const out = [];
  for (const f of files) {
    try {
      const d = NE.importFromFile(path.join(dir(), f));
      if (d.type !== 'provider' || !d.payload || !d.payload.id) throw new Error('not a provider node');
      out.push(canonical(d.payload));
    } catch (e) { if (onSkip) onSkip(f, e.message); }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** facts() → { providers, hash, count } — what GET /api/providers serves */
function facts() {
  const skipped = [];
  const providers = list({ onSkip: (f, why) => skipped.push({ file: f, why }) });
  return { providers, hash: hash(providers), count: providers.length, ...(skipped.length ? { skipped } : {}) };
}

module.exports = { MODULE_ID, VERSION, FIELDS, dir, canonical, list, hash, facts };
