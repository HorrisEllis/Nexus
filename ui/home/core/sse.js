'use strict';
// ui/home/core/sse.js — SSE live events + system heartbeat dots (flashDot).
// Split from ui/home/index.html (inline script, lines 1237-1329 at v0.39.227). Load order is set by index.html; do not reorder.
// ── SSE — live events ─────────────────────────────────────────────────────────
let evCount=0,logFilter_='',logSrcFilter_='';
let sseOrch=null,sseCx=null;
function connectSSE(){
  function connect(url,handler,onStatus){
    let es;
    function tryConnect(){
      try{
        es=new EventSource(url);
        es.onopen=()=>{if(onStatus)onStatus('live')}
        es.onmessage=e=>{try{handler(JSON.parse(e.data))}catch(_){}};
        es.onerror=()=>{if(onStatus)onStatus('reconnecting');setTimeout(tryConnect,5000)};
      }catch(_){setTimeout(tryConnect,5000)}
    }
    tryConnect();
  }
  connect(`${B.orch}/sse`,addEvent);
  // Listen for clear-glass.open events from orchestrator SSE
  // When the UI calls openClearGlass(), orchestrator broadcasts this SSE event
  // and Clear Glass (Electron) picks it up to open the URL in a new tab
  // Cortex SSE — proxied through orchestrator, same as Idearium below
  // (this finishes the Phase 23.5 lockdown — cortex was the one left dialing
  // direct when idearium got fixed).
  connect(`${B.orch}/api/cortex/sse`,d=>{addCxEvent(d);addEvent(d)},s=>{
    const el=document.getElementById('log-conn-status');
    if(el)el.textContent=s==='live'?'● live':s;
    if(el)el.style.color=s==='live'?'#00ff88':'rgba(255,170,0,.6)';
  });
  // Guardian SSE for job updates — proxied through orchestrator
  try{
    const gdEs=new EventSource(`${B.orch}/api/guardian/events`);
    // §FIXED 2026-09-13 — same real fix as ui/tv-shell/index.html (see
    // that file's comment for the full trace): this connection already
    // carries live job.chunk/job.dispatched/job.complete/job.error
    // events; hand them to CoPilot.onGuardianEvent so the floating
    // widget on THIS surface gets the same live jobId/status/text
    // progress, not just tv-shell's.
    gdEs.onmessage=e=>{
      try{
        const d=JSON.parse(e.data);
        if(d.type&&(d.type.includes('job')||d.type.includes('guardian')))gdLoadJobs();
        if(window.CoPilot&&typeof window.CoPilot.onGuardianEvent==='function')window.CoPilot.onGuardianEvent(d);
      }catch(_){}
    };
  }catch(_){}
  // Idearium SSE for live card refresh — proxied through orchestrator
  // (Phase 23.5 lockdown: idearium is reached via the orchestrator gateway,
  // not dialed directly, unlike guardian/cortex above).
  try{
    const idrEs=new EventSource(`${B.orch}/api/idearium/sse`);
    idrEs.onmessage=e=>{
      try{
        const d=JSON.parse(e.data);
        if(d.type==='idea.created'||d.type==='idea.updated'){
          if(curCh===3)idrLoad();
        }
      }catch(_){}
    };
  }catch(_){}
}
// Map source strings to their dot element IDs
const SRC_DOT={orchestrator:'sd-orch',cortex:'sd-cx',guardian:'sd-gd',idearium:'sd-idr',bridge:'sd-br',architect:'sd-arch',emerge:'sd-em','gap-loop':'sd-cx','self-heal':'sd-cx',healer:'sd-cx',raid:'sd-cx',heartbeat:'sd-cx'};
// Map source to their tile icon element for flash
const SRC_TILE_ICON={orchestrator:'tile-orch',guardian:'tile-gd',cortex:'tile-cx',idearium:'tile-idr',bridge:'tile-br'};
function flashDot(src){
  const key=Object.keys(SRC_DOT).find(k=>src?.toLowerCase().includes(k));
  const id=key?SRC_DOT[key]:null;
  if(!id)return;
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(()=>el.classList.remove('flash'),500);
  // Also flash tile icon on overview
  const tileKey=Object.keys(SRC_TILE_ICON).find(k=>src?.toLowerCase().includes(k));
  if(tileKey){
    const tile=document.getElementById(SRC_TILE_ICON[tileKey]);
    const icon=tile?.querySelector('.tile-icon');
    if(icon){icon.classList.remove('flash');void icon.offsetWidth;icon.classList.add('flash');setTimeout(()=>icon.classList.remove('flash'),600);}
  }
}

// Contract-verification trust state — the orchestrator hash-verifies every
// system's interaction contract ~2s after it registers (lib/contract-handshake.js)
// and broadcasts system.contract.verified over /sse. This was never tracked
// anywhere in the UI before — every proxied call above assumes a verified
// system without ever checking. Minimal surfacing: a border tint on each
// tile. Not a hard gate (the proxy itself doesn't gate on this either — see
// note in the chat) — visibility first, enforcement is a separate decision.
const _verifiedSystems = {};
const CONTRACT_KEY_MAP = {orchestrator:'orch',guardian:'gd',cortex:'cx',idearium:'idr',architect:'arch',emerge:'em',bridge:'br'};

