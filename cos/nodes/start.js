'use strict';

const { startCompartment } = require('../cli/commands/start.js');

module.exports = {
  name:    'start',
  version: '1.0.0',
  summary: 'Start compartment (state transition)',
  usage:   'cos start <name>',
  flags:   [],
  run(ctx) {
    const name = ctx.args[0];
    if (!name) { ctx.error('  Usage: cos start <name>'); return 1; }
    try {
      startCompartment(ctx.host, name);
      return 0;
    } catch {
      return 1;
    }
  },
};
