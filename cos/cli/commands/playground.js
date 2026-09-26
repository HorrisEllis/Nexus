/**
 * cli/commands/playground.js
 * COMPARTMENT OS — cos playground create | list | status | destroy | promote
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * playground subcommands (subset of spec §67's CLI list — see
 * playgrounds/factory.js header for what's deferred and why):
 *   cos playground create <name>                    → isolated, empty
 *   cos playground create <name> --mirror <comp>     → mirrored
 *   cos playground create <name> --blueprint <bp>    → synthetic
 *   cos playground list                              → all active playgrounds
 *   cos playground status <name|id>                  → compartments + file diffs
 *   cos playground destroy <name|id>                 → tear down everything in it
 *   cos playground promote <compartmentId>           → move a compartment to production
 *
 * Hooks: hk-pg-001 / hk-pg-004 / hk-pg-006
 * Events: playgrounds:created / playgrounds:destroyed / playgrounds:promoted /
 *         playgrounds:status:shown
 */

'use strict';

const { PLAYGROUNDS } = require('../../foundation/event-contracts.js');
const { createPlayground, getPlayground, listPlaygrounds } = require('../../playgrounds/index.js');

function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {string} name
 * @param {{ mirror?: string, blueprint?: string, network?: string, fs?: string }} flags
 * @param {object} out
 * @returns {Promise<object|null>}
 */
async function createPlaygroundCommand(host, name, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!name) {
    error('  Usage: cos playground create <name> [--mirror <comp> | --blueprint <bp>] [--network <mode>]');
    return null;
  }

  const mode = flags.mirror ? 'mirrored' : flags.blueprint ? 'synthetic' : 'isolated';

  let result;
  try {
    result = await createPlayground(host, {
      name, mode,
      sourceCompartmentName: flags.mirror,
      sourceBlueprintIdOrName: flags.blueprint,
      networkMode: flags.network,
      fsMode: flags.fs,
    });
  } catch (err) {
    error(`  Error: ${err.message}`);
    return null;
  }

  host.bus.emit('host:playgrounds:create', { playground: result.playground, sysmap: host.sysmap });

  log(`  ✓ Created playground "${name}"  [${mode}] [${result.playground.network.mode}]`);
  log(`    id: ${result.playground.id}`);
  if (result.compartments.length) {
    log(`    compartments: ${result.compartments.map(c => c.name).join(', ')}`);
  }
  return result.playground;
}

// ─── List ─────────────────────────────────────────────────────────────────────

function listPlaygroundsCommand(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const playgrounds = listPlaygrounds(host);
  host.bus.emit(PLAYGROUNDS.LISTED, { count: playgrounds.length });

  if (flags.json) {
    log(JSON.stringify(playgrounds, null, 2));
    return playgrounds;
  }

  const lines = [''];
  lines.push('  ' + pad('NAME', 18) + '  ' + pad('MODE', 12) + '  ' + pad('NETWORK', 10) + '  ' + pad('COMPARTMENTS', 12));
  lines.push('  ' + pad('─'.repeat(18), 18) + '  ' + pad('─'.repeat(12), 12) + '  ' + pad('─'.repeat(10), 10) + '  ' + pad('─'.repeat(12), 12));
  for (const p of playgrounds) {
    lines.push('  ' + pad(p.name, 18) + '  ' + pad(p.mode, 12) + '  ' + pad(p.network.mode, 10) + '  ' + pad(String(p.compartmentIds.length), 12));
  }
  lines.push('', `  ${playgrounds.length} playground${playgrounds.length !== 1 ? 's' : ''}`, '');
  log(lines.join('\n'));
  return playgrounds;
}

// ─── Status ───────────────────────────────────────────────────────────────────

function playgroundStatusCommand(host, idOrName, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!idOrName) { error('  Usage: cos playground status <name|id>'); return null; }
  const playground = getPlayground(host, idOrName);
  if (!playground) { error(`  Error: playground "${idOrName}" not found`); return null; }

  let status = null;
  const unsub = host.bus.on(PLAYGROUNDS.SHOWN, (ev) => { status = ev.payload; });
  host.bus.emit('host:playgrounds:status', { playgroundId: playground.id, host, sysmap: host.sysmap });
  unsub();

  if (flags.json) { log(JSON.stringify(status, null, 2)); return status; }

  const lines = ['', `  ── Playground: ${playground.name}  [${playground.mode}] [${playground.network.mode}] ──`, ''];
  for (const c of status.compartments) {
    lines.push(`     ${pad(c.name, 24)} [${c.state}]`);
  }
  if (status.diffs) {
    lines.push('', '  ── Changes vs source ──');
    for (const d of status.diffs) lines.push(`     ${pad(d.name, 24)} +${d.added} files, ${d.changed} changed`);
  }
  lines.push('');
  log(lines.join('\n'));
  return status;
}

// ─── Destroy ──────────────────────────────────────────────────────────────────

function destroyPlaygroundCommand(host, idOrName, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!idOrName) { error('  Usage: cos playground destroy <name|id>'); return null; }
  const playground = getPlayground(host, idOrName);
  if (!playground) { error(`  Error: playground "${idOrName}" not found`); return null; }

  let result = null, errored = null;
  const u1 = host.bus.on(PLAYGROUNDS.DESTROYED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(PLAYGROUNDS.ERROR,     (ev) => { errored = ev.payload; });
  host.bus.emit('host:playgrounds:destroy', { playgroundId: playground.id, host, sysmap: host.sysmap });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Destroyed playground "${result.name}"  (${result.destroyedCompartments.length} compartments removed)`);
  return result;
}

// ─── Promote ──────────────────────────────────────────────────────────────────

function promoteCommand(host, compartmentId, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!compartmentId) { error('  Usage: cos playground promote <compartmentId>'); return null; }

  let result = null, errored = null;
  const u1 = host.bus.on(PLAYGROUNDS.PROMOTED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(PLAYGROUNDS.ERROR,    (ev) => { errored = ev.payload; });
  host.bus.emit('host:playgrounds:promote', { compartmentId, host });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Promoted "${result.name}" to production`);
  return result;
}

// ─── Route subcommands ────────────────────────────────────────────────────────

/**
 * NOTE: async because createPlaygroundCommand awaits createPlayground()
 * (which may start a real echo server for 'simulated' network mode).
 */
async function runPlaygroundCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));

  switch (sub) {
    case 'create': return createPlaygroundCommand(host, args[0], flags, out);
    case 'list':   return listPlaygroundsCommand(host, flags, out);
    case 'status': return playgroundStatusCommand(host, args[0], flags, out);
    case 'destroy': return destroyPlaygroundCommand(host, args[0], out);
    case 'promote': return promoteCommand(host, args[0], out);
    default:
      error('  Usage: cos playground <create|list|status|destroy|promote> [args]');
      return null;
  }
}

module.exports = {
  runPlaygroundCommand,
  createPlaygroundCommand,
  listPlaygroundsCommand,
  playgroundStatusCommand,
  destroyPlaygroundCommand,
  promoteCommand,
};
