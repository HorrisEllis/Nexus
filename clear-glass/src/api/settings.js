'use strict';
/**
 * src/api/settings.js — NEXUS Connection Settings
 * UUID: cg-api-settings-v3-0000-0000-000000000021
 *
 * Stores NEXUS service ports and co-pilot routing config.
 * No Claude API key here — co-pilot routes through NEXUS copilot at :3750,
 * which handles all model routing (Ollama → Guardian NCP → fallback).
 * Direct API key lives in NEXUS copilot's own config, not here.
 */

const path = require('path');
const fs   = require('fs');
const { JaaKV } = require('../storage/jaa');

const SETTINGS_PATH = path.join(
  process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'nexus-settings.json'
);

const DEFAULTS = {
  // ── NEXUS service ports ────────────────────────────────────────────────
  orchestratorPort: 9000,
  cortexPort:       3748,
  guardianPort:     7820,
  copilotPort:      3750,
  ollamaPort:       3749,
  bridgePort:       9999,
  idearium:         4800,

  // ── Clear Glass own ports ──────────────────────────────────────────────
  ssePort:  7701,
  ipcPort:  7702,
  tlsPort:  7703,

  // ── Co-pilot routing ───────────────────────────────────────────────────
  useCortex:        true,   // route copilot through NEXUS copilot :3750
  raidEnabled:      true,   // enable RAID routing in NEXUS
  copilotChannel:   'clear-glass', // channel name for copilot sessions

  // ── Bridge auth token (issued after handshake) ───────────────────────
  bridgeToken: '',

  // ── When copilot :3750 is down — §0.39.274 ─────────────────────────────
  // James: "copilot, is either ollama or guardian. no api". The Anthropic-key fallback
  // (fallbackApiKey / fallbackModel / fallbackEndpoint) is gone; a saved key is dropped on load.
  // The pane answers through Ollama or a Guardian agent directly (src/copilot/bridge.js _ask).
  copilotOllamaModel: '',     // '' = ollama/config.js DEFAULT_MODEL

  // §BUILT 2026-09-26 — James: "expand the copilot settings… make a
  // clearglass hat for the copilot cli." Per-call routing, the same three
  // positions as ui/tv-shell/menu.js (ollama | copilot | guardian + NCP
  // agent), the Clear Glass hat, and what each call carries.
  copilotBackend:        'copilot',  // ollama | copilot | guardian
  copilotAgent:          'claude',   // NCP agent when backend is guardian
  copilotWearHat:        true,       // compose the clear_glass hat's persona into every call
  copilotAutoRunCommands: true,      // run ```driver blocks from a reply; off = show them, run on confirm
  copilotDomContext:     true,       // include the live DOM by default
  copilotDomMaxChars:    3000,       // DOM snapshot budget per call
  copilotTimeoutMs:      60000,      // one call's ceiling
  copilotHistoryMax:     200,        // CLI input history kept per window
  copilotShowRoute:      true,       // show backend/model under each reply
  // §0.39.278 — James: "its dumb, isnt persistent". The pane's conversation is kept (src/copilot/chat-store.js, Clear
  // Glass's own JAA store) and the recent turns go with every call, whichever backend answers.
  copilotRemember:       true,       // keep the pane's conversation and send the recent turns with each call
  copilotHistoryTurns:   10,         // how many earlier turns each call carries
  copilotHistoryChars:   4000,       // their budget; the oldest are left out first, and the prompt says so
  copilotToolSurface:    'layered',  // layered = Clear Glass's own actions + nexus.tools.tool / tools_expand; full = the orchestrator's whole capability prompt

  // §BUILT 2026-09-21 — James: "clearglass needs to help me with job
  // applications, answering on screen questions... full ui to
  // configure this." Real, persistent — this file, not a second store.
  screenQaEnabled:       true,
  screenQaMinConfidence: 'medium', // a field autofill would fill at this confidence or higher is excluded from AI answers
  screenQaProfileId:     '',       // optional autofill profile id used as context
  screenQaContext:       '',       // free-text context, combined with the profile above
};

class ApiSettings {
  constructor() { this.data = { ...DEFAULTS }; }

  // §JAA 2026-09-26 — James: "with clearglass, make it jaa. no json." Rows live in
  // the Clear Glass JAA store (src/storage/jaa.js); the old nexus-settings.json is imported
  // once on first load and left on disk.
  _kv() { return this._jaa || (this._jaa = new JaaKV('cg_api_settings', { legacyFile: SETTINGS_PATH })); }

  async load() {
    try {
      const raw = this._kv().load();
      // §0.39.274 — no paid-API fallback: a key saved by an earlier build is not kept around
      const RETIRED = ['fallbackApiKey', 'fallbackModel', 'fallbackEndpoint'];
      const had = RETIRED.some(k => k in raw);
      for (const k of RETIRED) delete raw[k];
      this.data = { ...DEFAULTS, ...raw };
      if (!Object.keys(raw).length || had) this._kv().replaceAll(this.data);
    } catch (err) {
      console.warn('[Settings] Load error:', err.message);
    }
  }

  async set(updates) {
    const { fallbackApiKey: _k, fallbackModel: _m, fallbackEndpoint: _e, ...clean } = updates || {};   // §0.39.274 retired
    updates = clean;
    this.data = { ...this.data, ...updates };
    this._kv().replaceAll(this.data);
    return { ok: true };
  }

  get() { return { ...this.data }; }

  getPublic() {
    const { fallbackApiKey: _, ...safe } = this.data;   // never returned, even if one slipped in
    return safe;
  }

  // Convenience helpers used by other modules
  nexusUrl(path = '') {
    return `http://127.0.0.1:${this.data.orchestratorPort}${path}`;
  }
  // Direct URLs — used internally for health checks only
  copilotDirectUrl(path = '') {
    return `http://127.0.0.1:${this.data.copilotPort}${path}`;
  }
  guardianDirectUrl(path = '') {
    return `http://127.0.0.1:${this.data.guardianPort}${path}`;
  }
  ollamaDirectUrl(path = '') {
    return `http://127.0.0.1:${this.data.ollamaPort}${path}`;
  }
  cortexUrl(path = '') {
    return `http://127.0.0.1:${this.data.cortexPort}${path}`;
  }
  // §RETIRED 2026-09-06 — bridgeUrl()/copilotUrl()/guardianUrl()/
  // ollamaUrl()/getBridgeToken()/setBridgeToken() removed. James, live:
  // "thought you took care of bridge man..." — these all aliased to
  // bridge:9999, which is gone; clear-glass/src/copilot/bridge.js was
  // the only real caller and now uses the *DirectUrl() methods below
  // directly, which were already real and already correct.
}

module.exports = ApiSettings;
