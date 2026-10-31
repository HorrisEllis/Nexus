// cos/ui/cockpit/sections/events/section.js — the events tab: run as a function of (root, COS, ctx). MG29, 0.60.336.
const $=(s)=>root.querySelector(s);const {h,icon}=COS;let path=[ctx.name];
async function open(p){path=p;crumbs();$('#body').replaceChildren(h('div',{class:'note'},'reading…'));
try{const r=await COS.call('GET',`/ledger/${p.map(encodeURIComponent).join('/')}`);
if(r.events){$('#body').replaceChildren(h('div',{class:'note'},`${r.total} events${r.corruptLines?` · ${r.corruptLines} unreadable lines, said`:''}; the newest ${r.returned}, newest first`),...r.events.slice().reverse().map(e=>h('div',{class:'ev'},h('span',{class:'t'},e.ts?COS.clock(e.ts):'—'),h('span',{class:'a'},[e.component,e.action].filter(Boolean).join(' · ')||e.type||'event'),h('span',{class:'d'},e.status?`${e.status}${e.detail?' · '+JSON.stringify(e.detail).slice(0,240):''}`:JSON.stringify(e).slice(0,280)))));return;}
const items=[...(r.dirs||r.hooks||r.systems||[]),...(r.days||r.files||[]).map(f=>typeof f==='string'?f:f.name)].map(x=>typeof x==='string'?x:x.name);
if(!items.length){$('#body').replaceChildren(h('div',{class:'note'},'Nothing recorded here.'));return;}
$('#body').replaceChildren(...items.map(n=>h('div',{class:'dir',onclick:()=>open([...p,n.replace(/\.jsonl$/,'')]),html:`${icon(/\d{4}-\d{2}-\d{2}/.test(n)?'clock':'folder')}<span>${COS.esc(n)}</span>`})));}
catch(e){$('#body').replaceChildren(h('div',{class:'note'},e.status===404?`${ctx.name} has written no component ledger yet (data/ledger/${p.join('/')}).`:e.message));}}
function crumbs(){$('#crumbs').replaceChildren(...path.flatMap((p,i)=>[i?h('span',{},'/'):null,h('a',{onclick:()=>open(path.slice(0,i+1))},p)]).filter(Boolean));}
open(path);return{refresh(){open(path);}};
