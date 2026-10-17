'use strict';
/**
 * lib/system-shape.js — does a system match genesis? Each of genesis's roles, filled by the system's own file, by the kernel, or
 * missing (0.60.138)
 * comp_id: nexus.lib.system-shape
 * UUID: nexus-lib-system-shape-v1-0000-2026-1017-jamesbrooks-001
 * Map: docs/2026-10-17-infrastructure-migration-phasemap.spec IM1 / IM5 (each system to the template)
 *
 * James, 2026-10-17: "and the diagnostic needs to be a real system matching genasis."
 *
 * Genesis 1.5.0's file catalog is the skeleton cos/archetype/nexus-system (idearium/spec-engine/templates/genesis.spec, generated
 * from it). A system laid out from it has every file. A system that predates it fills the same ROLES; the skeleton's own
 * machinery (its node index, listener, store, heartbeat, boundary) is the kernel's for those systems — decision D1, by his
 * axioms (docs/2026-10-17-decisions-by-the-axioms.spec) — and is named here as such, never counted as missing.
 *
 *   ROLES                      the roles, each { role, own: [paths], kernel?: path, why }
 *   SKELETON_INTERNAL          skeleton files that are its machinery, not a role a system must fill (each says why)
 *   shapeOf(system, { root })  → { system, matches, own, kernel, missing: [role], roles: [{ role, status, file }] }
 *   shapes({ root })           → every system with a registry or a runtime entry
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.system-shape';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');

const ROLES = Object.freeze([
  { role: 'entry', own: ['server.js'], why: 'the one door that starts it' },
  { role: 'cli', own: ['cli.js'], why: 'its commands, from its registry' },
  { role: 'config', own: ['config.js'], why: 'its configuration: its file, the environment over it' },
  { role: 'config-file', own: ['<system>.config.json'], why: 'its configuration values' },
  { role: 'compartment', own: ['compartment.json'], why: 'its COS compartment' },
  { role: 'registry', own: ['registry-components.js'], why: 'the spine and the drawbridge' },
  { role: 'contract', own: ['interaction-contract.json'], why: 'its interaction contract' },
  { role: 'events', own: ['event-taxonomy.js'], why: 'its event vocabulary (ET1)' },
  { role: 'schemas', own: ['schemas/index.js'], why: 'its own schemas for its node types' },
  { role: 'spec', own: ['spec/<system>.spec'], why: 'its living spec' },
  { role: 'node-taxonomy', own: ['spec/<system>.node-taxonomy.md'], why: 'its node types and where each comes from' },
  { role: 'handshake', own: ['contracts/handshake.js'], why: 'verify another system\'s contract before calling it' },
  { role: 'tests', own: ['tests/'], why: 'its own tests (D6)' },
  { role: 'nodes', own: ['data/nodes/'], why: 'its data as nodes (regenerated at boot; state, not committed)', state: true },
  { role: 'store', own: ['jaa-store.js'], kernel: 'lib/jaa-store.js', why: 'its JAA database' },
  { role: 'node-index', own: ['lib/node-index.js'], kernel: 'lib/node-registry.js', why: 'an index per node type and its history' },
  { role: 'listener', own: ['lib/listener.js'], kernel: 'lib/node-registry.js', why: 'a node dropped in goes live' },
  { role: 'heartbeat', own: ['lib/heartbeat.js'], kernel: 'lib/system-registry.js', why: 'its pulse, over its health route' },
  { role: 'boundary', own: ['lib/boundary.js'], kernel: 'lib/system-boundary.js', why: 'it holds only its own folder' },
]);

// skeleton files that are its own machinery or the template's, not a role a system must fill
const SKELETON_INTERNAL = Object.freeze({
  '.template-tree': 'the template\'s own listing', 'skeleton.json': 'the template\'s own manifest', 'package.json': 'a laid-out system\'s package (Nexus systems share the root one)',
  '{{slug}}.config.json': 'the config-file role', 'spec/{{slug}}.spec': 'the spec role', 'spec/{{slug}}.node-taxonomy.md': 'the node-taxonomy role',
  'tests/skeleton.test.js': 'the tests role', 'lib/system.js': 'the skeleton\'s boot (a predating system boots its own way)',
  'lib/atomic-write.js': 'kernel: lib/atomic-write.js', 'lib/envelope.js': 'kernel: lib/node-export.js', 'lib/ledger.js': 'kernel: the ledgers in lib/',
  'lib/bus.js': 'a primitive (D7): nexus/nexus-bus.js', 'lib/commands.js': 'the cli role', 'lib/core.js': 'the skeleton\'s seed component',
  'lib/handoff.js': 'the drawbridge\'s file form (DB3, open)', 'lib/modules.js': 'nesting (a module is a system)',
});

function _has(dir, rel) { try { return fs.existsSync(path.join(dir, rel)); } catch (_) { return false; } }

function shapeOf(system, { root = ROOT } = {}) {
  root = path.resolve(root);
  const dir = path.join(root, system);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { ok: false, error: `no system folder ${system}` };
  const roles = ROLES.map(r => {
    const file = r.own.map(f => f.replace('<system>', system)).find(f => _has(dir, f));
    if (file) return { role: r.role, status: 'own', file: `${system}/${file}` };
    if (r.kernel && _has(root, r.kernel)) return { role: r.role, status: 'kernel', file: r.kernel };
    if (r.state) return { role: r.role, status: 'state', file: `${system}/${r.own[0]}`, why: 'made at boot' };
    return { role: r.role, status: 'missing', want: `${system}/${r.own[0].replace('<system>', system)}`, why: r.why };
  });
  const missing = roles.filter(r => r.status === 'missing').map(r => r.role);
  return { ok: true, system, matches: missing.length === 0, own: roles.filter(r => r.status === 'own').length, kernel: roles.filter(r => r.status === 'kernel').length, missing, roles };
}

function shapes({ root = ROOT } = {}) {
  root = path.resolve(root);
  const names = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && _has(path.join(root, e.name), 'registry-components.js')).map(e => e.name);
  return names.sort().map(n => shapeOf(n, { root })).sort((a, b) => a.missing.length - b.missing.length);
}

module.exports = { MODULE_ID, VERSION, ROLES, SKELETON_INTERNAL, shapeOf, shapes };
