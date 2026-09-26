'use strict';

const { runEventsCommand } = require('../cli/commands/events.js');

module.exports = {
  name:    'events',
  version: '1.0.0',
  summary: 'Event bus stream / tail',
  usage:   'cos events <stream|tail> [--n=<count>] [--json]',
  flags:   [
    { name: 'n',    type: 'number',  description: 'Number of events for tail (default: 20)' },
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    runEventsCommand(ctx.host, sub, rest, ctx.flags);
    return ctx.flags.watch || sub === 'stream' ? undefined : 0;
  },
};
