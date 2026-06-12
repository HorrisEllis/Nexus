'use strict';
/**
 * hooks/bridge.hooks.js — Bridge System Hook Map
 * UUID: bridge-hooks-map-v1-0000-4000
 * System: Bridge :9999
 */
const HOOKS = [
  { id:'br-hook-register-0001', name:'bridge-system-register', intent:'Register a system with the bridge on boot so it has identity, a session token, and a fallback chain', type:'api', direction:'unidirectional', from:{surface:'any-system',layer:0}, to:{surface:'bridge',layer:1,port:9999}, ui:{panel:'BRIDGE panel', element:'System registry table, health dots', action:'POST /bridge/register (on each system boot)'}, config:{path:'/bridge/register', maxTokensPerSys:10}, contract:{axioms:['§9.1','§5.2'], sideEffects:['bridge.identity.issue(token)','bridge.registry.set(systemId)'], idempotent:true}, references:{files:['bridge/server.js','bridge/identity.js','bridge/registry.js']}, seam:null, status:'active', updatedAt:'2026-06-11T17:30:00Z' },
  { id:'br-hook-route-0002', name:'bridge-route-request', intent:'Route a cross-system request through ResolveGate→CircuitGate→DispatchGate so no system calls another directly', type:'gate', direction:'unidirectional', from:{surface:'any-system',layer:0}, to:{surface:'bridge',layer:1}, ui:{panel:'BRIDGE panel', element:'Request ledger, circuit state', action:'POST /bridge/request'}, config:{gates:['ResolveGate','CircuitGate','RouteOpenGate','DispatchGate','ResultGate/HoldGate'], maxRouteDepth:3}, contract:{axioms:['§9.1','§9.2','§BRIDGE-GATE'], sideEffects:['bridge.ledger.append(request)','bridge.router.dispatch()'], idempotent:false}, references:{files:['bridge/router.js','bridge/ledger.js']}, seam:null, status:'active', updatedAt:'2026-06-11T17:30:00Z' },
];
module.exports = { systemId:'bridge', port:9999, version:'1.0.0', updatedAt:'2026-06-11T17:30:00Z', hooks:HOOKS, byId:(id)=>HOOKS.find(h=>h.id===id), byName:(n)=>HOOKS.find(h=>h.name===n), byType:(t)=>HOOKS.filter(h=>h.type===t), withSEAM:()=>HOOKS.filter(h=>h.seam!==null), active:()=>HOOKS.filter(h=>h.status==='active') };
