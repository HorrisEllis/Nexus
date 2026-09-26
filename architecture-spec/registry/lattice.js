'use strict';
/**
 * .architecture/compiler/lattice.js — compiles every Component/Hook/Wire
 * node file into a single CompiledLattice. Generalization of
 * loom/schema/registry.js's graph() method — same algorithm, scoped to
 * run against any project's own .architecture/nodes/ tree.
 *
 * Stateless between runs: every call reads every node file fresh. There
 * is no incremental-update path — an incremental compiler that drifts
 * from the files on disk is the competing-truth-layer failure this
 * pattern exists to prevent.
 */
const fs = require('fs');
const path = require('path');

function _readJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      if (f.endsWith('.json')) return JSON.parse(raw);
      // Minimal YAML front-matter-free parse deferred to the caller's own
      // yaml lib in a real build — kept out of this file to stay dependency-free.
      throw new Error(`lattice.js: YAML nodes require a yaml parser wired in by the caller (${f})`);
    });
}

function compileLattice({ nodesDir }) {
  const components = _readJsonFiles(path.join(nodesDir, 'component'));
  const hooks       = _readJsonFiles(path.join(nodesDir, 'hook'));
  const wires        = _readJsonFiles(path.join(nodesDir, 'wire'));

  const nodes = {};
  for (const c of components) nodes[c.id] = { kind: 'component', status: c.status || 'stub' };
  const hookById = {};
  for (const h of hooks) { hookById[h.id] = h; nodes[h.id] = { kind: 'hook', status: h.status || 'stub' }; }

  const edges = [];
  const orphans = [];
  for (const w of wires) {
    const from = hookById[w.from_hook_id];
    const to   = hookById[w.to_hook_id];
    if (!from) orphans.push(w.from_hook_id);
    if (!to)   orphans.push(w.to_hook_id);
    if (from && to) edges.push({ from: w.from_hook_id, to: w.to_hook_id, intent: w.intent || null });
  }

  return {
    generated: new Date().toISOString(),
    nodes,
    edges,
    orphans: [...new Set(orphans)],
  };
}

module.exports = { compileLattice };
