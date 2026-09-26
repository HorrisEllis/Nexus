/**
 * host/gates/plugin.js
 * COMPARTMENT OS — Host Plugin Gates (Phase 29, spec §62-64)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Gates registered here on the host stream:
 *   host:plugin:install  → PluginInstallGate
 *   host:plugin:enable   → PluginEnableGate
 *   host:plugin:disable  → PluginDisableGate
 *   host:plugin:remove   → PluginRemoveGate
 */

'use strict';

const { Gate }  = require('../../siso/Gate.js');
const { Event } = require('../../siso/Event.js');
const { PLUGIN } = require('../../foundation/event-contracts.js');
const { enforce } = require('../../foundation/axioms.js');

const {
  installPlugin,
  enablePlugin,
  disablePlugin,
  removePlugin,
} = require('../../plugin/index.js');

// ─── PluginInstallGate ──────────────────────────────────────────────────────────

/**
 * Handles: 'host:plugin:install'
 * Input payload: { sourceDir, host, sysmap }
 * Emits: 'plugin:installed' on success, 'plugin:error' on failure.
 */
class PluginInstallGate extends Gate {
  constructor() {
    super('host:plugin:install');
  }

  transform(event, stream) {
    const { sourceDir, host, sysmap } = event.data;

    let record;
    try {
      record = installPlugin(host, sourceDir);
    } catch (err) {
      // installPlugin attaches .record even on failure (state:'error') — surface it.
      if (err.record) sysmap.upsertPlugin(err.record);
      stream.emit(new Event(PLUGIN.ERROR, { operation: 'install', reason: err.message, record: err.record || null }));
      return;
    }

    sysmap.upsertPlugin(record);
    enforce('COS-7', { mapUpdated: true });

    stream.emit(new Event(PLUGIN.INSTALLED, {
      pluginId: record.id,
      name: record.manifest.name,
      state: record.state,
      contributions: record.contributions,
      record,
    }));
  }
}

// ─── PluginEnableGate ───────────────────────────────────────────────────────────

class PluginEnableGate extends Gate {
  constructor() {
    super('host:plugin:enable');
  }

  transform(event, stream) {
    const { idOrName, host, sysmap } = event.data;
    try {
      const updated = enablePlugin(host, idOrName);
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(PLUGIN.ENABLED, { pluginId: updated.id, name: updated.manifest.name }));
    } catch (err) {
      stream.emit(new Event(PLUGIN.ERROR, { operation: 'enable', reason: err.message }));
    }
  }
}

// ─── PluginDisableGate ──────────────────────────────────────────────────────────

class PluginDisableGate extends Gate {
  constructor() {
    super('host:plugin:disable');
  }

  transform(event, stream) {
    const { idOrName, host, sysmap } = event.data;
    try {
      const updated = disablePlugin(host, idOrName);
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(PLUGIN.DISABLED, { pluginId: updated.id, name: updated.manifest.name }));
    } catch (err) {
      stream.emit(new Event(PLUGIN.ERROR, { operation: 'disable', reason: err.message }));
    }
  }
}

// ─── PluginRemoveGate ───────────────────────────────────────────────────────────

class PluginRemoveGate extends Gate {
  constructor() {
    super('host:plugin:remove');
  }

  transform(event, stream) {
    const { idOrName, host, sysmap } = event.data;
    try {
      const result = removePlugin(host, idOrName);
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(PLUGIN.REMOVED, { pluginId: result.pluginId }));
    } catch (err) {
      stream.emit(new Event(PLUGIN.ERROR, { operation: 'remove', reason: err.message }));
    }
  }
}

module.exports = {
  PluginInstallGate,
  PluginEnableGate,
  PluginDisableGate,
  PluginRemoveGate,
};
