// cos/ui/cockpit/sections/files/section.js — the files tab: run as a function of (root, COS, ctx). MG29, 0.60.336.
const $=(s)=>root.querySelector(s);const {h,icon}=COS;let path=[ctx.name];const kb=(b)=>b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(1)} MB`;
async function open(p){path=p;$('#crumbs').replaceChildren(...['data',...p].flatMap((x,i)=>[i?h('span',{},'/'):null,i?h('a',{onclick:()=>open(p.slice(0,i))},x):h('span',{},x)]).filter(Boolean));
try{const r=await COS.call('GET',`/files/${p.map(encodeURIComponent).join('/')}`);
if(!r.dirs.length&&!r.files.length){$('#body').replaceChildren(h('div',{class:'note'},'Empty.'));return;}
$('#body').replaceChildren(...r.dirs.map(d=>h('div',{class:'f d',onclick:()=>open([...p,d]),html:`${icon('folder')}<span>${COS.esc(d)}</span><span></span><span></span>`})),
...r.files.map(f=>h('div',{class:'f',html:`${icon('file')}<span>${COS.esc(f.name)}</span><span class="s">${kb(f.bytes)}</span><span class="m">${COS.ago(f.mtime)}</span>`})));}
catch(e){$('#body').replaceChildren(h('div',{class:'note'},e.status===404?`There is no data/${p.join('/')} on disk.`:e.message));}}
open(path);return{refresh(){open(path);}};
