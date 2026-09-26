'use strict';
// ui/home/areas/cortex.js — Cortex channel: gaps, failures.
// Split from ui/home/index.html (inline script, lines 1503-1516 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Cortex ────────────────────────────────────────────────────────────────────
async function cxLoadGaps(){
  const d=await get(`${B.orch}/api/cortex/gaps?status=open`);const el=document.getElementById('cx-gaps-el');
  const gaps=Array.isArray(d)?d:[];
  if(!gaps.length){el.innerHTML='<div style="color:rgba(0,255,136,.4);font-size:11px">No open loops — ecology nominal</div>';return}
  el.innerHTML=gaps.slice(0,20).map(g=>`<div class="gap-row ${g.severity||'low'}"><div class="gap-type-lbl">${g.loop_type||g.type||'gap'}${g.severity?' · '+g.severity:''}</div><div class="gap-body-txt">${(g.body||g.path||'').slice(0,120)}</div></div>`).join('');
}
async function cxLoadFails(){
  const d=await get(`${B.orch}/api/cortex/failures`);const el=document.getElementById('cx-fails-el');
  const fails=Array.isArray(d)?d:(d?.failures||[]);
  if(!fails.length){el.innerHTML='<div style="color:rgba(255,255,255,.2);font-size:11px">No failures</div>';return}
  el.innerHTML=fails.slice(0,10).map(f=>`<div class="gap-row high"><div class="gap-type-lbl">${f.source||'unknown'}</div><div class="gap-body-txt">${(f.error||'').slice(0,140)}</div></div>`).join('');
}

