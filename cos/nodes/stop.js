'use strict';

const { stopCompartment } = require('../cli/commands/stop.js');

module.exports = {
  name:    'stop',
  version: '1.0.0',
  summary: 'Stop compartment (state transition)',
  usage:   'cos stop <name>',
  flags:   [],
  run(ctx) {
    const name = ctx.args[0];
    if (!name) { ctx.error('  Usage: cos stop <name>'); return 1; }
    try {
      stopCompartment(ctx.host, name);
      return 0;
    } catch {
      return 1;
    }
  },
};
