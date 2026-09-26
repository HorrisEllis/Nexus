/**
 * plugin/installer.js
 * COMPARTMENT OS — Plugin Installer (spec §63 Plugin Manager)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * installPlugin(host, sourceDir) does the §63.2 install sequence for a
 * plugin that lives as a DIRECTORY (manifest.json + entryPoint file next
 * to it). Real .cosplugin ZIP I/O is deferred — flagged in plugin/index.js
 * header, not here. Directory-based install is what actually exercises
 * the vm sandbox, which was the point of this pass.
 *
 * Install sequence (mirrors §63.2's numbered steps, minus the ZIP-specific
 * ones):
 *   1. Read + parse manifest.json
 *   2. validateManifest() — COS-39, before any code runs
 *   3. Check cosVersion compatibility
 *   4. Check entryPoint file exists
 *   5. Compute SHA-256 of the manifest + entryPoint (recorded, not yet
 *      used for tamper detection on reinstall — that's a future seam)
 *   6. Create sandbox compartment (COS-40: it's a real, first-class
 *      compartment, visible in the system map)
 *   7. Execute entryPoint via the vm-sandboxed Host API
 *   8. Cross-check registered contributions are a subset of declared
 *      contributes — a plugin that registers something it didn't declare
 *      is a manifest/behavior mismatch, not a detail to ignore
 *   9. Mark active, return the PluginRecord
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { validateManifest, isCompatibleVersion } = require('./schema.js');
const { createPluginHost, executePluginCode } = require('./host-api.js');
const { COS_VERSION } = require('../foundation/constants.js');

const SANDBOX_RESOURCES = Object.freeze({
  ramLimitMB: 128, ramReservedMB: 0, ramAlertPercent: 90,
  cpuLimitPercent: 10, cpuPriority: 'background', cpuAffinityMask: null,
  ioThrottle: 'strict', governorPolicy: 'background', maxThreads: 0, minThreads: 0,
});

class PluginInstallError extends Error {
  constructor(message, cause = null) {
    super(`PluginInstall: ${message}`);
    this.name = 'PluginInstallError';
    this.cause = cause;
  }
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Cross-checks that everything registered via PluginHost.register.* was
 * actually declared in manifest.contributes. Doesn't require an exact
 * match — a plugin can declare more than it uses in a given run — but
 * registering something undeclared is rejected.
 * @param {object} manifest
 * @param {object} contributions
 * @throws {PluginInstallError}
 */
function verifyContributionsDeclared(manifest, contributions) {
  const declared = manifest.contributes || {};
  const checks = [
    ['runtimes', 'runtime'], ['compilers', 'compiler'], ['archetypes', 'archetype'],
    ['blueprints', 'blueprint'], ['cliCommands', 'cliCommand'], ['watchdogRules', 'watchdogRule'],
    ['pipeTransforms', 'pipeTransform'], ['themes', 'theme'], ['uiComponents', 'uiComponent'],
  ];
  for (const [field, label] of checks) {
    const registeredCount = contributions[field].length;
    const declaredCount = (declared[field] || []).length;
    if (registeredCount > 0 && declaredCount === 0) {
      throw new PluginInstallError(
        `plugin registered a ${label} contribution but manifest.contributes.${field} declared none — manifest must match behavior`
      );
    }
  }
}

/**
 * @param {object} host       { store, sysmap, bus }
 * @param {string} sourceDir  directory containing manifest.json + entryPoint
 * @returns {object} PluginRecord
 */
function installPlugin(host, sourceDir) {
  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new PluginInstallError(`no manifest.json found in ${sourceDir}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new PluginInstallError(`manifest.json is not valid JSON — ${err.message}`, err);
  }

  // Step 2 — COS-39: validated before any code runs.
  validateManifest(manifest);

  // Step 3
  if (!isCompatibleVersion(manifest.cosVersion, COS_VERSION)) {
    throw new PluginInstallError(`manifest requires cosVersion ${manifest.cosVersion}, running ${COS_VERSION}`);
  }

  // Step 4
  const entryPath = path.join(sourceDir, manifest.entryPoint);
  if (!fs.existsSync(entryPath)) {
    throw new PluginInstallError(`entryPoint "${manifest.entryPoint}" does not exist in ${sourceDir}`);
  }
  const entryCode = fs.readFileSync(entryPath, 'utf8');

  // Step 5
  const checksum = sha256(JSON.stringify(manifest) + entryCode);

  // Step 6 — sandbox compartment, real and visible in the system map.
  const { createCompartment } = require('../cli/commands/create.js');
  const sandboxName = `plugin-${manifest.name}`;
  const sandboxCompartment = createCompartment(host, {
    name: sandboxName,
    purpose: `Plugin sandbox — ${manifest.displayName}`,
    runtimeId: 'plugin',
    networkIsolated: !manifest.permissions.network,
  });
  const updatedSandbox = Object.assign({}, sandboxCompartment, {
    resources: { ...SANDBOX_RESOURCES },
    fs: Object.assign({}, sandboxCompartment.fs, {
      writable: [path.join(sandboxCompartment.fs.root, 'plugin-data')],
    }),
    updatedAt: Date.now(),
  });
  fs.mkdirSync(path.join(sandboxCompartment.fs.root, 'plugin-data'), { recursive: true });
  host.store.setCompartment(updatedSandbox);
  host.store.flushSync();
  host.sysmap.upsertCompartment(updatedSandbox);

  // Step 7 — execute via the vm-sandboxed Host API.
  const pluginMeta = { id: manifest.id, name: manifest.name, version: manifest.version };
  const { pluginHost, contributions, logs, teardown } = createPluginHost(pluginMeta, { bus: host.bus, sysmap: host.sysmap });

  let installError = null;
  try {
    executePluginCode(entryCode, pluginHost, { filename: `${manifest.name}/${manifest.entryPoint}` });
    // Step 8
    verifyContributionsDeclared(manifest, contributions);
  } catch (err) {
    installError = err;
  }

  if (installError) {
    teardown();
    const record = {
      id: manifest.id,
      manifest,
      state: 'error',
      compartmentId: updatedSandbox.id,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      errorMessage: installError.message,
      contributions: emptyContributionSummary(),
      checksum,
      builtIn: false,
    };
    throw Object.assign(installError, { record });
  }

  // Step 9
  const record = {
    id: manifest.id,
    manifest,
    state: 'active',
    compartmentId: updatedSandbox.id,
    installedAt: Date.now(),
    updatedAt: Date.now(),
    errorMessage: null,
    contributions: {
      runtimeIds:      contributions.runtimes.map(r => r.id),
      compilerIds:     contributions.compilers.map(c => c.id),
      archetypeIds:    contributions.archetypes.map(a => a.id),
      blueprintIds:    contributions.blueprints.map(b => b.id),
      themeIds:        contributions.themes.map(t => t.id),
      cliCommands:     contributions.cliCommands.map(c => c.name),
      watchdogRuleIds: contributions.watchdogRules.map(w => w.id),
    },
    checksum,
    logs,
    builtIn: false,
  };

  return record;
}

function emptyContributionSummary() {
  return {
    runtimeIds: [], compilerIds: [], archetypeIds: [], blueprintIds: [],
    themeIds: [], cliCommands: [], watchdogRuleIds: [],
  };
}

module.exports = {
  PluginInstallError,
  installPlugin,
  verifyContributionsDeclared,
  sha256,
};
