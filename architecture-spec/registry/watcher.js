'use strict';
/**
 * .architecture/registry/watcher.js — live per-type node index + ledger.
 * Generalization of guardian/lib/node-registry.js out of guardian and
 * into any project's own .architecture/registry/ domain. Same real
 * mechanism: watch data/nodes/<type>/, validate on drop, index in
 * memory (a real project wires its own JAA table in here in place of
 * the in-memory Map), append-only per-type ledger for full history.
 */
const fs = require('fs');
const path = require('path');

const NODE_TYPES = Object.freeze(['component', 'hook', 'wire', 'bundle', 'config']);

function _ledgerPath(nodesDir, type) { return path.join(nodesDir, type, '_ledger.jsonl'); }

function _appendLedger(nodesDir, type, entry) {
  const line = JSON.stringify({ ts: Date.now(), type, ...entry }) + '\n';
  try { fs.appendFileSync(_ledgerPath(nodesDir, type), line); }
  catch (e) { console.error(`[architecture-spec/watcher] ledger write failed for ${type}: ${e.message}`); }
}

function createWatcher({ nodesDir, checkFns, onChange = () => {} }) {
  // checkFns: { component: checkComponent, hook: checkHook, wire: checkWire, bundle: checkBundle }
  const registry = new Map(); // type -> Map(id -> { node, filePath })
  const watchers = [];

  function _idFromFilename(filename) { return path.basename(filename, path.extname(filename)); }

  function _processFile(type, filePath) {
    const filename = path.basename(filePath);
    if (filename.startsWith('.') || filename.startsWith('_ledger')) return;

    if (!fs.existsSync(filePath)) {
      const id = _idFromFilename(filename);
      const typeMap = registry.get(type);
      const existed = typeMap && typeMap.has(id);
      if (typeMap) typeMap.delete(id);
      _appendLedger(nodesDir, type, { action: 'deleted', file: filename, id });
      if (existed) onChange({ type, id, action: 'deleted' });
      return;
    }

    let doc;
    try { doc = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (e) {
      _appendLedger(nodesDir, type, { action: 'invalid', file: filename, error: e.message });
      return;
    }

    const check = checkFns[type] ? checkFns[type](doc) : { ok: true };
    if (!check.ok) {
      _appendLedger(nodesDir, type, { action: 'schema_invalid', file: filename, id: doc.id, ...check });
      return;
    }

    if (!registry.has(type)) registry.set(type, new Map());
    const typeMap = registry.get(type);
    const isNew = !typeMap.has(doc.id);
    typeMap.set(doc.id, { node: doc, filePath });
    _appendLedger(nodesDir, type, { action: isNew ? 'added' : 'changed', file: filename, id: doc.id });
    onChange({ type, id: doc.id, action: isNew ? 'added' : 'changed' });
  }

  function start() {
    for (const type of NODE_TYPES) {
      const typeDir = path.join(nodesDir, type);
      if (!fs.existsSync(typeDir)) fs.mkdirSync(typeDir, { recursive: true });
      for (const f of fs.readdirSync(typeDir)) _processFile(type, path.join(typeDir, f));
      const w = fs.watch(typeDir, (_evt, filename) => {
        if (filename) _processFile(type, path.join(typeDir, filename));
      });
      watchers.push(w);
    }
  }

  function stop() { for (const w of watchers) w.close(); }
  function all(type) { return registry.has(type) ? [...registry.get(type).values()] : []; }

  return { start, stop, all };
}

module.exports = { createWatcher, NODE_TYPES };
