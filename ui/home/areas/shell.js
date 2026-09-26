'use strict';
// ui/home/areas/shell.js — Menu toggle + tune() channel switching.
// Split from ui/home/index.html (inline script, lines 900-972 at v0.39.227). Load order is set by index.html; do not reorder.
let curCh=0;
window.menuOpen=false;

function toggleMenu(){window.menuOpen=!window.menuOpen;document.getElementById('menu-overlay').classList.toggle('open',window.menuOpen);document.getElementById('menu-btn').classList.toggle('open',window.menuOpen);document.getElementById('top-bar').classList.toggle('open',window.menuOpen)}
window.toggleMenu=toggleMenu;
document.addEventListener('click',e=>{if(menuOpen&&!e.target.closest('#menu-overlay')&&!e.target.closest('#menu-btn'))toggleMenu()});

function tune(n){
  document.querySelectorAll('.ch').forEach(c=>c.classList.remove('active'));
  const chId = CH_META[n].id;
  document.getElementById(chId).classList.add('active');
  // §24.1: notify co-pilot of channel change for user model tracking
  curCh = n;
  const chName = CH_META[n]?.name || 'Unknown';
  // Post to co-pilot setCurrentChannel (via guardian server.js route)
  fetch(`${B.orch}/api/guardian/copilot/channel`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ channelId: chId, channelName: chName }),
  }).catch(()=>{});
  // §FIXED 2026-09-20 — was positional (i===n), assuming DOM order matches
  // CH_META order. True only while the rail was hand-typed in CH_META's
  // exact order; broken the moment channels became reorderable (James:
  // "make each channel movable, editable, removable"). Matched by
  // data-ch-id now, same fix §FIX-2026-06-20 already did for everything
  // else in this function, just missed this one line.
  document.querySelectorAll('.ch-btn').forEach(b=>b.classList.toggle('on',b.dataset.chId===chId));
  document.getElementById('ch-name').textContent=CH_META[n].name;
  document.getElementById('ch-accent').textContent=CH_META[n].accent;
  document.getElementById('menu-label').textContent=CH_META[n].name;
  curCh=n;
  // §FIX-2026-06-20: keyed by channel id, not array position — CH_META is
  // mutated at runtime (_injectAgentSuiteTab), so a positional `if(n===8)`
  // silently points at the wrong channel after any insertion before it.
  // This bit James for the new ChatGPT console; everything below is now
  // immune to it regardless of what gets added to CH_META later.
  if(chId==='ch-guardian'){gdLoadJobs();gdLoadProvs()}
  if(chId==='ch-cortex'){cxLoadGaps();cxLoadFails()}
  if(chId==='ch-idearium')idrLoad('createdAt');
  if(chId==='ch-bridge')brLoad();
  if(chId==='ch-diagnose'){
    // Load sovereign diagnostics UI from /ui/diagnostics/index.html
    let diagFrame=document.getElementById('diag-full-iframe');
    if(!diagFrame){
      const diagCh=document.getElementById('ch-diagnose');
      // Check if we need to inject the iframe (first time)
      if(diagCh && !diagCh.querySelector('iframe')){
        diagFrame=document.createElement('iframe');
        diagFrame.id='diag-full-iframe';
        diagFrame.src='/ui/diagnostics/index.html';
        diagFrame.style.cssText='width:100%;height:100%;border:none;background:#0a0a14';
        diagFrame.title='Diagnostics';
        diagCh.appendChild(diagFrame);
      }
    }
    buildDiag();runDiag();loadDiagCFR();loadDiagGaps()
  }
  if(chId==='ch-blueprint'){const f=document.getElementById('blueprint-iframe');if(f&&!f.src.endsWith('blueprint-builder/index.html'))f.src='/ui/blueprint-builder/index.html';}
  if(chId==='ch-orch-full'){const f=document.getElementById('orch-full-iframe');if(f&&!f.src.endsWith('/orchestrator'))f.src='/ui/orchestrator';}
  if(chId==='ch-gd-full'){const f=document.getElementById('gd-full-iframe');if(f&&!f.src.endsWith('/guardian'))f.src='/ui/guardian';}
  if(chId==='ch-cx-full'){const f=document.getElementById('cx-full-iframe');if(f&&!f.src.endsWith('/cortex'))f.src='/ui/cortex';}
  if(chId==='ch-idr-full'){const f=document.getElementById('idr-full-iframe');if(f&&!f.src.endsWith('/idearium'))f.src='/ui/idearium';}
  if(chId==='ch-br-full'){const f=document.getElementById('br-full-iframe');if(f&&!f.src.endsWith('/bridge'))f.src='/ui/bridge';}
  if(chId==='ch-chatgpt-agent'){const f=document.getElementById('chatgpt-agent-iframe');if(f&&!f.src.endsWith('agents/chatgpt/index.html'))f.src='/ui/agents/chatgpt/index.html';}
  if(chId==='ch-claude-agent'){const f=document.getElementById('claude-agent-iframe');if(f&&!f.src.endsWith('agents/claude/index.html'))f.src='/ui/agents/claude/index.html';}
  if(chId==='ch-mistral-agent'){const f=document.getElementById('mistral-agent-iframe');if(f&&!f.src.endsWith('agents/mistral/index.html'))f.src='/ui/agents/mistral/index.html';}
  if(chId==='ch-gemini-agent'){const f=document.getElementById('gemini-agent-iframe');if(f&&!f.src.endsWith('agents/gemini/index.html'))f.src='/ui/agents/gemini/index.html';}
  if(chId==='ch-perplexity-agent'){const f=document.getElementById('perplexity-agent-iframe');if(f&&!f.src.endsWith('agents/perplexity/index.html'))f.src='/ui/agents/perplexity/index.html';}
  if(chId==='ch-causal'){cgLoad();}
  if(chId==='ch-conversations'){convLoad();}
  if(chId==='ch-canvas'){const f=document.getElementById('canvas-iframe');if(f&&!f.src)f.src='http://127.0.0.1:3751/';}
  if(chId==='ch-emerge'){const f=document.getElementById('emerge-iframe');if(f&&!f.src)f.src='/ui/emerge-ide.html';}
}

