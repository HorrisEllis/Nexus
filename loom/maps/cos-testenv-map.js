'use strict';
/**
 * loom/maps/cos-testenv-map.js — the COS test VM (0.39.264), ErosmancerOS started by Clear Glass,
 * and (until 0.60.83, when ERAVOS was deleted) the Eravos → Idearium "new organism" path, mapped into LOOM one component per FILE, with every REAL edge
 * as a wire: require() edges (verified against the source) AND the edges the source
 * scanner cannot see — a child process spawned by path, an HTTP call, a postMessage.
 * Mirrors loom/maps/observability-map.js / ui-map.js.
 * comp_id: nexus.loom.maps.cos-testenv
 * UUID: nexus-loom-map-cos-testenv-v1-0000-2026-0926-001
 *
 * Ids come from source-map.js idFor(), so the scanner (which excludes hand-mapped
 * paths) never declares these twice, and edges INTO scanned files (qemu-runtime,
 * guest-agent, sandbox, idearium/api) terminate on the scanner's own ids.
 */
const { idFor } = require('../scanners/source-map');

const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  // 0.60.328 MG15b — COS's one supervisor and its server (docs/2026-10-24-cos-manager-phasemap.spec); Idearium reaches it over HTTP :7799 (/api/cos/*)
  ['clear-glass/src/automation/driver-port.js', I('clear-glass/src/automation/driver-port.js'), []],   // 0.60.333 AE2 — reached by orchestrator/automation over HTTP :7704
  ['cos/manager/supervisor.js', I('cos/manager/supervisor.js'), []],
  ['cos/manager/autopilot-door.js', I('cos/manager/autopilot-door.js'), [I('lib/test-sandbox.js'), I('lib/bus-subscriptions.js'), I('cortex/memory/jaa-db.js'), I('intelligence/cfr/field.js'), I('lib/ledger-sse.js'), I('lib/error-log.js')]],   // 0.60.329 MG16; cortex/intelligence: the legacy /tables /files reads
  ['cos/manager/server.js',     I('cos/manager/server.js'),     [I('cos/manager/supervisor.js'), I('cos/manager/autopilot-door.js'), I('cos/manager/proposals.js'), I('cos/manager/usage.js'), I('cos/manager/contract.json')]],   // requires; the contract read per request (MG18)
  // 0.60.336 MG18/MG29 (MG_D16) — COS's UI: the cockpit server forwards to the manager over HTTP by the contract's allowlist; each page loads
  // core by <script>, talks to the shell only by postMessage (the bus), and to the manager only through the cockpit server's same-origin routes
  ['cos/manager/proposals.js',  I('cos/manager/proposals.js'),  []],   // given the supervisor; notes on its ledger
  ['cos/manager/usage.js',      I('cos/manager/usage.js'),      []],
  ['cos/manager/contract.json', I('cos/manager/contract.json'), []],
  ['cos/ui/serve.js',           I('cos/ui/serve.js'),           [I('cos/manager/contract.json'), I('cos/manager/server.js')]],   // reads the contract; HTTP to the manager
  ['cos/ui/core/core.js',       I('cos/ui/core/core.js'),       [I('cos/ui/serve.js')]],   // fetch, same-origin
  ['cos/ui/core/section.js',    I('cos/ui/core/section.js'),    [I('cos/ui/core/core.js')]],
  ['cos/ui/shell/bus.js',       I('cos/ui/shell/bus.js'),       []],
  ['cos/ui/shell/page.js',      I('cos/ui/shell/page.js'),      [I('cos/ui/core/core.js'), I('cos/ui/shell/bus.js'), I('cos/ui/serve.js')]],   // the event stream; frames by postMessage
  ...['overview', 'ledger', 'proposals', 'automation', 'planned', 'cockpit'].map(p => [`cos/ui/${p}/page.js`, I(`cos/ui/${p}/page.js`), [I('cos/ui/core/core.js'), I('cos/ui/shell/page.js'), ...(p === 'cockpit' ? [I('cos/ui/core/section.js')] : [])]]),
  ...['overview', 'logs', 'events', 'api', 'data', 'files', 'tests', 'snapshot'].map(s => [`cos/ui/cockpit/sections/${s}/section.js`, I(`cos/ui/cockpit/sections/${s}/section.js`), [I('cos/ui/core/section.js'), I('cos/ui/cockpit/page.js')]]),
  // 0.60.330 MG17 — autopilot hands over: the launcher spawns COS's manager by path (and the archive with --legacy-supervisor) and reaches it over
  // HTTP; core's duties reach COS only by its routes, and run lib's own pieces (the fan-in, ledger wire, error.log, intelligence, gaps, updates)
  ['lib/nexus/autopilot.js',    I('lib/nexus/autopilot.js'),    [I('cos/manager/server.js'), I('lib/nexus/autopilot.retired-0.60.330.js'), I('lib/nexus/core-duties.js'), I('lib/version.js'), I('lib/nexus-cli-interface.js')]],
  ['lib/nexus/core-duties.js',  I('lib/nexus/core-duties.js'),  [I('cos/manager/server.js'), I('lib/ledger-fanin/boot.js'), I('lib/ledger-fanin/index.js'), I('lib/ledger-sse.js'), I('lib/error-log.js'),
    I('lib/autopilot-intelligence.js'), I('lib/gap-field.js'), I('lib/nexus-update.js'), I('lib/test-sandbox.js'), I('lib/resource-monitor.js'), I('lib/prevention.js'), I('lib/cli/diagnose.js')]],   // HTTP /api/cos/*, /idle; requires; diagnose.js spawned by path
  ['lib/nexus/autopilot.retired-0.60.330.js', I('lib/nexus/autopilot.retired-0.60.330.js'), []],   // archived (§0.3); run only by --legacy-supervisor; its own edges are the source scanner's
  ['cos/testenv/tar.js',        I('cos/testenv/tar.js'),        []],
  ['cos/testenv/detect.js',     I('cos/testenv/detect.js'),     []],
  ['cos/testenv/host.js',       I('cos/testenv/host.js'),       []],
  ['cos/testenv/index.js',      I('cos/testenv/index.js'), [
    I('cos/compartment/qemu-runtime.js'), I('cos/compartment/guest-agent.js'),    // _q(), _ga()
    I('cos/testenv/host.js'), I('cos/testenv/tar.js'), I('cos/playground/sandbox.js'),   // capabilities, packDir, runProcess
  ]],
  ['cos/testenv/provision.js',  I('cos/testenv/provision.js'), [
    I('cos/testenv/host.js'), I('cos/compartment/qemu-runtime.js'), I('cos/compartment/guest-agent.js'),
    I('cos/testenv/index.js'),                                                      // --status → capabilities()
  ]],
  ['cos/testenv/setup-job.js',  I('cos/testenv/setup-job.js'), [
    I('cos/testenv/index.js'),                                                      // status() → capabilities()
    I('cos/testenv/provision.js'),                                                  // spawned by path (child process)
    I('cos/testenv/host.js'), I('cos/compartment/qemu-runtime.js'), I('cos/testenv/installer.js'),   // hostInfo() for the step-by-step setup (0.39.265)
  ]],
  // ErosmancerOS runs with Clear Glass (0.39.264): the supervisor spawns the TypeScript server by path.
  // The source scanner reads .js/.cjs/.mjs only, so ErosmancerOS's server enters the registry here.
  ['clear-glass/erosmancer/erosmancer-os/src/api/server.ts', 'nexus.erosmancer.erosmancer-os.src.api.server', []],
  ['clear-glass/src/eros/supervisor.js', I('clear-glass/src/eros/supervisor.js'), ['nexus.erosmancer.erosmancer-os.src.api.server']],
];

function mapCosTestenv(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-0926-001` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  const requiredBy = new Set();
  for (const [, , req] of FILES) for (const d of req) requiredBy.add(d);
  for (const [, id, req] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0926-001` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0926-001` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  let n = 0;
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      // a dependency outside this map is a scanned file: its .export hook is the scanner's (or a boundary hook)
      const r = driver.declare('wire', { id: `cos-testenv.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-cos-testenv-wire-${n}-v1-0000-2026-0926-001`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapCosTestenv, FILES };
