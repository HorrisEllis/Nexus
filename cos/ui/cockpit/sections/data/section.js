// cos/ui/cockpit/sections/data/section.js — the data tab: run as a function of (root, COS, ctx). MG29, 0.60.336.
const $=(s)=>root.querySelector(s);const {h}=COS;
async function list(){try{const r=await COS.call('GET','/tables');if(r._legacy){$('#legacy').hidden=false;$('#legacy').title=r._legacy;}
$('#list').replaceChildren(...r.tables.map(t=>h('div',{class:'t',onclick:(e)=>{root.querySelectorAll('.t').forEach(x=>x.classList.remove('on'));e.currentTarget.classList.add('on');rows(t.name);}},h('span',{},t.name),h('span',{class:'n'},t.rows==null?'—':t.rows<0?'unreadable':String(t.rows)))));
$('#rows').replaceChildren(h('div',{class:'note'},`${r.tables.length} tables in ${r.dir}. Read from disk, so it answers even when the system holding the store is wedged.`));}
catch(e){$('#list').replaceChildren();$('#rows').replaceChildren(h('div',{class:'note'},e.message));}}
async function rows(n){try{const r=await COS.call('GET',`/tables/${encodeURIComponent(n)}?limit=60`);const data=r.rows||[r.data];if(!data.length){$('#rows').replaceChildren(h('div',{class:'note'},'Empty.'));return;}
const cols=[...new Set(data.flatMap(x=>Object.keys(x||{})))].slice(0,8);$('#rows').replaceChildren(h('div',{class:'note',style:'padding:12px 16px'},`${r.total??1} rows · the newest ${data.length}`),h('table',{},h('thead',{},h('tr',{},...cols.map(c=>h('th',{},c)))),h('tbody',{},...data.slice().reverse().map(x=>h('tr',{},...cols.map(c=>{const v=x[c];return h('td',{title:typeof v==='object'?JSON.stringify(v):String(v??'')},typeof v==='object'&&v?JSON.stringify(v):String(v??''));}))))));}
catch(e){$('#rows').replaceChildren(h('div',{class:'note'},e.message));}}
list();return{refresh:list};
