'use strict';
// ui/home/areas/bridge.js — Bridge channel: relay nodes.
// Split from ui/home/index.html (inline script, lines 1535-1547 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Bridge ────────────────────────────────────────────────────────────────────
// No orchestrator proxy exists for Bridge yet — direct call. Same gap noted
// at the SYSTEMS table above; needs a `sub==='bridge'` block in orchestrator.js
// before this can move off :9999.
async function brLoad(){
  const h=await get(`${B.br}/health`);
  if(h){document.getElementById('br-reqs').textContent=h.requests??'—';document.getElementById('br-nodes').textContent=h.nodes??'—';document.getElementById('br-health').textContent=h.ok?'OK':'DEGRADED';document.getElementById('br-health').style.color=h.ok?'#00ff88':'#ff3355';document.getElementById('br-uptime').textContent=h.uptimeMs?Math.floor(h.uptimeMs/60000)+'m':'—'}
  const reg=await get(`${B.br}/api/registry`);const el=document.getElementById('br-reg');
  const nodes=Array.isArray(reg)?reg:(reg?.nodes||[]);
  if(!nodes.length){el.innerHTML='<div style="color:rgba(255,255,255,.2);font-size:11px">No registered nodes</div>';return}
  el.innerHTML=nodes.map(n=>`<div class="node-row"><span class="node-id">${n.id||n.name||'node'}</span><span class="node-url">${n.url||n.address||''}</span><span class="node-st ${n.online||n.healthy?'up':'down'}">${n.online||n.healthy?'● online':'● offline'}</span></div>`).join('');
}

