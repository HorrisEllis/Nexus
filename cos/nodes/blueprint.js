'use strict';

const { runBlueprintCommand } = require('../cli/commands/blueprint.js');

module.exports = {
  name:    'blueprint',
  version: '1.0.0',
  summary: 'Manage blueprints and blueprint instances',
  usage:   'cos blueprint <list|show|create|destroy|status|import> [args] [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = runBlueprintCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
