'use strict';

const { runCommand, attachCompartment } = require('../cli/commands/run.js');

module.exports = {
  name:    'run',
  version: '1.0.0',
  summary: 'Send command to running compartment stdin',
  usage:   'cos run <name> <command>',
  flags:   [],
  run(ctx) {
    const compName = ctx.args[0];
    const cmd = ctx.args.slice(1).join(' ');
    if (!compName) { ctx.error('  Usage: cos run <name> <command>'); return 1; }
    if (!cmd) {
      attachCompartment(ctx.host, compName);
      return undefined;
    }
    return runCommand(ctx.host, compName, cmd) ? 0 : 1;
  },
};
