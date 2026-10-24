'use strict';
// ui/home/areas/inspect.js — Inspect overlay: contextual diagnostics for the active channel.
// Split from ui/home/index.html (inline script, lines 973-1019 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Inspect overlay — contextual diagnostics for whatever channel is active ──
// Maps CH_META index -> { dotId (its live status dot), srcMatch (for
// filtering recent log rows), reload (re-fetch that channel's data) }.
// null fields mean "this channel has no single backing system" (Overview,
// Log, Diagnose, Blueprint aren't 1:1 with a system dot).
const CH_INSPECT=[
  {dotId:null,    srcMatch:'',         reload:null},
  {dotId:'sd-gd', srcMatch:'guardian', reload:()=>{gdLoadJobs();gdLoadProvs()}},
  {dotId:'sd-cx', srcMatch:'cortex',   reload:()=>{cxLoadGaps();cxLoadFails()}},
  {dotId:'sd-idr',srcMatch:'idearium', reload:()=>idrLoad()},
  {dotId:'sd-br', srcMatch:'bridge',   reload:()=>brLoad()},
  {dotId:null,    srcMatch:'',         reload:()=>clearLog()},
  {dotId:null,    srcMatch:'',         reload:()=>{buildDiag();runDiag();loadDiagCFR();loadDiagGaps()}},
  {dotId:null,    srcMatch:'',         reload:()=>{const f=document.getElementById('blueprint-iframe');if(f&&f.src)f.src=f.src}},
  {dotId:null,    srcMatch:'orchestrator', reload:()=>{const f=document.getElementById('orch-full-iframe');if(f&&f.src)f.src=f.src}},
  {dotId:'sd-gd', srcMatch:'guardian', reload:()=>{const f=document.getElementById('gd-full-iframe');if(f&&f.src)f.src=f.src}},
  {dotId:'sd-cx', srcMatch:'cortex',   reload:()=>{const f=document.getElementById('cx-full-iframe');if(f&&f.src)f.src=f.src}},
  {dotId:'sd-idr',srcMatch:'idearium', reload:()=>{const f=document.getElementById('idr-full-iframe');if(f&&f.src)f.src=f.src}},
  {dotId:'sd-br', srcMatch:'bridge',   reload:()=>{const f=document.getElementById('br-full-iframe');if(f&&f.src)f.src=f.src}},
  {dotId:null,    srcMatch:'chatgpt',  reload:()=>{const f=document.getElementById('chatgpt-agent-iframe');if(f&&f.src)f.src=f.src}},
];

function openInspect(){
  const meta=CH_META[curCh],info=CH_INSPECT[curCh];
  if(!info){console.warn(`openInspect: no CH_INSPECT entry for channel ${curCh} (${meta?.id})`);return;}
  document.getElementById('insp-name').textContent=meta.name;
  document.getElementById('insp-accent').textContent=meta.accent;
  const dotEl=info.dotId?document.getElementById(info.dotId):null;
  const statusDot=document.getElementById('insp-dot'),statusText=document.getElementById('insp-status-text');
  if(dotEl){
    const isErr=dotEl.classList.contains('err'),isOn=dotEl.classList.contains('on');
    statusDot.className='dot'+(isErr?' err':isOn?' on':'');
    statusText.textContent=isErr?'error':isOn?'online':'offline / unknown';
  }else{
    statusDot.className='dot';
    statusText.textContent='n/a — this channel has no single backing system';
  }
  const rows=Array.from(document.querySelectorAll('#log-stream .ll'));
  const filtered=info.srcMatch?rows.filter(r=>r.querySelector('.ll-src')?.textContent?.toLowerCase().includes(info.srcMatch)):rows;
  const logEl=document.getElementById('insp-log');
  logEl.textContent=filtered.length?filtered.slice(0,8).map(r=>r.textContent).join('\n'):'No recent events for this channel yet.';
  document.getElementById('insp-reload').style.display=info.reload?'':'none';
  document.getElementById('inspect-overlay').classList.add('open');
}
function closeInspect(){document.getElementById('inspect-overlay').classList.remove('open')}
function inspectReload(){const info=CH_INSPECT[curCh];if(info&&info.reload)info.reload()}

