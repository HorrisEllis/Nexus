'use strict';
// ui/home/areas/overview.js — Overview channel: system grid, heartbeat pulse, health polling, metrics.
// Split from ui/home/index.html (inline script, lines 1073-1236 at v0.39.227). Load order is set by index.html; do not reorder.


// comp_id: nexus.ui.tv-shell.health
  // ── Health polling ────────────────────────────────────────────────────────────
const SYSTEMS=[
  {key:'orch',url:`${B.orch}/health`,dot:'sd-orch',tileId:'tile-orch',tileStatus:'ts-orch'},
  {key:'gd',  url:`${B.orch}/api/guardian/health`, dot:'sd-gd',  tileId:'tile-gd',  tileStatus:'ts-gd'},
  {key:'cx',  url:`${B.orch}/api/cortex/health`, dot:'sd-cx',  tileId:'tile-cx',  tileStatus:'ts-cx'},
  {key:'idr', url:`${B.orch}/api/idearium/health`,dot:'sd-idr', tileId:'tile-idr', tileStatus:'ts-idr'},
  // br/dg: no orchestrator proxy exists for Bridge or Diagnostic yet — direct
  // port is the only path available right now. Flagged, not silently left.
  {key:'br',  url:`${B.br}/health`, dot:'sd-br',  tileId:'tile-br',  tileStatus:'ts-br'},
  {key:'arch',url:`${B.orch}/api/architect/health`,dot:'sd-arch',tileId:'tile-arch',tileStatus:'ts-arch'},
  {key:'em',  url:`${B.orch}/api/emerge/status`, dot:'sd-em',  tileId:'tile-em',  tileStatus:'ts-em'},
  {key:'dg',  url:`${B.dg}/status`, tileId:'tile-dg',  tileStatus:'ts-dg'},
  {key:'forge',url:`${B.orch}/health`,             tileId:'tile-forge',tileStatus:'ts-forge'}, // virtual — served by orch, no health endpoint of its own
];
// §FIXED 2026-09-20 — was positional (rd-0..rd-4), broke the moment the
// rail became reorderable/removable (a channel's dot id can no longer
// mean "whatever's currently in this slot"). Keyed by channel id now —
// see renderRail()'s dot id below (`rd-${chId}`).
const railDots={orch:'ch-overview',gd:'ch-guardian',cx:'ch-cortex',idr:'ch-idearium',br:'ch-bridge'};

// ── Per-card heartbeat pulse ──────────────────────────────────────────────────
// Fires on every successful health poll — gives each card a live heartbeat
// independent of SSE events, so offline-capable cards still pulse when up.
function pulseCard(tileId){
  const tile=document.getElementById(tileId);
  const icon=tile?.querySelector('.tile-icon');
  if(!icon)return;
  icon.classList.remove('flash');
  void icon.offsetWidth; // reflow to restart animation
  icon.classList.add('flash');
  setTimeout(()=>icon.classList.remove('flash'),600);
}

// Maps autopilot's kernel names to SYSTEMS' short keys. Emerge isn't in
// autopilot's supervised kernel set (ALL_KERNELS in autopilot.js) — no entry
// here means no entry there either, not an oversight on this side.
const AUTOPILOT_KEY_MAP={mistral:'orch',bridge:'br',cortex:'cx',guardian:'gd',idearium:'idr',architect:'arch',diagnostic:'dg'};

async function pollHealth(){
  for(const s of SYSTEMS){
    const d=await get(s.url);
    const up=d&&(d.ok===true||d.status==='ok'||!d.error);
    const dot=document.getElementById(s.dot);
    if(dot){dot.classList.toggle('on',up);dot.classList.toggle('err',!up)}
    const ts=document.getElementById(s.tileStatus);
    if(ts){ts.textContent=up?'ONLINE':'OFFLINE';ts.className='tile-status '+(up?'online':'offline')}
    const tile=document.getElementById(s.tileId);
    if(tile)tile.classList.toggle('online',up);
    const rdChId=railDots[s.key];
    if(rdChId!==undefined){const rd=document.getElementById(`rd-${rdChId}`);if(rd)rd.classList.toggle('online',up)}
    // Pulse card icon on every successful poll — heartbeat
    if(up)pulseCard(s.tileId);
    CP.setHealthState(s.key, up);  // co-pilot tension field
  }
  // Autopilot supervision overlay — a health probe only knows "did the HTTP
  // endpoint respond". It can't see circuit-broken, mid-restart-with-backoff,
  // or crash-looping-but-still-up-for-the-moment. Pure addition: if autopilot
  // isn't running (plain `npm run start:all`, no supervisor), this resolves
  // null and every tile stays exactly as the probe loop above already set it.
  const ap=await get(`${B.orch}/api/autopilot/status`).catch(()=>null);
  if(ap?.kernels){
    for(const [name,k] of Object.entries(ap.kernels)){
      const key=AUTOPILOT_KEY_MAP[name];if(!key)continue;
      const s=SYSTEMS.find(sys=>sys.key===key);if(!s)continue;
      const ts=document.getElementById(s.tileStatus);
      const dot=document.getElementById(s.dot);
      if(k.status==='circuit_open'){
        if(ts){ts.textContent='CIRCUIT OPEN';ts.className='tile-status offline'}
        if(dot){dot.classList.remove('on');dot.classList.add('err')}
      }else if(k.status==='down'&&k.restarts>0){
        if(ts){ts.textContent=`RESTARTING (${k.restarts})`;ts.className='tile-status offline'}
      }else if(k.status==='online'&&k.restarts>0&&ts&&ts.textContent==='ONLINE'){
        // Up right now, but it's crashed before — worth knowing even when green
        ts.textContent=`ONLINE · ${k.restarts} restart${k.restarts===1?'':'s'}`;
      }
    }
  }
  loadMetrics();
}

async function loadMetrics(){
  // ── Orchestrator ──────────────────────────────────────────────────────────
  // /health returns { ok, uptime (seconds float), online, total, systems }
  // /api/api-map returns route list — use health.total as route proxy
  const orch=await get(`${B.orch}/health`);
  if(orch){
    // uptime is seconds (float), not ms
    const secs=orch.uptime||0;
    const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60);
    document.getElementById('tm-uptime').textContent=h?`${h}h`:`${m}m`;
    // route count — use systems total as proxy until /api/api-map is reliable
    document.getElementById('tm-routes').textContent=orch.total??orch.online??'—';
  }

  // ── Guardian ──────────────────────────────────────────────────────────────
  // /health returns { jobs, providers (obj or count), connected }
  const gd=await get(`${B.orch}/api/guardian/health`);
  if(gd){
    document.getElementById('tm-jobs').textContent=gd.jobs??'—';
    const provCount=typeof gd.providers==='number'
      ? gd.providers
      : Object.keys(gd.providers||gd.connected||{}).length;
    document.getElementById('tm-provs').textContent=provCount||'0';
  }

  // ── Cortex ────────────────────────────────────────────────────────────────
  const gaps=await get(`${B.orch}/api/cortex/gaps?status=open`);
  if(Array.isArray(gaps))document.getElementById('tm-gaps').textContent=gaps.length;
  const cxEvt=await get(`${B.orch}/api/cortex/events?n=1`);
  if(cxEvt){
    const count=Array.isArray(cxEvt)?cxEvt.length:(cxEvt.total??cxEvt.count??'—');
    document.getElementById('tm-events').textContent=count;
  }

  // ── Idearium ──────────────────────────────────────────────────────────────
  // /health returns { version, snr, uptime } — no idea counts
  // fetch /api/ideas directly for count
  const idrIdeas=await get(`${B.orch}/api/idearium/ideas`);
  const idrSpecs=await get(`${B.orch}/api/idearium/specs`);
  if(idrIdeas){
    const ideas=Array.isArray(idrIdeas)?idrIdeas:(idrIdeas.ideas||[]);
    document.getElementById('tm-ideas').textContent=ideas.length;
  }
  if(idrSpecs){
    const specs=Array.isArray(idrSpecs)?idrSpecs:(idrSpecs.specs||[]);
    document.getElementById('tm-specs').textContent=specs.length;
  }

  // ── Bridge ────────────────────────────────────────────────────────────────
  // No orchestrator proxy exists for Bridge yet — direct call, flagged above.
  // /health returns { ok, requests (stats obj), registry (snap), uptime (secs) }
  const br=await get(`${B.br}/health`);
  if(br){
    // requests is a stats object — use total or length, not the object itself
    const reqCount=typeof br.requests==='number'
      ? br.requests
      : (br.requests?.total??br.requests?.length??Object.keys(br.requests||{}).length??'—');
    document.getElementById('tm-reqs').textContent=reqCount;
    // nodes from registry snapshot
    const nodeCount=typeof br.nodes==='number'
      ? br.nodes
      : Object.keys(br.registry||{}).length;
    document.getElementById('tm-nodes').textContent=nodeCount||'—';
  }

  // ── Architect ─────────────────────────────────────────────────────────────
  // /health returns { ok, jaa: {table: rowCount, ...}, hooks: {total, bindings, byType, byStatus} }
  const arch=await get(`${B.orch}/api/architect/health`);
  if(arch){
    document.getElementById('tm-hooks').textContent=arch.hooks?.total??'—';
    document.getElementById('tm-blueprints').textContent=arch.jaa?.blueprints??0;
  }

  // ── Emerge ────────────────────────────────────────────────────────────────
  // §GAP: emerge-ide.js has no HTTP route exposing keyword/axiom counts —
  // kernel.SCHEMA.keywords/axioms only get emitted on the internal event bus
  // (compiler.snapshot, spec.updated), never as a plain GET. Tile metrics stay
  // dashed until that route exists — not fabricating a fetch to a URL that
  // isn't there.
}

