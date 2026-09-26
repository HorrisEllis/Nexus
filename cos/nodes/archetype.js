'use strict';

const { runArchetypeCommand } = require('../cli/commands/archetype.js');

module.exports = {
  name:    'archetype',
  version: '1.0.0',
  summary: 'Manage compartment archetypes (templates)',
  usage:   'cos archetype <list|show|assign|detect|create> [args] [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = runArchetypeCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
