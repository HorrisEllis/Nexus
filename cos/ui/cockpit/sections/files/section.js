// cos/ui/cockpit/sections/files/section.js — the files tab: run as a function of (root, COS, ctx). MG29, 0.60.337.
// SC18 (0.60.545) — James, 2026-11-15: "the files tab needs to be each systems entire compartment backend." It read data/<system> at the root
// only; now the system's whole folder (its code, spec, compartment file, data), through COS's route, with a reading pane. The same browser
// serves the Data tab (ctx.treeIn = 'data': its data folders, a table's newest rows). Read-only; a file named like a secret is not shown.
const $=(s)=>root.querySelector(s);const {h,icon}=COS;const IN=ctx.treeIn||'backend';let path=[];
const kb=(b)=>b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(1)} MB`;
const url=(p,extra)=>`/api/cos/systems/${encodeURIComponent(ctx.name)}/tree?in=${IN}&path=${encodeURIComponent(p.join('/'))}${extra||''}`;
function crumbs(p){$('#crumbs').replaceChildren(...[IN==='data'?'data folders':ctx.name,...p].flatMap((x,i)=>[i?h('span',{},'/'):null,h('a',{onclick:()=>open(p.slice(0,i))},x)]).filter(Boolean));}
async function open(p){path=p;crumbs(p);$('#view').replaceChildren();
  try{const r=await COS.call('GET',url(p));
    $('#where').textContent=r.folder||(r.roots?r.roots.map(x=>`${x.label}: ${x.exists?x.about:'not there'}`).join(' · '):'');
    if(r.none){$('#body').replaceChildren(h('div',{class:'note'},r.none));return;}
    if(!r.dirs.length&&!r.files.length){$('#body').replaceChildren(h('div',{class:'note'},'Empty.'));return;}
    const label=(d)=>{const x=(r.roots||[]).find(y=>y.id===d);return x?`${x.label} — ${x.about}`:d;};
    $('#body').replaceChildren(...r.dirs.map(d=>h('div',{class:'f d',onclick:()=>open([...p,d]),html:`${icon('folder')}<span>${COS.esc(label(d))}</span><span></span><span></span>`})),
      ...r.files.map(f=>h('div',{class:'f','data-file':f.name,onclick:(e)=>{root.querySelectorAll('.f.on').forEach(x=>x.classList.remove('on'));e.currentTarget.classList.add('on');read([...p,f.name]);},html:`${icon('file')}<span>${COS.esc(f.name)}</span><span class="s">${kb(f.bytes)}</span><span class="m">${COS.ago(f.mtime)}</span>`})));}
  catch(e){$('#body').replaceChildren(h('div',{class:'note'},e.message));}}
async function read(p){const v=$('#view');v.replaceChildren(h('div',{class:'note'},'reading…'));
  try{const r=await COS.call('GET',url(p,'&rows=60'));const head=h('div',{class:'head'},`${r.file.name} · ${kb(r.file.bytes)}${r.total!=null?` · ${r.total} rows, the newest ${r.rows.length}`:''}${r.cut?' · the first 200 KB':''}`);
    if(r.withheld){v.replaceChildren(head,h('div',{class:'note'},r.withheld));return;}
    if(r.rows){const data=r.rows.slice().reverse();const cols=[...new Set(data.flatMap(x=>Object.keys(x||{})))].slice(0,8);
      v.replaceChildren(head,data.length?h('table',{},h('thead',{},h('tr',{},...cols.map(c=>h('th',{},c)))),h('tbody',{},...data.map(x=>h('tr',{},...cols.map(c=>{const t=x==null?'':x[c];const s=t==null?'':typeof t==='object'?JSON.stringify(t):String(t);return h('td',{title:s.slice(0,2000)},s.slice(0,160));}))))):h('div',{class:'note'},'Empty.'));return;}
    v.replaceChildren(head,h('pre',{},r.text||''));}
  catch(e){v.replaceChildren(h('div',{class:'note'},e.message));}}
if(IN==='data')$('#title').textContent='Its data folders, read-only';
open(path);return{refresh(){open(path);}};
