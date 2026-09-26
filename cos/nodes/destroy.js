'use strict';

const { runDestroyWizard } = require('../cli/commands/destroy.js');

module.exports = {
  name:    'destroy',
  version: '1.0.0',
  summary: 'Destroy compartment',
  usage:   'cos destroy <name> [--force] [--wipe]',
  flags:   [
    { name: 'force', type: 'boolean', description: 'Skip confirmation prompts' },
    { name: 'wipe',  type: 'boolean', description: 'Wipe filesystem on destroy' },
  ],
  async run(ctx) {
    const name = ctx.args[0];
    const ok = await runDestroyWizard(ctx.host, name, ctx.flags);
    return ok ? 0 : 1;
  },
};
