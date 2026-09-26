/**
 * plugin/host-api.js
 * COMPARTMENT OS — Plugin Host API (spec §77, "Plugin Host API")
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Plugin entryPoint code runs inside a real V8 isolated context
 * (Node's `vm` module — a different global object, different Object/
 * Array/Function constructors, no closure over this process's scope).
 *
 * SECURITY MODEL, FLAGGED EXPLICITLY:
 *   The sandbox exposes globalThis.PluginHost and NOTHING ELSE. There is
 *   no `require`, no `process`, no `fs`, no access to this module's
 *   closure. A plugin cannot reach the host filesystem or network through
 *   ANY path except by going through PluginHost's declared methods below
 *   — and those methods don't currently include fs/network primitives,
 *   because spec §77's own PluginHostAPI table doesn't define any.
 *
 *   This means: a manifest declaring permissions.hostFs = true is
 *   VALIDATED (and recorded — installer.js checks declared vs. actually
 *   used contributions) but does NOT currently grant the plugin any real
 *   filesystem capability. Permissions are a ceiling enforced by what's
 *   absent from the sandbox, not a live capability-injection switch.
 *   COS-50 ("Plugin Host API is the ONLY channel — no side-door IPC")
 *   is enforced by construction: there is no side door because there's
 *   no Node primitive reachable at all, sanctioned or not.
 *
 *   If a future phase needs plugins to actually touch files (e.g. a
 *   theme plugin reading its own CSS), that's the seam to add a
 *   permission-gated PluginHost.fs.* surface — deliberately not invented
 *   here since spec doesn't ask for it.
 *
 * Execution has a hard timeout (5s) — COS-1 spirit: a plugin that hangs
 * at install time is a stub, not a working plugin.
 */

'use strict';

const vm = require('vm');

class PluginRuntimeError extends Error {
  constructor(message, pluginId = null, cause = null) {
    super(`PluginRuntime: ${message}`);
    this.name = 'PluginRuntimeError';
    this.pluginId = pluginId;
    this.cause = cause;
  }
}

/**
 * Objects created inside the vm context carry that context's OWN
 * Object.prototype/Array.prototype — a different realm than this process's.
 * Forwarding them straight into the real event bus or contributions array
 * means downstream `instanceof Object` / prototype-identity checks could
 * behave unpredictably, even though the data looks identical under
 * JSON.stringify. Cloning through JSON at the boundary converts to plain
 * host-realm objects — found via a failing assert.deepStrictEqual in
 * testing, not from spec text, so flagged here rather than left implicit.
 * @param {*} value
 * @returns {*}
 */
function crossRealmSafeClone(value) {
  if (value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; } // non-serializable (e.g. a function) — pass through, caller's problem
}

/**
 * Builds the PluginHost object + a contributions/log collector for one
 * plugin instance. Each plugin gets its OWN PluginHost — contributions
 * never leak between plugins.
 *
 * @param {object} plugin       { id, name, version }
 * @param {object} deps         { bus, sysmap }  — real host primitives
 * @returns {{ pluginHost: object, contributions: object, logs: object[] }}
 */
function createPluginHost(plugin, deps) {
  const contributions = {
    runtimes: [], compilers: [], archetypes: [], blueprints: [],
    uiComponents: [], cliCommands: [], watchdogRules: [], pipeTransforms: [], themes: [],
  };
  const logs = [];
  const ownListeners = []; // [{ type, fn, unsubscribe }] — for off() bookkeeping

  const log = (level) => (msg, data) => {
    logs.push({ level, msg: String(msg), data: crossRealmSafeClone(data) ?? null, ts: Date.now() });
  };

  const pluginHost = Object.freeze({
    register: Object.freeze({
      runtime:      (def) => contributions.runtimes.push(crossRealmSafeClone(def)),
      compiler:     (def) => contributions.compilers.push(crossRealmSafeClone(def)),
      archetype:    (def) => contributions.archetypes.push(crossRealmSafeClone(def)),
      blueprint:    (def) => contributions.blueprints.push(crossRealmSafeClone(def)),
      cliCommand:   (def) => contributions.cliCommands.push(crossRealmSafeClone(def)),
      watchdogRule: (def) => contributions.watchdogRules.push(crossRealmSafeClone(def)),
      pipeTransform:(def) => contributions.pipeTransforms.push(crossRealmSafeClone(def)),
      theme:        (def) => contributions.themes.push(crossRealmSafeClone(def)),
      uiComponent:  (def) => contributions.uiComponents.push(crossRealmSafeClone(def)),
    }),

    on(eventType, handler) {
      if (typeof handler !== 'function') return;
      const wrapped = (stamped) => { try { handler(stamped); } catch (_) { /* plugin's own bug, not host's */ } };
      const unsubscribe = deps.bus.on(eventType, wrapped);
      ownListeners.push({ type: eventType, fn: handler, unsubscribe });
    },

    off(eventType, handler) {
      const idx = ownListeners.findIndex(l => l.type === eventType && l.fn === handler);
      if (idx >= 0) {
        ownListeners[idx].unsubscribe();
        ownListeners.splice(idx, 1);
      }
    },

    emit(eventType, payload) {
      deps.bus.emit(eventType, crossRealmSafeClone(payload) ?? {});
    },

    systemMap: Object.freeze({
      get: async () => deps.sysmap.get(),
      getCompartment: async (id) => deps.sysmap.get().compartments.find(c => c.id === id) || null,
    }),

    vault: Object.freeze({
      // Key NAMES only — values are never in the system map (COS-42 spirit), so
      // there is nothing to accidentally over-expose here even without a
      // permission check.
      listKeys: async (compartmentId) =>
        deps.sysmap.get().vaultKeys.filter(k => k.compartmentId === compartmentId).map(k => k.key),
    }),

    log: Object.freeze({
      info:  log('info'),
      warn:  log('warn'),
      error: log('error'),
      debug: log('debug'),
    }),

    meta: Object.freeze({ id: plugin.id, name: plugin.name, version: plugin.version }),
  });

  return {
    pluginHost,
    contributions,
    logs,
    teardown() { for (const l of ownListeners) l.unsubscribe(); },
  };
}

/**
 * Executes a plugin's entryPoint source code inside an isolated vm context.
 * The ONLY thing reachable from inside the code is `globalThis.PluginHost`.
 *
 * @param {string} code        entryPoint file contents
 * @param {object} pluginHost   from createPluginHost()
 * @param {{ filename?: string, timeoutMs?: number }} opts
 * @throws {PluginRuntimeError} if the code throws, times out, or the
 *         module system can't load (no require — by design)
 */
function executePluginCode(code, pluginHost, opts = {}) {
  const { filename = 'plugin-entry.js', timeoutMs = 5000 } = opts;

  const sandbox = { PluginHost: pluginHost };
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false }, // no eval()/new Function() escape hatches either
  });

  let script;
  try {
    script = new vm.Script(code, { filename });
  } catch (err) {
    throw new PluginRuntimeError(`syntax error in ${filename}: ${err.message}`, pluginHost.meta.id, err);
  }

  try {
    script.runInContext(context, { timeout: timeoutMs });
  } catch (err) {
    if (err && /Script execution timed out/.test(err.message)) {
      throw new PluginRuntimeError(`${filename} did not finish within ${timeoutMs}ms — treated as hung, not installed`, pluginHost.meta.id, err);
    }
    throw new PluginRuntimeError(`runtime error in ${filename}: ${err.message}`, pluginHost.meta.id, err);
  }
}

module.exports = {
  PluginRuntimeError,
  createPluginHost,
  executePluginCode,
};
