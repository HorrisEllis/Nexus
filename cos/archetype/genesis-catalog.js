'use strict';
/**
 * cos/archetype/genesis-catalog.js — genesis's file catalog, generated from the nexus-system archetype's real files.
 * UUID: nexus-cos-genesis-catalog-v1-0000-2026-1006-jamesbrooks-001
 *
 * §0.39.359 SB28 — genesis 1.4.0's GENESIS_FILE_TREE is the skeleton, file for file; each file's depends are its real
 * require()s plus the files it reads at run time (EXTRA below). Generated, never hand-edited:
 *   node cos/archetype/genesis-catalog.js           print the catalog block
 *   node cos/archetype/genesis-catalog.js --write   splice it into idearium/spec-engine/templates/genesis.spec
 * tests/modules/test-system-skeleton.test.js (SK-01) fails when the spec's block and this output differ.
 */
const fs = require('fs');
const path = require('path');
const NS = require('./nexus-system.js');
const GENESIS = path.join(__dirname, '..', '..', 'idearium', 'spec-engine', 'templates', 'genesis.spec');

const INTENT = {
  'package.json': ['declare_the_system_package', 'Name, version, scripts: start (server.js), cli (cli.js), test (tests/skeleton.test.js). No dependencies — the system stands alone.'],
  '<system>.config.json': ['system_wide_adjustable_values', 'Port, heartbeat interval, listener poll, the Versionium slot. Anything adjustable lives here, not in code.'],
  'config.js': ['load_the_configuration', 'Reads <system>.config.json, then the environment (<SYSTEM>_PORT, <SYSTEM>_HEARTBEAT_MS) over it.'],
  'compartment.json': ['declare_the_cos_seam', 'The COS compartment: archetype nexus-system, runtime node, entry server.js, health check /health. Existence and boundary only.'],
  'registry-components.js': ['the_component_registry_the_spine', 'Every component: type, id, uuid, file, intent, version, status, capabilities (at least one), hooks, consumers, data. Every component connects only to this.'],
  'interaction-contract.json': ['the_fixed_part_of_the_interaction_contract', 'id, version, namespace, transport and the fixed resources; GET /contract adds every route node, so the contract grows with the system.'],
  'event-taxonomy.js': ['the_events_generated_from_event_nodes', 'The system events the skeleton emits, plus every event node — generated, never hand-written; the bus asks it whether an event is declared.'],
  'jaa-store.js': ['the_jaa_database', 'A table per name, rows upserted by id, soft deletes, an append-only <table>.jsonl beside each. The node index lives in it.'],
  'schemas/index.js': ['load_the_systems_own_schemas', 'Reads schemas/schema.<type>; the node index refuses a node whose type has no schema.'],
  'lib/atomic-write.js': ['write_a_file_whole_or_not_at_all', 'Temp file then rename; retries the Windows EPERM/EBUSY rename before it is an error.'],
  'lib/envelope.js': ['read_write_and_check_node_files', 'data/nodes/<type>/<id>.<type> in the node envelope (JSON, which is also YAML); fingerprint; validate against a schema.'],
  'lib/ledger.js': ['the_event_ledger', 'Every event, per session, timestamped: data/ledger/<session>/events.jsonl.'],
  'lib/bus.js': ['the_one_way_an_event_moves', 'Ledger first, then listeners; an event no node declares is still delivered and marked undeclared.'],
  'lib/node-index.js': ['index_the_nodes_in_jaa_tables', 'Domain 2d: nodes_<type> per type, nodes_<type>_ledger history; refuses a node that fails its schema; rebuildable from the files alone.'],
  'lib/listener.js': ['a_dropped_node_goes_live', 'Watches data/nodes, reindexes, emits <system>.node.changed, rewrites each capability bundle (references, never copies).'],
  'lib/heartbeat.js': ['the_pulse', 'Domain 10: <system>.heartbeat on an interval with uptime, node counts and refused nodes — an index behind its files shows as drift.'],
  'contracts/handshake.js': ['verify_another_systems_contract', 'Same id, compatible version, the resources needed, the hash last seen — before one system calls another.'],
  'lib/commands.js': ['run_command_nodes_through_the_registry', 'A command names its capability; the registry names the component and file; the command\'s events are emitted after it runs.'],
  'lib/system.js': ['boot', 'Config, schemas, store, ledger, bus, node index, listener, heartbeat, and the component-shape check. server.js and cli.js both start here.'],
  'lib/core.js': ['the_core_component', 'Component <system>.core, capability <system>.core.observe: status and nodes — the system reporting on itself.'],
  'server.js': ['serve_the_route_nodes', '/health, /contract, /nodes/:type[/:id], and every route node — a new route is a node, this file does not change.'],
  'cli.js': ['run_the_command_nodes', 'node cli.js <command> [--flag value] — the same command nodes the routes run.'],
  'spec/<system>.spec': ['the_living_spec', 'identity, context, file_structure, modules, components, generated — the architecture template\'s sections; grows with the system.'],
  'spec/<system>.node-taxonomy.md': ['the_node_types', 'Each node type, what it is and its required fields.'],
  'tests/skeleton.test.js': ['prove_the_skeleton_is_alive', 'Boots, indexes, checks the shape, serves routes, runs the CLI, and serves a route node dropped in without a restart.'],
};
const EXTRA = {   // reads that are not a require(): files read at run time
  'config.js': ['<system>.config.json'],
  'lib/system.js': ['registry-components.js'],
  'server.js': ['interaction-contract.json'],
  'schemas/index.js': [],
};

function intentOf(p) {
  if (INTENT[p]) return INTENT[p];
  if (p.startsWith('schemas/schema.')) { const t = p.slice(15); return [`schema_for_${t}_nodes`, `The ${t} node type's fields, copied from the system template; the system owns this copy.`]; }
  if (p.startsWith('data/nodes/')) { const [, , type] = p.split('/'); return [`seed_${type}_node`, `A seed ${type} node of the core component, so the skeleton has the component shape from its first boot.`]; }
  if (/\.gitkeep$/.test(p)) { const d = path.dirname(p); return [`keep_${d.replace(/\W+/g, '_')}`, `Keeps ${d}/ in version control.`]; }
  throw new Error(`no intent for ${p}`);
}

// Each file's depends: its relative require()s, the files it reads at run time, and a seed node's schema.
function _deps(f, keys) {
  const out = new Set();
  const re = /require\(\s*'(\.{1,2}\/[^']+)'\s*\)/g;
  let m;
  while ((m = re.exec(f.content))) {
    let r = path.posix.normalize(path.posix.join(path.posix.dirname(f.p), m[1]));
    if (!r.endsWith('.js') && !r.endsWith('.json')) r += '.js';
    if (!keys.has(r)) throw new Error(`${f.p} requires ${r}, not in the tree`);
    out.add(keys.get(r));
  }
  for (const e of EXTRA[f.p] || []) out.add(keys.get(e));
  if (f.p.startsWith('data/nodes/')) out.add(keys.get(`schemas/schema.${f.p.split('/')[2]}`));
  return [...out];
}

const GROUPS = [
  ['identity and configuration', p => /^(package\.json|<system>\.config\.json|config\.js|compartment\.json)$/.test(p)],
  ['registry, contract and taxonomy', p => /^(registry-components\.js|interaction-contract\.json|event-taxonomy\.js|contracts\/)/.test(p)],
  ['schemas', p => p.startsWith('schemas/')],
  ['data: nodes, index, ledger, baseline', p => p.startsWith('data/') || p === 'jaa-store.js'],
  ['lib: the code the nodes point at', p => p.startsWith('lib/')],
  ['entry points', p => /^(server|cli)\.js$/.test(p)],
  ['spec, input/output, tests', () => true],
];

/** catalogText() -> the GENESIS_FILE_TREE block's body, from the archetype's files as they are now */
function catalogText() {
  const files = NS.files().map(f => ({ ...f, p: f.path.replace(/\{\{slug\}\}/g, '<system>') }));
  const keys = new Map();
  files.forEach((f, i) => { f.key = `gs${String(i + 1).padStart(4, '0')}`; keys.set(f.p, f.key); });
  const lines = [], placed = new Set();
  for (const [title, test] of GROUPS) {
    const g = files.filter(f => !placed.has(f.p) && test(f.p));
    if (!g.length) continue;
    lines.push(`  // ── ${title}`);
    for (const f of g) {
      placed.add(f.p);
      const [intent, summary] = intentOf(f.p);
      const d = _deps(f, keys);
      lines.push(`  file "${f.p}" {`);
      lines.push(`    uuid    = ${f.key}-${f.from.replace(/[^a-z]/g, '').slice(0, 5).padEnd(5, 'x')}-4000-8000-${String(Number(f.key.slice(2))).padStart(12, '0')}`);
      lines.push(`    intent  = ${intent}`);
      lines.push(`    summary = "${summary.replace(/"/g, "'")}"`);
      lines.push(`    source  = ${f.from}`);
      lines.push(`    depends = [${d.length ? ' ' + d.map(x => `"${x}"`).join(', ') + ' ' : ''}]`);
      lines.push('  }');
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

const OPEN = 'catalog GENESIS_FILE_TREE {\n\n';
const CLOSE = '\n}\n\n// ══════════════════════════════════════════════════════════════════════════════\n// Build order';

/** inSpec(text) -> the catalog block as genesis.spec has it */
function inSpec(text = fs.readFileSync(GENESIS, 'utf8')) {
  const a = text.indexOf(OPEN), b = text.indexOf(CLOSE);
  if (a < 0 || b < a) throw new Error('genesis.spec: no GENESIS_FILE_TREE block in the 1.4.0 layout');
  return text.slice(a + OPEN.length, b).trimEnd();
}

function write() {
  const text = fs.readFileSync(GENESIS, 'utf8');
  const a = text.indexOf(OPEN) + OPEN.length, b = text.indexOf(CLOSE);
  fs.writeFileSync(GENESIS, text.slice(0, a) + catalogText() + text.slice(b));
}

if (require.main === module) { if (process.argv.includes('--write')) write(); else process.stdout.write(catalogText() + '\n'); }

module.exports = { catalogText, inSpec, write, GENESIS };
