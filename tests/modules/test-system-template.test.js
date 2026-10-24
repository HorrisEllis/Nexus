'use strict';
// tests/modules/test-system-template.test.js — 0.39.314, docs/2026-10-05-build-from-the-spec-phasemap.spec SB17.
// James: "dont add noise. only what we talked about. then show me." · "each component only needs to connect to the
// registry. that cuts down immensly on context." · "include a contract folder. also routes would be nodes right?" ·
// "then bundle each capability node, in relation to any other relevant node."
//
//   ST-01  the template is his words, the tree and the rules — nothing else
//   ST-02  the tree has Guardian's shape with what he added: contracts/, routes as nodes, a bundle per capability
//   ST-03  the rules carry what he said: registry only, capability → command → events as nodes, a schema per node type
//   ST-04  the previous template is archived whole
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '../..');
const T = path.join(ROOT, 'idearium/spec-engine/templates/architecture-spec.template.yaml');
let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

const text = fs.readFileSync(T, 'utf8');
const t = yaml.load(text);

test('ST-01', 'his words, the tree, the registry and the rules — nothing else', () => {
  assert.deepStrictEqual(Object.keys(t), ['tree', 'registry', 'rules']);
  assert.match(text, /"each component only needs to connect to the registry\. that cuts down immensly on context\./, 'his words, verbatim');
  assert.match(text, /"hardcoded has to earn its place\."/);
});

test('ST-02', 'Guardian\'s shape, with contracts/, routes as nodes and a bundle per capability', () => {
  for (const p of ['server.js', 'cli.js', 'config.js', '<system>.config.json', 'compartment.json', 'registry-components.js', 'interaction-contract.json',
    'event-taxonomy.js', 'jaa-store.js', 'contracts/', 'schemas/', 'schema.<type>', 'data/', 'nodes/', 'node-index/', 'ledger/<session>/', 'baseline/',
    'input/', 'output/', 'lib/', 'spec/', 'ui/']) assert.ok(t.tree.includes(p), p);
  for (const n of ['bundle/<capability-id>.bundle', 'component/<id>.component', 'capability/<id>.capability', 'command/<id>.command', 'event/<id>.event',
    'route/<id>.route', 'hook/<id>.hook', 'wire/<id>.wire', 'toast/<id>.toast']) assert.ok(t.tree.includes(n), n);
  assert.ok(!/^\s*[├└]── (routes|commands)\/\s/m.test(t.tree), 'routes and commands are nodes, not top-level folders');
});

test('ST-03', 'the rules carry what he said', () => {
  const r = t.rules.join('\n');
  assert.match(r, /connects only to the registry/);
  assert.match(r, /at least one capability; each capability at least one command; each command its events — each a node/);
  assert.match(r, /own folder, its own schema and its own JAA index/);
  assert.match(r, /routes, hooks, wires, toasts and contracts are nodes/);
  assert.match(r, /bundle: references to every node related to it/);
  assert.match(r, /heartbeat and pulse, and announces itself/);
  assert.match(r, /UI floats on top/);
  assert.match(r, /deltas and sigmas/);
  assert.match(r, /Versionium snapshot/);
});

test('ST-04', 'the previous templates are archived whole', () => {
  const a = path.join(ROOT, 'idearium/spec-engine/templates/_archive');
  assert.match(fs.readFileSync(path.join(a, 'architecture-spec.template.0.39.312.yaml'), 'utf8'), /^# ARCHIVED 2026-10-05 \(0\.39\.314\)/);
  assert.match(fs.readFileSync(path.join(a, 'architecture-spec.template.pre-0.39.312.yaml'), 'utf8'), /^# ARCHIVED 2026-10-05/);
});

test('ST-05', 'the registry and its node schemas: each node type the registry points at has a schema, and they agree', () => {
  const dir = path.join(ROOT, 'idearium/spec-engine/templates/system/schemas');
  const want = ['component', 'capability', 'command', 'event', 'route', 'hook', 'wire', 'bundle'];
  const schemas = {};
  for (const ty of want) {
    const doc = yaml.load(fs.readFileSync(path.join(dir, `schema.${ty}`), 'utf8'));
    assert.strictEqual(doc.type, 'schema'); assert.strictEqual(doc.id, ty);
    assert.ok(doc.payload && doc.payload.fields && doc.payload.fields.id && doc.payload.fields.uuid && doc.payload.fields.type, `${ty}: type, id, uuid`);
    schemas[ty] = doc.payload.fields;
  }
  // every key the registry template writes on a component is a field of schema.component, and every required one is written
  const keys = [...t.registry.matchAll(/^\s{6,8}([a-z]+):/gm)].map(m => m[1]).filter(k => !['dir', 'store', 'types'].includes(k));
  for (const k of keys) assert.ok(schemas.component[k], `registry key ${k} is in schema.component`);
  for (const [k, f] of Object.entries(schemas.component)) if (f.required) assert.ok(keys.includes(k), `required ${k} is in the registry template`);
  assert.ok(!schemas.component.data.required && !schemas.component.consumers.required, 'data and consumers: if applicable');
  assert.match(schemas.component.data.description, /node\|vector\|database\|table\|file/);
  assert.match(schemas.capability.commands.description, /at least one/); assert.match(schemas.component.capabilities.description, /at least one/);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
