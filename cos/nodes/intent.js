'use strict';

const { setIntent, intentLines, readIntentFile } = require('../cli/commands/intent.js');
const INTENT = require('../foundation/intent.js');

module.exports = {
  name:    'intent',
  version: '1.0.0',
  summary: 'Show or set a compartment\'s intent — its end state, conditions and axioms',
  usage:   'cos intent <name> [--file=<intent.spec>] [--json]',
  flags:   [
    { name: 'file', type: 'string',  description: 'Set the intent from this file (charter: / intent: with end_state, conditions, axioms)' },
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const name = ctx.args[0];
    if (!name) { console.error('  usage: cos intent <name> [--file=<intent.spec>]'); return 1; }
    try {
      let comp = ctx.host.store.getCompartmentByName(name) || ctx.host.store.getCompartment(name);
      if (ctx.flags.file) comp = setIntent(ctx.host, { name, intent: readIntentFile(ctx.flags.file) });
      if (!comp) { console.error(`  compartment "${name}" not found`); return 1; }
      if (ctx.flags.json) console.log(JSON.stringify({ name: comp.name, intent: comp.intent, effective: INTENT.effective(comp, ctx.host.store), status: comp.intentStatus }, null, 2));
      else console.log(['', `  ${comp.name} — intent${ctx.flags.file ? ' set' : ''}`, ...intentLines(comp, ctx.host.store), ''].join('\n'));
      return 0;
    } catch (e) { console.error(`  ${e.message}`); return 1; }
  },
};
