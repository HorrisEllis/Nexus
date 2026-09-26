/**
 * plugin/index.js
 * COMPARTMENT OS — Plugin Public API (Phase 29, spec §62-64)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * SCOPE NOTE, same spirit as blueprint/index.js's header:
 *   Built this pass: manifest schema, the 30 built-in manifests as data,
 *   the vm-sandboxed Plugin Host API (plugin/host-api.js — the actual
 *   point of this phase), directory-based install/enable/disable/remove.
 *   Deferred, flagged, not silently dropped:
 *     - Real .cosplugin ZIP pack/unpack (spec says ZIP; doing that for
 *       real without a dependency means shelling out to PowerShell's
 *       Compress-Archive/Expand-Archive on win32 — a legitimate, real
 *       implementation, just not built in this pass since the ask was
 *       specifically about the code-execution layer).
 *     - Plugin Watchdog folder watcher (§64 — hot-install on file drop).
 *     - dev-mode hot-reload, registry search/publish (no cos.dev registry
 *       exists), permission usage audit log.
 */

'use strict';

const { ALL_BUILTIN_MANIFESTS } = require('./registry.js');
const { installPlugin, PluginInstallError } = require('./installer.js');
const { PluginSchemaError } = require('./schema.js');

// Built-ins are registered once, at a fixed epoch — they don't get
// "installed" at runtime, they're foundation-shipped. No sandbox
// compartment: they're trusted, data-only entries (see registry.js header).
const BUILTIN_EPOCH = 1782000000000;

function contributionSummaryFromManifest(manifest) {
  const c = manifest.contributes || {};
  return {
    runtimeIds:      (c.runtimes  || []).map(r => r.id),
    compilerIds:     (c.compilers || []).map(c2 => c2.id),
    archetypeIds:    (c.archetypes || []).map(a => a.id),
    blueprintIds:    (c.blueprints || []).map(b => b.id),
    themeIds:        (c.themes || []).map(t => t.id),
    cliCommands:     (c.cliCommands || []).map(cc => cc.name),
    watchdogRuleIds: (c.watchdogRules || []).map(w => w.id),
  };
}

/**
 * @returns {object[]} PluginRecord[] for every built-in manifest
 */
function builtInPluginRecords() {
  return ALL_BUILTIN_MANIFESTS.map(manifest => ({
    id: manifest.id,
    manifest,
    state: 'active',
    compartmentId: null,
    installedAt: BUILTIN_EPOCH,
    updatedAt: BUILTIN_EPOCH,
    errorMessage: null,
    contributions: contributionSummaryFromManifest(manifest),
    builtIn: true,
  }));
}

/**
 * @param {object} host
 * @returns {object[]} all plugin records — built-in + custom (both already
 *          live in sysmap.plugins; see system-map.js construction)
 */
function listPlugins(host) {
  return host.sysmap.get().plugins;
}

/**
 * @param {object} host
 * @param {string} idOrName
 * @returns {object|null}
 */
function getPlugin(host, idOrName) {
  const plugins = listPlugins(host);
  return plugins.find(p => p.id === idOrName || p.manifest.name === idOrName) || null;
}

/**
 * @param {object} host
 * @param {string} idOrName
 */
function enablePlugin(host, idOrName) {
  const plugin = getPlugin(host, idOrName);
  if (!plugin) throw new PluginInstallError(`plugin "${idOrName}" not found`);
  if (plugin.builtIn) throw new PluginInstallError(`built-in plugin "${idOrName}" is always active — cannot enable/disable`);
  const updated = Object.assign({}, plugin, { state: 'active', updatedAt: Date.now() });
  host.sysmap.upsertPlugin(updated);
  return updated;
}

/**
 * @param {object} host
 * @param {string} idOrName
 */
function disablePlugin(host, idOrName) {
  const plugin = getPlugin(host, idOrName);
  if (!plugin) throw new PluginInstallError(`plugin "${idOrName}" not found`);
  if (plugin.builtIn) throw new PluginInstallError(`built-in plugin "${idOrName}" is always active — cannot enable/disable`);
  const updated = Object.assign({}, plugin, { state: 'disabled', updatedAt: Date.now() });
  host.sysmap.upsertPlugin(updated);
  return updated;
}

/**
 * Removes a custom plugin: destroys its sandbox compartment (if any) and
 * removes the PluginRecord. Built-ins cannot be removed.
 * @param {object} host
 * @param {string} idOrName
 */
function removePlugin(host, idOrName) {
  const plugin = getPlugin(host, idOrName);
  if (!plugin) throw new PluginInstallError(`plugin "${idOrName}" not found`);
  if (plugin.builtIn) throw new PluginInstallError(`built-in plugin "${idOrName}" cannot be removed`);

  if (plugin.compartmentId) {
    const comp = host.store.getCompartment(plugin.compartmentId);
    if (comp) {
      const { destroyCompartment } = require('../cli/commands/destroy.js');
      destroyCompartment(host, comp.name, { force: true, wipe: true });
    }
  }
  host.sysmap.removePlugin(plugin.id);
  return { removed: true, pluginId: plugin.id };
}

module.exports = {
  builtInPluginRecords,
  listPlugins,
  getPlugin,
  enablePlugin,
  disablePlugin,
  removePlugin,
  installPlugin,
  PluginInstallError,
  PluginSchemaError,
};
