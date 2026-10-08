'use strict';

const { verifyCompartment, intentLines } = require('../cli/commands/intent.js');

module.exports = {
  name:    'verify',
  version: '1.0.0',
  summary: 'Check a compartment against its intent: its end state, and that its conditions hold',
  usage:   'cos verify <name> [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const name = ctx.args[0];
    if (!name) { console.error('  usage: cos verify <name>'); return 1; }
    try {
      const { status, compartment } = verifyCompartment(ctx.host, { name });
      if (ctx.flags.json) console.log(JSON.stringify(status, null, 2));
      else console.log(['', `  ${compartment.name} — checked against its intent`, ...intentLines(compartment, ctx.host.store), ''].join('\n'));
      // 0: every condition holds (the end state may still be partway); 2: a condition is broken; 3: no intent
      return status.none ? 3 : status.ok ? 0 : 2;
    } catch (e) { console.error(`  ${e.message}`); return 1; }
  },
};
