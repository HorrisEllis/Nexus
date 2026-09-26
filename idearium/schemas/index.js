// idearium/schemas/index.js — idearium's own, fully sovereign schema registry.
//
// §CORRECTED 2026-09-12 — James: "relevant individual node schemas per
// system. Each system is sovereign remember that." Every type idearium
// uses now has its own real, individual file in this folder — a genuine
// copy, not a pointer to lib/node-schemas.js. Zero runtime dependency on
// the shared registry, and no more async get()/list() either — that was
// only needed for the dynamic import() of the shared CJS module, which
// this version no longer touches.
//
// §HONEST TRADEOFF, NOT HIDDEN — same as every other system's version of
// this file: these copies can drift from lib/node-schemas.js's originals
// if the canonical shape changes later and this copy isn't re-synced.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodeExportModule from '../../lib/node-export.js';

const nodeExport = nodeExportModule;
const SCHEMAS_DIR = path.dirname(fileURLToPath(import.meta.url));

function loadAll() {
  const out = {};
  const files = fs.readdirSync(SCHEMAS_DIR).filter((f) => f.startsWith('schema.'));
  for (const f of files) {
    const doc = nodeExport.importFromFile(path.join(SCHEMAS_DIR, f));
    if (doc.type !== 'schema') {
      throw new Error(`idearium/schemas/index.js: ${f} has type "${doc.type}", expected "schema"`);
    }
    out[doc.id] = doc.payload;
  }
  return out;
}

const SCHEMAS = loadAll();

export function get(type) { return SCHEMAS[type] || null; }

export function list() {
  return Object.entries(SCHEMAS).map(([type, s]) => ({ type, status: s.status, source: s.source, definedIn: 'idearium/schemas' }));
}

export const MODULE_ID = 'idearium-schemas';
export const VERSION = '2.0.0';
export { SCHEMAS };
