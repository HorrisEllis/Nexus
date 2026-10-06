'use strict';
/**
 * cos/archetype/components/index.js — reusable system components, the parts a COS system template is assembled from.
 * UUID: nexus-cos-system-components-v1-0000-2026-1006-jamesbrooks-001
 *
 * §0.39.359 SB30 — James: "then we can have it a cos template with reusable components." Each component is a folder
 * of real files, laid out where they go in a system (components/<id>/<path in the system>). A template names the
 * components it uses; `requires` pulls in what a component needs, so naming `listener` brings `node-index`,
 * `envelope` and `atomic-write` with it. No component imports Nexus: a system built from them stands alone.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;

const COMPONENTS = Object.freeze([
  { id: 'atomic-write', intent: 'write a file whole or not at all; retries the Windows EPERM/EBUSY rename', requires: [] },
  { id: 'envelope',     intent: 'node files: read, write, fingerprint and check against a schema', requires: ['atomic-write'] },
  { id: 'jaa-store',    intent: 'the JAA database: a table per name, rows by id, a ledger beside each', requires: ['atomic-write'] },
  { id: 'ledger',       intent: 'every event, per session, timestamped', requires: [] },
  { id: 'bus',          intent: 'the one way an event moves: ledger first, then listeners', requires: ['ledger'] },
  { id: 'node-index',   intent: 'the node files indexed in JAA tables, one per node type, with history', requires: ['envelope', 'jaa-store'] },
  { id: 'listener',     intent: 'a node dropped into its folder goes live; capability bundles kept current', requires: ['node-index', 'bus'] },
  { id: 'heartbeat',    intent: 'the pulse: uptime, node counts, problems, on an interval', requires: ['node-index', 'bus'] },
  { id: 'handshake',    intent: 'verify another system\'s interaction contract before calling it', requires: [] },
  { id: 'commands',     intent: 'run command nodes through the registry; emit their events', requires: ['node-index', 'bus'] },
]);

function _walk(dir, base = dir) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(..._walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

function list() { return COMPONENTS.map(c => ({ ...c, files: _walk(path.join(DIR, c.id)) })); }

function get(id) { return list().find(c => c.id === id) || null; }

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
    for (const rel of _walk(path.join(DIR, id))) out.push({ path: rel, content: fs.readFileSync(path.join(DIR, id, rel), 'utf8'), component: id });
  }
  return out;
}

module.exports = { COMPONENTS, list, get, resolve, files, MODULE_ID: 'cos-system-components', VERSION: '1.0.0' };
