'use strict';

const { runSnapshotCommand } = require('../cli/commands/snapshot.js');

module.exports = {
  name:    'snapshot',
  version: '1.0.0',
  summary: 'Take, list, restore, or delete compartment snapshots',
  usage:   'cos snapshot <take|list|restore|delete> <compartment> [args] [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = runSnapshotCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
