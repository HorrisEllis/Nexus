// cos/ui/cockpit/sections/logs/section.js — the logs tab: run as a function of (root, COS, ctx). MG29, 0.60.336.
const $=(s)=>root.querySelector(s);const {h}=COS;let lines=[],follow=true,errOnly=false,q='';
async function load(){try{lines=(await COS.call('GET',`/api/cos/systems/${encodeURIComponent(ctx.name)}/logs?limit=400`)).lines;render();}catch(e){$('#out').textContent=e.message;}}
function render(){const list=lines.filter(l=>(!errOnly||l.stream==='err')&&(!q||l.line.toLowerCase().includes(q)));$('#n').textContent=`${list.length} lines · read every 2 s`;
if(!lines.length){$('#out').replaceChildren(h('span',{class:'empty'},ctx.sys&&ctx.sys.pid?'It has written nothing since COS started it.':'Not running: the last 400 lines it wrote under COS are kept here once it runs.'));return;}
$('#out').replaceChildren(...list.map(l=>h('span',{class:`l${l.stream==='err'?' err':''}`},h('span',{class:'t'},COS.clock(l.ts)),l.line)));if(follow)$('#out').scrollTop=$('#out').scrollHeight;}
$('#q').oninput=(e)=>{q=e.target.value.toLowerCase();render();};$('#follow').onclick=(e)=>{follow=!follow;e.currentTarget.setAttribute('aria-pressed',String(follow));render();};
$('#err').onclick=(e)=>{errOnly=!errOnly;e.currentTarget.setAttribute('aria-pressed',String(errOnly));render();};
const t=setInterval(()=>{if(root.host.classList.contains('on'))load();},2000);load();return{refresh:load,stop(){clearInterval(t);}};
