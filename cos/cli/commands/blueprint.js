/**
 * cli/commands/blueprint.js
 * COMPARTMENT OS — cos blueprint list | show | create | destroy | status | import
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * blueprint subcommands:
 *   cos blueprint list                              → all 11 built-ins + any custom
 *   cos blueprint show <id|name>                     → full detail
 *   cos blueprint create <id|name> <instanceName>    → launch (alias: launch)
 *   cos blueprint destroy <instanceId>                → tear down an instance
 *   cos blueprint status <instanceId>                → instance detail
 *   cos blueprint import <file.json>                 → import a custom blueprint
 *
 * NOTE: hk-b-004 (scale) and hk-b-007 (map) are deferred — see
 * blueprint/index.js header. Not wired here.
 *
 * Hooks: hk-b-001 / hk-b-002 / hk-b-003 / hk-b-005 / hk-b-006
 * Events: blueprint:listed / blueprint:shown / blueprint:created /
 *         blueprint:destroyed / blueprint:status:shown / blueprint:imported
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { BLUEPRINT } = require('../../foundation/event-contracts.js');
const { listBlueprints, getBlueprint } = require('../../blueprint/index.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

function customBlueprintsFrom(host) {
  return host.sysmap.get().blueprintDefs.filter(b => !b.builtIn);
}

// ─── List ─────────────────────────────────────────────────────────────────────

function listBlueprintsCommand(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));

  const blueprints = listBlueprints(customBlueprintsFrom(host));
  host.bus.emit(BLUEPRINT.LISTED, { count: blueprints.length });

  if (flags.json) {
    log(JSON.stringify(blueprints, null, 2));
    return blueprints;
  }

  const lines = [''];
  lines.push(
    '  ' + pad('NAME',     20) + '  ' +
    pad('NODES',   6) + '  ' +
    pad('TAGS',    30) + '  ' +
    pad('SOURCE',  10)
  );
  lines.push(
    '  ' + pad('─'.repeat(20), 20) + '  ' +
    pad('─'.repeat(6),  6) + '  ' +
    pad('─'.repeat(30), 30) + '  ' +
    pad('─'.repeat(10), 10)
  );

  for (const b of blueprints) {
    lines.push(
      '  ' + pad(b.name,                  20) + '  ' +
      pad(String(b.nodes.length),          6) + '  ' +
      pad((b.tags || []).join(', '),      30) + '  ' +
      pad(b.builtIn ? 'built-in' : 'custom', 10)
    );
  }

  lines.push('');
  lines.push(`  ${blueprints.length} blueprint${blueprints.length !== 1 ? 's' : ''}`);
  lines.push('');

  log(lines.join('\n'));
  return blueprints;
}

// ─── Show ─────────────────────────────────────────────────────────────────────

function showBlueprint(host, idOrName, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!idOrName) {
    error('  Usage: cos blueprint show <id|name>');
    return null;
  }

  const blueprint = getBlueprint(idOrName, customBlueprintsFrom(host));
  if (!blueprint) {
    error(`  Error: blueprint "${idOrName}" not found`);
    return null;
  }

  host.bus.emit(BLUEPRINT.SHOWN, { blueprintId: blueprint.id, name: blueprint.name });

  if (flags.json) {
    log(JSON.stringify(blueprint, null, 2));
    return blueprint;
  }

  const lines = [
    '',
    `  ── Blueprint: ${blueprint.icon || ''} ${blueprint.displayName} ──────────────`,
    `     id:            ${blueprint.id}`,
    `     name:          ${blueprint.name}`,
    `     source:        ${blueprint.builtIn ? 'built-in' : 'custom'}`,
    `     description:   ${blueprint.description}`,
    '',
    `  ── Nodes (${blueprint.nodes.length}) ───────────────────────────────`,
  ];
  for (const node of blueprint.nodes) {
    const archetype = require('../../archetype/registry.js').ARCHETYPE_MAP.get(node.archetypeId);
    const scale = node.scalable ? ` [scalable ${node.minInstances}-${node.maxInstances}]` : '';
    lines.push(`     ${pad(node.role, 16)} archetype: ${archetype ? archetype.name : node.archetypeId}${scale}`);
  }
  lines.push('', `  ── Pipes (${blueprint.pipes.length}) ───────────────────────────────`);
  for (const p of blueprint.pipes) {
    lines.push(`     ${p.name}  (${p.hookId})${p.filter ? '  filter: ' + p.filter : ''}`);
  }
  lines.push('', `  ── Boot order ──────────────────────────────────`, `     ${blueprint.startOrder.join(' → ')}`, '');

  log(lines.join('\n'));
  return blueprint;
}

// ─── Create (launch) ────────────────────────────────────────────────────────────

function createBlueprintInstance(host, idOrName, instanceName, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!idOrName || !instanceName) {
    error('  Usage: cos blueprint create <id|name> <instanceName>');
    return null;
  }

  let result = null;
  let errored = null;
  const unsubCreated = host.bus.on(BLUEPRINT.CREATED, (ev) => { result = ev.payload; });
  const unsubError   = host.bus.on(BLUEPRINT.ERROR,   (ev) => { errored = ev.payload; });

  host.bus.emit('host:blueprint:create', {
    blueprintIdOrName: idOrName,
    instanceName,
    host,
    sysmap: host.sysmap,
  });

  unsubCreated(); unsubError();

  if (errored) {
    error(`  Error: ${errored.reason}`);
    return null;
  }

  log(`  ✓ Launched "${result.blueprintName}" as "${instanceName}"  (${result.compartmentCount} compartments, ${result.pipeCount} pipes)`);
  log(`    instance id: ${result.blueprintInstanceId}`);
  return result;
}

// ─── Destroy ──────────────────────────────────────────────────────────────────

function destroyBlueprintInstanceCommand(host, instanceId, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!instanceId) {
    error('  Usage: cos blueprint destroy <instanceId>');
    return null;
  }

  let result = null;
  let errored = null;
  const unsubDestroyed = host.bus.on(BLUEPRINT.DESTROYED, (ev) => { result = ev.payload; });
  const unsubError     = host.bus.on(BLUEPRINT.ERROR,     (ev) => { errored = ev.payload; });

  host.bus.emit('host:blueprint:destroy', { instanceId, host, sysmap: host.sysmap });

  unsubDestroyed(); unsubError();

  if (errored) {
    error(`  Error: ${errored.reason}`);
    return null;
  }

  log(`  ✓ Destroyed "${result.instanceName}"  (${result.destroyedCompartments.length} compartments removed)`);
  if (result.errors.length) {
    log(`    ${result.errors.length} compartment(s) failed to destroy cleanly — see log`);
  }
  return result;
}

// ─── Status ───────────────────────────────────────────────────────────────────

function showBlueprintStatus(host, instanceId, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!instanceId) {
    error('  Usage: cos blueprint status <instanceId>');
    return null;
  }

  const map = host.sysmap.get();
  const instance = map.blueprintInstances.find(i => i.id === instanceId);
  if (!instance) {
    error(`  Error: blueprint instance "${instanceId}" not found`);
    return null;
  }

  host.bus.emit(BLUEPRINT.STATUS, { blueprintInstanceId: instance.id });

  if (flags.json) {
    log(JSON.stringify(instance, null, 2));
    return instance;
  }

  const lines = ['', `  ── Blueprint Instance: ${instance.name} ──────────────`, `     state: ${instance.state}`, ''];
  for (const [role, ids] of Object.entries(instance.compartments)) {
    for (const id of ids) {
      const comp = map.compartments.find(c => c.id === id);
      lines.push(`     ${pad(role, 16)} ${comp ? comp.name : id}  [${comp ? comp.state : 'missing'}]`);
    }
  }
  lines.push('', `     pipes: ${instance.pipeIds.length}`, '');

  log(lines.join('\n'));
  return instance;
}

// ─── Import ───────────────────────────────────────────────────────────────────

function importBlueprintCommand(host, filePath, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!filePath) {
    error('  Usage: cos blueprint import <file.json>');
    return null;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  } catch (err) {
    error(`  Error: could not read/parse "${filePath}" — ${err.message}`);
    return null;
  }

  let result = null;
  let errored = null;
  const unsubImported = host.bus.on(BLUEPRINT.IMPORTED, (ev) => { result = ev.payload; });
  const unsubError    = host.bus.on(BLUEPRINT.ERROR,    (ev) => { errored = ev.payload; });

  host.bus.emit('host:blueprint:import', { raw, sysmap: host.sysmap });

  unsubImported(); unsubError();

  if (errored) {
    error(`  Error: ${errored.reason}`);
    return null;
  }

  log(`  ✓ Imported blueprint "${result.name}"  (id: ${result.blueprintId})`);
  return result;
}

// ─── Route subcommands ────────────────────────────────────────────────────────

function runBlueprintCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));

  switch (sub) {
    case 'list':
      return listBlueprintsCommand(host, flags, out);
    case 'show':
      return showBlueprint(host, args[0], flags, out);
    case 'create':
    case 'launch':
      return createBlueprintInstance(host, args[0], args[1], out);
    case 'destroy':
      return destroyBlueprintInstanceCommand(host, args[0], out);
    case 'status':
      return showBlueprintStatus(host, args[0], flags, out);
    case 'import':
      return importBlueprintCommand(host, args[0], out);
    default:
      error('  Usage: cos blueprint <list|show|create|destroy|status|import> [args]');
      return null;
  }
}

module.exports = {
  runBlueprintCommand,
  listBlueprintsCommand,
  showBlueprint,
  createBlueprintInstance,
  destroyBlueprintInstanceCommand,
  showBlueprintStatus,
  importBlueprintCommand,
};
