/**
 * cli/commands/vaultd.js
 * COMPARTMENT OS — cos vaultd install | start | stop | status | migrate | config | backup | restore
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * install/uninstall are NOT implemented — see vaultd/config.js header for
 * why (real Windows service registration, unreachable here). Calling
 * them returns a clear "not implemented" error rather than pretending.
 *
 * Every status check also updates SystemMap.vaultdState — COS-42:
 * "vaultd state is visible in SystemMap whether running or not."
 */

'use strict';

const path = require('path');
const { VAULTD } = require('../../foundation/event-contracts.js');
const {
  startVaultd, stopVaultd, statusVaultd, backupVaultd, restoreVaultd,
} = require('../../vaultd/daemon.js');
const { DEFAULT_VAULTD_CONFIG, VAULTD_CONFIG_FILE } = require('../../vaultd/config.js');

async function installCommand(out = {}) {
  const error = out.error || ((...a) => console.error(...a));
  error('  Not implemented: vaultd install/uninstall requires registering a real Windows');
  error('  service (sc.exe / native service APIs), which is not reachable from this build');
  error('  environment. Use "cos vaultd start" instead — it runs vaultd as a real detached');
  error('  process, just not a registered Windows service.');
  return null;
}

async function startCommand(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  try {
    const result = await startVaultd({ port: flags.port ? Number(flags.port) : undefined });
    if (host) host.bus.emit(VAULTD.STARTED, result);
    log(`  ✓ vaultd started — pid ${result.pid}, listening on http://127.0.0.1:${result.port}`);
    await updateSystemMapVaultdState(host);
    return result;
  } catch (err) {
    if (host) host.bus.emit(VAULTD.ERROR, { operation: 'start', reason: err.message });
    error(`  Error: ${err.message}`);
    return null;
  }
}

function stopCommand(host, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const result = stopVaultd();
  if (host) host.bus.emit(VAULTD.STOPPED, result);
  if (!result.wasRunning) {
    log('  vaultd was not running');
  } else {
    log('  ✓ vaultd stopped');
  }
  if (host) host.sysmap.setVaultdState(null); // COS-42: null when not running
  return result;
}

async function statusCommand(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const state = await statusVaultd();
  if (host) host.bus.emit(VAULTD.STATUS, state);
  await updateSystemMapVaultdState(host, state);

  if (flags.json) { log(JSON.stringify(state, null, 2)); return state; }

  const lines = ['', `  ── vaultd ──────────────────────────`];
  lines.push(`     running:      ${state.running}`);
  if (state.running) {
    lines.push(`     pid:          ${state.pid}`);
    lines.push(`     uptime:       ${Math.round(state.uptime / 1000)}s`);
    lines.push(`     secrets:      ${state.secretCount}`);
    lines.push(`     grants:       ${state.grantCount}`);
    lines.push(`     tpmBound:     ${state.tpmBound}`);
    if (state.degraded) lines.push(`     \u26a0 process is alive but not responding on HTTP`);
  }
  lines.push('');
  log(lines.join('\n'));
  return state;
}

async function updateSystemMapVaultdState(host, precomputedState = null) {
  if (!host) return;
  const state = precomputedState || await statusVaultd();
  // COS-42: VaultdState present whether running or not — null only when
  // genuinely not running, never omitted.
  // NOTE: sysmap.get() returns a deep clone (JSON.parse(JSON.stringify(...))) —
  // mutating its return value is a no-op. Caught this before shipping by
  // checking system-map.js's actual implementation rather than assuming.
  host.sysmap.setVaultdState(state.running ? state : null);
}

function migrateCommand(host, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  // The embedded vault and vaultd already share the SAME on-disk store —
  // see vaultd/server.js header. There is nothing to copy or convert;
  // "migrating" is just starting vaultd against the existing store.
  log('  Nothing to migrate: vaultd reads the same vault store the embedded');
  log('  vault already uses. Run "cos vaultd start" to make it accessible');
  log('  over HTTP as well.');
  return { migrated: true, note: 'shared-store, no-op' };
}

function configCommand(out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  log(JSON.stringify(DEFAULT_VAULTD_CONFIG, null, 2));
  log(`\n  config file: ${VAULTD_CONFIG_FILE} (not yet persisted — defaults shown)`);
  return DEFAULT_VAULTD_CONFIG;
}

function backupCommand(host, outPath, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!outPath) { error('  Usage: cos vaultd backup --out vault.cosvault'); return null; }
  try {
    const result = backupVaultd(path.resolve(outPath));
    if (host) host.bus.emit(VAULTD.BACKED_UP, result);
    log(`  ✓ Backed up vault store to ${outPath} (still encrypted)`);
    return result;
  } catch (err) {
    error(`  Error: ${err.message}`);
    return null;
  }
}

function restoreCommand(host, inPath, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!inPath) { error('  Usage: cos vaultd restore vault.cosvault'); return null; }
  try {
    const result = restoreVaultd(path.resolve(inPath));
    if (host) host.bus.emit(VAULTD.RESTORED, result);
    log(`  ✓ Restored vault store from ${inPath}`);
    return result;
  } catch (err) {
    error(`  Error: ${err.message}`);
    return null;
  }
}

async function runVaultdCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));
  switch (sub) {
    case 'install':
    case 'uninstall': return installCommand(out);
    case 'start':     return startCommand(host, flags, out);
    case 'stop':      return stopCommand(host, out);
    case 'status':    return statusCommand(host, flags, out);
    case 'migrate':   return migrateCommand(host, out);
    case 'config':    return configCommand(out);
    case 'backup':    return backupCommand(host, flags.out || args[0], out);
    case 'restore':   return restoreCommand(host, args[0], out);
    default:
      error('  Usage: cos vaultd <start|stop|status|migrate|config|backup|restore> [args]');
      return null;
  }
}

module.exports = {
  runVaultdCommand,
  installCommand, startCommand, stopCommand, statusCommand, migrateCommand, configCommand, backupCommand, restoreCommand,
};
