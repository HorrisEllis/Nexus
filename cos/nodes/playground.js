'use strict';

const { runPlaygroundCommand } = require('../cli/commands/playground.js');

module.exports = {
  name:    'playground',
  version: '1.0.0',
  summary: 'Manage disposable playgrounds (create/status/destroy/promote)',
  usage:   'cos playground <create|list|status|destroy|promote> [args] [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  async run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = await runPlaygroundCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
