'use strict';
// ui/home/areas/diagnose.js — Diagnose channel: checks, CFR, gaps, engines.
// Split from ui/home/index.html (inline script, lines 1548-1635 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Diagnose ──────────────────────────────────────────────────────────────────
const DIAG=[
  {name:'Orchestrator',port:9000,url:`${B.orch}/health`},
  {name:'Guardian',    port:7820,url:`${B.orch}/api/guardian/health`},
  {name:'Cortex',      port:3748,url:`${B.orch}/api/cortex/health`},
  {name:'Idearium',    port:4800,url:`${B.orch}/api/idearium/health`},
  {name:'Bridge',      port:9999,url:`${B.br}/health`}, // no orchestrator proxy yet — direct
  {name:'Emerge',      port:4242,url:`${B.orch}/api/emerge/status`}, // was hitting :4242/health directly — wrong path (emerge has no /health, only /status) and bypassed the proxy
];
function buildDiag(){
  document.getElementById('diag-rows').innerHTML=DIAG.map((s,i)=>`
    <div class="diag-row" id="dr-${i}">
      <span class="diag-name">${s.name}</span>
      <span class="diag-port">:${s.port}</span>
      <span class="diag-status" id="dst-${i}">—</span>
      <span class="diag-detail" id="ddt-${i}">not checked</span>
    </div>`).join('');
}
async function runDiag(){
  for(let i=0;i<DIAG.length;i++){
    const s=DIAG[i];
    const statusEl=document.getElementById(`dst-${i}`);
    const detailEl=document.getElementById(`ddt-${i}`);
    if(statusEl)statusEl.textContent='...';
    if(statusEl)statusEl.className='diag-status checking';
    const d=await get(s.url);
    const ok=d&&(d.ok===true||d.status==='ok'||!d.error);
    if(statusEl){statusEl.textContent=ok?'ONLINE':'OFFLINE';statusEl.className='diag-status '+(ok?'ok':'fail')}
    const detail=[];
    if(d?.version)detail.push('v'+d.version);
    if(d?.uptimeMs)detail.push(Math.floor(d.uptimeMs/60000)+'m uptime');
    if(d?.routes)detail.push(d.routes+' routes');
    if(d?.jobs!==undefined)detail.push(d.jobs+' jobs');
    if(d?.tables)detail.push(Object.keys(d.tables||{}).length+' tables');
    if(detailEl)detailEl.textContent=detail.join(' · ')||(ok?'healthy':'unreachable');
  }
}
async function loadDiagCFR(){
  const el=document.getElementById('diag-cfr-body');
  const sigma=document.getElementById('diag-cfr-sigma');
  // Was: guardian cfr/state, fall back to cortex resilience/status. Dropped
  // the fallback — /api/resilience/status doesn't exist anywhere server-side
  // (checked admin-server.js and every cortex/*.js route handler). It always
  // resolved null before; routing it through the proxy would resolve a
  // truthy {ok:false,error:...} 404 body instead, which is worse — it would
  // render a fake "sigma=0.000" panel instead of "CFR not responding". This
  // needs the actual cortex route built, not a proxy entry for a route that
  // isn't there.
  const d=await get(`${B.orch}/api/guardian/cfr/state`);
  if(!d){el.innerHTML='<div style="color:rgba(255,255,255,.2);font-size:11px">CFR not responding</div>';return}
  const s=d.sigma?.score??d.sigma??d.score??0;
  if(sigma)sigma.textContent=`σ=${typeof s==='number'?s.toFixed(3):s}`;
  const color=s<.35?'#00ff88':s<.7?'#ffaa00':'#ff3355';
  el.innerHTML=`
    <div style="margin-bottom:8px">
      <div style="font-size:9px;color:rgba(255,255,255,.3);margin-bottom:4px;font-family:'Space Mono',monospace">SIGMA</div>
      <div style="height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden"><div style="width:${Math.min(100,Math.round((s||0)*100))}%;height:100%;background:${color};transition:width .5s"></div></div>
      <div style="font-family:'Space Mono',monospace;font-size:18px;font-weight:700;color:${color};margin-top:6px">${typeof s==='number'?s.toFixed(3):s||'—'}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-family:'Space Mono',monospace;font-size:10px;color:rgba(255,255,255,.4)">
      ${Object.entries(d).filter(([k])=>!['sigma','cfr','_'].some(x=>k.startsWith(x))).slice(0,8).map(([k,v])=>`<span><span style="color:rgba(255,255,255,.2)">${k}:</span> ${typeof v==='object'?JSON.stringify(v).slice(0,30):String(v).slice(0,30)}</span>`).join('')}
    </div>`;
}
async function loadDiagGaps(){
  const el=document.getElementById('diag-gaps-body');
  const d=await get(`${B.orch}/api/cortex/gaps?status=open`);
  const gaps=Array.isArray(d)?d:[];
  if(!gaps.length){el.innerHTML='<div style="color:rgba(0,255,136,.4);font-size:11px">No open loops</div>';return}
  el.innerHTML=gaps.slice(0,15).map(g=>`<div class="gap-row ${g.severity||'low'}"><div class="gap-type-lbl">${g.loop_type||g.type||'gap'}${g.severity?' · '+g.severity:''}</div><div class="gap-body-txt">${(g.body||g.path||'').slice(0,120)}</div></div>`).join('');
}
async function runDiagEngines(){
  const el=document.getElementById('diag-engines-body');
  el.innerHTML='<div style="color:rgba(255,170,0,.6);font-size:11px">Running diagnostic engines...</div>';
  const d=await post(`${B.orch}/api/cortex/replay/inspect`,{fromTs:Date.now()-300000});
  const rows=[];
  if(d){rows.push({name:'Replay inspect (5m)',val:d.eventCount+' events',ok:true})}
  // Resilience status row dropped — /api/resilience/status doesn't exist
  // server-side (see loadDiagCFR above). Was always a no-op.
  // Topology from gap-loop via cortex event_log
  const gaps=await get(`${B.orch}/api/cortex/gaps?status=open`);
  const gapCount=Array.isArray(gaps)?gaps.length:0;
  rows.push({name:'Open loops',val:gapCount+' total',ok:gapCount===0});
  const fails=await get(`${B.orch}/api/cortex/failures`);
  const failCount=Array.isArray(fails)?fails.length:(fails?.failures||[]).length;
  rows.push({name:'Failures',val:failCount+' recent',ok:failCount===0});
  el.innerHTML=rows.map(r=>`<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px"><span style="color:${r.ok?'#00ff88':'#ffaa00'}">${r.ok?'✓':'⚠'}</span><span style="color:rgba(255,255,255,.6)">${r.name}</span><span style="margin-left:auto;font-family:\'Space Mono\',monospace;font-size:10px;color:rgba(255,255,255,.3)">${r.val}</span></div>`).join('');
}

