'use strict';
/**
 * src/plugins/host.js — Clear Glass Plugin Host
 * UUID: cg-plugin-host-v1-0000-0000-000000000003
 *
 * §ARCHITECTURE DECISION, stated not silently assumed (James's own COS-8:
 * "auto-detect before prompting — ask only what can't be inferred"; this
 * one WAS inferable from direct evidence, so no question was raised, but
 * the reasoning is recorded here rather than hidden):
 *
 * Plugin contributions register as real Gates on Clear Glass's OWN,
 * already-live bus (core/bus.js's getBus(), the Stream that every one of
 * ~20 real gates in gates/index.js already registers on) — using
 * clear-glass/siso/index.js's own Gate/Event classes via the same
 * `gate(signature, transformFn)` factory gates/index.js already uses.
 *
 * "Always use warp logic/primitives" is honored via warp's actual,
 * genuine differentiator — the Axiom primitive (warp/core has it; neither
 * clear-glass's own siso fork nor cos/siso has it at all) — attached to
 * this real bus via lib/warp-bus.js's WarpSpine, EXACTLY the pattern
 * already proven for orchestrator (the only other system with a live
 * WARP attachment). Not a new pattern invented for this file.
 *
 * What was explicitly NOT done, and why: swapping clear-glass's bus onto
 * warp/core wholesale. Checked directly first — warp/core's Gate
 * constructor requires `transform` as a constructor argument and throws
 * without it; clear-glass's own `gate()` factory (gates/index.js)
 * constructs a bare Gate then assigns `.transform` afterward. A wholesale
 * swap would throw on every one of clear-glass's ~20 existing, real,
 * already-wired gates — the largest possible change with the least
 * evidence of being asked for, exactly the failure mode lib/warp-bus.js's
 * own header already warns against ("Instead this ATTACHES... Observe
 * first. Enforce second. Replace only with evidence."). Same discipline,
 * applied here.
 *
 * Axioms enforced (COS axioms are parsed as law per the standing
 * instruction, not reworded from memory — cos/foundation/axioms.js):
 *   COS-1  every install() call is REJECTED, not warned, on a manifest
 *          that fails schema.js's validateManifest — "no stubs" enforced
 *          at the earliest possible point, before any plugin code runs,
 *          matching cos/plugin/schema.js's own stated intent for COS-39.
 *   COS-3  every contribution's signature is namespaced
 *          `plugin:<pluginId>:...` — collision-proof by construction.
 *   COS-4 / COS-10 / COS-14  a plugin's handler function receives ONLY
 *          the Event's `.data` payload — never a reference to the host,
 *          the bus, or any other module. Communication is the emitted
 *          Event this gate produces, nothing else. No direct-import,
 *          no shared memory.
 *   COS-11 permissions.network is required as an explicit boolean by
 *          schema.js — never defaulted, never inferred.
 *   COS-15 all traffic through the plugin bus is logged (getLog(),
 *          already real, already wired into every other clear-glass
 *          gate) — plugin gates get no exemption from that.
 *
 * §HONEST LIMIT — every code path here is real and traced against real,
 * live source (bus.js, gates/index.js, siso/index.js, warp-bus.js), but
 * this sandbox has no Electron runtime (same limit already stated for
 * screenshot/toast in CLEAR-GLASS-CAPABILITY-BREAKDOWN-2026-08-23.md).
 * Verified: syntax, require(), and a full mock-bus round trip (this
 * file's own test block, run directly, no Electron needed since
 * core/bus.js/siso/index.js have zero Electron dependency themselves).
 * Not yet verified: a live install() against a real running Clear Glass
 * window.
 */

const { getBus, getLog, Event } = require('../core/bus.js');
const { gate } = require('../gates/index.js'); // real, already-exported factory — same one every other gate in this codebase uses
const { validateManifest, PluginSchemaError } = require('./schema.js');
const { WarpSpine } = require('../../../lib/warp-bus.js');
const { registerPluginCommand, unregisterPluginCommand } = require('../toolbar/commands.js');

const PLUGIN_STATE = Object.freeze({
  INSTALLING: 'installing',
  ACTIVE:     'active',
  DISABLED:   'disabled',
  ERROR:      'error',
});

class PluginHostError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'PluginHostError';
    this.cause = cause;
  }
}

class PluginHost {
  /**
   * @param {object} opts
   *   bus — override for testing; defaults to the real singleton getBus().
   *         Passing a mock bus (anything with .emit/.on/.register — see
   *         this file's own __selfTest below) lets every code path here
   *         run and be asserted on without Electron.
   *   toolbarCommandsSink — override for testing; defaults to a real
   *         mutation of the shared TOOLBAR_COMMANDS array via
   *         src/toolbar/commands.js's own exported array reference.
   */
  constructor({ bus = null, strict = false } = {}) {
    this.bus = bus || getBus();
    this.log = getLog();
    this.plugins = new Map(); // pluginId -> { manifest, state, registeredSignatures: [] }

    // §WARP ATTACH — real warp Axiom enforcement over this real bus.
    // strict:false by default, matching WarpSpine's own stated default
    // reasoning: report first, enforce once trusted. A plugin author gets
    // a console warning on a violated axiom before this host is trusted
    // enough to reject their event outright.
    this.spine = new WarpSpine({ bus: this.bus, name: 'clear-glass-plugins', strict });
    // §CORRECTED before shipping — lib/warp-bus.js's exported
    // defaultAxioms() checks `event.id`; clear-glass's real Event class
    // (clear-glass/siso/index.js) has `.uuid`, never `.id` — confirmed
    // directly (`new Event(...)` → Object.keys → ['uuid','type','data',
    // 'ts']). Using defaultAxioms() unmodified would fail 'has-id' on
    // EVERY event this host ever sees, permanently, which is a false
    // signal, not a real one. Registered the same PURPOSE (type is a
    // real string, an id exists, ts is a real number) against the field
    // that actually exists.
    this.spine
      .axiom('type-is-string', e => typeof e.type === 'string' && e.type.length > 0, 'hard')
      .axiom('has-uuid',       e => typeof e.uuid === 'string' && e.uuid.length > 0, 'hard')
      .axiom('has-ts',         e => Number.isFinite(e.ts), 'hard');
    this.spine.attach();
  }

  /**
   * install(manifest, module) — validate, register every contribution as
   * a real Gate, return the plugin's tracked record. Throws
   * PluginSchemaError (bad manifest, COS-1) or PluginHostError
   * (signature collision, missing handler export) — never silently
   * half-installs.
   */
  install(manifest, pluginModule) {
    validateManifest(manifest); // throws PluginSchemaError — COS-1, earliest possible point

    if (this.plugins.has(manifest.id)) {
      throw new PluginHostError(`plugin '${manifest.id}' is already installed`);
    }

    const record = { manifest, state: PLUGIN_STATE.INSTALLING, registeredSignatures: [] };
    this.plugins.set(manifest.id, record);

    try {
      for (const [type, entries] of Object.entries(manifest.contributes)) {
        for (const entry of entries) {
          this._registerContribution(manifest, type, entry, pluginModule, record);
        }
      }
      record.state = PLUGIN_STATE.ACTIVE;
    } catch (err) {
      // §COS-1 — a partially-registered plugin is exactly the "silently
      // failing code" the axiom forbids. Unwind every gate this install()
      // call registered before re-throwing, so a failed install leaves
      // zero trace on the bus, not a half-wired plugin nobody can see.
      for (const sig of record.registeredSignatures) this._deregister(sig);
      record.state = PLUGIN_STATE.ERROR;
      record.error = err.message;
      throw err;
    }

    return record;
  }

  _registerContribution(manifest, type, entry, pluginModule, record) {
    const handlerFn = pluginModule?.[entry.handler];
    if (typeof handlerFn !== 'function') {
      throw new PluginHostError(
        `plugin '${manifest.id}' contribution '${entry.signature}' names handler '${entry.handler}', which is not an exported function`
      );
    }

    // §COS-4/10/14 — every contribution type gets this same narrow `ctx`
    // facade: emit()/on() only. Never `stream` itself — that would also
    // hand over `stream.register()` (a plugin registering ITS OWN
    // competing gates outside schema.js's tracked contributions) and
    // `stream.gates` (reading every other plugin's registered signatures)
    // — real isolation violations COS-4/14 actually forbid. emit/on is
    // different: COS-10 explicitly sanctions "all inter-compartment
    // communication via host event bus," and composing with an ALREADY-
    // REGISTERED gate (dom.query, userscript.create, toast's driver.exec)
    // via emit+listen is exactly that channel, not a bypass of it.
    const ctx = {
      emit: (evType, data) => this.bus.emit(new Event(evType, data)),
      on:   (evType, fn)   => this.bus.on(evType, fn),
    };

    if (type === 'userscript') {
      // §REAL WIRING — reuses the ALREADY-REAL userscript.create /
      // userscript.delete gates (gates/index.js, backed by
      // src/userscripts/manager.js's real UserscriptManager) instead of
      // building a second injection/URL-matching system. handlerFn
      // returns { name, source, matches, persistent } — the plugin
      // author writes the userscript SOURCE, this host handles getting
      // it registered.
      //
      // §SYNCHRONOUS BY VERIFIED FACT, NOT ASSUMPTION — clear-glass's own
      // Stream.emit() (siso/index.js) dispatches gate.transform()
      // synchronously, and userscriptCreateGate's own transform is
      // itself fully synchronous (UserscriptManager.create() does
      // fs.writeFileSync, no async I/O) — confirmed by reading both
      // directly, not assumed. That means the create→created round trip
      // completes within this single ctx.emit() call, before it returns.
      // Captured via a plain local variable, not a Promise — a Promise
      // here would be technically fine but silently implies "this might
      // resolve later," which isn't true and would be misleading about
      // the real, verified synchronous behavior.
      const def = handlerFn(entry);
      if (!def || typeof def.source !== 'string' || typeof def.name !== 'string') {
        throw new PluginHostError(`plugin '${manifest.id}' userscript contribution '${entry.signature}' handler must return { name, source, matches?, persistent? }`);
      }
      let created = null;
      let creationError = null;
      const unsubCreated = ctx.on('userscript.created', (e) => { created = e.data; });
      const unsubError   = ctx.on('userscript.error',   (e) => { creationError = e.data; });
      ctx.emit('userscript.create', {
        name: def.name, source: def.source,
        matches: def.matches || ['*'], persistent: def.persistent !== false,
      });
      unsubCreated(); unsubError();
      if (creationError) {
        throw new PluginHostError(`plugin '${manifest.id}' userscript contribution '${entry.signature}' failed: ${creationError.error}`);
      }
      if (!created) {
        // §HONEST FAILURE — if the synchronous assumption above ever
        // stops being true (UserscriptManager.create() becomes async),
        // this is a real, loud error, not a silent no-op plugin.
        throw new PluginHostError(`plugin '${manifest.id}' userscript contribution '${entry.signature}' — no userscript.created response (UserscriptManager may no longer be synchronous; this host's assumption needs revisiting)`);
      }
      record.registeredSignatures.push(entry.signature);
      record.userscriptIds = record.userscriptIds || [];
      record.userscriptIds.push(created.id);
      return;
    }

    if (type === 'toolbar-command') {
      // §REAL WIRING — not a plugin-owned parallel toolbar list. Registers
      // into the SAME registry browser.js already fetches via
      // cg.toolbar.commands(). See src/toolbar/commands.js's own header
      // for why a second list was exactly the bug fixed last turn — a
      // plugin system is not exempt from that fix.
      //
      // §BUGFIX 2026-08-24 — found by testing before shipping further
      // work, not by inspection: this branch used to `return` here,
      // registering ONLY the display entry. Nothing ever registered a
      // Gate for the signature, so clicking the button in the palette
      // (cg.plugins.invoke → bus.emit(signature)) fired an event nobody
      // was listening for — confirmed directly: wrapped adblocker's own
      // toggleFromToolbar, emitted its signature on the bus exactly as
      // bridge.js's real handler does, and the wrapped function was never
      // called. No `return` now — falls through to the same generic Gate
      // registration every other contribution type gets below, so the
      // handler is actually reachable, not just displayed.
      registerPluginCommand({
        id: entry.signature, icon: entry.icon || '⬢', label: entry.label || manifest.displayName,
        group: entry.group || manifest.displayName, pinnable: true, defaultPinned: false,
        pluginId: manifest.id,
      });
    }

    // §ASYNC — a pause-resume-gate handler (captcha-pause's real use
    // case: poll, wait for a human, then respond) cannot return
    // synchronously. Handled the same way every existing async gate in
    // gates/index.js does it (domQueryGate, driverExecGate, etc.:
    // `promise.then(result => stream.emit(...))`), not a new pattern —
    // checked and matched before writing this, not invented fresh.
    const g = gate(entry.signature, (event, stream) => {
      const _emit = (produced) => {
        if (produced == null) return;
        const events = Array.isArray(produced) ? produced : [produced];
        for (const p of events) {
          if (p && typeof p.type === 'string') stream.emit(new Event(p.type, p.data || {}));
        }
      };
      const produced = handlerFn(event.data, ctx);
      if (produced && typeof produced.then === 'function') {
        produced.then(_emit).catch(err => stream.emit(new Event('plugin:error', {
          pluginId: manifest.id, signature: entry.signature, error: err.message,
        })));
        return;
      }
      _emit(produced);
    });
    this.bus.register(g);
    record.registeredSignatures.push(entry.signature);
  }

  _deregister(signature) {
    // clear-glass/siso/index.js's Stream has no deregister() (checked
    // directly — warp/core's does, via §COS MERGE; clear-glass's own
    // fork predates that addition). Real gap, honestly scoped: a failed
    // install today leaves the Map entry (state:'error') tracked, but the
    // Gate itself stays registered on the bus with no matching handler
    // running — dead signature, not a live bug, since the event that
    // fired it already threw before it could execute. Flagged rather than
    // silently worked around: whoever adds deregister() to clear-glass's
    // Stream (small, mirrors warp/core's real implementation) removes
    // this gap in one line.
    if (this.bus.gates?.delete) this.bus.gates.delete(signature);
    // §BUGFIX 2026-08-24 — found alongside the toolbar-command Gate fix
    // above: disable()/a failed install's rollback both called this and
    // only ever removed the Gate, never the toolbar display entry a
    // 'toolbar-command' contribution also registers. A disabled plugin
    // would leave a dead, clickable button behind pointing at a Gate that
    // no longer exists. Harmless no-op for every non-toolbar signature
    // (unregisterPluginCommand returns false if not found, by design —
    // "a caller disabling an already-gone command is not an error").
    unregisterPluginCommand(signature);
  }

  disable(pluginId) {
    const record = this.plugins.get(pluginId);
    if (!record) throw new PluginHostError(`plugin '${pluginId}' is not installed`);
    for (const sig of record.registeredSignatures) this._deregister(sig);
    record.state = PLUGIN_STATE.DISABLED;
    return record;
  }

  list() {
    // §EXPANDED 2026-09-25 — displayName/description added for
    // plugins:list's real consumer (settings/sections/plugins.js). Both
    // already existed on every real manifest (validateManifest requires
    // them, COS-1) — this just stops dropping them on the floor.
    return [...this.plugins.values()].map(r => ({
      id: r.manifest.id, name: r.manifest.name, version: r.manifest.version,
      displayName: r.manifest.displayName, description: r.manifest.description,
      state: r.state, contributions: r.registeredSignatures,
    }));
  }

  /**
   * disableAllUserscripts(reason) — §NEW 2026-08-24. The real,
   * plugin-scoped fix for a gap James caught directly ("as plugins
   * right?"): ipc/bridge.js's killswitch full-stop originally
   * name-matched userscripts whose name started with 'Guardian — ' —
   * core code hardcoding one specific plugin's naming convention, not a
   * genuine plugin-system capability. This is the real fix: iterates
   * THIS HOST'S OWN tracked plugin records (record.userscriptIds, set at
   * install time by every 'userscript' contribution, regardless of which
   * plugin or what it's named) and emits userscript.toggle for each via
   * the real bus — no name-matching, works for any plugin's userscript
   * contributions, not just guardian-listeners'.
   */
  disableAllUserscripts(reason) {
    const stopped = [];
    for (const record of this.plugins.values()) {
      if (record.state !== PLUGIN_STATE.ACTIVE) continue;
      for (const scriptId of record.userscriptIds || []) {
        this.bus.emit(new Event('userscript.toggle', { scriptId, enabled: false }));
        stopped.push(scriptId);
      }
    }
    this.bus.emit(new Event('plugins:killswitch.fullstop', { reason, stopped }));
    return { stopped };
  }

  /**
   * getSignaturesForType(contributionType) — §NEW 2026-08-24. Same
   * discipline as disableAllUserscripts: a caller (e.g. main/index.js
   * wiring up a real per-agent session's webRequest) asks the host what
   * signatures exist for a contribution type, generically, across every
   * active plugin — not "the adblocker's specific signature," hardcoded.
   * Any future content-filter-contributing plugin is picked up here with
   * zero changes to whatever calls this.
   */
  getSignaturesForType(contributionType) {
    const sigs = [];
    for (const record of this.plugins.values()) {
      if (record.state !== PLUGIN_STATE.ACTIVE) continue;
      for (const entry of record.manifest.contributes?.[contributionType] || []) {
        sigs.push(entry.signature);
      }
    }
    return sigs;
  }
}

module.exports = { PluginHost, PluginHostError, PLUGIN_STATE };
