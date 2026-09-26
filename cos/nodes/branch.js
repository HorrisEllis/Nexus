'use strict';

const { run: runBranchCommand } = require('../cli/commands/branch.js');

module.exports = {
  name:    'branch',
  version: '1.0.0',
  summary: 'Isolated branch sandbox for a compartment (fork/list/show/diff/run/checkout/rm/kill)',
  usage:   'cos branch <fork|list|show|diff|run|checkout|rm|kill> <compartment> [args]',
  flags:   [],
  async run(ctx) {
    // branch.js does its own --flag parsing internally, so it needs the
    // raw, unsplit args (not ctx.args, which has had --flags stripped out).
    await runBranchCommand(ctx.host, ctx.rawArgs);
    return 0;
  },
};
