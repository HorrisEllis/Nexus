'use strict';
// schemas/index.js — the system's own schemas, one file per node type (schema.<type>). The system owns these copies;
// a node type with no schema here is refused by the node index until one is added.
const fs = require('fs');
const path = require('path');

function loadAll(dir = __dirname) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter(f => f.startsWith('schema.'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (doc.type !== 'schema') throw new Error(`schemas/${f}: type is "${doc.type}", expected "schema"`);
    out[doc.id] = doc.payload;
  }
  return out;
}

function create(dir = __dirname) {
  const all = loadAll(dir);
  return { get: (type) => all[type] || null, types: () => Object.keys(all).sort(), all };
}

module.exports = { create, loadAll };
