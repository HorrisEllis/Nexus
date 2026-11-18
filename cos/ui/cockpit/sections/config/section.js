// cos/ui/cockpit/sections/config/section.js — a system's configuration: every setting, where it came from, when and how it applies (SC5, 0.60.380).
// James, 2026-11-02: "Need configuration for each system ... set ram, cpu and network limits. Percent or gbs. Ports and network settings. All the
// settings like idearium has for the repos. All relevant configuration settings". Units are free ("25%", "2GB", "2 cores", "100Mbps"); the manager
// parses and says what it applied. Nothing is shown as applied that the OS does not do: a not-enforced setting says so in red.
const $=(s)=>root.querySelector(s);const {h}=COS;const base=`/api/cos/systems/${encodeURIComponent(ctx.name)}/config`;
const S={cat:null,d:null};const HINT={size:'25%, 2GB, 1536MB',cpu:'50%, 2 cores',bandwidth:'100Mbps, 10MB/s, 20%'};
const OPTS={'memory.onOver':['warn','restart'],'cpu.onOver':['warn','restart'],'cpu.priority':['low','below-normal','normal','above-normal','high'],'network.bind':['127.0.0.1','0.0.0.0','::1','::'],'network.outbound':['allow','deny'],'start.restart':['crash','never'],'wall.mode':['audit','enforce'],'start.autostart':['true','false'],'start.onDemand':['true','false']};
const show=(k,s)=>s.value==null?'':s.unit==='size'&&typeof s.value==='number'?`${s.value>=1024&&s.value%1024===0?s.value/1024+'GB':s.value+'MB'}`:s.unit==='cpu'?`${s.value}%`:s.unit==='bandwidth'&&typeof s.value==='object'?(s.value.mbps!=null?`${s.value.mbps}Mbps`:`${s.value.pct}%`):String(s.value);
function field(k,s){const o=OPTS[k];const v=show(k,s);
  const inp=o?h('select',{class:'input',name:k},...o.map(x=>h('option',{value:x,...(String(s.value)===x?{selected:''}:{})},x))):h('input',{class:'input',name:k,value:v,placeholder:s.unit?HINT[s.unit]+(k==='memory.limit'||k==='cpu.limit'||k==='network.limit'?', none':''):'',...(k==='general.notes'?{}:{})});
  inp.dataset.was=o?String(s.value):v;
  const clear=s.from==='his'?h('button',{type:'button',class:'btn quiet sm',title:'back to the declared value',onclick:()=>clearKey(k)},'Reset'):h('span',{class:'from','data-f':s.from},s.from);
  return h('div',{class:'set'},h('label',{},s.label,h('small',{},k)),inp,clear,h('div',{class:'how'},h('b',{'data-s':s.how.state||'unknown'},s.how.state||'—'),`${s.how.when?s.how.when+' · ':''}${s.how.why||''}${s.how.readBack!=null?` · read back ${s.how.readBack}`:''}`));}
function pane(){const d=S.d;$('#cats').replaceChildren(...Object.entries(d.groups).map(([g,l])=>h('button',{type:'button',class:`btn quiet sm${S.cat===g?' on':''}`,onclick:()=>{S.cat=g;pane();}},l)));
  $('#pane-title').textContent=d.groups[S.cat];$('#host').textContent=`host ${Math.round(d.host.totalMB/1024)} GB · ${d.host.cores} cores${d.running.pid?` · pid ${d.running.pid}`:''}`;
  const rows=S.cat==='environment'?envRows():Object.entries(d.settings).filter(([,s])=>s.group===S.cat).map(([k,s])=>field(k,s));
  $('#pane').replaceChildren(...rows,h('div',{class:'cfg-foot'},h('span',{class:'msg',id:'msg'}),h('button',{class:'btn primary'},'Save')));}
// 2026-11-15 — James: "can you add ollama settings in cos ui? in the system settings?" · "Keep the 3b, save it". A …_MODEL setting is picked from
// the models the system itself reports (its own GET /api/models, asked only when it answers one), and applied at once through its PUT /api/model.
const isModelKey=(k)=>/_MODEL$/.test(k)&&S.models&&S.models.list.length;
function envInput(k,x){const v=x.removed?'':x.value??'';if(!isModelKey(k))return h('input',{class:'input',name:`env.${k}`,value:v,'data-was':v});
  const list=S.models.list.includes(v)||!v?S.models.list:[v,...S.models.list];
  return h('select',{class:'input',name:`env.${k}`,'data-was':v},...(v?[]:[h('option',{value:'',selected:''},'(the system\'s own default)')]),...list.map(m=>h('option',{value:m,...(m===v?{selected:''}:{})},`${m}${S.models.list.includes(m)?'':' (not installed)'}${m===S.models.active?' · running':''}`)));}
async function loadModels(){S.models=null;try{const sys=await COS.call('GET',`/api/cos/systems/${encodeURIComponent(ctx.name)}`);const port=(sys.system||sys).port;if(!port)return;
  const r=await fetch(`http://127.0.0.1:${port}/api/models`,{signal:AbortSignal.timeout(4000)});if(!r.ok)return;const j=await r.json();
  if(j&&Array.isArray(j.models)&&j.models.length)S.models={port,list:j.models,active:j.active||null};}catch(_){S.models=null;}}
async function applyModels(patch){if(!S.models)return[];const out=[];
  for(const[k,v]of Object.entries(patch)){if(!/^env\..*_MODEL$/.test(k)||!v||!S.models.list.includes(v))continue;
    try{const r=await fetch(`http://127.0.0.1:${S.models.port}/api/model`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:v})});const j=await r.json().catch(()=>({}));
      out.push(r.ok&&j.ok?`${v} running now`:`${v} saved, not applied now: ${j.error||r.status} (it applies at the next start)`);}catch(e){out.push(`${v} saved, not applied now: ${e.message} (it applies at the next start)`);}}
  return out;}
function envRows(){const e=Object.entries(S.d.env);return[...e.map(([k,x])=>h('div',{class:'env-row set'},h('label',{},k,h('small',{},x.from)),envInput(k,x),x.from==='his'?h('button',{type:'button',class:'btn quiet sm',onclick:()=>clearKey(`env.${k}`)},'Reset'):h('span'),h('span'))),
  h('div',{class:'env-row set'},h('input',{class:'input',id:'nk',placeholder:'NEW_VAR'}),h('input',{class:'input',id:'nv',placeholder:'value (not for secrets: kept in COS\'s data as text)'}),h('span'),h('span')),
  h('p',{class:'faint',style:'margin:0;font-size:12px'},'Applies at the next start. COS_BOUNDARY and NODE_OPTIONS are COS\'s own.')];}
async function load(){try{S.d=await COS.call('GET',base);await loadModels();if(!S.cat||!S.d.groups[S.cat])S.cat='resources';pane();}catch(e){$('#pane').replaceChildren(h('p',{class:'faint'},e.message));}}
async function clearKey(k){try{S.d=await COS.call('POST',`${base}/clear`,{keys:[k],by:'person'});COS.notice('ok',`${k}: the declared value again`);pane();}catch(e){if(!e.refused)COS.notice('err',e.message);}}
$('#pane').onsubmit=async(e)=>{e.preventDefault();const patch={};
  for(const el of $('#pane').querySelectorAll('[name]')){const v=el.value.trim();if(v===(el.dataset.was??''))continue;patch[el.name]=v===''||v==='none'?null:v;}
  const nk=$('#nk'),nv=$('#nv');if(nk&&nk.value.trim())patch[`env.${nk.value.trim()}`]=nv.value;
  if(!Object.keys(patch).length){$('#msg').textContent='nothing changed';return;}
  if(!await COS.confirm({title:`Change ${Object.keys(patch).length} setting${Object.keys(patch).length>1?'s':''} of ${ctx.name}?`,body:Object.entries(patch).map(([k,v])=>`<code>${COS.esc(k)}</code> → ${COS.esc(v==null?'none':String(v))}`).join('<br>')+'<br><br>Through COS\'s manager, ledgered as your act, recorded in Versionium.',act:'Save'}))return;
  try{S.d=await COS.call('PATCH',base,{patch,by:'person'});const applied=await applyModels(patch);if(applied.length)await loadModels();COS.notice('ok','saved');pane();$('#msg').textContent=`saved: each says when it applies${applied.length?' · '+applied.join(' · '):''}`;}catch(err){if(!err.refused){pane();const m=$('#msg');m.textContent=err.message;m.classList.add('err');}}};
ctx.onState(load);load();return{refresh:load};
