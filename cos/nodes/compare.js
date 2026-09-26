'use strict';

const { run: runCompareCommand } = require('../cli/commands/compare.js');

module.exports = {
  name:    'compare',
  version: '1.0.0',
  summary: 'Compare branches of a compartment (run/branches/reports/show)',
  usage:   'cos compare <run|branches|reports|show> <compartment> [args]',
  flags:   [],
  async run(ctx) {
    // compare.js does its own --flag parsing internally, so it needs the
    // raw, unsplit args (not ctx.args, which has had --flags stripped out).
    await runCompareCommand(ctx.host, ctx.rawArgs);
    return 0;
  },
};
