// cos/ui/cockpit/sections/tests/section.js — the tests tab: run as a function of (root, COS, ctx). MG29, 0.60.336.
const $=(s)=>root.querySelector(s);const {h}=COS;
$('#body').replaceChildren(h('p',{class:'note'},`Runs Nexus's real test runner filtered to ${ctx.name} (one run at a time on this machine), sandboxed so it cannot touch live data. It can take minutes.`));
$('#run').onclick=async()=>{if(!await COS.confirm({title:`Run ${ctx.name}'s tests?`,body:'The real runner, filtered to this system. One run at a time; it can take minutes.',act:'Run'}))return;
$('#run').disabled=true;$('#body').replaceChildren(h('p',{class:'note'},'running…'));
try{const r=await COS.call('POST',`/run-tests/${encodeURIComponent(ctx.name)}`,{by:'person'});const ok=r.ok!==false&&!r.failed;
$('#body').replaceChildren(h('div',{class:`verdict ${ok?'ok':'bad'}`},ok?'Passed':'Failed',h('span',{class:'mono faint',style:'font-weight:400;font-size:12px'},[r.passed!=null?`${r.passed} passed`:'',r.failed!=null?`${r.failed} failed`:'',r.durationMs?COS.dur(r.durationMs):''].filter(Boolean).join(' · '))),h('pre',{},r.tail||r.output||JSON.stringify(r,null,2)));}
catch(e){$('#body').replaceChildren(h('div',{class:'verdict bad'},'Could not run'),h('pre',{},e.message));}finally{$('#run').disabled=false;}};return{};
