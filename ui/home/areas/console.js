'use strict';
// ui/home/areas/console.js — Fullscreen system console (#bot-bar).
// Split from ui/home/index.html (inline script, lines 1020-1057 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Fullscreen system console ────────────────────────────────────────────────
// §FIX 2026-06-21: #bot-bar lives inside #menu-overlay, which gets
// transform:translateX(-50%) when .open — per CSS spec, a transformed
// ancestor becomes the containing block for any position:fixed descendant.
// So #bot-bar.fullscreen's "position:fixed; inset:16px" was resolving
// against #menu-overlay's own small box, not the real viewport — clicking
// fullscreen visually did almost nothing. Confirmed via direct measurement
// (forcing the class without any click/JS path produced a ~132px-tall box,
// not a near-viewport one). Fix: relocate #bot-bar to be a direct child of
// <body> while fullscreen — a real sibling of every transformed ancestor,
// so position:fixed resolves against the actual viewport — then restore it
// to its original DOM position (via a marker comment node, not an assumed
// parent) on exit.
let _botBarHomeMarker = null; // Comment node marking #bot-bar's real position in the DOM
function toggleConsoleFullscreen(){
  const bar=document.getElementById('bot-bar');
  const goingFullscreen=!bar.classList.contains('fullscreen');

  if(goingFullscreen){
    // Leave a marker where #bot-bar currently lives so exiting can put it
    // back exactly, regardless of what #menu-overlay's own state does
    // in between (don't assume parentElement is still #menu-overlay later).
    _botBarHomeMarker=document.createComment('bot-bar-home');
    bar.parentNode.insertBefore(_botBarHomeMarker, bar);
    document.body.appendChild(bar);
  } else if(_botBarHomeMarker && _botBarHomeMarker.parentNode){
    _botBarHomeMarker.parentNode.insertBefore(bar, _botBarHomeMarker);
    _botBarHomeMarker.parentNode.removeChild(_botBarHomeMarker);
    _botBarHomeMarker=null;
  }

  bar.classList.toggle('fullscreen',goingFullscreen);
  if(goingFullscreen){
    document.getElementById('assistant-out').style.display='block';
    document.getElementById('assistant-in').focus();
  }
}
window.toggleConsoleFullscreen=toggleConsoleFullscreen;
