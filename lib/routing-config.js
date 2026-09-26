'use strict';
/**
 * lib/routing-config.js — CA6 of the awareness/routing phasemap
 * UUID: nexus-routing-config-v1-0000-2026-0730-001
 *
 * §PHASEMAP CA6 (docs/copilot-awareness-routing-phasemap.spec, CHUNK C). Makes
 * CA5's intent→agent map, fallback order, and token limits EDITABLE config —
 * cortex rows, the same editable-surface pattern as the schema registry — so
 * routing behaviour changes without a code edit (James: "configs for intent and
 * fallback routing and token limits and constraints"). §2.2 cortex is the source
 * of truth; §0.3 edits are versioned, old preserved; §0.4 the whole point is
 * optionality. Falls back to agent-router's built-in DEFAULT_* so routing works
 * before any config is written.
 */

const CONFIG_TABLE = 'routing_config';

function _jaa() { return require('../cortex/memory/jaa-db'); }

/**
 * getRoutingConfig() — the CURRENT routing config from cortex, or the built-in
 * defaults if none has been written. Shape: { routes, fallback, constraints, version }.
 */
function getRoutingConfig() {
  const router = require('./agent-router');
  const builtin = {
    routes: router.DEFAULT_ROUTES,
    fallback: router.DEFAULT_FALLBACK,
    constraints: router.AGENT_CONSTRAINTS,
    version: 0,
    source: 'builtin-default',
  };
  try {
    const { jaaDB } = _jaa();
    const rows = jaaDB.query(CONFIG_TABLE, () => true, 1000) || [];
    if (!rows.length) return builtin;
    // highest version wins (§0.3 — edits accrete, newest is active)
    const current = rows.reduce((a, b) => ((b.version || 1) >= (a.version || 1) ? b : a));
    return {
      routes: current.routes || builtin.routes,
      fallback: current.fallback || builtin.fallback,
      constraints: current.constraints || builtin.constraints,
      version: current.version || 1,
      source: 'cortex',
    };
  } catch (_) {
    return builtin;   // cortex unreachable — routing still works on defaults (§1.2)
  }
}

/**
 * setRoutingConfig(patch) — write a new routing config version to cortex. The
 * old version is preserved (§0.3). Returns the stored row.
 */
function setRoutingConfig(patch = {}) {
  const { jaaDB, uid } = _jaa();
  const cur = getRoutingConfig();
  const row = {
    uuid: uid ? uid() : `routing-cfg-${Date.now()}`,
    kind: 'routing_config',
    routes: patch.routes || cur.routes,
    fallback: patch.fallback || cur.fallback,
    constraints: patch.constraints || cur.constraints,
    version: (cur.version || 0) + 1,
    editedBy: patch.editedBy || 'user',
    ts: Date.now(),
  };
  try { jaaDB.insert(CONFIG_TABLE, row); return row; }
  catch (e) { return { error: `failed to persist routing config: ${e.message}` }; }
}

/**
 * setAgentForIntent(intent, agent, why) — a targeted edit: route one intent to a
 * different agent. Reads current, patches the one rule, writes a new version.
 */
function setAgentForIntent(intent, agent, why) {
  const cur = getRoutingConfig();
  const routes = cur.routes.map(r => r.intent === intent ? { ...r, agent, why: why || `user set ${intent}→${agent}` } : r);
  if (!routes.some(r => r.intent === intent)) routes.unshift({ intent, agent, why: why || `user added ${intent}→${agent}` });
  return setRoutingConfig({ routes, editedBy: 'user' });
}

/**
 * setTokenLimit(agent, maxTokens, chunk) — edit an agent's token constraint.
 */
function setTokenLimit(agent, maxTokens, chunk) {
  const cur = getRoutingConfig();
  const constraints = { ...cur.constraints, [agent]: { ...(cur.constraints[agent] || {}), maxTokens, ...(chunk != null ? { chunk } : {}) } };
  return setRoutingConfig({ constraints, editedBy: 'user' });
}

module.exports = {
  CONFIG_TABLE, getRoutingConfig, setRoutingConfig, setAgentForIntent, setTokenLimit,
  MODULE_ID: 'routing-config', VERSION: '1.0.0',
};
