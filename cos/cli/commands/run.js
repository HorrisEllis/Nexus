/**
 * cli/commands/run.js
 * COMPARTMENT OS — cos run <name> <command>
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Sends a command string to a running compartment's stdin.
 * Also provides an interactive REPL mode (no command arg = attach).
 *
 * Hook: hk-h-014
 * Event: comp:process:stdin
 */

'use strict';

const readline = require('readline');
const { COMP } = require('../../foundation/event-contracts.js');
const { getProcess } = require('../../compartment/process-runner.js');

/**
 * Send a single command to a compartment's stdin.
 * @param {object} host
 * @param {string} name
 * @param {string} command
 * @param {object} out
 */
function runCommand(host, name, command, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  const comp = host.store.getCompartmentByName(name)
            || host.store.getCompartment(name);

  if (!comp) {
    error(`  Error: compartment "${name}" not found`);
    return false;
  }

  if (comp.state !== 'running') {
    error(`  Error: compartment "${name}" is not running (state: ${comp.state})`);
    return false;
  }

  const proc = getProcess(comp.id);
  if (!proc) {
    error(`  Error: no live process for "${name}" — process may not have been spawned yet`);
    return false;
  }

  host.bus.emit('comp:process:stdin', {
    compartmentId: comp.id,
    name:          comp.name,
    text:          command + '\n',
  });

  host.bus.emit(COMP.COMMAND_RUN, {
    compartmentId: comp.id,
    name:          comp.name,
    command,
  });

  log(`  → ${name}: ${command}`);
  return true;
}

/**
 * Attach to a running compartment — stream its output, forward stdin.
 * Exits on Ctrl+C.
 * @param {object} host
 * @param {string} name
 * @param {object} out
 */
function attachCompartment(host, name, out = {}) {
  const log   = out.log   || ((...a) => process.stdout.write(a.join(' ') + '\n'));
  const error = out.error || ((...a) => console.error(...a));

  const comp = host.store.getCompartmentByName(name)
            || host.store.getCompartment(name);

  if (!comp) { error(`  Error: compartment "${name}" not found`); return; }
  if (comp.state !== 'running') {
    error(`  Error: "${name}" is not running`);
    return;
  }

  log(`\n  Attached to: ${comp.name}  [${comp.id}]`);
  log('  Output streaming. Type to send stdin. Ctrl+C to detach.\n');

  // Subscribe to stdout/stderr events for this compartment
  const unsubOut = host.bus.on(COMP.PROCESS_STDOUT, ev => {
    if (ev.payload.compartmentId === comp.id) {
      process.stdout.write(`  [out] ${ev.payload.line}\n`);
    }
  });
  const unsubErr = host.bus.on(COMP.PROCESS_STDERR, ev => {
    if (ev.payload.compartmentId === comp.id) {
      process.stdout.write(`  [err] ${ev.payload.line}\n`);
    }
  });
  const unsubExit = host.bus.on(COMP.PROCESS_EXITED, ev => {
    if (ev.payload.compartmentId === comp.id) {
      process.stdout.write(`\n  Process exited (code ${ev.payload.code}). Detaching.\n`);
      cleanup();
    }
  });
  const unsubCrash = host.bus.on(COMP.PROCESS_CRASHED, ev => {
    if (ev.payload.compartmentId === comp.id) {
      process.stdout.write(`\n  Process crashed (code ${ev.payload.code}). Detaching.\n`);
      cleanup();
    }
  });

  // Forward keyboard input to stdin
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (line) => {
    host.bus.emit('comp:process:stdin', {
      compartmentId: comp.id,
      name:          comp.name,
      text:          line + '\n',
    });
  });

  function cleanup() {
    unsubOut();
    unsubErr();
    unsubExit();
    unsubCrash();
    rl.close();
  }

  process.stdin.resume();
  process.on('SIGINT', () => {
    log('\n  Detached.\n');
    cleanup();
    process.exit(0);
  });
}

module.exports = { runCommand, attachCompartment };
