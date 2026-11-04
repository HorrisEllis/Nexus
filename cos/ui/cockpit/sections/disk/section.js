// cos/ui/cockpit/sections/disk/section.js — a system's disk (DK3, 0.60.382). James, 2026-11-02: "Cos is the wmware. The compartments are the
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
// DK8 0.60.383 — the virtual disk (qcow2): its files and all its data in one file, its snapshots inside; each act confirmed, by = person
const vb=`/api/cos/systems/${encodeURIComponent(ctx.name)}/vdisk`;const mb=(b)=>`${(b/1048576).toFixed(1)} MB`;
async function vact(op,body,title,text){if(!await COS.confirm({title,body:text+'<br><br>Through COS\'s manager, on its ledger, recorded in Versionium.',act:title.replace(/\?$/,'')}))return;
  try{await COS.call('POST',`${vb}/${op}`,{...body,by:'person'});COS.notice('ok',title.replace(/\?$/,'')+': done');}catch(e){if(!e.refused)COS.notice('err',e.message);}vload();}
async function vload(){let d;try{d=await COS.call('GET',vb);}catch(e){$('#vd').replaceChildren(h('p',{class:'why'},e.message));return;}
  if(!d.tools.ok){$('#vd-sum').textContent='';$('#vd').replaceChildren(h('p',{class:'why'},d.tools.why));return;}
  if(!d.disk){$('#vd-sum').textContent='none yet';$('#vd').replaceChildren(h('p',{class:'faint',style:'margin:0'},'One qcow2 file QEMU boots: this system\'s files and all its data in one ext4 filesystem, its spec as the metadata inside, its snapshots in the same file.'),
    h('div',{class:'row'},h('button',{class:'btn primary sm',id:'vd-make',onclick:()=>vact('make',{},`Make ${ctx.name}'s virtual disk?`,'Its files and all its data, with its spec as the metadata, in one qcow2.')},'Make the virtual disk')));return;}
  const k=d.disk;$('#vd-sum').textContent=`${k.file} · ${k.snapshots.length} snapshot${k.snapshots.length===1?'':'s'}`;
  $('#vd').replaceChildren(h('div',{class:'facts'},h('b',{},'Format'),h('span',{},`${k.format} · ext4 inside`),h('b',{},'Size'),h('span',{},`${mb(k.actualSize)} on disk, ${mb(k.virtualSize)} virtual`),
      h('b',{},'Holds'),h('span',{},`${k.metadata.fileCount} files · code ${k.metadata.layers.code.files}${k.metadata.layers.state?` · data ${k.metadata.layers.state.files}`:' · no data'}`),h('b',{},'Last written'),h('span',{},`${COS.ago(Date.parse(k.metadata.created))} by ${k.metadata.by}`)),
    h('div',{class:'row'},h('button',{class:'btn sm',id:'vd-refresh',onclick:()=>vact('refresh',{},`Refresh ${ctx.name}'s virtual disk?`,'Its current files and data written into the disk. Every snapshot inside is kept.')},'Refresh from the system'),
      h('button',{class:'btn sm',id:'vd-verify',onclick:async()=>{const v=(await COS.call('GET',`${vb}/verify`)).verify;const el=$('#vd-v');el.className=`v mono ${v.ok?'ok':'bad'}`;el.textContent=v.ok?`all ${v.files} files match`:`${v.changed.length} changed, ${v.missing.length} missing`;}},'Verify'),h('span',{class:'v mono',id:'vd-v'})),
    h('div',{class:'row'},h('input',{class:'input mono',id:'vd-tag',placeholder:'snapshot name',value:`snap-${new Date().toISOString().slice(0,10)}`}),h('button',{class:'btn primary sm',id:'vd-snap',onclick:()=>{const tag=$('#vd-tag').value.trim();vact('snapshot',{tag},`Take snapshot ${tag}?`,'The disk as it is now, kept inside it.');}},'Take snapshot')),
    h('ol',{class:'snaps',id:'vd-snaps'},...(k.snapshots.length?k.snapshots.map(s=>h('li',{'data-tag':s.tag},h('span',{},`${s.tag} · ${s.at?COS.ago(Date.parse(s.at)):''}${s.vmState?' · with its memory':''}`),
      h('button',{class:'btn sm',onclick:()=>vact('revert',{tag:s.tag},`Revert to ${s.tag}?`,'The disk goes back to this snapshot. The system\'s live folder is not changed until the disk is opened.')},'Revert'),
      h('button',{class:'btn sm danger',onclick:()=>vact('drop-snapshot',{tag:s.tag},`Drop snapshot ${s.tag}?`,'This snapshot is removed from the disk.')},'Drop'))):[h('li',{class:'faint'},'No snapshot yet.')])));}
ctx.onState(()=>{});vload();load();return{refresh:()=>{vload();load();}};
