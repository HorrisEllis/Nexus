/* ═══════════════════════════════════════════════════════════
   ORGANISM: ORCHESTRATOR  v1.0.0
   id: eravos.nexus-orchestrator

   Thin per-system wrapper around NexusNodeCore. All polling,
   diagnose, snapshot, and idearium logic lives in the shared
   core (organisms/nexus-shared/nexus-node-core.js) -- this file
   only supplies this node's identity and endpoint.
   ═══════════════════════════════════════════════════════════ */

window.NexusOrchestratorEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  return NexusNodeCore.mount(instanceId, sBus, {
    key: 'orchestrator',
    label: 'ORCHESTRATOR',
    icon: '🌐',
    accent: '#ff2266',
    base: 'http://127.0.0.1:9000',
    statusPath: '/api/status',
    snapshotsPath: '/snapshots',
    orchestratorBase: 'http://127.0.0.1:9000',
    diagnosePath: '/diagnose',
    idLink: 'http://127.0.0.1:4800',
    isOrchestrator: true,
    ...config,
  });
}

return { mount };
})();
