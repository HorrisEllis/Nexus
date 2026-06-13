#!/usr/bin/env node
/**
 * cli/index.js
 * COMPARTMENT OS — cos CLI entry point
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Usage:
 *   cos create [name]
 *   cos list [--json]
 *   cos map [--json] [--watch]
 *   cos start <name>
 *   cos stop <name>
 *   cos destroy <name> [--force] [--wipe]
 *   cos status <name> [--json]
 *   cos hooks <list|show|fire> [args]
 *   cos events <stream|tail> [--n <count>] [--json]
 *   cos schema validate [--json]
 *   cos version
 *   cos help
 *
 * All commands boot the host shell (state-store + event-bus + system-map).
 * COS-2:  CLI first — if it can't be done in CLI it doesn't exist yet.
 * COS-13: Host service is the authority. CLI is a client of the host.
 */

'use strict';

const { createHost }         = require('../host/index.js');
const { runCreateWizard }    = require('./commands/create.js');
const { listCompartments }   = require('./commands/list.js');
const { renderMap }          = require('./commands/map.js');
const { startCompartment }   = require('./commands/start.js');
const { stopCompartment }    = require('./commands/stop.js');
const { runDestroyWizard }   = require('./commands/destroy.js');
const { showStatus }         = require('./commands/status.js');
const { runHooksCommand }    = require('./commands/hooks.js');
const { runEventsCommand }   = require('./commands/events.js');
const { validateSchema }     = require('./commands/schema.js');
const { runCommand, attachCompartment } = require('./commands/run.js');
const { COS_VERSION, SPEC_VERSION } = require('../foundation/constants.js');

// ─── Parse raw argv ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args  = argv.slice(2);  // strip node + script
  const flags = {};
  const positional = [];

  for (const a of args) {
    if (a === '--json')  { flags.json  = true; continue; }
    if (a === '--watch') { flags.watch = true; continue; }
    if (a === '--force') { flags.force = true; continue; }
    if (a === '--wipe')  { flags.wipe  = true; continue; }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v !== undefined ? v : true;
      continue;
    }
    positional.push(a);
  }

  return { command: positional[0] || null, args: positional.slice(1), flags };
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  COMPARTMENT OS  v${COS_VERSION}

  Usage: cos <command> [options]

  Commands:
    create [name]               Create a new compartment
    list                        List all compartments
    status <name>               Show full compartment status
    run <name> <cmd>            Send command to running compartment stdin
    attach <name>               Attach to running compartment (stream output)
    start <name>                Start compartment (state transition)
    stop <name>                 Stop compartment (state transition)
    destroy <name>              Destroy compartment [--force] [--wipe]
    map                         Print the system map
    hooks <list|show|fire>      Manage registered hooks
    events <stream|tail>        Event bus stream / tail
    schema validate             Validate all hooks against schema
    version                     Show version info
    help                        Show this help

  Flags:
    --json                      Output as JSON
    --watch                     Live-updating output (map)
    --force                     Skip confirmation prompts
    --wipe                      Wipe filesystem on destroy
    --n=<count>                 Number of events for tail (default: 20)

  Examples:
    cos create my-service
    cos list
    cos start my-service
    cos stop my-service
    cos status my-service
    cos destroy my-service --force
    cos map --watch
    cos hooks list
    cos events tail --n=50
    cos events stream
    cos schema validate
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(argv = process.argv) {
  const { command, args, flags } = parseArgs(argv);

  if (!command || command === 'help' || flags.help) {
    printHelp();
    return 0;
  }

  if (command === 'version') {
    console.log(`cos ${COS_VERSION} (spec ${SPEC_VERSION})`);
    return 0;
  }

  // All other commands need the host
  let host;
  try {
    host = createHost();
  } catch (err) {
    console.error(`  Error: failed to boot host — ${err.message}`);
    return 1;
  }

  try {
    switch (command) {

      case 'create': {
        const nameArg = args[0] || null;
        const result  = await runCreateWizard(host, nameArg);
        host.store.flushSync();
        return result ? 0 : 1;
      }

      case 'list': {
        listCompartments(host, flags);
        return 0;
      }

      case 'map': {
        renderMap(host, flags);
        return flags.watch ? undefined : 0;
      }

      case 'start': {
        const name = args[0];
        if (!name) { console.error('  Usage: cos start <name>'); return 1; }
        try {
          startCompartment(host, name);
          return 0;
        } catch { return 1; }
      }

      case 'stop': {
        const name = args[0];
        if (!name) { console.error('  Usage: cos stop <name>'); return 1; }
        try {
          stopCompartment(host, name);
          return 0;
        } catch { return 1; }
      }

      case 'destroy': {
        const name = args[0];
        const ok = await runDestroyWizard(host, name, flags);
        return ok ? 0 : 1;
      }

      case 'run': {
        const compName = args[0];
        const cmd = args.slice(1).join(' ');
        if (!compName) { console.error('  Usage: cos run <name> <command>'); return 1; }
        if (!cmd) {
          attachCompartment(host, compName);
          return undefined;
        }
        return runCommand(host, compName, cmd) ? 0 : 1;
      }

      case 'attach': {
        const compName = args[0];
        if (!compName) { console.error('  Usage: cos attach <name>'); return 1; }
        attachCompartment(host, compName);
        return undefined;
      }

      case 'status': {
        const name = args[0];
        const result = showStatus(host, name, flags);
        return result ? 0 : 1;
      }

      case 'hooks': {
        const sub = args[0];
        const rest = args.slice(1);
        runHooksCommand(host, sub, rest, flags);
        return 0;
      }

      case 'events': {
        const sub = args[0];
        const rest = args.slice(1);
        runEventsCommand(host, sub, rest, flags);
        return flags.watch || sub === 'stream' ? undefined : 0;
      }

      case 'schema': {
        const sub = args[0];
        if (sub !== 'validate') {
          console.error('  Usage: cos schema validate');
          return 1;
        }
        const result = validateSchema(host, flags);
        return result.invalid === 0 ? 0 : 1;
      }

      default: {
        console.error(`  Unknown command: "${command}"\n  Run: cos help`);
        return 1;
      }
    }
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
