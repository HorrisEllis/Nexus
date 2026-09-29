'use strict';
/**
 * loom/maps/economy-map.js — 0.39.281: docs/2026-09-29-provider-economy-phasemap.spec mapped into LOOM, one component
 * per FILE with every REAL edge as a wire. Mirrors loom/maps/build-surface-map.js.
 * comp_id: nexus.loom.maps.economy
 * UUID: nexus-loom-map-economy-v1-0000-2026-0929-001
 *
 * Hand-mapped because several edges are not require()s the source scanner can see:
 *   guardian/lib/dispatcher.js → guardian/lib/economy-guard.js          deps.economy (handed in by server.js via lib/index.js)
 *   lib/repo-inject.js → lib/repo-agent.js                              the stage option (repo-agent._economyStage) it is handed
 *   idearium/ui/settings.html → idearium/api/index.js                   HTTP GET|POST /api/economy, GET /api/economy/:what
 *   idearium/api/index.js → guardian/server.js                          HTTP :7820/api/economy* (nexus-client)
 *   clear-glass/src/mesh/automation-engine.js → clear-glass/src/driver/index.js   browserFn → driver.exec pointer (via 'eros')
 *   clear-glass/renderer/settings/sections/eros.js → clear-glass/src/main/index.js   HTTP /eros/* (the wire proxy)
 *   clear-glass/src/main/index.js → erosmancer-os/src/api/server.ts     _proxyEros → ErosmancerOS REST
 * The .ts and .html files are not scanned (.js only), so they are declared here; lib/economy/* and
 * guardian/lib/economy-guard.js are hand-mapped (excluded from the scan in loom/bootstrap.js).
 */
const { idFor } = require('../scanners/source-map');
const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['lib/economy/policy.js', I('lib/economy/policy.js'), []],
  ['lib/economy/ledger.js', I('lib/economy/ledger.js'), []],
  ['lib/economy/gate.js', I('lib/economy/gate.js'), []],
  ['lib/economy/tokens.js', I('lib/economy/tokens.js'), []],
  ['lib/economy/router.js', I('lib/economy/router.js'), []],
  ['lib/economy/store.js', I('lib/economy/store.js'), [
    I('lib/economy/policy.js'), I('lib/economy/ledger.js'),   // require('./policy.js'), require('./ledger.js') — normalize, dir()
    I('lib/agent-providers.js'),                              // require('../agent-providers.js') — the one provider list
  ]],
  ['guardian/lib/economy-guard.js', I('guardian/lib/economy-guard.js'), [
    I('lib/economy/gate.js'), I('lib/economy/ledger.js'), I('lib/economy/store.js'), I('lib/economy/tokens.js'),
  ]],
  ['idearium/ui/settings.html', I('idearium/ui/settings.html'), [I('idearium/api/index.js')]],   // HTTP /api/economy*
  ['erosmancer/erosmancer-os/src/replay/index.ts', I('erosmancer/erosmancer-os/src/replay/index.ts'), []],
  ['erosmancer/erosmancer-os/src/api/server.ts', I('erosmancer/erosmancer-os/src/api/server.ts'), [
    I('erosmancer/erosmancer-os/src/replay/index.ts'),         // import { ScriptReplayQueue } — snapshot(), list() (EC10)
  ]],
];

// Consumers the scanner sees as files but not these edges: [consumer id, dependency id, where].
const CONSUMERS = [
  [I('guardian/server.js'), I('guardian/lib/economy-guard.js'), 'createEconomyGuard() → wireGuardianCore({ economy }), attach(bus)'],
  [I('guardian/server.js'), I('lib/economy/store.js'), 'GET|POST /api/economy'],
  [I('guardian/server.js'), I('lib/economy/ledger.js'), 'GET /api/economy/usage|limits|routing'],
  [I('guardian/server.js'), I('lib/economy/gate.js'), 'GET /api/economy/usage (gate per provider)'],
  [I('guardian/server.js'), I('lib/economy/tokens.js'), 'GET /api/economy/limits'],
  [I('guardian/server.js'), I('lib/economy/router.js'), 'GET /api/economy/routing'],
  [I('guardian/server.js'), I('lib/economy/policy.js'), 'GET /api/economy (tiers, job types, limits)'],
  [I('guardian/lib/dispatcher.js'), I('guardian/lib/economy-guard.js'), 'deps.economy.check / begin before the dispatch pool'],
  [I('lib/repo-agent.js'), I('lib/economy/store.js'), '_economyStage(provider) — the stage tiers'],
  [I('lib/repo-inject.js'), I('lib/repo-agent.js'), 'fromReply({ stage }) — the stage record repo-agent hands it'],
  [I('lib/seam/adapters/warp-cascade.js'), I('lib/economy/store.js'), '_learnedOrder: policy'],
  [I('lib/seam/adapters/warp-cascade.js'), I('lib/economy/ledger.js'), '_learnedOrder: build records'],
  [I('lib/seam/adapters/warp-cascade.js'), I('lib/economy/gate.js'), '_learnedOrder: only providers the gate allows'],
  [I('lib/seam/adapters/warp-cascade.js'), I('lib/economy/router.js'), '_learnedOrder: choose("build", …)'],
  [I('idearium/api/index.js'), I('guardian/server.js'), 'economy.get / economy.set / economy.view → HTTP :7820/api/economy*'],
  [I('clear-glass/src/mesh/automation-engine.js'), I('clear-glass/src/driver/index.js'), "_erosInput → browserFn → driver.exec pointer via 'eros'"],
  [I('clear-glass/renderer/settings/sections/eros.js'), I('clear-glass/src/main/index.js'), 'HTTP /eros/tabs|nodes|execute|replay (workbench)'],
  [I('clear-glass/src/main/index.js'), I('erosmancer/erosmancer-os/src/api/server.ts'), '_proxyEros: /eros/* → /api/*'],
];

function mapEconomy(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-0929-003` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  for (const [, id, req] of FILES) {
    const e = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0929-003` });
    (e.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r: e });
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0929-003` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  // A consumer whose edge is not a require() (deps handed in, a renderer script over HTTP) has no import hook from the
  // scan; declare it, so the wire has both ends. One that already exists is refused as a duplicate — that is fine.
  for (const consumer of new Set(CONSUMERS.map(c => c[0]))) {
    if (own.has(consumer)) continue;
    const r = driver.declare('hook', { id: `${consumer}.import`, component_id: consumer, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${consumer}-import-v1-0000-2026-0929-003` });
    if (r.ok) results.hooks.push({ id: `${consumer}.import`, r });
    else if (!(r.failures || []).every(f => f.axiomId === 'loom.unique-id')) results.failures.push({ id: `${consumer}.import`, r });
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `economy.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-economy-wire-${n}-v1-0000-2026-0929-001`, external: true });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      const r = driver.declare('wire', { id: `economy.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-economy-wire-${n}-v1-0000-2026-0929-001`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapEconomy, FILES, CONSUMERS };
