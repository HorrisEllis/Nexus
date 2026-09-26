'use strict';

const { validateSchema, validateCommandNodes } = require('../cli/commands/schema.js');

module.exports = {
  name:    'schema',
  version: '1.1.0',
  summary: 'Validate hooks and/or command nodes against their schemas',
  usage:   'cos schema validate [--hooks] [--commands] [--json]',
  flags:   [
    { name: 'hooks',    type: 'boolean', description: 'Validate hooks only' },
    { name: 'commands', type: 'boolean', description: 'Validate command nodes only' },
    { name: 'json',     type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub = ctx.args[0];
    if (sub !== 'validate') {
      ctx.error('  Usage: cos schema validate [--hooks] [--commands]');
      return 1;
    }

    // Default: validate both. --hooks or --commands narrows to one.
    const doHooks    = ctx.flags.hooks    || !ctx.flags.commands;
    const doCommands = ctx.flags.commands || !ctx.flags.hooks;

    let invalid = 0;
    if (doHooks) {
      const r = validateSchema(ctx.host, ctx.flags);
      invalid += r.invalid;
    }
    if (doCommands) {
      const r = validateCommandNodes(ctx.flags);
      invalid += r.invalid;
    }

    return invalid === 0 ? 0 : 1;
  },
};
