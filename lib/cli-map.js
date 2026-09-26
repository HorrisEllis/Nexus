'use strict';
/**
 * lib/cli-map.js — Phase 40.5: CLI Map Generator
 * UUID: nexus-cli-map-v1-0000-2026-0625-jamesbrooks-001
 * Version: 1.0.0
 *
 * Reads all registered component descriptors from the registry,
 * runs T1.5 projections, and writes cli-map.json to disk.
 *
 * Blueprint loads cli-map.json at boot → grammar tree + REPL dispatch table.
 * Zero runtime registration. Zero hand-written help. Zero duplication.
 *
 * §40.5: Generated REPL help text entirely from descriptor.
 * §CC-002: Zero LLM. Same input → same output.
 * §3.1: cli-map.json written before grammar-engine reads it.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULE_ID = 'cli-map';
const VERSION   = '1.0.0';

const ROOT        = path.join(__dirname, '..');
const CLI_MAP_PATH = path.join(ROOT, 'cli-map.json');

/**
 * generate — produce cli-map.json from live component registry.
 * @returns {object} { ok, path, commands, grammarEntries, generatedAt }
 */
function generate() {
  // Read registry
  let components = [];
  try {
    const reg = require('./component-registry');
    components = reg.list ? reg.list() : [];
  } catch(e) {
    return { ok: false, error: `registry unavailable: ${e.message}` };
  }

  // Run T1.5 projections
  let projections;
  try {
    const proj = require('../copilot/lib/descriptor-projector');
    projections = proj.projectAll(components);
  } catch(e) {
    return { ok: false, error: `projector unavailable: ${e.message}` };
  }

  const { cliMap, grammarMap } = projections;

  // Build the cli-map.json structure
  const cliMapDoc = {
    format:        'NEX-CLI-MAP/1.0',
    uuid:          `climap_${crypto.randomUUID().slice(0, 8)}`,
    version:       VERSION,
    generatedAt:   Date.now(),
    generatedBy:   MODULE_ID,
    componentCount: components.length,

    // REPL dispatch table: command → { route, componentId, help }
    commands: Object.fromEntries(
      cliMap.map(c => [c.command, {
        command:     c.command,
        aliases:     c.aliases || [],
        componentId: c.componentId,
        route:       c.route,
        help:        c.help,
        tier:        components.find(comp => comp.id === c.componentId)?.tier || 'T1',
      }])
    ),

    // Flat alias list for grammar trie
    grammarAliases: grammarMap.flatMap(g => g.entries.map(entry => ({
      text:        entry,
      componentId: g.componentId,
      route:       g.route,
      confidence:  g.confidence || 1.0,
    }))),

    // Full CLI map array (for Blueprint's cliMap field)
    cliArray: cliMap,
  };

  // §2.1 Write to disk
  try {
    fs.writeFileSync(CLI_MAP_PATH, JSON.stringify(cliMapDoc, null, 2), 'utf8');
  } catch(e) {
    return { ok: false, error: `write failed: ${e.message}` };
  }

  // Update grammar-engine with new aliases (live rebuild)
  try {
    const ge = require('./grammar-engine');
    if (ge.rebuild) {
      ge.rebuild('http://127.0.0.1:9000').catch(() => {});
    }
  } catch(_) {}

  console.log(`[${MODULE_ID}] cli-map.json written — ${cliMap.length} commands · ${cliMapDoc.grammarAliases.length} aliases`);

  return {
    ok: true,
    path: CLI_MAP_PATH,
    commands: Object.keys(cliMapDoc.commands).length,
    grammarEntries: cliMapDoc.grammarAliases.length,
    generatedAt: cliMapDoc.generatedAt,
    uuid: cliMapDoc.uuid,
  };
}

/** load — read cli-map.json from disk */
function load() {
  try {
    return JSON.parse(fs.readFileSync(CLI_MAP_PATH, 'utf8'));
  } catch(_) { return null; }
}

/**
 * getDispatchTable — return { command → route } for REPL dispatcher.
 * Used by nexus-repl.js to route commands without hardcoding.
 */
function getDispatchTable() {
  const map = load();
  if (!map) return {};
  return Object.fromEntries(
    Object.entries(map.commands || {}).map(([cmd, def]) => [cmd, def.route])
  );
}

/**
 * getHelpText — return formatted help for a command or all commands.
 */
function getHelpText(command = null) {
  const map = load();
  if (!map) return 'cli-map.json not generated yet. Run generate() first.';
  if (command) {
    const def = map.commands[command];
    if (!def) return `Unknown command: ${command}`;
    return def.help || `${command}: no help text generated`;
  }
  return Object.entries(map.commands)
    .map(([cmd, def]) => `  ${cmd.padEnd(20)} ${(def.help || '').split('\n')[0].slice(0, 60)}`)
    .join('\n');
}

module.exports = { generate, load, getDispatchTable, getHelpText, CLI_MAP_PATH, MODULE_ID, VERSION };
