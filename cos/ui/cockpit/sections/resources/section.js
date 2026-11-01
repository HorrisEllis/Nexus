// cos/ui/cockpit/sections/resources/section.js — caps by layer and as applied (read back), and the account. CP6a, 0.60.356.
// James, 2026-11-01: "then i want resource management for each cos compartment". Every value says its layer and how the OS applied it.
const $=(s)=>root.querySelector(s);const {h}=COS;const url=`/api/cos/systems/${encodeURIComponent(ctx.name)}/caps`;
async function load(){try{const d=await COS.call('GET',url);const c=d.caps;$('#at').textContent=`read ${COS.clock(Date.now())}`;
$('#caps').replaceChildren(...['heapMB','rssLimitMB','onOver','priority'].flatMap(k=>[h('dt',{},k),h('dd',{},`${c[k]??'none'} · ${c.layers[k]}`)]),
...Object.entries(c.applied).flatMap(([k,v])=>[h('dt',{},`applied · ${k}`),h('dd',{},`${v.state}${v.readBack!=null?` → ${v.readBack}`:''}${v.why?` — ${v.why}`:''}`)]));
const hs=d.history.slice(-20).reverse();$('#hist').replaceChildren(...(hs.length?hs.map(s=>h('li',{},`${COS.clock(s.at)} · ${s.rssMB??'—'} MB · ${s.cpuPct??'—'}% CPU · ${s.reader||s.notRead||''}`)):[h('li',{class:'faint'},'No samples yet: COS reads every 30 s.')]));}
catch(e){$('#caps').replaceChildren(h('dd',{},e.message));}}
$('#f').onsubmit=async(e)=>{e.preventDefault();const k=$('#k').value,raw=$('#v').value.trim();const v=raw==='none'?null:/MB$/.test(k)?Number(raw):raw;
if(!await COS.confirm({title:`Set ${k} of ${ctx.name} to ${raw}?`,body:'Through COS\'s manager, ledgered as your act, recorded in Versionium.',act:'Set'}))return;
try{await COS.call('PATCH',url,{patch:{[k]:v},by:'person'});COS.notice('ok',`${k} set`);load();}catch(err){if(!err.refused)COS.notice('err',err.message);}};
ctx.onState(load);load();return{refresh:load};
