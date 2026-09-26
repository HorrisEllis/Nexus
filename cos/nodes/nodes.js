'use strict';

const { loadNodes } = require('./index.js');

module.exports = {
  name:    'nodes',
  version: '1.0.0',
  summary: 'List loaded command nodes (introspect the CLI itself)',
  usage:   'cos nodes list [--json]',
  flags:   [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
  ],
  run(ctx) {
    const sub = ctx.args[0] || 'list';
    if (sub !== 'list') {
      ctx.error('  Usage: cos nodes list');
      return 1;
    }

    const { nodes, errors } = loadNodes();

    if (ctx.flags.json) {
      ctx.log(JSON.stringify({
        nodes: [...nodes.values()].map(n => ({
          name: n.name, version: n.version, summary: n.summary, usage: n.usage, file: n.__file,
        })),
        errors,
      }, null, 2));
      return errors.length === 0 ? 0 : 1;
    }

    ctx.log(`\n  ${nodes.size} command node${nodes.size !== 1 ? 's' : ''} loaded from cos/nodes/\n`);
    for (const n of [...nodes.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      ctx.log(`  ${n.name.padEnd(12)} v${n.version.padEnd(8)} ${n.summary}`);
      ctx.log(`  ${' '.repeat(12)} ${' '.repeat(9)} ${n.usage}`);
    }
    if (errors.length > 0) {
      ctx.log(`\n  ${errors.length} node(s) failed to load:`);
      for (const e of errors) ctx.log(`  ✖ ${e.file}: ${e.message}`);
    }
    ctx.log('');

    return errors.length === 0 ? 0 : 1;
  },
};
