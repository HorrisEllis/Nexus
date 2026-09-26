'use strict';
// ui/home/core/ui-state.js — NEXUS_UI_STATE reader for co-pilot + asSend.
// Split from ui/home/index.html (inline script, lines 1966-2034 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Co-pilot UI reader ────────────────────────────────────────────────────────
// Exposes window.NEXUS_UI_STATE so co-pilot can read what's on screen.
// Updated whenever the channel changes or canvas loads.

window.NEXUS_UI_STATE = {
  currentChannel: () => CH_META[curCh]?.id || 'unknown',
  currentChannelName: () => CH_META[curCh]?.name || 'unknown',
  healthMap: () => {
    const map = {};
    document.querySelectorAll('.spill-dot').forEach(d => {
      const id = d.id?.replace('sd-','');
      if (id) map[id] = d.classList.contains('on');
    });
    return map;
  },
  openGaps: () => {
    const gaps = [];
    document.querySelectorAll('.gap-row').forEach(r => {
      gaps.push({ severity: r.classList.contains('high')?'high':'medium', text: r.textContent?.trim()?.slice(0,60) });
    });
    return gaps;
  },
  causalGraph: () => {
    try { return CG.getState(); } catch(_) { return null; }
  },
  canvasOrganisms: () => {
    try {
      const iframe = document.getElementById('canvas-iframe');
      if (!iframe?.contentWindow?.KERNEL) return [];
      const reg = iframe.contentWindow.KERNEL.registry;
      const result = [];
      reg.forEach((org, id) => result.push({ id, label: org.config?.label || id, online: org.state?.online }));
      return result;
    } catch(_) { return []; }
  },
  activeSpotlights: () => window._cpSpotlitEls?.map(el=>el.id)||[],
  snapshot: () => JSON.stringify({
    channel: window.NEXUS_UI_STATE.currentChannel(),
    health: window.NEXUS_UI_STATE.healthMap(),
    causal: window.NEXUS_UI_STATE.causalGraph(),
    organisms: window.NEXUS_UI_STATE.canvasOrganisms(),
    ts: Date.now(),
  }),
};

// comp_id: nexus.ui.tv-shell.copilot-runtime
  // file: ui/tv-shell/spotlight/spotlight.js (external)
  // ── Co-pilot UI Runtime ─────────────────────────────────────────────────────
// Loaded from: /ui/tv-shell/spotlight/spotlight.js (served by orchestrator)
// window.CP and window.Spotlight are set by that module.
// Stub defined here so inline code is safe before the module loads.
if (typeof CP === 'undefined') {
  window.CP = {
    init:()=>{}, spotlight:()=>{}, clearSpotlight:()=>{},
    updateTension:()=>{}, guidedSteps:()=>{}, executeUI:()=>{},
    navigateTo:(ch)=>{ if(typeof tuneById==='function') tuneById(ch); },
    setHealthState:()=>{}, guidedStep:()=>{}, stepNext:()=>{},
  };
}

document.addEventListener('DOMContentLoaded', () => typeof CP !== 'undefined' && CP.init());

// asSend() body moved into ui/copilot/copilot.js — CoPilot.send().
// Thin wrapper kept so existing onclick="asSend()"/onkeydown="asSend()"
// HTML attributes don't all need updating for this extraction.
CoPilot.init({ B, CH_META, getCurCh: () => curCh, tune, post });
async function asSend(){ return CoPilot.send(); }


