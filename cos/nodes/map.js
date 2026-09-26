'use strict';

const { renderMap } = require('../cli/commands/map.js');

module.exports = {
  name:    'map',
  version: '1.0.0',
  summary: 'Print the system map',
  usage:   'cos map [--json] [--watch]',
  flags:   [
    { name: 'json',  type: 'boolean', description: 'Output as JSON' },
    { name: 'watch', type: 'boolean', description: 'Live-updating output' },
  ],
  run(ctx) {
    renderMap(ctx.host, ctx.flags);
    return ctx.flags.watch ? undefined : 0;
  },
};
