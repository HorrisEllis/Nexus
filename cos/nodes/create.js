'use strict';

const { runCreateWizard } = require('../cli/commands/create.js');
const { setIntent, readIntentFile } = require('../cli/commands/intent.js');

module.exports = {
  name:    'create',
  version: '1.0.0',
  summary: 'Create a new compartment',
  usage:   'cos create [name] [--intent=<intent.spec>]',
  flags:   [
    { name: 'intent', type: 'string', description: 'Its intent from this file: the end state, conditions and axioms' },
  ],
  async run(ctx) {
    const nameArg = ctx.args[0] || null;
    // §2026-10-07 — the intent is read (and refused, with why) before anything is created
    let intent = null;
    if (ctx.flags.intent) { try { intent = readIntentFile(ctx.flags.intent); } catch (e) { console.error(`  ${e.message}`); return 1; } }
    const result  = await runCreateWizard(ctx.host, nameArg);
    if (result && intent) { try { setIntent(ctx.host, { name: result.name, intent }); } catch (e) { console.error(`  created, but ${e.message}`); return 1; } }
    ctx.host.store.flushSync();
    return result ? 0 : 1;
  },
};
