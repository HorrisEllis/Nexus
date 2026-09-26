#!/usr/bin/env node
/**
 * cli/index.js
 * COMPARTMENT OS — cos CLI entry point
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Dispatch is dynamic: every subcommand except `version`/`help` (which
 * don't need a host) is loaded from cos/nodes/ by the command listener
 * (nodes/index.js) and validated against foundation/command-schema.js.
 * To add a command, drop a file in cos/nodes/ — see nodes/index.js.
 *
 * All commands boot the host shell (state-store + event-bus + system-map).
 * COS-2:  CLI first — if it can't be done in CLI it doesn't exist yet.
 * COS-13: Host service is the authority. CLI is a client of the host.
 */

'use strict';

const { createHost }                = require('../host/index.js');
const { loadNodes }                 = require('../nodes/index.js');
const { COS_VERSION, SPEC_VERSION } = require('../foundation/constants.js');

// ─── Parse raw argv ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const raw   = argv.slice(2);  // strip node + script
  const flags = {};
  const positional = [];
  let commandTokenIndex = -1;   // index into `raw` of the command token itself

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === '--json')  { flags.json  = true; continue; }
    if (a === '--watch') { flags.watch = true; continue; }
    if (a === '--force') { flags.force = true; continue; }
    if (a === '--wipe')  { flags.wipe  = true; continue; }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v !== undefined ? v : true;
      continue;
    }
    if (positional.length === 0) commandTokenIndex = i;
    positional.push(a);
  }

  // Everything after the command token, completely unparsed — for nodes
  // (branch, compare) that do their own --flag parsing and need to see
  // flags interspersed with positional args, not pre-split.
  const rawArgs = commandTokenIndex === -1 ? [] : raw.slice(commandTokenIndex + 1);

  return { command: positional[0] || null, args: positional.slice(1), flags, rawArgs };
}

// ─── Help (generated from loaded nodes) ────────────────────────────────────────

function printHelp(nodes) {
  const lines = [
    '',
    `  COMPARTMENT OS  v${COS_VERSION}`,
    '',
    '  Usage: cos <command> [options]',
    '',
    '  Commands:',
  ];

  for (const n of [...nodes.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`    ${n.name.padEnd(28)} ${n.summary}`);
  }
  lines.push(
    `    ${'version'.padEnd(28)} Show version info`,
    `    ${'help'.padEnd(28)} Show this help`,
    '',
    '  Flags:',
    '    --json                      Output as JSON',
    '    --watch                     Live-updating output (map)',
    '    --force                     Skip confirmation prompts',
    '    --wipe                      Wipe filesystem on destroy',
    '    --n=<count>                 Number of events for tail (default: 20)',
    '',
    '  Run `cos nodes list` to see full usage strings for every command.',
    ''
  );

  console.log(lines.join('\n'));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(argv = process.argv) {
  const { command, args, flags, rawArgs } = parseArgs(argv);

  // Load + validate command nodes up front. A broken node is reported,
  // not fatal — the rest of the CLI keeps working (see nodes/index.js).
  const { nodes, errors } = loadNodes();

  if (!command || command === 'help' || flags.help) {
    printHelp(nodes);
    if (errors.length > 0) {
      console.error(`\n  Warning: ${errors.length} command node(s) failed to load — run "cos nodes list" for details.\n`);
    }
    return 0;
  }

  if (command === 'version') {
    console.log(`cos ${COS_VERSION} (spec ${SPEC_VERSION})`);
    return 0;
  }

  const node = nodes.get(command);
  if (!node) {
    const failed = errors.find(e => e.file.replace(/\.js$/, '') === command);
    if (failed) {
      console.error(`  Error: command "${command}" failed schema validation — ${failed.message}`);
    } else {
      console.error(`  Unknown command: "${command}"\n  Run: cos help`);
    }
    return 1;
  }

  // Node-only commands (introspection) don't need a live host.
  const ctx = { args, flags, rawArgs, log: (...a) => console.log(...a), error: (...a) => console.error(...a) };

  if (node.name !== 'nodes') {
    try {
      ctx.host = createHost();
    } catch (err) {
      console.error(`  Error: failed to boot host — ${err.message}`);
      return 1;
    }
  }

  try {
    return await node.run(ctx);
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    if (process.env.COS_DEBUG) console.error(err.stack);
    return 1;
  }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  main(process.argv).then(code => {
    if (typeof code === 'number') process.exit(code);
  });
}

module.exports = { main, parseArgs };
