'use strict';

const { runVmCommand } = require('../cli/commands/vm.js');

module.exports = {
  name:    'vm',
  version: '1.0.0',
  summary: 'Manage qemu-windows VM compartments (status/reset/snapshot/base-image/cleanup)',
  usage:   'cos vm <status|reset|stop|snapshot|base-image|cleanup> [args] [--json] [--force]',
  flags:   [
    { name: 'json',  type: 'boolean', description: 'Output as JSON (status only)' },
    { name: 'force', type: 'boolean', description: 'Skip the running-VM guard on reset; hard-kill after powerdown on stop' },
  ],
  async run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = await runVmCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
