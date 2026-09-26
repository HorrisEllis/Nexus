'use strict';

const { runVaultdCommand } = require('../cli/commands/vaultd.js');

module.exports = {
  name:    'vaultd',
  version: '1.0.0',
  summary: 'Manage the vault daemon (install/start/stop/status/migrate/config/backup/restore)',
  usage:   'cos vaultd <install|start|stop|status|migrate|config|backup|restore> [args] [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  async run(ctx) {
    const sub  = ctx.args[0];
    const rest = ctx.args.slice(1);
    const result = await runVaultdCommand(ctx.host, sub, rest, ctx.flags);
    return result === null ? 1 : 0;
  },
};
