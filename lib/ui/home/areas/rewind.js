'use strict';
// ui/home/areas/rewind.js — Rewind overlay: snapshot timeline + rollback.
// Split from ui/home/index.html (inline script, lines 2035-2099 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Rewind ────────────────────────────────────────────────────────────────────
let rwSnapshots=[],rwSelected=null,rwHovered=null,rwAnimFrame=null;
const CX_SNAP=`${B.orch}/api/cortex/snapshots`,CX_ROLLBACK=`${B.orch}/api/cortex/snapshots/rollback`;
function sigmaColor(s,a=1){if(typeof s!=='number')s=0;s=Math.min(1,Math.max(0,s));if(s<.35){const t=s/.35;return`rgba(${Math.round(0)},${Math.round(255-t*25)},${Math.round(136+t*119)},${a})`}else if(s<.7){const t=(s-.35)/.35;return`rgba(${Math.round(t*255)},${Math.round(229-t*59)},${Math.round(255-t*255)},${a})`}else{const t=(s-.7)/.3;return`rgba(255,${Math.round(170-t*170)},${Math.round(t*85)},${a})`}}
async function openRewind(){document.getElementById('rewind-overlay').classList.add('open');setRwStatus('Loading...','working');await loadRewindData()}
function closeRewind(){document.getElementById('rewind-overlay').classList.remove('open');if(rwAnimFrame){cancelAnimationFrame(rwAnimFrame);rwAnimFrame=null}}
async function loadRewindData(){
  const sd=await get(CX_SNAP);const ed=await get(`${B.orch}/api/cortex/events?n=200`);
  const snaps=sd?.snapshots||sd||[];const events=Array.isArray(ed)?ed:(ed?.events||[]);
  const sigmaEvents=events.filter(e=>e.sigma?.score!==undefined).map(e=>({ts:e.ts,sigma:e.sigma.score,delta:e.delta||0})).sort((a,b)=>a.ts-b.ts);
  rwSnapshots=snaps.map(s=>{let closest=null,minD=Infinity;for(const ev of sigmaEvents){const d=Math.abs(ev.ts-s.ts);if(d<minD){minD=d;closest=ev}}return{...s,sigma:closest?.sigma||0,delta:closest?.delta||0}}).sort((a,b)=>a.ts-b.ts);
  if(!rwSnapshots.length){setRwStatus('No snapshots','');return}
  setRwStatus(rwSnapshots.length+' snapshots','');drawTimeline();
}
function drawTimeline(){
  const c=document.getElementById('rw-canvas');if(!c)return;
  const dpr=window.devicePixelRatio||1,rect=c.getBoundingClientRect();
  c.width=rect.width*dpr;c.height=rect.height*dpr;
  const ctx=c.getContext('2d');ctx.scale(dpr,dpr);
  c.onmousemove=e=>{const r=c.getBoundingClientRect(),mx=e.clientX-r.left;const idx=_snapAtX(mx,r.width);rwHovered=idx>=0?idx:null;const tip=document.getElementById('rw-hover-tip');if(idx>=0){const sn=rwSnapshots[idx];const ts=new Date(sn.ts).toISOString().replace('T',' ').substr(0,19);tip.innerHTML=`<b>${sn.snapId?.slice(0,12)||'?'}</b> ${sn.trigger||'?'}<br>${ts} σ=${sn.sigma?.toFixed(3)||'0'}`;tip.style.left=(r.left+_snapX(idx,rwSnapshots.length,r.width,24))+'px';tip.style.top=(r.top+80)+'px';tip.classList.add('show')}else tip.classList.remove('show')};
  c.onclick=e=>{const r=c.getBoundingClientRect();const idx=_snapAtX(e.clientX-r.left,r.width);if(idx>=0){rwSelected=rwSnapshots[idx];showSnapDetail(rwSelected)}};
  c.onmouseleave=()=>{rwHovered=null;document.getElementById('rw-hover-tip').classList.remove('show')};
  let gt=0;function animLoop(){gt+=.04;_renderTL(ctx,c.getBoundingClientRect().width,c.getBoundingClientRect().height,gt);rwAnimFrame=requestAnimationFrame(animLoop)}animLoop();
}
function _snapX(i,n,W,PAD){return n===1?W/2:PAD+(i/(n-1))*(W-PAD*2)}
function _snapAtX(mx,W){const PAD=24,n=rwSnapshots.length;if(!n)return-1;let best=0,bestD=Infinity;for(let i=0;i<n;i++){const d=Math.abs(_snapX(i,n,W,PAD)-mx);if(d<bestD){bestD=d;best=i}}return bestD<28?best:-1}
function _renderTL(ctx,W,H,t){
  if(!ctx)return;
  ctx.clearRect(0,0,W,H);const n=rwSnapshots.length;if(!n)return;const PAD=24,MID=H*.55,MH=H*.38;
  ctx.beginPath();ctx.moveTo(PAD,MID);ctx.lineTo(W-PAD,MID);ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=1;ctx.stroke();
  if(n>=2){const fmt=ts=>new Date(ts).toISOString().substr(11,5);ctx.font='9px "Space Mono"';ctx.fillStyle='rgba(255,255,255,.2)';ctx.textAlign='left';ctx.fillText(fmt(rwSnapshots[0].ts),PAD,H-4);ctx.textAlign='right';ctx.fillText(fmt(rwSnapshots[n-1].ts),W-PAD,H-4)}
  for(let i=0;i<n-1;i++){const x1=_snapX(i,n,W,PAD),x2=_snapX(i+1,n,W,PAD);const g=ctx.createLinearGradient(x1,0,x2,0);g.addColorStop(0,sigmaColor(rwSnapshots[i].sigma,.2));g.addColorStop(1,sigmaColor(rwSnapshots[i+1].sigma,.2));ctx.beginPath();ctx.moveTo(x1,MID);ctx.lineTo(x2,MID);ctx.strokeStyle=g;ctx.lineWidth=1.5;ctx.stroke()}
  for(let i=0;i<n;i++){
    const sn=rwSnapshots[i];const x=_snapX(i,n,W,PAD);const dy=Math.min(MH,Math.max(-MH,(sn.delta||0)*MH*2));const y=MID-dy;
    const sel=rwSelected?.snapId===sn.snapId;const hov=rwHovered===i;const r=sel?7+Math.sin(t)*2:hov?6:4;
    if(sel||hov){ctx.beginPath();ctx.arc(x,y,r+5,0,Math.PI*2);ctx.fillStyle=sigmaColor(sn.sigma,sel?.1+Math.sin(t)*.05:.06);ctx.fill()}
    ctx.beginPath();ctx.moveTo(x,MID);ctx.lineTo(x,y);ctx.strokeStyle=sigmaColor(sn.sigma,sel?.5:.15);ctx.lineWidth=sel?1.5:.7;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=sigmaColor(sn.sigma,sel||hov?1:.65);ctx.fill();
    if(sel){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke()}
  }
}
function showSnapDetail(sn){
  document.getElementById('rw-detail-empty').style.display='none';
  const c=document.getElementById('rw-detail-content');c.style.display='block';
  document.getElementById('rw-snap-id').textContent=sn.snapId?.slice(0,20)||'?';
  document.getElementById('rw-snap-trigger').textContent=sn.trigger||sn.type||'manual';
  document.getElementById('rw-snap-ts').textContent=new Date(sn.ts).toISOString().replace('T',' ').substr(0,19);
  document.getElementById('rw-snap-stats').innerHTML=[{v:sn.totalRows??'?',l:'Rows'},{v:sn.openGaps??'?',l:'Open gaps'},{v:sn.rollback_count||0,l:'Rollbacks'},{v:sn.sigma?.toFixed?sn.sigma.toFixed(3):'?',l:'Sigma'}].map(s=>`<div class="rw-stat"><div class="rw-stat-v">${s.v}</div><div class="rw-stat-l">${s.l}</div></div>`).join('');
  const pct=Math.round((sn.sigma||0)*100);const fill=document.getElementById('rw-snap-sigma-fill');fill.style.width=pct+'%';fill.style.background=sigmaColor(sn.sigma||0);
  document.getElementById('rw-confirm-row').style.display='block';
  const btn=document.getElementById('rw-confirm-btn');btn.textContent='⟲ Restore this snapshot';btn.classList.remove('danger');btn.disabled=false;
  setRwStatus(`Selected: ${sn.snapId?.slice(0,16)} — ${sn.trigger||'?'} at ${new Date(sn.ts).toLocaleTimeString()}`,'');
}
function cancelSelect(){rwSelected=null;document.getElementById('rw-confirm-row').style.display='none';document.getElementById('rw-detail-empty').style.display='block';document.getElementById('rw-detail-content').style.display='none';setRwStatus('','')}
async function confirmRewind(){
  if(!rwSelected)return;const btn=document.getElementById('rw-confirm-btn');
  if(!btn.classList.contains('danger')){btn.textContent='⚠ Confirm — rewinds all state';btn.classList.add('danger');setRwStatus('Click again to confirm rollback','working');return}
  btn.textContent='⟳ Rewinding...';btn.disabled=true;setRwStatus('Sending rollback...','working');
  const d=await post(CX_ROLLBACK,{snapId:rwSelected.snapId,reason:'user-rewind-ui'});
  if(d?.ok||d?.rolled_back){setRwStatus('✓ Rolled back — refreshing...','ok');const ch=document.getElementById('channel');ch.style.filter='brightness(.1) saturate(0)';setTimeout(()=>{ch.style.transition='filter .6s ease';ch.style.filter='';setTimeout(()=>ch.style.transition='',700)},300);setTimeout(()=>{pollHealth();loadRewindData()},1200)}
  else{setRwStatus(`✗ Rollback failed: ${d?.error||'Cortex not responding'}`,'err');btn.textContent='⟲ Restore this snapshot';btn.classList.remove('danger');btn.disabled=false}
}
function setRwStatus(msg,cls=''){const el=document.getElementById('rw-status');if(el){el.textContent=msg;el.className=cls}}


