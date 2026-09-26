/**
 * cli/commands/plugin.js
 * COMPARTMENT OS — cos plugins list | show | add | enable | disable | remove | validate | new
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * plugin subcommands (subset of the 15 in spec §63 — see plugin/index.js
 * header for what's deferred and why):
 *   cos plugins list                  → all 30 built-ins + any custom installed
 *   cos plugins show <id|name>        → full detail
 *   cos plugins add <dir>             → install from a directory
 *   cos plugins enable <id|name>      → re-activate a disabled custom plugin
 *   cos plugins disable <id|name>     → deactivate without removing
 *   cos plugins remove <id|name>      → uninstall + destroy sandbox
 *   cos plugins validate <dir>        → validate manifest.json without installing
 *   cos plugins new <name>            → scaffold a new plugin directory
 *
 * Hooks: hk-pl-001 / hk-pl-002 / hk-pl-003 / hk-pl-004 / hk-pl-006 / hk-pl-007 / hk-pl-010 / hk-pl-012
 * Events: plugin:listed / plugin:shown / plugin:installed / plugin:enabled /
 *         plugin:disabled / plugin:removed / plugin:error
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const { PLUGIN } = require('../../foundation/event-contracts.js');
const { listPlugins, getPlugin } = require('../../plugin/index.js');
const { validateManifest, PluginSchemaError } = require('../../plugin/schema.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

// ─── List ─────────────────────────────────────────────────────────────────────

function listPluginsCommand(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));

  const plugins = listPlugins(host);
  host.bus.emit(PLUGIN.LISTED, { count: plugins.length });

  if (flags.json) {
    log(JSON.stringify(plugins, null, 2));
    return plugins;
  }

  const lines = [''];
  lines.push(
    '  ' + pad('NAME',     22) + '  ' +
    pad('STATE',    10) + '  ' +
    pad('CONTRIBUTES',         30) + '  ' +
    pad('SOURCE',   10)
  );
  lines.push(
    '  ' + pad('─'.repeat(22), 22) + '  ' +
    pad('─'.repeat(10), 10) + '  ' +
    pad('─'.repeat(30), 30) + '  ' +
    pad('─'.repeat(10), 10)
  );

  for (const p of plugins) {
    const contributesParts = Object.entries(p.contributions)
      .filter(([, v]) => Array.isArray(v) && v.length > 0)
      .map(([k, v]) => `${k}(${v.length})`);
    lines.push(
      '  ' + pad(p.manifest.name,                  22) + '  ' +
      pad(p.state,                                  10) + '  ' +
      pad(contributesParts.join(', ') || '—',       30) + '  ' +
      pad(p.builtIn ? 'built-in' : 'custom',        10)
    );
  }

  lines.push('', `  ${plugins.length} plugin${plugins.length !== 1 ? 's' : ''}`, '');
  log(lines.join('\n'));
  return plugins;
}

// ─── Show ─────────────────────────────────────────────────────────────────────

function showPlugin(host, idOrName, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!idOrName) {
    error('  Usage: cos plugins show <id|name>');
    return null;
  }

  const plugin = getPlugin(host, idOrName);
  if (!plugin) {
    error(`  Error: plugin "${idOrName}" not found`);
    return null;
  }

  host.bus.emit(PLUGIN.SHOWN, { pluginId: plugin.id, name: plugin.manifest.name });

  if (flags.json) {
    log(JSON.stringify(plugin, null, 2));
    return plugin;
  }

  const m = plugin.manifest;
  const lines = [
    '',
    `  ── Plugin: ${m.displayName} ──────────────`,
    `     id:            ${plugin.id}`,
    `     version:       ${m.version}`,
    `     state:         ${plugin.state}`,
    `     source:        ${plugin.builtIn ? 'built-in' : 'custom'}`,
    `     author:        ${m.author}`,
    `     description:   ${m.description}`,
    '',
    `  ── Permissions ─────────────────────────────────`,
    `     hostFs:        ${m.permissions.hostFs ? 'yes' : 'no'}`,
    `     network:       ${m.permissions.network ? 'yes' : 'no'}`,
    `     spawnProcess:  ${m.permissions.spawnProcess ? 'yes' : 'no'}`,
    `     adminRequired: ${m.permissions.adminRequired ? 'yes' : 'no'}`,
    '',
    `  ── Contributions ───────────────────────────────`,
  ];
  for (const [k, v] of Object.entries(plugin.contributions)) {
    if (Array.isArray(v) && v.length) lines.push(`     ${pad(k, 18)} ${JSON.stringify(v)}`);
  }
  if (!plugin.builtIn) {
    lines.push('', `     sandbox compartment: ${plugin.compartmentId || '—'}`);
    if (plugin.errorMessage) lines.push(`     error: ${plugin.errorMessage}`);
  }
  lines.push('');

  log(lines.join('\n'));
  return plugin;
}

// ─── Add (install) ──────────────────────────────────────────────────────────────

function addPlugin(host, sourceDir, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!sourceDir) {
    error('  Usage: cos plugins add <dir>');
    return null;
  }

  let result = null;
  let errored = null;
  const unsubInstalled = host.bus.on(PLUGIN.INSTALLED, (ev) => { result = ev.payload; });
  const unsubError      = host.bus.on(PLUGIN.ERROR,     (ev) => { errored = ev.payload; });

  host.bus.emit('host:plugin:install', { sourceDir: path.resolve(sourceDir), host, sysmap: host.sysmap });

  unsubInstalled(); unsubError();

  if (errored) {
    error(`  Error: ${errored.reason}`);
    return null;
  }

  log(`  ✓ Installed "${result.name}"  (state: ${result.state})`);
  const contribLines = Object.entries(result.contributions).filter(([, v]) => v.length);
  for (const [k, v] of contribLines) log(`    contributes ${k}: ${v.join(', ')}`);
  return result;
}

// ─── Enable / Disable / Remove ─────────────────────────────────────────────────

function enablePluginCommand(host, idOrName, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!idOrName) { error('  Usage: cos plugins enable <id|name>'); return null; }

  let result = null, errored = null;
  const u1 = host.bus.on(PLUGIN.ENABLED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(PLUGIN.ERROR,   (ev) => { errored = ev.payload; });
  host.bus.emit('host:plugin:enable', { idOrName, host, sysmap: host.sysmap });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Enabled "${result.name}"`);
  return result;
}

function disablePluginCommand(host, idOrName, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!idOrName) { error('  Usage: cos plugins disable <id|name>'); return null; }

  let result = null, errored = null;
  const u1 = host.bus.on(PLUGIN.DISABLED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(PLUGIN.ERROR,    (ev) => { errored = ev.payload; });
  host.bus.emit('host:plugin:disable', { idOrName, host, sysmap: host.sysmap });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Disabled "${result.name}"`);
  return result;
}

function removePluginCommand(host, idOrName, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!idOrName) { error('  Usage: cos plugins remove <id|name>'); return null; }

  let result = null, errored = null;
  const u1 = host.bus.on(PLUGIN.REMOVED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(PLUGIN.ERROR,   (ev) => { errored = ev.payload; });
  host.bus.emit('host:plugin:remove', { idOrName, host, sysmap: host.sysmap });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Removed plugin (id: ${result.pluginId})`);
  return result;
}

// ─── Validate ─────────────────────────────────────────────────────────────────

function validatePluginDir(sourceDir, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!sourceDir) { error('  Usage: cos plugins validate <dir>'); return null; }

  const manifestPath = path.join(path.resolve(sourceDir), 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    error(`  ✕ no manifest.json found in ${sourceDir}`);
    return { valid: false };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    error(`  ✕ manifest.json is not valid JSON — ${err.message}`);
    return { valid: false };
  }

  try {
    validateManifest(manifest);
  } catch (err) {
    error(`  ✕ manifest.json — invalid`);
    error(`    ${err.message}`);
    return { valid: false, error: err.message };
  }

  const entryPath = path.join(path.resolve(sourceDir), manifest.entryPoint);
  if (!fs.existsSync(entryPath)) {
    error(`  ✕ entryPoint "${manifest.entryPoint}" does not exist`);
    return { valid: false };
  }

  log(`  ✓ manifest.json — valid`);
  log(`  ✓ entryPoint exists: ${manifest.entryPoint}`);
  log(`  Ready to install: cos plugins add ${sourceDir}`);
  return { valid: true, manifest };
}

// ─── New (scaffold) ─────────────────────────────────────────────────────────────

function scaffoldPlugin(targetDir, name, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const dir = path.resolve(targetDir, name);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    id: randomUUID(), name, version: '0.1.0',
    displayName: name, description: 'A new COS plugin',
    author: require('os').userInfo().username || 'unknown', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: {}, permissions: { hostFs: false, network: false, spawnProcess: false, adminRequired: false },
    entryPoint: 'index.js',
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(dir, 'index.js'),
    `// ${name} — plugin entry point\n// PluginHost is injected globally — see spec section 77\nPluginHost.log.info('${name} initialized');\n`);
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n\nA COS plugin.\n`);

  log(`  ✓ Scaffolded plugin at ${dir}`);
  return { dir, manifest };
}

// ─── Route subcommands ────────────────────────────────────────────────────────

function runPluginCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));

  switch (sub) {
    case 'list':    return listPluginsCommand(host, flags, out);
    case 'show':    return showPlugin(host, args[0], flags, out);
    case 'add':     return addPlugin(host, args[0], out);
    case 'enable':  return enablePluginCommand(host, args[0], out);
    case 'disable': return disablePluginCommand(host, args[0], out);
    case 'remove':  return removePluginCommand(host, args[0], out);
    case 'validate': return validatePluginDir(args[0], out);
    case 'new':     return scaffoldPlugin(args[0] || '.', args[1] || args[0], out);
    default:
      error('  Usage: cos plugins <list|show|add|enable|disable|remove|validate|new> [args]');
      return null;
  }
}

module.exports = {
  runPluginCommand,
  listPluginsCommand,
  showPlugin,
  addPlugin,
  enablePluginCommand,
  disablePluginCommand,
  removePluginCommand,
  validatePluginDir,
  scaffoldPlugin,
};
