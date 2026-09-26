'use strict';

const { attachCompartment } = require('../cli/commands/run.js');

module.exports = {
  name:    'attach',
  version: '1.0.0',
  summary: 'Attach to running compartment (stream output)',
  usage:   'cos attach <name>',
  flags:   [],
  run(ctx) {
    const compName = ctx.args[0];
    if (!compName) { ctx.error('  Usage: cos attach <name>'); return 1; }
    attachCompartment(ctx.host, compName);
    return undefined;
  },
};
