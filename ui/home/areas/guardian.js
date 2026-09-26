'use strict';
// ui/home/areas/guardian.js — Guardian channel: providers, dispatch, jobs.
// Split from ui/home/index.html (inline script, lines 1365-1502 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Guardian ──────────────────────────────────────────────────────────────────
// Known busy providers — tracks tab state
let _providerState={};

async function gdLoadProvs(){
  const d=await get(`${B.orch}/api/guardian/providers`);
  const el=document.getElementById('gd-provs-el');
  const provs=d?.providers||d?.connected||{};
  const names=Object.keys(provs);
  _providerState=provs;
  updateProviderStatusLine();
  if(!names.length){
    el.innerHTML='<div style="color:rgba(255,255,255,.2);font-size:11px;line-height:1.8">No providers connected.<br>Open a tab and activate the userscript.</div>';
    return;
  }
  el.innerHTML=names.map(n=>{
    const p=provs[n]||{};
    const busy=p.busy||p.status==='busy';
    return `<div class="prov-pill ${busy?'':'live'}" style="${busy?'border-color:rgba(255,170,0,.3);color:#ffaa00':''}">
      <span>${busy?'⏳':'●'}</span>${n}${busy?'<span style="font-size:8px;margin-left:4px">BUSY</span>':''}
      ${!busy?`<button onclick="gdOpenNewTab('${n}')" style="margin-left:auto;background:none;border:1px solid rgba(255,255,255,.1);border-radius:4px;color:rgba(255,255,255,.4);font-size:8px;padding:1px 5px;cursor:pointer" title="Open new tab">+tab</button>`:''}
    </div>`;
  }).join('');
}

function updateProviderStatusLine(){
  const pr=document.getElementById('gd-prov')?.value||'claude';
  const el=document.getElementById('gd-provider-status');if(!el)return;
  const connected=Object.keys(_providerState);
  if(!connected.length){el.textContent='No tabs connected — send will open a tab';el.style.color='rgba(255,170,0,.6)';return}
  const match=connected.find(n=>n.toLowerCase().includes(pr.toLowerCase()));
  if(match){
    const busy=_providerState[match]?.busy;
    el.textContent=busy?`${match} is busy — will route to next available`:`${match} ready`;
    el.style.color=busy?'rgba(255,170,0,.6)':'rgba(0,255,136,.5)';
  }else{
    el.textContent=`${pr} not connected — send will open ${PROVIDER_URLS[pr]||'a new tab'}`;
    el.style.color='rgba(255,170,0,.6)';
  }
}

function gdOpenNewTab(provider){
  const url=PROVIDER_URLS[provider||'claude'];
  if(url)openClearGlass(url);
}

async function gdSend(){
  const p=document.getElementById('gd-prompt').value.trim();
  const pr=document.getElementById('gd-prov').value;
  if(!p)return;
  const res=document.getElementById('gd-res');
  res.style.color='rgba(255,255,255,.5)';

  // Check if provider is connected
  const provs=await get(`${B.orch}/api/guardian/providers`);
  const connected=Object.keys(provs?.providers||provs?.connected||{});
  const hasProvider=connected.some(n=>n.toLowerCase().includes(pr.toLowerCase()));

  if(!hasProvider){
    // Open Clear Glass browser with the provider URL (no bare Chrome tabs)
    const url=PROVIDER_URLS[pr];
    res.textContent=`No ${pr} tab connected — opening Clear Glass. Install userscript then Send again.`;
    res.style.color='rgba(255,170,0,.7)';
    if(url) openClearGlass(url);
    return;
  }

  // Check if this provider is busy (has an active streaming/processing job)
  const jobs=await get(`${B.orch}/api/guardian/jobs`);
  const jobList=Array.isArray(jobs)?jobs:(jobs?.jobs||[]);
  const busy=jobList.some(j=>j.provider?.toLowerCase().includes(pr.toLowerCase())&&(j.status==='streaming'||j.status==='processing'));
  if(busy){
    // Find next available provider that's connected and not busy
    const busyProviders=new Set(jobList.filter(j=>j.status==='streaming'||j.status==='processing').map(j=>j.provider?.toLowerCase()));
    const available=connected.find(n=>!busyProviders.has(n.toLowerCase())&&n.toLowerCase()!==pr.toLowerCase());
    if(available){
      res.innerHTML=`${pr} is busy. Route to <b style="color:#00e5ff">${available}</b>? <button onclick="routeToProvider('${available}')" style="background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.3);border-radius:4px;color:#00e5ff;font-size:10px;padding:2px 8px;cursor:pointer;margin-left:8px">Use ${available}</button> <button onclick="openNewProviderTab('${pr}')" style="background:none;border:1px solid rgba(255,255,255,.15);border-radius:4px;color:rgba(255,255,255,.5);font-size:10px;padding:2px 8px;cursor:pointer;margin-left:4px">Open new ${pr} tab</button>`;
      res.style.color='rgba(255,170,0,.7)';
      return;
    }else{
      // All connected providers busy — open a new tab
      const url=PROVIDER_URLS[pr];
      res.textContent=`All providers busy. Opening new ${pr} tab...`;
      if(url) window.open(url,'_blank');
      return;
    }
  }

  // Timestamp is the source of truth for ordering
  const jobTs=Date.now();
  res.textContent=`Dispatching [${new Date(jobTs).toISOString().substr(11,8)}]...`;
  res.style.color='rgba(255,255,255,.4)';

  const d=await post(`${B.orch}/api/guardian/dispatch`,{command:'chat',prompt:p,provider:pr,meta:{ts:jobTs,source:'ui',ordered:true,seam_ts:jobTs}});
  if(d?.jobId){
    res.textContent=`Job ${d.jobId.slice(0,12)} — ${d.status||'queued'} [${new Date(jobTs).toISOString().substr(11,8)}]`;
    res.style.color='rgba(0,229,255,.6)';
    document.getElementById('gd-prompt').value='';
  }else{
    res.textContent=d?JSON.stringify(d):'Error: Guardian offline';
    res.style.color='rgba(255,51,85,.7)';
  }
  gdLoadJobs();
  setTimeout(gdLoadJobs,2000);
}

function openNewProviderTab(pr){const url=PROVIDER_URLS[pr];if(url)window.open(url,'_blank');}
async function routeToProvider(pr){
  document.getElementById('gd-prov').value=pr;
  await gdSend();
}

async function gdCancelJob(jobId){
  await post(`${B.orch}/api/guardian/queue/cancel/${jobId}`,{});
  gdLoadJobs();
}

async function gdLoadJobs(){
  const d=await get(`${B.orch}/api/guardian/jobs`);
  const el=document.getElementById('gd-jobs-el');
  const jobs=Array.isArray(d)?d:(d?.jobs||[]);
  document.getElementById('gd-job-count').textContent=jobs.length||'0';
  if(!jobs.length){el.innerHTML='<div style="color:rgba(255,255,255,.2);font-size:11px">No jobs yet</div>';return}
  // Sort by timestamp (source of truth for order)
  const sorted=jobs.slice(0,30).sort((a,b)=>(b.ts||b.createdAt||0)-(a.ts||a.createdAt||0));
  el.innerHTML=sorted.map(j=>{
    const ts=j.ts||j.createdAt?new Date(j.ts||j.createdAt).toISOString().substr(11,8):'';
    const isActive=j.status==='streaming'||j.status==='processing'||j.status==='queued';
    return `<div class="job-row">
      <span class="j-st ${j.status||''}">${j.status||'?'}</span>
      <span class="j-prov">${j.provider||'?'}</span>
      <span class="j-txt">${(j.prompt||j.command||'').slice(0,100)}</span>
      <span style="font-family:'Space Mono',monospace;font-size:8px;color:rgba(255,255,255,.2)">${ts}</span>
      ${isActive?`<button onclick="gdCancelJob('${j.id||j.uuid||''}')" style="margin-left:4px;background:none;border:1px solid rgba(255,51,85,.3);border-radius:4px;color:rgba(255,51,85,.6);font-size:8px;padding:1px 5px;cursor:pointer;flex-shrink:0">✕</button>`:''}
    </div>`;
  }).join('');
}

