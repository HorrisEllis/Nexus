/* ═══════════════════════════════════════════════════════════
   NEXUS NODE CORE  v1.0.0
   organisms/nexus-shared/nexus-node-core.js

   Shared engine logic for the 7 separate NEXUS diagnostic
   organisms (cortex, guardian, bridge, orchestrator,
   diagnostic, architect, idearium). Each organism is a thin
   per-system wrapper (its own engine.js + schema.json, its
   own window) that calls into this core with its own config —
   same pattern pads/wobble-bass/acid-synth/reese-bass share
   VOICES from pads.engine.js.

   AGNOSTIC BY DESIGN — no own clock/interval:
   Status polling is driven entirely by the existing global
   MasterTransport (the ▶ ⏺ bar already wired for audio):
     transport:play         -> start polling this node
     transport:stop         -> stop polling this node
     transport:record-start -> also write every poll result
                                into KERNEL.ledger, tagged
                                'nexus_diagnostic_snapshot'
     transport:record-stop  -> stop writing to ledger
                                (polling keeps going if still
                                playing)
   A node never owns its own timer. It just reacts to the same
   wires every other organism already reacts to.

   REPLAY — not fully built yet. The ledger entries written
   during record are real, queryable history
   (KERNEL.ledger.entries().filter(e=>e.type==='nexus_diagnostic_snapshot')),
   which is the data a future scrub/replay UI (e.g. feeding the
   existing Timeline organism) would consume. No playback UI
   exists yet — this just lays the ledger groundwork honestly.

   DIAGNOSE — every node's Diagnose button POSTs to the
   Orchestrator (not directly to the target system), since the
   Orchestrator is the existing interconnect/verifier for the
   other subsystems. The Orchestrator's own card diagnoses
   itself directly. Endpoint paths are config, not guesses —
   they default to placeholders and should be set to whatever
   NEXUS actually exposes.
   ═══════════════════════════════════════════════════════════ */

window.NexusNodeCore = (() => {
'use strict';

function mount(instanceId, sBus, config = {}) {
  const gBus = KERNEL.bus;

  const cfg = {
    key:              config.key              || 'unknown',
    label:            config.label             || 'NEXUS NODE',
    icon:             config.icon              || '◆',
    accent:           config.accent            || '#00ff88',
    base:             config.base              || 'http://127.0.0.1:9000',
    statusPath:       config.statusPath        || '/api/status',
    snapshotsPath:    config.snapshotsPath     || '/snapshots',
    orchestratorBase: config.orchestratorBase  || 'http://127.0.0.1:9000',
    diagnosePath:     config.diagnosePath      || '/diagnose',
    idLink:           config.idLink            || 'http://127.0.0.1:4800',
    pollMs:           config.pollMs            || 4000,
    timeoutMs:        config.timeoutMs         || 2500,
    isOrchestrator:   !!config.isOrchestrator,
  };

  let _state = {
    online: null, latencyMs: null, error: null, payload: null, lastCheckedAt: null,
    diagnosing: false, lastDiagnose: null,
    playing: false, recording: false,
  };
  let _interval = null;

  function _withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms))]);
  }

  function _sync() { sBus.publish('org:state_sync', { ..._state }); }

  async function _pollOnce() {
    const t0 = performance.now();
    try {
      const res = await _withTimeout(fetch(cfg.base + cfg.statusPath, { cache: 'no-store', mode: 'cors' }), cfg.timeoutMs);
      const latencyMs = Math.round(performance.now() - t0);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let payload = null;
      try { payload = await res.json(); } catch (_) {}
      _state = { ..._state, online: true, latencyMs, error: null, payload, lastCheckedAt: Date.now() };
    } catch (e) {
      _state = { ..._state, online: false, latencyMs: null, error: e.message || 'UNREACHABLE', payload: null, lastCheckedAt: Date.now() };
    }
    _sync();
    if (_state.recording) {
      KERNEL.ledger._write({
        type: 'nexus_diagnostic_snapshot',
        instanceId, key: cfg.key, label: cfg.label,
        online: _state.online, latencyMs: _state.latencyMs, error: _state.error,
      });
    }
  }

  async function _diagnose() {
    if (_state.diagnosing) return;
    _state = { ..._state, diagnosing: true }; _sync();
    const targetBase = cfg.isOrchestrator ? cfg.base : cfg.orchestratorBase;
    const t0 = performance.now();
    try {
      const res = await _withTimeout(
        fetch(targetBase + cfg.diagnosePath, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: cfg.key }),
        }),
        Math.max(cfg.timeoutMs, 8000)
      );
      const ms = Math.round(performance.now() - t0);
      let body = null; try { body = await res.json(); } catch (_) {}
      _state = { ..._state, diagnosing: false, lastDiagnose: { ok: res.ok, ms, body, at: Date.now() } };
    } catch (e) {
      _state = { ..._state, diagnosing: false, lastDiagnose: { ok: false, error: e.message, at: Date.now() } };
    }
    _sync();
    KERNEL.ledger._write({ type: 'nexus_diagnose_run', instanceId, key: cfg.key, result: _state.lastDiagnose });
  }

  function _openSnapshots() {
    window.open(cfg.base + cfg.snapshotsPath, '_blank');
  }

  function _openIdearium() {
    window.open(`${cfg.idLink}/?focus=${encodeURIComponent(cfg.key)}`, '_blank');
  }

  function _startPolling() {
    if (_interval) return;
    _state = { ..._state, playing: true }; _sync();
    _pollOnce();
    _interval = setInterval(_pollOnce, cfg.pollMs);
  }

  function _stopPolling() {
    if (_interval) { clearInterval(_interval); _interval = null; }
    _state = { ..._state, playing: false }; _sync();
  }

  const _unsubs = [
    gBus.subscribe('transport:play',         () => _startPolling()),
    gBus.subscribe('transport:stop',         () => _stopPolling()),
    gBus.subscribe('transport:record-start', () => { _state = { ..._state, recording: true };  _sync(); }),
    gBus.subscribe('transport:record-stop',  () => { _state = { ..._state, recording: false }; _sync(); }),
    gBus.subscribe('ui:diagnose:'      + instanceId, () => _diagnose()),
    gBus.subscribe('ui:open-snapshots:' + instanceId, () => _openSnapshots()),
    gBus.subscribe('ui:open-idearium:'  + instanceId, () => _openIdearium()),
  ];

  /* One check immediately on mount so the card isn't blank
     before anyone presses play — doesn't start the interval. */
  _pollOnce();
  if (window.MasterTransport?.playing) _startPolling();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.nexus-' + cfg.key,
    label:    cfg.label,
    provides: ['capability.nexus_diagnostic'],
    requires: [],
    permissions: ['network_fetch', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'nn.hook.bus_out', direction: 'out', event_type: 'org:state_sync', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() {
      _stopPolling();
      _unsubs.forEach(u => u());
      KERNEL.registry.unregister(instanceId);
    },
    get state() { return { ..._state }; },
    diagnose: _diagnose,
  };
}

return { mount };
})();
