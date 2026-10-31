// cos/ui/cockpit/sections/overview/section.js — the overview tab: run as a function of (root, COS, ctx). MG29, 0.60.336.
const $=(s)=>root.querySelector(s);const {h}=COS;
function facts(){const s=ctx.sys;if(!s)return;const f=(k,v)=>[h('dt',{},k),h('dd',{class:v==null||v===''?'none':''},v==null||v===''?'—':String(v))];
$('#at').textContent=`read ${COS.clock(Date.now())}`;
$('#facts').replaceChildren(...[['State',COS.stateLabel(s.state)],['Health',s.healthUrl],['Port',s.port&&`:${s.port}`],['PID',s.pid],['Started',s.startedAt&&`${new Date(s.startedAt).toLocaleString()} (${COS.ago(s.startedAt)})`],['Started by',s.by],
['Boot phase',s.onDemand?'on demand':s.bootPhase],['Critical',s.critical?'yes: may start down to the critical memory floor':'no'],['Restarts',`${s.restarts.count} · next wait ${COS.dur(s.restarts.backoffMs)}`],['Crashes, 5 min',s.crashesInWindow],
['Last exit',s.lastExit&&`code ${s.lastExit.code??'—'}${s.lastExit.signal?' · '+s.lastExit.signal:''} · ${COS.ago(s.lastExit.ts)}`],['Circuit',s.circuit.open?`open since ${COS.ago(s.circuit.openedAt)}: ${s.circuit.why}`:'closed'],['Last activity',s.lastActivity&&COS.ago(s.lastActivity)]].flatMap(([k,v])=>f(k,v)));}
async function mini(){try{const l=(await COS.call('GET',`/api/cos/ledger?system=${encodeURIComponent(ctx.name)}&limit=14`)).entries.reverse();
if(!l.length){$('#mini').replaceChildren(h('li',{class:'faint',style:'display:block'},'Nothing on the ledger for this system yet.'));return;}
$('#mini').replaceChildren(...l.map(e=>h('li',{},h('span',{class:'t'},COS.clock(e.ts)),h('span',{class:`k${/crash|circuit-open|refused/.test(e.kind)?' bad':''}`},e.kind),h('span',{class:'w'},`${e.why} · ${e.by}`))));}catch(e){$('#mini').replaceChildren(h('li',{style:'display:block',class:'faint'},e.message));}}
$('#all').onclick=(e)=>{e.preventDefault();COS.navigate(`#/ledger`);};
ctx.onState(facts);ctx.onLedger(mini);facts();mini();return{refresh(){facts();mini();}};
