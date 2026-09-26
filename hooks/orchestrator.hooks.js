'use strict';
/**
 * hooks/orchestrator.hooks.js — Orchestrator System Hook Map
 * UUID: orchestrator-hooks-map-v1-0000-4000
 * System: Orchestrator :9000 — the root surface
 */
const HOOKS = [
  {
    id: "orchestrator-hook-perf-0013",
    name: "orchestrator-perf",
    intent: "Real resource telemetry: free memory, cpu, heap, pressure level, spawnSafe. Exists because the 0xC0000409 crash was the FIRST symptom of memory pressure — nothing exposed it beforehand.",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "orchestrator", layer: 1, port: 9000 },
    config: { path: "/api/perf", method: "GET" },
    contract: { axioms: ["1.2"], sideEffects: [], idempotent: true, methodEnforced: true },
    references: { files: ["lib/resource-monitor.js"] },
    status: "active",
    updatedAt: "2026-07-10T00:00:00Z"
  },
  {
    id: "orchestrator-hook-manifest-0012",
    name: "orchestrator-system-manifest",
    intent: "Project component + hook + wire + API + CLI per system from code. Gives lib/system-manifest.js its first consumer. /api/manifest for all 13 systems, /api/manifest/<system> for one.",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "orchestrator", layer: 1, port: 9000 },
    config: { path: "/api/manifest", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true, methodEnforced: true },
    references: { files: ["lib/system-manifest.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "orchestrator-hook-nexus-heal-0011",
    name: "orchestrator-self-heal",
    intent: "Trigger autonomous gap analysis and repair-spec generation. RELOCATED 2026-07-09 from cortex.hooks.js, where it declared POST /api/self-heal/run on cortex and referenced two phantom files (cortex/healer/index.js, cortex/self-heal/index.js). Neither cortex route nor those files ever existed. RELOCATED AGAIN 2026-08-23 — the real implementation is now diagnostic/nexus-heal-loop.js (this session's own IC10: moved into the diagnostic system's real, own diagnostic/ folder — docs/diagnostic-phase-map.spec confirms service/ as the diagnostic system's real location, port 7825), required by orchestrator.js:130 and served at POST /api/nexus/heal — verified live: it classifies the gap and returns a real repairSpec.",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "orchestrator", layer: 1, port: 9000 },
    config: { path: "/api/nexus/heal", method: "POST" },
    contract: { axioms: ["1.2"], sideEffects: ["classifies gap", "builds repairSpec", "may dispatch to architect"], idempotent: false, methodEnforced: true },
    references: { files: ["diagnostic/nexus-heal-loop.js", "lib/gap-relay.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "orchestrator-hook-warp-map-0010",
    name: "orchestrator-warp-map",
    intent: "Live map of every event that ran, projected from WARP StreamLog (not a document)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "orchestrator", layer: 1, port: 9000 },
    config: { path: "/api/warp/map", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["lib/warp-bus.js","warp/core/Stream.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "orchestrator-hook-bus-stats-0009",
    name: "orchestrator-bus-stats",
    intent: "Read nexus-bus stats (_sources presence map) — polled by lib/nerve",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "orchestrator", layer: 1, port: 9000 },
    config: { path: "/api/bus/stats", method: "GET" },
    contract: { axioms: [], sideEffects: [], idempotent: true },
    references: { files: ["nexus-bus.js","lib/nerve/index.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  { id:'orch-hook-api-proxy-0001', name:'orchestrator-api-proxy', intent:'Proxy all /api/<system>/* requests to the correct backend service so the UI has one address for everything', type:'api', direction:'bidirectional', from:{surface:'browser',layer:6}, to:{surface:'orchestrator',layer:1,port:9000}, ui:{panel:'All panels via window.A() API client', element:'Every panel that calls A().get() or A().post()', action:'All /api/* routes'}, config:{port:9000, routes:'all /api/<system>/* → proxied to SYS[system]'}, contract:{axioms:['§5.2'], sideEffects:[], idempotent:true}, references:{files:['orchestrator.js → proxy blocks']}, seam:null, status:'active', updatedAt:'2026-06-11T17:30:00Z' },
  { id:'orch-hook-sse-0002', name:'orchestrator-sse', intent:'Stream real-time events from all systems to the browser so the UI reflects live state without polling', type:'stream', direction:'unidirectional', from:{surface:'orchestrator',layer:1}, to:{surface:'browser',layer:6}, ui:{panel:'All panels — status dots, live event counts', element:'Red/green system dots in nav bar', action:'GET /events (SSE)'}, config:{path:'/events', protocol:'SSE', sources:['cortex','guardian','bridge','idearium']}, contract:{axioms:['§2.3'], sideEffects:[], idempotent:true}, references:{files:['orchestrator.js → GET /events']}, seam:null, status:'active', updatedAt:'2026-06-11T17:30:00Z' },
  { id:'orch-hook-health-0003', name:'orchestrator-health', intent:'Probe all systems in parallel and return a unified health summary so the meta observer has one source of truth', type:'api', direction:'bidirectional', from:{surface:'*',layer:0}, to:{surface:'orchestrator',layer:1}, ui:{panel:'HOME tiles, META > HEALTH', element:'System tiles on HOME, health grid on META', action:'GET /health'}, config:{path:'/health', probes:'parallel to all SYS entries'}, contract:{axioms:['§2.3'], sideEffects:[], idempotent:true}, references:{files:['orchestrator.js → allHealth()']}, seam:null, status:'active', updatedAt:'2026-06-11T17:30:00Z' },
  { id:'orch-hook-boot-systems-0004', name:'orchestrator-boot-systems', intent:'Start all sub-systems (cortex/guardian/idearium/architect/emerge) in order after orchestrator boot phases complete', type:'gate', direction:'unidirectional', from:{surface:'orchestrator',layer:1}, to:{surface:'all-systems',layer:0}, ui:{panel:'CONSOLE — boot log output', element:'Boot phase output lines', action:'Auto on server.listen'}, config:{order:['cortex','guardian','idearium','architect','emerge'], gated:true}, contract:{axioms:['§3.1'], sideEffects:['spawns child processes'], idempotent:false}, references:{files:['cli/boot-systems.js → _bootSystems()'], fault:'F-LEDGER-001 — _eventLedger.write vs .record (fixed 2026-06-11)'}, seam:null, status:'active', updatedAt:'2026-06-11T17:30:00Z' },
];
module.exports = { systemId:'orchestrator', port:9000, version:'2.0.0', updatedAt:'2026-06-11T17:30:00Z', hooks:HOOKS, byId:(id)=>HOOKS.find(h=>h.id===id), byName:(n)=>HOOKS.find(h=>h.name===n), byType:(t)=>HOOKS.filter(h=>h.type===t), withSEAM:()=>HOOKS.filter(h=>h.seam!==null), active:()=>HOOKS.filter(h=>h.status==='active') };
