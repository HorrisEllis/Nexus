'use strict';

const { runCreateWizard } = require('../cli/commands/create.js');

module.exports = {
  name:    'create',
  version: '1.0.0',
  summary: 'Create a new compartment',
  usage:   'cos create [name]',
  flags:   [],
  async run(ctx) {
    const nameArg = ctx.args[0] || null;
    const result  = await runCreateWizard(ctx.host, nameArg);
    ctx.host.store.flushSync();
    return result ? 0 : 1;
  },
};
