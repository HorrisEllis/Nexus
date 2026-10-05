'use strict';
// tests/modules/test-system-template.test.js — 0.39.312 SB17, docs/2026-10-05-build-from-the-spec-phasemap.spec.
// James: "why not identity context file_structure modules -> components summary, with routes and commands, anything
// else relevant. then everything relevant to the modules, is listed each module and component. not in seperate
// sections" · "each component has to have at least one capability, with at least one command, and events, each a node
// each." · "each system is responsible for its data, schemas, contracts, configurations, heartbeat and pulse"
//
//   ST-01  his order: identity → context → file_structure → modules → components (+ generated, never hand-written)
//   ST-02  each component carries its own: summary, capabilities, commands, routes, events, nodes, schema, config, gates, tests
//   ST-03  each module carries its own data: per node type its schema, its JAA index table and its ledger table
//   ST-04  identity says what the system owns, its data folder and its heartbeat (with node counts); his words have a field
//   ST-05  nothing lost: every field of the archived template has a place in this one
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '../..');
const T = path.join(ROOT, 'idearium/spec-engine/templates/architecture-spec.template.yaml');
const OLD = path.join(ROOT, 'idearium/spec-engine/templates/_archive/architecture-spec.template.pre-0.39.312.yaml');
let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

const text = fs.readFileSync(T, 'utf8');
const t = yaml.load(text);
const mod = t.modules[0];
const comp = mod.components[0];

test('ST-01', 'his order: identity → context → file_structure → modules (→ components), then generated', () => {
  assert.deepStrictEqual(Object.keys(t), ['identity', 'context', 'file_structure', 'modules', 'generated']);
  assert.ok(Array.isArray(t.modules) && Array.isArray(mod.components));
  assert.deepStrictEqual(Object.keys(t.generated), ['contract', 'event_taxonomy', 'node_index', 'registry', 'atlas'], 'the cross-cutting lists are derived, named once');
});

test('ST-02', 'each component carries its own — not in separate sections', () => {
  for (const k of ['summary', 'capabilities', 'commands', 'routes', 'events', 'nodes', 'schema', 'config', 'gates', 'diagnostics', 'tests', 'depends_on', 'layer', 'status']) assert.ok(k in comp, k);
  assert.ok(Array.isArray(comp.capabilities) && 'id' in comp.capabilities[0], 'capabilities: a list, each its own node');
  assert.ok('capability' in comp.commands[0], 'a command invokes a capability');
  assert.ok('command' in comp.routes[0], 'a route belongs to a command');
  assert.ok(Array.isArray(comp.events.emits) && Array.isArray(comp.events.hears));
  assert.ok(/at least one/.test(text.split('capabilities:')[1].split('\n')[0]) && /at least one/.test(text.split('        commands:')[1].split('\n')[0]), 'his "at least one" is written on both');
  for (const gone of ['api_routes', 'memory_architecture', 'node_bundles', 'self_diagnostics', 'event_kinds']) assert.ok(!(gone in t), `no separate section: ${gone}`);
});

test('ST-03', 'each module carries its own data: schema, JAA index table and ledger table per node type', () => {
  const d = mod.data[0];
  for (const k of ['node_type', 'folder', 'schema', 'jaa_table', 'ledger_table', 'integrity', 'mutability', 'kind_status']) assert.ok(k in d, k);
  assert.match(text, /nodes_<type> — the index, rebuildable from the files/);
  assert.match(text, /nodes_<type>_ledger — append-only/);
  for (const k of ['seams', 'config', 'summary', 'status']) assert.ok(k in mod, k);
});

test('ST-04', 'identity: what it owns, its data folder, its heartbeat with node counts, and his words', () => {
  for (const k of ['data', 'schemas', 'contract', 'config']) assert.ok(k in t.identity.owns, k);
  assert.ok('data_folder' in t.identity && 'james' in t.identity && 'extends' in t.identity);
  assert.ok('interval' in t.identity.heartbeat && 'route' in t.identity.heartbeat);
  assert.match(text, /each node type's count/);
  assert.ok('pulse' in t.context && 'sovereignty' in t.context && 'spine' in t.context && 'axioms' in t.context);
});

test('ST-05', 'nothing lost: every field of the archived template has a place here', () => {
  const old = yaml.load(fs.readFileSync(OLD, 'utf8'));
  const flat = (o) => Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v)) ? [k, ...flat(v)] : (Array.isArray(v) && v[0] && typeof v[0] === 'object') ? [k, ...flat(v[0])] : [k]);
  const renamed = { meta: 'identity', foundation: 'extends', spec_name: 'name', boundaries: 'glossary', node_kinds: 'data', kind: 'node_type',
    event_kinds: 'event_taxonomy', memory_architecture: 'data', type: 'store', heartbeat_interval: 'interval', self_diagnostics: 'diagnostics',
    node_bundles: 'bundle_with', bundle_kind: 'node_type', member_kinds: 'bundle_with', api_routes: 'routes' };
  const now = new Set(flat(t));
  const unplaced = [...new Set(flat(old))].filter(k => !now.has(k) && !(renamed[k] && now.has(renamed[k])));
  assert.deepStrictEqual(unplaced, []);
  assert.match(fs.readFileSync(OLD, 'utf8'), /^# ARCHIVED 2026-10-05/);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
