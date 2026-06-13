/**
 * ui/ports.js — Canonical NEXUS port map
 * UUID: nexus-ports-v1-0000-4000-0000-000000000001
 * Served by orchestrator at http://localhost:9000/ports.js
 * Import in any UI: <script src="http://localhost:9000/ports.js"></script>
 */
window.NEXUS_PORTS = {
  orchestrator: 9000,
  bridge:       9999,
  cortex:       3748,
  guardian:     7820,
  guardian_wss: 7821,
  dropzone:     7822,
  memory:       7823,
  idearium:     4800,
  emerge:       4242,
  ollama:       11434,
  architect:    3747,
  diagnostic:   7825,   // §A-4: added
};

window.NEXUS_URLS = {
  orchestrator: 'http://localhost:9000',
  bridge:       'http://localhost:9999',
  cortex:       'http://localhost:3748',
  guardian:     'http://localhost:7820',
  guardian_wss: 'wss://localhost:7821',
  dropzone:     'http://localhost:7822',
  memory:       'http://localhost:7823',
  idearium:     'http://localhost:4800',
  emerge:       'http://localhost:4242',
  ollama:       'http://localhost:11434',
  architect:    'http://localhost:3747',
  diagnostic:   'http://localhost:7825',   // §A-4: added
  orch_sse:     'http://localhost:9000/sse',
  cortex_sse:   'http://localhost:3748/sse',
  bridge_sse:   'http://localhost:9999/bridge/sse',
};

// Helper: fetch from any system via orchestrator proxy
window.nexusFetch = (system, path, opts = {}) => {
  const base = window.NEXUS_URLS[system] || window.NEXUS_URLS.orchestrator;
  return fetch(base + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
};

console.log('[nexus] ports loaded', window.NEXUS_PORTS);
