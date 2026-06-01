'use strict';
// ── foundation/poll-registry.js ───────────────────────────────────────────────
// UUID: poll-registry-v5-0000-4000-0000-000000000001
//
// The only place poll intervals are declared. §M3 enforcement point.
// boot.js calls pollRegistry.start() after jaaDB.open().
// Modules are started in declaration order (§3.1 bottom-up).

const modules = [
  // foundation
  { id: 'bus-log',         mod: require('./bus-log'),                    pollMs:  1000 },

  // core
  { id: 'raid',            mod: require('../core/raid'),                 pollMs:  3000 },

  // agents (dispatcher first, then sub-agents)
  { id: 'agents',          mod: require('../agents'),                    pollMs:  2000 },
  { id: 'ollama',          mod: require('../agents/ollama'),             pollMs:  2000 },
  { id: 'claude',          mod: require('../agents/claude'),             pollMs:  3000 },

  // gate / healer
  { id: 'gap-finder',      mod: require('../gate/gap-finder'),           pollMs:  2000 },
  { id: 'healer',          mod: require('../healer'),                    pollMs:  5000 },

  // memory
  { id: 'agent-memory',    mod: require('../memory/agent-memory'),       pollMs:  4000 },

  // versionium
  { id: 'versionium',      mod: require('../versionium'),                pollMs:  3000 },

  // orion (in pipeline order — each depends on previous table status)
  { id: 'orion-sensor',    mod: require('../orion/sensor'),              pollMs:  1000 },
  { id: 'orion-record',    mod: require('../orion/record'),              pollMs:  1000 },
  { id: 'orion-policy',    mod: require('../orion/policy'),              pollMs:  2000 },
  { id: 'orion-verify',    mod: require('../orion/verify'),              pollMs:  3000 },
];

function start(overrides = {}) {
  for (const entry of modules) {
    const pollMs = overrides[entry.id] ?? entry.pollMs;
    try {
      entry.mod.init({ pollMs });
    } catch (err) {
      console.error(`[PollRegistry] failed to start '${entry.id}':`, err.message);
    }
  }
  console.log(`[PollRegistry] started ${modules.length} modules`);
}

function stop() {
  for (const entry of [...modules].reverse()) {
    try { entry.mod.stop?.(); } catch {}
  }
  console.log('[PollRegistry] stopped all modules');
}

module.exports = { start, stop, modules };
