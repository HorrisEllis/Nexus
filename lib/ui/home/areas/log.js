'use strict';
// ui/home/areas/log.js — Log channel: live event stream.
// Split from ui/home/index.html (inline script, lines 1330-1364 at v0.39.227). Load order is set by index.html; do not reorder.
function addEvent(d){
  evCount++;
  const type=d.type||d.event||'';
  if (type === 'system.contract.verified') {
    const sid = d.systemId || d.system || '';
    _verifiedSystems[sid] = { trust: d.trust, hash: d.hash, ts: Date.now() };
    const sysEntry = SYSTEMS.find(s => s.key === (CONTRACT_KEY_MAP[sid] || sid));
    const tile = sysEntry && document.getElementById(sysEntry.tileId);
    if (tile) tile.style.boxShadow = d.trust === 'VERIFIED' ? '0 0 0 1px rgba(0,255,136,.35) inset' : '0 0 0 1px rgba(255,170,0,.35) inset';
  }
  const src=d.source||d.system||'';
  flashDot(src||type.split('.')[0]);  // flash the source system's dot + tile icon
  const ts=new Date(d.ts||Date.now()).toISOString().substr(11,8);
  document.getElementById('ticker-line').textContent=`${ts} · ${src||type} · ${type}`;
  const srcF=logSrcFilter_||document.getElementById('log-src-filter')?.value||'';
  if((!logFilter_||type.includes(logFilter_)||src.includes(logFilter_))&&(!srcF||src.includes(srcF)||type.includes(srcF))){
    const stream=document.getElementById('log-stream');
    if(!stream)return;
    const row=document.createElement('div');row.className='ll';
    row.innerHTML=`<span class="ll-ts">${ts}</span><span class="ll-src">${src}</span><span class="ll-msg">${type}</span>`;
    stream.prepend(row);
    if(stream.children.length>500)stream.removeChild(stream.lastChild);
  }
}
function addCxEvent(d){
  const el=document.getElementById('cx-events-el');if(!el)return;
  evCount++;document.getElementById('cx-ev-count').textContent=evCount;
  const ts=new Date(d.ts||Date.now()).toISOString().substr(11,8);
  const row=document.createElement('div');row.className='evt-row';
  row.innerHTML=`<span class="ev-ts">${ts}</span><span class="ev-src">${d.source||d.system||''}</span><span class="ev-type">${d.type||''}</span>`;
  el.prepend(row);if(el.children.length>100)el.removeChild(el.lastChild);
}
function logFilter(v){logFilter_=v.toLowerCase()}
function clearLog(){document.getElementById('log-stream').innerHTML='';evCount=0}

