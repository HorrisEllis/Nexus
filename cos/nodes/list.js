'use strict';

const { listCompartments } = require('../cli/commands/list.js');

module.exports = {
  name:    'list',
  version: '1.0.0',
  summary: 'List all compartments',
  usage:   'cos list [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    listCompartments(ctx.host, ctx.flags);
    return 0;
  },
};
