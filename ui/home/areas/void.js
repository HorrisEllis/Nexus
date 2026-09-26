'use strict';
// ui/home/areas/void.js — Layer 0 particle void (decorative canvas).
// Split from ui/home/index.html (inline script, lines 679-699 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Particle void ─────────────────────────────────────────────────────────────
const vc=document.getElementById('void'),vx=vc.getContext('2d');
let VW,VH,vpts=[],vt=0;
function vresize(){VW=vc.width=innerWidth;VH=vc.height=innerHeight}
class VP{constructor(){this.reset()}reset(){this.x=Math.random()*VW;this.y=Math.random()*VH;this.vx=(Math.random()-.5)*.25;this.vy=(Math.random()-.5)*.25;this.p=Math.random()*Math.PI*2;this.r=Math.random()*1.4+.3;this.h=[195,145,260,210][Math.floor(Math.random()*4)]}tick(){this.x+=this.vx;this.y+=this.vy;this.p+=.018;if(this.x<0||this.x>VW||this.y<0||this.y>VH)this.reset()}draw(){vx.beginPath();vx.arc(this.x,this.y,this.r,0,Math.PI*2);vx.fillStyle=`hsla(${this.h},70%,65%,${.06+Math.sin(this.p)*.05})`;vx.fill()}}
function vframe(){if(!vx)return;vt+=.01;vx.clearRect(0,0,VW,VH);for(let i=0;i<vpts.length;i++){for(let j=i+1;j<vpts.length;j++){const dx=vpts[i].x-vpts[j].x,dy=vpts[i].y-vpts[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d<130){vx.beginPath();vx.moveTo(vpts[i].x,vpts[i].y);vx.lineTo(vpts[j].x,vpts[j].y);vx.strokeStyle=`rgba(120,140,200,${(1-d/130)*.05})`;vx.lineWidth=.4;vx.stroke()}}vpts[i].tick();vpts[i].draw()}requestAnimationFrame(vframe)}
// §FIX 2026-06-21: this whole block is a purely decorative background
// animation. It was previously the single most dangerous line in the file —
// vframe() runs SYNCHRONOUSLY on this first call (not inside a rAF/timeout
// yet), and vx.clearRect() on a null context (vx is null whenever
// getContext('2d') fails — common in privacy-hardened browsers, ad-blockers,
// and fingerprint-protection extensions that stub out canvas) throws
// uncaught, which halts ALL subsequent top-level script execution in this
// single inline <script> tag. Confirmed by reproduction: toggleConsoleFullscreen,
// toggleMenu, and everything else declared after this point in source order
// silently failed to finish initializing when this threw. try/catch here is
// not decorative — it's the one thing standing between "background sparkle
// effect is missing" and "half the page's JS never runs."
try { vresize();window.addEventListener('resize',vresize);for(let i=0;i<70;i++)vpts.push(new VP());vframe(); }
catch(e) { console.warn('[nexus-ui] background effect disabled (canvas unavailable): ' + e.message); }

