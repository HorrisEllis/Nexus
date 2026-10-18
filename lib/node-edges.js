'use strict';
/**
 * lib/node-edges.js — GM4 (0.60.157): what a node says about its edges, read from its file (the truth, §10.3), nothing copied.
 * comp_id: nexus.lib.node-edges
 *
 * James, 2026-10-18: "associative lattice, every data node, is a node in the associative lattice, interconnected by the timestamp
 * and cuasal graph." Map: docs/2026-10-18-gate-memory-phasemap.spec GM4. The lattice (intelligence/lattice/node-lattice.js)
 * reads every system's projection through Idearium's GET /api/system/nodes/:system?edges=1, never the files.
 *
 *   project(doc) → { id, type, system, at, atFrom, summary, causedBy: [string], strings: [string], wire?: { from, to, kind } }
 *     causedBy   every causedBy / caused_by / cause the node carries (envelope, context or payload), as written
 *     strings    the short strings inside it (≤ 120 chars, ≤ 200 of them): the lattice keeps those that name another node
 *     at, atFrom its time in ms: when it happened (its payload's ts/at/updatedAt, atFrom 'payload'), else when its file was
 *                written (the envelope's export times, atFrom 'export')
 *     system     as the node says, else the system whose folder holds it
 *   readSystem(dir) → { nodes: [projection], types, invalid: [{ file, why }] } — every node file under <system>/data/nodes,
 *     read-only, with or without a node database (a system the route said had "no database yet" is read the same way)
 */

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.node-edges';
const VERSION = '1.0.0';
const MAX_STRINGS = 200;
const MAX_LEN = 120;

const _ms = (v) => { if (v == null) return null; const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) ? n : null; };

function _walk(v, out, causes, depth = 0) {
  if (v == null || depth > 6 || out.size >= MAX_STRINGS) return;
  if (typeof v === 'string') { const s = v.trim(); if (s.length >= 3 && s.length <= MAX_LEN) out.add(s); return; }
  if (Array.isArray(v)) { for (const x of v) _walk(x, out, causes, depth + 1); return; }
  if (typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (/^(causedBy|caused_by|cause|causes)$/.test(k)) for (const c of [].concat(x || [])) if (typeof c === 'string' && c) causes.add(c);
      _walk(x, out, causes, depth + 1);
    }
  }
}

function project(doc) {
  const strings = new Set(), causes = new Set();
  _walk({ context: doc.context, source: doc.source, payload: doc.payload, tags: doc.tags, causedBy: doc.causedBy }, strings, causes);
  strings.delete(String(doc.id));
  // the time the thing HAPPENED (its payload's own time) is kept apart from when its file was written (the envelope's export
  // times): a batch export stamps hundreds of nodes in one second, and joining them by that would be noise read as context
  const p = doc.payload && typeof doc.payload === 'object' ? doc.payload : {};
  const happened = [p.ts, p.at, p.updatedAt, p.createdAt, p.timestamp].map(_ms).filter(Boolean);
  const written = [doc.lastSeenAt, doc.exported_at, doc.updatedAt, doc.exportedAt, doc.createdAt, doc.ts].map(_ms).filter(Boolean);
  const at = happened.length ? Math.max(...happened) : written.length ? Math.max(...written) : null;
  return { id: String(doc.id), type: doc.type || null, system: doc.system || null, at, atFrom: happened.length ? 'payload' : written.length ? 'export' : null,
    summary: doc.summary ? String(doc.summary).slice(0, 200) : null, causedBy: [...causes], strings: [...strings],
    ...(doc.type === 'wire' && p.from && p.to ? { wire: { from: String(p.from), to: String(p.to), kind: p.kind || null } } : {}) };
}

function readSystem(dir) {
  const nodesDir = path.join(dir, 'data', 'nodes');
  const NE = require('./node-export.js');
  const nodes = [], invalid = [], types = {};
  let typeDirs = [];
  try { typeDirs = fs.readdirSync(nodesDir, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== '_archive').map(e => e.name); } catch (_) { return { nodes, types, invalid, missing: true }; }
  for (const t of typeDirs) {
    let files = [];
    try { files = fs.readdirSync(path.join(nodesDir, t)).filter(f => !f.startsWith('.') && !/ledger/.test(f)); } catch (_) {}
    types[t] = 0;
    for (const f of files) {
      try { const doc = NE.importFromFile(path.join(nodesDir, t, f)); nodes.push(project({ ...doc, type: doc.type || t, system: doc.system || path.basename(dir) })); types[t]++; }
      catch (e) { invalid.push({ file: `${t}/${f}`, why: String(e.message).slice(0, 160) }); }
    }
  }
  return { nodes, types, invalid };
}

module.exports = { MODULE_ID, VERSION, project, readSystem };
