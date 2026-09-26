/**
 * cli/commands/archetype.js
 * COMPARTMENT OS — cos archetype list | show | assign | detect | create
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * archetype subcommands:
 *   cos archetype list                          → all 16 built-ins + any custom
 *   cos archetype show <id|name>                 → full detail
 *   cos archetype assign <comp> <id|name>        → assign to a compartment
 *   cos archetype assign <comp> <id|name> --force → forced (skips confidence check)
 *   cos archetype detect [path]                  → score current dir (or path) against all archetypes
 *   cos archetype create <file.json>             → import a custom archetype (alias: import)
 *
 * Hooks: hk-a-001 / hk-a-002 / hk-a-003 / hk-a-004 / hk-a-005
 * Events: archetype:listed / archetype:shown / archetype:assigned /
 *         archetype:detected / archetype:created
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { ARCHETYPE } = require('../../foundation/event-contracts.js');
const { listArchetypes, getArchetype } = require('../../archetype/index.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

function customArchetypesFrom(host) {
  return host.sysmap.get().archetypes.filter(a => !a.builtIn);
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {{ json?: boolean }} flags
 * @param {object} out
 */
function listArchetypesCommand(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));

  const archetypes = listArchetypes(customArchetypesFrom(host));
  host.bus.emit(ARCHETYPE.LISTED, { count: archetypes.length });

  if (flags.json) {
    log(JSON.stringify(archetypes, null, 2));
    return archetypes;
  }

  const lines = [''];
  lines.push(
    '  ' + pad('NAME',     18) + '  ' +
    pad('RUNTIME',  10) + '  ' +
    pad('TAGS',     28) + '  ' +
    pad('SOURCE',   10)
  );
  lines.push(
    '  ' + pad('─'.repeat(18), 18) + '  ' +
    pad('─'.repeat(10), 10) + '  ' +
    pad('─'.repeat(28), 28) + '  ' +
    pad('─'.repeat(10), 10)
  );

  for (const a of archetypes) {
    lines.push(
      '  ' + pad(a.name,              18) + '  ' +
      pad(a.runtimeId,                10) + '  ' +
      pad((a.tags || []).join(', '),  28) + '  ' +
      pad(a.builtIn ? 'built-in' : 'custom', 10)
    );
  }

  lines.push('');
  lines.push(`  ${archetypes.length} archetype${archetypes.length !== 1 ? 's' : ''}`);
  lines.push('');

  log(lines.join('\n'));
  return archetypes;
}

// ─── Show ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {string} idOrName
 * @param {{ json?: boolean }} flags
 * @param {object} out
 */
function showArchetype(host, idOrName, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!idOrName) {
    error('  Usage: cos archetype show <id|name>');
    return null;
  }

  const archetype = getArchetype(idOrName, customArchetypesFrom(host));
  if (!archetype) {
    error(`  Error: archetype "${idOrName}" not found`);
    return null;
  }

  host.bus.emit(ARCHETYPE.SHOWN, { archetypeId: archetype.id, name: archetype.name });

  if (flags.json) {
    log(JSON.stringify(archetype, null, 2));
    return archetype;
  }

  const lines = [
    '',
    `  ── Archetype: ${archetype.icon || ''} ${archetype.displayName} ──────────────`,
    `     id:            ${archetype.id}`,
    `     name:          ${archetype.name}`,
    `     version:       ${archetype.version}`,
    `     source:        ${archetype.builtIn ? 'built-in' : `custom (plugin: ${archetype.pluginId || 'none'})`}`,
    `     description:   ${archetype.description}`,
    '',
    `  ── Runtime ─────────────────────────────────────`,
    `     primary:       ${archetype.runtimeId}`,
    `     options:       ${archetype.runtimeOptions.join(', ')}`,
    '',
    `  ── Resources ───────────────────────────────────`,
    `     cpu:           ${archetype.resources.cpuLimitPercent}% (${archetype.resources.cpuPriority}, ${archetype.resources.governorPolicy})`,
    `     ram:           ${archetype.resources.ramLimitMB}MB limit / ${archetype.resources.ramReservedMB}MB reserved`,
    `     io throttle:   ${archetype.resources.ioThrottle}`,
    '',
    `  ── Watchdog ────────────────────────────────────`,
    `     enabled:       ${archetype.watchdogPreset.enabled ? 'yes' : 'no'}`,
    `     on anomaly:    ${archetype.watchdogPreset.onAnomaly}`,
    `     crash limit:   ${archetype.watchdogPreset.crashLoopLimit} per ${archetype.watchdogPreset.crashLoopWindowMs}ms`,
    '',
    `  ── Network ─────────────────────────────────────`,
    `     isolated:      ${archetype.networkPreset.isolated ? 'yes' : 'no'} (level ${archetype.networkPreset.level})`,
    `     logged:        ${archetype.networkPreset.logAllTraffic ? 'yes' : 'no'}`,
    '',
    `  ── Pipe Signature ──────────────────────────────`,
    `     exposes:       ${JSON.stringify(archetype.pipeSignature.exposes)}`,
    `     consumes:      ${JSON.stringify(archetype.pipeSignature.consumes)}`,
    '',
    `  ── Detection ───────────────────────────────────`,
    `     hints:         ${archetype.detectionHints.length ? JSON.stringify(archetype.detectionHints) : '(none — manual-pick only)'}`,
    `     tags:          ${archetype.tags.join(', ')}`,
    '',
  ];

  log(lines.join('\n'));
  return archetype;
}

// ─── Assign ───────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {string} compartmentName
 * @param {string} archetypeIdOrName
 * @param {{ force?: boolean }} flags
 * @param {object} out
 */
function assignArchetype(host, compartmentName, archetypeIdOrName, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!compartmentName || !archetypeIdOrName) {
    error('  Usage: cos archetype assign <compartment> <id|name> [--force]');
    return null;
  }

  let result = null;
  let errored = null;
  const unsubAssigned = host.bus.on(ARCHETYPE.ASSIGNED, (ev) => { result = ev.payload; });
  const unsubError    = host.bus.on(ARCHETYPE.ERROR,    (ev) => { errored = ev.payload; });

  host.bus.emit('host:archetype:assign', {
    compartmentName,
    archetypeIdOrName,
    forced: !!flags.force,
    store:  host.store,
    sysmap: host.sysmap,
  });

  unsubAssigned(); unsubError();

  if (errored) {
    error(`  Error: ${errored.reason}`);
    return null;
  }

  log(`  ✓ Assigned "${result.archetypeName}" to "${result.compartmentName}"`);
  return result;
}

// ─── Detect ───────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {string|null} targetPath  defaults to process.cwd()
 * @param {{ json?: boolean }} flags
 * @param {object} out
 */
function detectArchetypeCommand(host, targetPath, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));

  const root = targetPath ? path.resolve(targetPath) : process.cwd();

  let detected = null;
  const unsub = host.bus.on(ARCHETYPE.DETECTED, (ev) => { detected = ev.payload; });
  host.bus.emit('host:archetype:detect', { root });
  unsub();

  if (flags.json) {
    log(JSON.stringify(detected, null, 2));
    return detected;
  }

  const lines = ['', `  Detecting archetype for: ${root}`, ''];
  if (!detected.top) {
    lines.push('  No archetype matched — pick manually (cos archetype list).');
  } else {
    lines.push(`  Best match: ${detected.top.name}  (confidence: ${detected.top.confidence}, score: ${(detected.top.score * 100).toFixed(0)}%)`);
    lines.push('');
    lines.push('  Top candidates:');
    for (const r of detected.results) {
      if (r.score === 0) continue;
      lines.push(`    ${pad(r.name, 18)}  score ${(r.score * 100).toFixed(0)}%  (${r.confidence})`);
    }
  }
  lines.push('');

  log(lines.join('\n'));
  return detected;
}

// ─── Create / Import ──────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {string} filePath
 * @param {object} out
 */
function createArchetype(host, filePath, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!filePath) {
    error('  Usage: cos archetype create <file.json>  (alias: cos archetype import <file.json>)');
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
  const unsubCreated = host.bus.on(ARCHETYPE.CREATED, (ev) => { result = ev.payload; });
  const unsubError   = host.bus.on(ARCHETYPE.ERROR,   (ev) => { errored = ev.payload; });

  host.bus.emit('host:archetype:import', { raw, sysmap: host.sysmap });

  unsubCreated(); unsubError();

  if (errored) {
    error(`  Error: ${errored.reason}`);
    return null;
  }

  log(`  ✓ Imported archetype "${result.name}"  (id: ${result.archetypeId})`);
  return result;
}

// ─── Route subcommands ────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {string} sub   — 'list' | 'show' | 'assign' | 'detect' | 'create' | 'import'
 * @param {string[]} args
 * @param {object} flags
 * @param {object} out
 */
function runArchetypeCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));

  switch (sub) {
    case 'list':
      return listArchetypesCommand(host, flags, out);
    case 'show':
      return showArchetype(host, args[0], flags, out);
    case 'assign':
      return assignArchetype(host, args[0], args[1], flags, out);
    case 'detect':
      return detectArchetypeCommand(host, args[0] || null, flags, out);
    case 'create':
    case 'import':
      return createArchetype(host, args[0], out);
    default:
      error('  Usage: cos archetype <list|show|assign|detect|create> [args]');
      return null;
  }
}

module.exports = {
  runArchetypeCommand,
  listArchetypesCommand,
  showArchetype,
  assignArchetype,
  detectArchetypeCommand,
  createArchetype,
};
