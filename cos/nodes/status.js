'use strict';

const { showStatus } = require('../cli/commands/status.js');

module.exports = {
  name:    'status',
  version: '1.0.0',
  summary: 'Show full compartment status',
  usage:   'cos status <name> [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const name = ctx.args[0];
    const result = showStatus(ctx.host, name, ctx.flags);
    return result ? 0 : 1;
  },
};
