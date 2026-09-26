/**
 * cli/commands/hooks.js
 * COMPARTMENT OS — cos hooks list | show <id> | fire <id>
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * hook subcommands:
 *   cos hooks list                → all registered hooks from system map
 *   cos hooks show <id>           → hook detail + contract
 *   cos hooks fire <id>           → emit hook event (manual trigger)
 *
 * Hooks: hk-h-015 / hk-h-016 / hk-h-017
 * Events: host:hooks:listed / host:hook:shown / host:hook:fired
 */

'use strict';

const { HOST }       = require('../../foundation/event-contracts.js');
const { validateHook } = require('../../foundation/hook-schema.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * List all hooks registered in the system map.
 * @param {object} host
 * @param {{ json?: boolean }} flags
 * @param {object} out
 */
function listHooks(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));

  const map   = host.sysmap.get();
  const hooks = map.hooks || [];

  host.bus.emit(HOST.HOOKS_LISTED, { count: hooks.length });

  if (flags.json) {
    log(JSON.stringify(hooks, null, 2));
    return hooks;
  }

  if (hooks.length === 0) {
    log('\n  No hooks registered. Hooks are registered when compartments are created.\n');
    return hooks;
  }

  const lines = [''];
  lines.push(
    '  ' + pad('NAME',     28) + '  ' +
    pad('VERSION',  8) + '  ' +
    pad('SCOPE',    20) + '  ' +
    pad('EVENT',    36)
  );
  lines.push(
    '  ' + pad('─'.repeat(28), 28) + '  ' +
    pad('─'.repeat(8),  8) + '  ' +
    pad('─'.repeat(20), 20) + '  ' +
    pad('─'.repeat(36), 36)
  );

  for (const h of hooks) {
    const scope = h.compartmentId === 'host'
      ? 'host'
      : h.compartmentId || '—';
    lines.push(
      '  ' + pad(h.name || '—', 28) + '  ' +
      pad(h.version   || '—',  8) + '  ' +
      pad(scope,              20) + '  ' +
      pad(h.bindings?.event || '—', 36)
    );
  }

  lines.push('');
  lines.push(`  ${hooks.length} hook${hooks.length !== 1 ? 's' : ''}`);
  lines.push('');

  log(lines.join('\n'));
  return hooks;
}

// ─── Show ─────────────────────────────────────────────────────────────────────

/**
 * Show detail for a single hook by id or name.
 * @param {object} host
 * @param {string} idOrName
 * @param {{ json?: boolean }} flags
 * @param {object} out
 */
function showHook(host, idOrName, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!idOrName) {
    error('  Usage: cos hooks show <id|name>');
    return null;
  }

  const map   = host.sysmap.get();
  const hooks = map.hooks || [];
  const hook  = hooks.find(h => h.id === idOrName || h.name === idOrName);

  if (!hook) {
    error(`  Error: hook "${idOrName}" not found`);
    return null;
  }

  host.bus.emit(HOST.HOOK_SHOWN, { hookId: hook.id, name: hook.name });

  if (flags.json) {
    log(JSON.stringify(hook, null, 2));
    return hook;
  }

  const lines = [
    '',
    `  ── Hook: ${hook.name} ──────────────────────────────`,
    `     id:           ${hook.id}`,
    `     version:      ${hook.version || '—'}`,
    `     compartment:  ${hook.compartmentId || '—'}`,
    `     event:        ${hook.bindings?.event || '—'}`,
    `     cli:          ${hook.bindings?.cli   || '—'}`,
    `     ui:           ${hook.bindings?.ui    || '—'}`,
    '',
    `  ── Contract ────────────────────────────────────`,
    `     inputs:       ${JSON.stringify(hook.contract?.inputs    || [])}`,
    `     outputs:      ${JSON.stringify(hook.contract?.outputs   || [])}`,
    `     side effects: ${JSON.stringify(hook.contract?.sideEffects || [])}`,
    `     axioms:       ${JSON.stringify(hook.contract?.axioms    || [])}`,
    '',
    `  ── Meta ────────────────────────────────────────`,
    `     description:  ${hook.meta?.description  || '—'}`,
    `     auto-detected:${hook.meta?.autoDetected  ? 'yes' : 'no'}`,
    `     source file:  ${hook.meta?.sourceFile   || '—'}`,
    '',
  ];

  log(lines.join('\n'));
  return hook;
}

// ─── Fire ─────────────────────────────────────────────────────────────────────

/**
 * Manually fire a hook's event.
 * @param {object} host
 * @param {string} idOrName
 * @param {object} inputPayload
 * @param {object} out
 */
function fireHook(host, idOrName, inputPayload = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!idOrName) {
    error('  Usage: cos hooks fire <id|name> [--input key=value]');
    return null;
  }

  const map   = host.sysmap.get();
  const hooks = map.hooks || [];
  const hook  = hooks.find(h => h.id === idOrName || h.name === idOrName);

  if (!hook) {
    error(`  Error: hook "${idOrName}" not found`);
    return null;
  }

  const eventType = hook.bindings?.event;
  if (!eventType) {
    error(`  Error: hook "${idOrName}" has no event binding`);
    return null;
  }

  const payload = Object.assign({}, inputPayload, {
    hookId:  hook.id,
    firedAt: Date.now(),
    manual:  true,
  });

  host.bus.emit(eventType, payload);
  host.bus.emit(HOST.HOOK_FIRED, { hookId: hook.id, name: hook.name, eventType });

  log(`  ✓ Fired: ${hook.name}  →  ${eventType}`);
  return { hook, eventType, payload };
}

// ─── Route subcommands ────────────────────────────────────────────────────────

/**
 * Route hooks subcommands.
 * @param {object} host
 * @param {string} sub      — 'list' | 'show' | 'fire'
 * @param {string[]} args   — positional args after sub
 * @param {object} flags
 * @param {object} out
 */
function runHooksCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));

  switch (sub) {
    case 'list':
      return listHooks(host, flags, out);
    case 'show':
      return showHook(host, args[0], flags, out);
    case 'fire':
      return fireHook(host, args[0], {}, out);
    default:
      error('  Usage: cos hooks <list|show|fire> [args]');
      return null;
  }
}

module.exports = { runHooksCommand, listHooks, showHook, fireHook };
