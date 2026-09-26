'use strict';

const { runVaultCommand } = require('../cli/commands/vault.js');

module.exports = {
  name:    'vault',
  version: '1.0.0',
  summary: 'Per-compartment secret storage (set/get/list/delete/grant/revoke/audit/export/import)',
  usage:   'cos vault <set|get|list|delete|grant|revoke|audit|export|import> [args] [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = runVaultCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
