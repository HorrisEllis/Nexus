'use strict';
// ui/home/core/keys.js — Global keyboard shortcuts.
// Split from ui/home/index.html (inline script, lines 1058-1072 at v0.39.227). Load order is set by index.html; do not reorder.

document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  if(e.key==='ArrowLeft'||e.key==='[')tune(Math.max(0,curCh-1));
  if(e.key==='ArrowRight'||e.key===']')tune(Math.min(CH_META.length-1,curCh+1));
  if(e.key>='1'&&e.key<='7')tune(parseInt(e.key)-1);
  if(e.key==='m'||e.key==='M')toggleMenu();
  if(e.key==='Escape'&&document.getElementById('bot-bar').classList.contains('fullscreen')){toggleConsoleFullscreen();return}
  if(e.key==='Escape'&&document.getElementById('inspect-overlay').classList.contains('open')){closeInspect();return}
  if(e.key==='Escape'&&menuOpen)toggleMenu();
  if(e.key==='Escape')closeModeSelector();
  if((e.key==='r'||e.key==='R')&&!menuOpen)openRewind();
  if((e.key==='i'||e.key==='I')&&!menuOpen)openInspect();
});

