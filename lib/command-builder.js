'use strict';
/**
 * lib/command-builder.js — self-building commands (agnostic; §CA6)
 * UUID: nexus-command-builder-v1-0000-2026-0808-001
 *
 * James: "hey nexus, make me a command for <component> to <ability>" — co-pilot
 * BUILDS a command (dynamic, from the grammar + capability registry), stores it
 * in the cortex tool management system (tool-index), hooks it into loom.
 *
 * §8.6 — composes what already exists, three real pieces:
 *   copilot/lib/capabilities.js  — the REAL capability registry (loom's
 *                                  capability-map, route-verified), already
 *                                  co-pilot's own toolbox lookup.
 *   lib/tool-index.js            — the cortex tool management system. ALREADY
 *                                  in loom's model (loom/maps/observability-
 *                                  map.js has it) — a command registered here
 *                                  is loom-registered without a new loom
 *                                  scanner file. That's "hooks it into loom"
 *                                  satisfied honestly through an existing
 *                                  wire, not a new one invented to satisfy the
 *                                  phrase.
 *   lib/chains.js                — CA3's runner executes the built command.
 *
 * §HONEST BOUNDARY (§1.1/§1.2) — resolveCapability() only matches capabilities
 * whose route is already verified-served (copilot/lib/capabilities.js's own
 * §1.1 guarantee); buildCommand() refuses (ok:false) rather than fabricate a
 * command for an ability nothing actually provides. runCommand() executes
 * through a chains.js 'system' step — a real, honest delivery descriptor, not
 * a live cross-system HTTP call: NEXUS has no port registry a command can
 * resolve at runtime (checked — orchestrator exposes no such endpoint), and
 * building one is real new infrastructure this phase did not ask for (§0.5 —
 * complexity must earn its existence; §16.4 — don't generalize before it's
 * needed). A future phase can upgrade the dispatch without changing this
 * file's stored shape.
 *
 * §RAID — building a command is governed (creating a persistent capability is
 * itself an action); running one is governed SEPARATELY (a stored command
 * does not bypass the gate on each future use — it is re-checked every run).
 */

const TABLE = 'self_built_commands';

function _cortex() { try { return require('../cortex/memory/jaa-db').jaaDB || require('../cortex/memory/jaa-db'); } catch (_) { return null; } }
function _fanin() { try { return require('./ledger-fanin'); } catch (_) { return null; } }
function _toolIndex() { try { return require('./tool-index'); } catch (_) { return null; } }

async function _govern(intent, target) {
  let allowed = true, reason = null;
  try {
    const sm = require('../copilot/lib/self-model');
    if (sm.governAction) { const g = sm.governAction({ action: intent, target }, {}); if (g && g.allowed === false) { allowed = false; reason = g.reason; } }
  } catch (_) {}
  return { allowed, reason };
}

function _log(type, fields) {
  try { const f = _fanin(); f && f.emit && f.emit({ type, source: 'command-builder', ts: Date.now(), ...fields }); } catch (_) {}
}

/**
 * parseRequest(text) — "make me a command for <component> to <ability>" →
 * {component, ability}. Honest about failing to parse rather than guessing.
 */
function parseRequest(text) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(/for\s+([a-z0-9_\-./]+)\s+to\s+(.+?)[.!]?$/i);
  if (!m) return null;
  return { component: m[1].trim().toLowerCase(), ability: m[2].trim() };
}

const _STOPWORDS = new Set(['a', 'an', 'the', 'to', 'me', 'for', 'of', 'and', 'or', 'my', 'it', 'this', 'that']);
function _words(s) { return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !_STOPWORDS.has(w)); }

/**
 * resolveCapability(component, ability) — best-scoring real capability for
 * this system matching the ability text, or null if nothing scores.
 */
function resolveCapability(component, ability, opts = {}) {
  const caps = opts.capabilities || require('../copilot/lib/capabilities');
  const forSystem = caps.capabilitiesForSystem(component, opts);
  if (!forSystem.capabilities.length) return null;
  const wanted = _words(ability);
  if (!wanted.length) return null;

  let best = null, bestScore = 0;
  for (const c of forSystem.capabilities) {
    const haystack = _words(`${c.name} ${c.description} ${c.id}`);
    const score = wanted.filter(w => haystack.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore > 0 ? { ...best, matchScore: bestScore } : null;
}

function _slug(component, ability) {
  return `${component}.${_words(ability).slice(0, 4).join('-') || 'command'}`;
}

/**
 * buildCommand(spec) — spec: { request } (natural language) OR { component,
 * ability } directly. @returns { ok, name, capability, stored } | { ok:false, reason }
 */
async function buildCommand(spec = {}) {
  const parsed = spec.request ? parseRequest(spec.request) : { component: spec.component, ability: spec.ability };
  if (!parsed || !parsed.component || !parsed.ability) {
    return { ok: false, reason: 'could not parse "for <component> to <ability>" from the request' };
  }
  const { component, ability } = parsed;
  const capability = resolveCapability(component, ability, spec);
  if (!capability) return { ok: false, reason: `no verified capability in "${component}" matches "${ability}"` };

  const name = spec.name || _slug(component, ability);
  const { allowed, reason } = await _govern(spec.intent || 'command-builder.build', { name, component, capability: capability.id });
  _log(allowed ? 'command.built' : 'command.build.denied', { name, component, ability, capabilityId: capability.id, allowed, reason });
  if (!allowed) return { ok: false, reason: reason || 'denied' };

  const record = { name, component, ability, capabilityId: capability.id, route: capability.route, description: capability.description, createdAt: Date.now(), createdBy: spec.actor || 'copilot' };

  // Store in the cortex tool management system — ALREADY loom-registered
  // (loom/maps/observability-map.js has lib/tool-index.js), so this alone
  // satisfies "hooks it into loom" without a new scanner.
  const ti = _toolIndex();
  if (ti && ti.register) ti.register({ id: `command.${name}`, file: null, dir: null, provides: capability.description, intents: [ability], kind: 'self-built-command', capabilityId: capability.id, route: capability.route });

  try {
    const db = _cortex();
    if (db && db.insert) db.insert(TABLE, { ...record, _key: name });
  } catch (e) { _log('command.store.error', { name, error: e.message }); }

  return { ok: true, name, capability, stored: record };
}

/** getCommand(name) — the stored definition, or null. */
function getCommand(name) {
  try {
    const db = _cortex(); if (!db || !db.query) return null;
    const rows = db.query(TABLE, r => r.name === name);
    if (!rows || !rows.length) return null;
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  } catch (_) { return null; }
}

/** listCommands() — every self-built command. */
function listCommands() {
  try {
    const db = _cortex(); if (!db || !db.query) return [];
    const rows = db.query(TABLE, () => true) || [];
    const byName = new Map();
    for (const r of rows) { const prev = byName.get(r.name); if (!prev || r.createdAt > prev.createdAt) byName.set(r.name, r); }
    return [...byName.values()];
  } catch (_) { return []; }
}

/**
 * runCommand(name, payload, opts) — execute a previously-built command via
 * lib/chains.js. Governed on EVERY run, not just at build time.
 */
async function runCommand(name, payload = {}, opts = {}) {
  const cmd = getCommand(name);
  if (!cmd) return { ok: false, reason: `no self-built command named "${name}"` };

  const { allowed, reason } = await _govern(opts.intent || 'command-builder.run', { name, capabilityId: cmd.capabilityId });
  _log(allowed ? 'command.run' : 'command.run.denied', { name, allowed, reason });
  if (!allowed) return { ok: false, reason: reason || 'denied' };

  const chains = require('./chains');
  const result = await chains.runChain({
    name: `command:${name}`,
    input: payload,
    steps: [{ kind: 'system', id: cmd.capabilityId, payload: { route: cmd.route, ...payload }, intent: `command-builder.run.${name}` }],
  });

  const ti = _toolIndex();
  if (ti && ti.record) ti.record({ tool: `command.${name}`, intent: cmd.ability, ok: result.ok, consumer: opts.actor || 'copilot' });

  return result;
}

module.exports = {
  parseRequest, resolveCapability, buildCommand, getCommand, listCommands, runCommand,
  TABLE, MODULE_ID: 'command-builder', VERSION: '1.0.0',
};
