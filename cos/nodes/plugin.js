'use strict';

const { runPluginCommand } = require('../cli/commands/plugin.js');

module.exports = {
  name:    'plugin',
  version: '1.0.0',
  summary: 'Manage plugins (list/show/add/enable/disable/remove/scaffold)',
  usage:   'cos plugin <list|show|add|enable|disable|remove|scaffold> [args] [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = runPluginCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
