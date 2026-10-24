'use strict';
// ui/home/areas/idearium.js — Idearium channel: ideas.
// Split from ui/home/index.html (inline script, lines 1517-1534 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Idearium ──────────────────────────────────────────────────────────────────
async function idrLoad(sort='createdAt'){
  const d=await get(`${B.orch}/api/idearium/ideas?sort=${sort}`);const el=document.getElementById('idr-feed');
  const ideas=Array.isArray(d)?d:(d?.ideas||[]);
  if(!ideas.length){el.innerHTML='<div style="color:rgba(255,255,255,.2);font-size:12px">No ideas yet. Type one above.</div>';return}
  const maxT=Math.max(...ideas.map(i=>i.tension||0),1);
  el.innerHTML=ideas.slice(0,40).map(i=>{
    const t=i.tension||0;const tags=(i.tags||[]).map(g=>`<span class="it-tag">${g}</span>`).join('');
    return `<div class="idea-tile ${t>.6?'high-t':''}"><div class="it-title">${i.title||(i.body||'').slice(0,80)||'Untitled'}</div>${i.body&&i.title?`<div class="it-body">${i.body}</div>`:''}<div class="it-meta">${i.status||'open'}${tags}${t?`<span>tension: ${t.toFixed?t.toFixed(2):t}</span>`:''}</div>${t?`<div class="t-bar"><div class="t-fill" style="width:${Math.round(t/maxT*100)}%"></div></div>`:''}</div>`;
  }).join('');
}
async function idrCreate(){
  const inp=document.getElementById('idr-new');const body=inp.value.trim();if(!body)return;
  const d=await post(`${B.orch}/api/idearium/ideas`,{body,status:'open'});
  if(d?.uuid||d?.ok){inp.value='';idrLoad('createdAt')}
  else{inp.style.borderColor='#ff3355';setTimeout(()=>inp.style.borderColor='',1500)}
}

