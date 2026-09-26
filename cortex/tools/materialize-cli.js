#!/usr/bin/env node
'use strict';
/**
 * cortex/tools/materialize-cli.js — CLI for table-materializer.js.
 * Usage: node cortex/tools/materialize-cli.js <table> [--apply]
 * Default is dry-run; --apply performs the real write.
 */
const path = require('path');
const { jaaDB } = require('../memory/jaa-db.js');
const cm = require('../../loom/scanners/capability-map.js');
const { materializeTable } = require('./table-materializer.js');

const TABLE_CONFIGS = {
  components: () => {
    const decls = cm.loadAll();
    const declaredIds = new Set(decls.map(d => d.id));
    const { served } = cm.verifyRoutes(decls);
    return {
      nodeType: 'component',
      idOf: (r) => r.id, // real, readable dotted id — NOT r.uuid
      toPayload: (r) => ({ id: r.id, uuid: r.uuid, namespace: r.namespace, name: r.name, version: r.version }),
      fingerprint: (r) => `${r.namespace}::${r.route ? r.route.method + ' ' + r.route.path : 'no-route'}`,
      ownerOf: (r) => r.namespace,
      proofCheck: (r) => {
        if (!declaredIds.has(r.id)) return { ok: false, reason: 'no longer declared in any registry-components.js -- stale' };
        const isServed = served.get(r.id);
        return { ok: !!isServed, reason: isServed ? 'served' : 'declared but no real route serves it' };
      },
    };
  },
};

if (require.main === module) {
  const table = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!table || !TABLE_CONFIGS[table]) {
    console.error(`Usage: node cortex/tools/materialize-cli.js <table> [--apply]\nKnown tables: ${Object.keys(TABLE_CONFIGS).join(', ')}`);
    process.exit(1);
  }
  const rows = jaaDB.query(table);
  const cfg = TABLE_CONFIGS[table]();
  const summary = materializeTable({ table, rows, dryRun: !apply, ...cfg });
  console.log(JSON.stringify(summary, null, 2));
}
module.exports = { TABLE_CONFIGS };
