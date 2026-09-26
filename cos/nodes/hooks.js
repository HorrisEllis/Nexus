'use strict';

const { runHooksCommand } = require('../cli/commands/hooks.js');

module.exports = {
  name:    'hooks',
  version: '1.0.0',
  summary: 'Manage registered hooks',
  usage:   'cos hooks <list|show|fire> [args]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = runHooksCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
