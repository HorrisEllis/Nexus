'use strict';
/**
 * .architecture/registry/decompose.js — agnostic decomposition tool.
 *
 * Takes anything with declared seams (cut points) — a phasemap, a
 * component, a block of a spec file — and breaks it into node-sized
 * pieces, wires them together (dependency edges become Wire nodes),
 * and writes them into the registry's own node layout so the existing
 * lattice compiler and watcher pick them up with no special-casing.
 *
 * Agnostic means: the tool doesn't know what a "phase" or a
 * "component" is. It knows how to walk a seam-bounded structure and
 * produce {id, meta, depends_on} records. Callers supply the seam
 * detection strategy for their own content shape.
 */
const fs = require('fs');
const path = require('path');

/**
 * findSeams(obj, atPath) — the simplest real strategy: every key one
 * level under `atPath` in a parsed object is a seam-bounded chunk.
 * (A phasemap's `spec.phases.*` is exactly this shape — see test below.)
 * Returns [{ id, value }] in declaration order.
 */
function findSeamsByTopLevelKeys(obj, atPath) {
  const segments = atPath.split('.').filter(Boolean);
  let node = obj;
  for (const seg of segments) {
    if (node == null) return [];
    node = node[seg];
  }
  if (!node || typeof node !== 'object') return [];
  return Object.keys(node).map(id => ({ id, value: node[id] }));
}

/**
 * decomposePhasemap({ phases, sourceFile }) — phases: object keyed by
 * phase id, each { does, gate, status, depends_on, system }.
 * Returns { bySystem, wires, hooks } — hooks are the .entry/.done
 * endpoints every wire above actually references. Without these, the
 * wires produced are orphans by construction (confirmed by running the
 * real lattice compiler against this tool's own output before this
 * fix — every wire pointed at a hook id that didn't exist as a file).
 */
function decomposePhasemap({ phases, sourceFile }) {
  const chunks = findSeamsByTopLevelKeys({ phases }, 'phases');
  const bySystem = {};
  const wires = [];
  const hooks = [];
  const seenHooks = new Set();

  function addHook(phaseId, suffix, direction) {
    const id = `${phaseId}.${suffix}`;
    if (seenHooks.has(id)) return id;
    seenHooks.add(id);
    hooks.push({ id, component_id: phaseId, name: suffix, type: 'callto', direction });
    return id;
  }

  for (const { id, value } of chunks) {
    const system = value.system || 'unassigned';
    const record = {
      id,
      type: 'phase',
      intent: value.does || '',
      entry_condition: (value.depends_on || []).length
        ? `all of: ${value.depends_on.join(', ')} done`
        : 'none — first phase',
      exit_gate: value.gate || '',
      status: value.status || 'pending',
      source_file: sourceFile,
    };
    (bySystem[system] = bySystem[system] || []).push(record);

    const entryHook = addHook(id, 'entry', 'in');
    const doneHook = addHook(id, 'done', 'out');

    for (const dep of (value.depends_on || [])) {
      const depDoneHook = addHook(dep, 'done', 'out');
      wires.push({
        id: `${dep}__to__${id}`,
        from_hook_id: depDoneHook,
        to_hook_id: entryHook,
        intent: `${id} cannot begin until ${dep} is done`,
      });
    }
  }
  return { bySystem, wires, hooks };
}

/**
 * migrateToSystemFolders(decomposed, baseDir) — writes each system's
 * phase records to <baseDir>/<system>/phases/<phase-id>.json. Returns
 * the list of files written. Does not touch a system's folder if it
 * has no phases in this decomposition (never creates an empty phases/
 * dir speculatively).
 */
function migrateToSystemFolders({ bySystem }, baseDir) {
  const written = [];
  for (const [system, records] of Object.entries(bySystem)) {
    const dir = path.join(baseDir, system, 'phases');
    fs.mkdirSync(dir, { recursive: true });
    for (const rec of records) {
      const filePath = path.join(dir, `${rec.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(rec, null, 2));
      written.push(filePath);
    }
  }
  return written;
}

/**
 * wireIntoRegistry(decomposed, nodesDir) — writes one Hook node file per
 * phase endpoint and one Wire node file per dependency edge into
 * nodesDir/{hook,wire}/, matching the exact schemas
 * .architecture/schema/{hook,wire}.js validate. Real registry
 * integration, not a separate parallel format.
 */
function wireIntoRegistry({ wires, hooks }, nodesDir) {
  const hookDir = path.join(nodesDir, 'hook');
  const wireDir = path.join(nodesDir, 'wire');
  fs.mkdirSync(hookDir, { recursive: true });
  fs.mkdirSync(wireDir, { recursive: true });
  const written = [];
  for (const h of (hooks || [])) {
    const filePath = path.join(hookDir, `${h.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(h, null, 2));
    written.push(filePath);
  }
  for (const w of wires) {
    const filePath = path.join(wireDir, `${w.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(w, null, 2));
    written.push(filePath);
  }
  return written;
}

module.exports = { findSeamsByTopLevelKeys, decomposePhasemap, migrateToSystemFolders, wireIntoRegistry };
