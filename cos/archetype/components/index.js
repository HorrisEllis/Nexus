'use strict';
/**
 * cos/archetype/components/index.js — reusable system components, the parts the nexus-system template is made of.
 * UUID: nexus-cos-system-components-v1-0000-2026-1006-jamesbrooks-001
 *
 * §0.39.359 SB30 — James: "then we can have it a cos template with reusable components." A component is a named set of
 * files in the skeleton's own tree (cos/archetype/nexus-system/), at the paths they have in a system — one tree, so
 * every require between them resolves where it is kept. Any repo can take one alone (cos-component:<id>); `requires`
 * brings what it needs, so `listener` comes with `node-index`, `envelope`, `atomic-write`, `jaa-store`, `bus` and
 * `ledger`. No component imports Nexus: a system built from them stands alone.
 */
const fs = require('fs');
const path = require('path');

const TREE = path.join(__dirname, '..', 'nexus-system');

const COMPONENTS = Object.freeze([
  { id: 'atomic-write', files: ['lib/atomic-write.js'], intent: 'write a file whole or not at all; retries the Windows EPERM/EBUSY rename', requires: [] },
  { id: 'envelope',     files: ['lib/envelope.js'], intent: 'node files: read, write, fingerprint and check against a schema', requires: ['atomic-write'] },
  { id: 'jaa-store',    files: ['jaa-store.js'], intent: 'the JAA database: a table per name, rows by id, a ledger beside each', requires: ['atomic-write'] },
  { id: 'ledger',       files: ['lib/ledger.js'], intent: 'every event, per session, timestamped', requires: [] },
  { id: 'bus',          files: ['lib/bus.js'], intent: 'the one way an event moves: ledger first, then listeners', requires: ['ledger'] },
  { id: 'node-index',   files: ['lib/node-index.js'], intent: 'the node files indexed in JAA tables, one per node type, with history', requires: ['envelope', 'jaa-store'] },
  { id: 'listener',     files: ['lib/listener.js'], intent: 'a node dropped into its folder goes live; capability bundles kept current', requires: ['node-index', 'bus'] },
  { id: 'heartbeat',    files: ['lib/heartbeat.js'], intent: 'the pulse: uptime, node counts, problems, on an interval', requires: ['node-index', 'bus'] },
  { id: 'handshake',    files: ['contracts/handshake.js'], intent: 'verify another system\'s interaction contract before calling it', requires: [] },
  { id: 'commands',     files: ['lib/commands.js'], intent: 'run command nodes through the registry; emit their events', requires: ['node-index', 'bus'] },
]);

function list() { return COMPONENTS.map(c => ({ ...c, files: [...c.files] })); }

function get(id) { return list().find(c => c.id === id) || null; }

/** every file path a component owns — the rest of the tree is the skeleton's own */
function owned() { return new Set(COMPONENTS.flatMap(c => c.files)); }

/** resolve(ids) -> every component those ids need, dependencies first, each once. Unknown ids throw. */
function resolve(ids) {
  const out = [], seen = new Set();
  const visit = (id, chain = []) => {
    if (seen.has(id)) return;
    const c = COMPONENTS.find(x => x.id === id);
    if (!c) throw new Error(`no system component "${id}"${chain.length ? ` (needed by ${chain.join(' → ')})` : ''}`);
    if (chain.includes(id)) throw new Error(`component cycle: ${[...chain, id].join(' → ')}`);
    for (const r of c.requires) visit(r, [...chain, id]);
    seen.add(id); out.push(id);
  };
  for (const id of ids) visit(id);
  return out;
}

/** files(ids) -> [{ path, content, component }] for those components and what they require. */
function files(ids) {
  const out = [];
  for (const id of resolve(ids)) {
    for (const rel of COMPONENTS.find(c => c.id === id).files) out.push({ path: rel, content: fs.readFileSync(path.join(TREE, rel), 'utf8'), component: id });
  }
  return out;
}

module.exports = { COMPONENTS, TREE, list, get, owned, resolve, files, MODULE_ID: 'cos-system-components', VERSION: '1.0.0' };
