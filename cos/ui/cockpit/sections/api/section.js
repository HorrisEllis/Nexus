// cos/ui/cockpit/sections/api/section.js — the api tab: run as a function of (root, COS, ctx). MG29, 0.60.336.
const $=(s)=>root.querySelector(s);const {h}=COS;
async function load(){$('#src').textContent=`GET /contract on ${ctx.name}, through the door`;
try{const c=await COS.call('GET',`/contract-map/${encodeURIComponent(ctx.name)}`);const routes=c.routes||(c.contract&&c.contract.routes)||c.endpoints||null;
if(Array.isArray(routes)&&routes.length){$('#body').replaceChildren(...routes.map(r=>{const m=(r.method||String(r).split(' ')[0]||'GET').toUpperCase();const p=r.path||r.route||String(r).split(' ').slice(1).join(' ');return h('div',{class:'r'},h('span',{class:`m ${m.toLowerCase()}`},m),h('span',{class:'p'},`${p}${r.about?'  — '+r.about:''}`));}));return;}
const {_legacy,...rest}=c;$('#body').replaceChildren(h('pre',{class:'raw'},JSON.stringify(rest,null,2)));}
catch(e){$('#body').replaceChildren(h('div',{class:'note'},`${ctx.name}'s contract could not be read: ${e.message}`));}}
load();return{refresh:load};
