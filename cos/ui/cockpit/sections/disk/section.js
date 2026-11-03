// cos/ui/cockpit/sections/disk/section.js — a system's disk (DK3, 0.60.381). James, 2026-11-02: "Cos is the wmware. The compartments are the
// virtual machines/disks." · "Use the spec as metadata then have the actual file be a compressed or virtual disk or envirement."
// Its metadata (the declaration and its spec, and how much of its code the spec names: how much of the disk the metadata alone could
// rebuild), its disks, Make a disk (with its data only when ticked), Verify (every file re-hashed against the disk's metadata).
const $=(s)=>root.querySelector(s);const {h}=COS;const base=`/api/cos/systems/${encodeURIComponent(ctx.name)}/disk`;
const kb=(b)=>b>=1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.round(b/1024)} KB`;
async function load(){try{const d=await COS.call('GET',base);
  $('#cov').textContent=`its spec names ${d.coverage.pct}% of its code`;
  $('#meta').replaceChildren(h('b',{},'Declared by'),h('span',{},d.metadata.declaredBy||'nothing yet'),h('b',{},'Its data'),h('span',{},d.metadata.state.join(', ')),
    h('b',{},'Spec covers'),h('span',{},`${d.coverage.namedBySpec} of ${d.coverage.codeFiles} code files (${d.coverage.pct}%) — the share of this disk its metadata alone could rebuild`,h('div',{class:'bar'},h('i',{style:`width:${d.coverage.pct}%`}))));
  $('#disks').replaceChildren(...(d.disks.length?d.disks.map(x=>h('li',{'data-file':x.file},h('span',{},x.file,h('small',{},`${x.files} files · ${kb(x.bytes)}${x.withState?' · with its data':''} · Nexus ${x.nexus||'?'} · ${COS.ago(Date.parse(x.created))} by ${x.by}`)),h('span',{class:'v'}),h('button',{class:'btn sm',onclick:(e)=>verify(x.file,e.target.closest('li'))},'Verify'))):[h('li',{class:'empty'},'No disk yet.')]));
}catch(e){$('#meta').replaceChildren(h('span',{},e.message));}}
async function verify(file,li){try{const r=(await COS.call('GET',`/api/cos/disks/${encodeURIComponent(file)}/verify`)).verify;const v=li.querySelector('.v');v.className=`v ${r.ok?'ok':'bad'}`;v.textContent=r.ok?`all ${r.files} match`:`${r.changed.length} changed, ${r.missing.length} missing`;}catch(e){COS.notice('err',e.message);}}
$('#make').onclick=async()=>{const st=$('#state').checked;
  if(!await COS.confirm({title:`Make a disk of ${ctx.name}?`,body:`Its files in one compressed file, its spec and declaration as the metadata inside${st?', <b>and its data</b>':' (its data stays out)'}. Kept in COS's data, recorded in Versionium.`,act:'Make the disk'}))return;
  $('#make').disabled=true;$('#make').textContent='Making…';
  try{const r=await COS.call('POST',base,{withState:st,by:'person'});COS.notice('ok',`${r.file}: ${r.files} files, ${kb(r.bytes)}`);await load();}catch(e){if(!e.refused)COS.notice('err',e.message);}finally{$('#make').disabled=false;$('#make').textContent='Make a disk';}};
ctx.onState(()=>{});load();return{refresh:load};
