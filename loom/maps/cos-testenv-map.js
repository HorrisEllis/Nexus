'use strict';
/**
 * loom/maps/cos-testenv-map.js — the COS test VM (0.39.264), ErosmancerOS started by Clear Glass,
 * and the Eravos → Idearium "new organism" path, mapped into LOOM one component per FILE, with every REAL edge
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
  ]],
  // ErosmancerOS runs with Clear Glass (0.39.264): the supervisor spawns the TypeScript server by path.
  // The source scanner reads .js/.cjs/.mjs only, so ErosmancerOS's server enters the registry here.
  ['erosmancer/erosmancer-os/src/api/server.ts', 'nexus.erosmancer.erosmancer-os.src.api.server', []],
  ['clear-glass/src/eros/supervisor.js', I('clear-glass/src/eros/supervisor.js'), ['nexus.erosmancer.erosmancer-os.src.api.server']],
  // Eravos "+ NEW": HTTP to Idearium's API when standalone, postMessage to Idearium's page when embedded
  ['ui/eravos/catalog/catalog-ui.js', I('ui/eravos/catalog/catalog-ui.js'), [I('idearium/api/index.js'), I('idearium/ui/js/app.js')]],
  ['eravos/ui/catalog/catalog-ui.js', I('eravos/ui/catalog/catalog-ui.js'), [I('idearium/api/index.js'), I('idearium/ui/js/app.js')]],
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
