/* ═══════════════════════════════════════════════════════════
   ERAVOS MOD FACTORY  v3.0.0
   Spawns any registered mod with its UI projection.
   Engine first — UI last.
   ═══════════════════════════════════════════════════════════ */

window.ModFactory = (() => {
'use strict';

/* ── Scoped publish ─────────────────────────────────────────
   _pub is a module-level stub. The real scoped version is
   passed into each buildUI as scopedPub and captured in
   event handler closures at build time.
   We override the module-level _pub during buildUI execution
   so the shared helpers (mkKnob etc) also use the right scope.
   Event handlers close over the scoped version permanently.  */
let _pub = (topic, payload) => KERNEL.bus.publish(topic, payload);


/* ── Shared control helpers ─────────────────────────────── */
function mkKnob(parent, opts) {
  const { label, min, max, value, unit='', step=0.01, onChange, eventKey, pub } = opts;
  const _pubFn = pub || _pub;
  const pct = (value - min) / (max - min);
  const deg = -145 + pct * 290;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;cursor:ns-resize;';
  const knob = document.createElement('div');
  knob.style.cssText = 'width:36px;height:36px;border-radius:50%;border:2px solid var(--b3);background:radial-gradient(circle at 35% 35%,var(--bg3),var(--bg1));position:relative;transition:border-color .12s;';
  const dot = document.createElement('div');
  dot.style.cssText = `position:absolute;width:2.5px;height:8px;background:var(--accent);border-radius:2px;top:4px;left:50%;transform-origin:bottom center;transform:translateX(-50%) rotate(${deg}deg);pointer-events:none;`;
  knob.appendChild(dot);
  const valEl = document.createElement('div'); valEl.style.cssText='font-family:var(--mono);font-size:6px;color:var(--dim2);min-width:30px;text-align:center;';
  const lblEl = document.createElement('div'); lblEl.style.cssText='font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;text-align:center;';
  valEl.textContent = _fmt(value, unit, step);
  lblEl.textContent = label;
  knob.addEventListener('mouseenter', () => knob.style.borderColor='var(--accent)');
  knob.addEventListener('mouseleave', () => knob.style.borderColor='var(--b3)');
  let _d=false, _sy=0, _sv=value, cur=value;
  knob.addEventListener('pointerdown', e=>{_d=true;_sy=e.clientY;_sv=cur;knob.setPointerCapture(e.pointerId);e.preventDefault();});
  knob.addEventListener('pointermove', e=>{
    if(!_d) return;
    cur = Math.max(min, Math.min(max, _sv + (_sy-e.clientY)/150*(max-min)));
    const p=(cur-min)/(max-min);
    dot.style.transform=`translateX(-50%) rotate(${-145+p*290}deg)`;
    valEl.textContent=_fmt(cur,unit,step);
    if(onChange) onChange(cur);
    if(eventKey) _pubFn('ui:config_change',{key:eventKey,value:cur});
  });
  knob.addEventListener('pointerup',()=>_d=false);
  wrap.appendChild(knob); wrap.appendChild(valEl); wrap.appendChild(lblEl);
  parent.appendChild(wrap);
  return { el:wrap, get value(){return cur;} };
}

function mkToggle(parent, opts) {
  const { label, value=false, onChange, eventKey, pub } = opts;
  const _pubFn = pub || _pub;
  const el  = document.createElement('div');
  el.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:3px;border:1px solid ${value?'var(--accent)':'var(--b2)'};background:${value?'rgba(0,255,136,.07)':'transparent'};cursor:pointer;transition:all .12s;`;
  const led = document.createElement('div'); led.style.cssText=`width:6px;height:6px;border-radius:50%;background:${value?'var(--accent)':'var(--dim)'};flex-shrink:0;transition:background .12s,box-shadow .12s;${value?'box-shadow:0 0 5px var(--accent);':''}`;
  const lbl = document.createElement('div'); lbl.style.cssText='font-family:var(--mono);font-size:7.5px;letter-spacing:.1em;color:var(--dim2);';
  lbl.textContent = label;
  el.appendChild(led); el.appendChild(lbl);
  let cur = value;
  el.addEventListener('click', () => {
    cur = !cur;
    el.style.borderColor = cur ? 'var(--accent)' : 'var(--b2)';
    el.style.background  = cur ? 'rgba(0,255,136,.07)' : 'transparent';
    led.style.background = cur ? 'var(--accent)' : 'var(--dim)';
    led.style.boxShadow  = cur ? '0 0 5px var(--accent)' : '';
    lbl.style.color      = cur ? 'var(--accent)' : 'var(--dim2)';
    if(onChange) onChange(cur);
    if(eventKey) _pubFn('ui:config_change',{key:eventKey,value:cur});
  });
  parent.appendChild(el);
  return { el, get value(){return cur;} };
}

function mkSelect(parent, opts) {
  const { label, options, value, onChange, eventKey, pub } = opts;
  const _pubFn = pub || _pub;
  const row = document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:6px;';
  const lbl = document.createElement('div'); lbl.style.cssText='font-family:var(--mono);font-size:7px;letter-spacing:.09em;color:var(--dim2);min-width:34px;flex-shrink:0;'; lbl.textContent=label;
  const sel = document.createElement('select'); sel.style.cssText='flex:1;background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:8px;padding:3px 5px;outline:none;cursor:pointer;';
  options.forEach(o => {
    const opt = document.createElement('option'); opt.value=o.v||o; opt.textContent=o.l||o;
    if((o.v||o)===value) opt.selected=true; sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    if(onChange) onChange(sel.value);
    if(eventKey) _pubFn('ui:config_change',{key:eventKey,value:sel.value});
  });
  row.appendChild(lbl); row.appendChild(sel);
  parent.appendChild(row);
  return sel;
}

function mkDiv(parent) {
  const d=document.createElement('div'); d.style.cssText='height:1px;background:var(--b1);margin:3px 0;flex-shrink:0;'; parent.appendChild(d);
}

function mkScope(parent, { height=48, color='rgba(0,255,136,.4)', label } = {}) {
  if(label){ const l=document.createElement('div'); l.style.cssText='font-family:var(--mono);font-size:6.5px;color:var(--dim);margin-bottom:2px;'; l.textContent=label; parent.appendChild(l); }
  const scope=document.createElement('div'); scope.style.cssText=`width:100%;height:${height}px;border-radius:4px;background:var(--bg2);border:1px solid var(--b1);overflow:hidden;position:relative;flex-shrink:0;`;
  const cvs=document.createElement('canvas'); cvs.width=200; cvs.height=height; cvs.style.cssText='position:absolute;inset:0;width:100%;height:100%;';
  scope.appendChild(cvs); parent.appendChild(scope);
  const ctx=cvs.getContext('2d'); let ph=0;
  function draw(){ requestAnimationFrame(draw); ctx.clearRect(0,0,200,height); ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.beginPath(); for(let x=0;x<200;x++){const y=height/2+Math.sin(x*.08+ph)*Math.sin(x*.033+ph*.5)*(height*.3); x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke(); ph+=.04; }
  draw();
  return scope;
}

function mkWave(parent, { height=54, color='rgba(170,68,255,.7)' } = {}) {
  const wrap=document.createElement('div'); wrap.style.cssText=`width:100%;height:${height}px;border-radius:4px;background:var(--bg2);border:1px solid var(--b1);overflow:hidden;position:relative;flex-shrink:0;cursor:pointer;`;
  const cvs=document.createElement('canvas'); cvs.width=200; cvs.height=height; cvs.style.cssText='position:absolute;inset:0;width:100%;height:100%;';
  const ph=document.createElement('div'); ph.style.cssText='position:absolute;top:0;bottom:0;width:1.5px;background:var(--accent);pointer-events:none;left:0;';
  wrap.appendChild(cvs); wrap.appendChild(ph);
  parent.appendChild(wrap);
  return {
    el: wrap, cvs, ph,
    draw(peaks) {
      const ctx=cvs.getContext('2d'); ctx.clearRect(0,0,200,height);
      ctx.strokeStyle=color; ctx.lineWidth=1; ctx.beginPath();
      peaks.forEach((v,i)=>{ const h2=v*height*.45; ctx.moveTo(i/peaks.length*200,height/2-h2); ctx.lineTo(i/peaks.length*200,height/2+h2); });
      ctx.stroke();
    },
    setHead(norm) { ph.style.left=(norm*100)+'%'; },
  };
}

function _fmt(v, unit, step) {
  const n = step >= 1 ? Math.round(v) : +v.toFixed(2);
  return unit ? `${n}${unit}` : `${n}`;
}

function mkBtn(parent, label, onClick, opts={}) {
  const b=document.createElement('button');
  b.textContent=label; b.title=opts.title||'';
  b.style.cssText=`height:${opts.h||20}px;padding:0 ${opts.px||7}px;border-radius:3px;border:1px solid var(--b2);background:transparent;color:var(--dim2);font-family:var(--mono);font-size:${opts.fs||7}px;letter-spacing:.08em;cursor:pointer;transition:all .12s;outline:none;flex-shrink:0;`;
  b.addEventListener('mouseenter',()=>{b.style.borderColor='var(--accent)';b.style.color='var(--accent)';});
  b.addEventListener('mouseleave',()=>{if(!b.dataset.on){b.style.borderColor='var(--b2)';b.style.color='var(--dim2)';}});
  b.addEventListener('click',onClick);
  if(parent) parent.appendChild(b);
  return b;
}

/* ── Mod definitions ──────────────────────────────── */

const DEFS = {};

function reg(id, def) { DEFS[id] = { id, ...def }; }

/* ═══════════════════════════════════════════════════════
   DRUM MACHINE
═══════════════════════════════════════════════════════ */
reg('pads', {
  category:'Audio — Drums', summary:'Eight-pad sample-trigger drum machine with per-pad pitch and decay.', needs:[],
  label:'Drum Machine', icon:'🥁', accent:'#00ff88',
  width:290, height:500, minWidth:230, minHeight:360,
  mountEngine(instanceId, intakeResult, sBus) {
    PadsMod.mount(instanceId, sBus, KERNEL.audio, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const root=document.createElement('div'); root.style.cssText='display:flex;flex-direction:column;height:100%;';
    const bankBar=document.createElement('div'); bankBar.style.cssText='display:flex;gap:3px;padding:6px 8px;border-bottom:1px solid var(--b1);flex-shrink:0;';
    const grid=document.createElement('div'); grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:8px;';
    const qa=document.createElement('div'); qa.style.cssText='padding:6px 8px;border-top:1px solid var(--b1);flex-shrink:0;';
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:6px;justify-content:center;padding:4px 8px 8px;border-top:1px solid var(--b1);flex-shrink:0;';

    root.appendChild(bankBar); root.appendChild(grid); root.appendChild(qa); root.appendChild(kRow);
    content.appendChild(root);

    let curBank=0, selIdx=null, state={bank:0, pads:[], config:{}, voiceNames:[]};

    /* Bank buttons */
    ['A','B','C'].forEach((id,i)=>{
      const btn=document.createElement('button'); btn.textContent=id;
      btn.style.cssText='flex:1;height:20px;border-radius:3px;border:1px solid var(--b2);background:transparent;color:var(--dim);font-family:var(--orb);font-size:7.5px;font-weight:700;letter-spacing:.14em;cursor:pointer;transition:all .12s;outline:none;';
      btn.addEventListener('click',()=>_pub('ui:bank_select',{bank:i}));
      bankBar.appendChild(btn);
    });

    function renderPads(pads) {
      grid.innerHTML='';
      pads.forEach((pad,i)=>{
        const cell=document.createElement('div');
        cell.style.cssText=`aspect-ratio:1;border-radius:5px;border:1px solid var(--b2);background:var(--bg2);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;transition:border-color .08s,transform .06s;`;
        cell.innerHTML=`<div style="font-family:var(--mono);font-size:6px;color:rgba(255,255,255,.15);z-index:1;">${i+1}</div><div style="font-family:var(--raj);font-size:8px;font-weight:700;color:rgba(255,255,255,.5);z-index:1;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pad.sound.toUpperCase()}</div><div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:${pad.color};opacity:.3;"></div><div class="flash" style="position:absolute;inset:0;background:${pad.color};opacity:0;transition:opacity .07s;border-radius:5px;"></div>`;
        cell.addEventListener('mouseenter',()=>{cell.style.borderColor=pad.color;cell.style.transform='scale(.97)';});
        cell.addEventListener('mouseleave',()=>{cell.style.borderColor='var(--b2)';cell.style.transform='';});
        cell.addEventListener('pointerdown',()=>{
          KERNEL.audio.boot();
          selIdx=i; renderQA(pads);
          _pub('ui:pad_press',{index:i,velocity:0.9});
        });
        cell.dataset.padIdx=i;
        grid.appendChild(cell);
      });
    }

    function litPad(index, color) {
      const cell=grid.querySelector(`[data-pad-idx="${index}"]`);
      if(!cell) return;
      const flash=cell.querySelector('.flash');
      if(flash){ flash.style.opacity='.35'; setTimeout(()=>flash.style.opacity='0',140); }
      cell.style.transform='scale(.91)'; setTimeout(()=>cell.style.transform='',120);
    }

    function renderQA(pads) {
      qa.innerHTML='';
      if(selIdx===null||!pads[selIdx]) return;
      const pad=pads[selIdx];
      const row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:5px;';
      const lbl=document.createElement('div'); lbl.style.cssText='font-family:var(--raj);font-size:8px;font-weight:600;color:var(--dim2);min-width:36px;'; lbl.textContent=`PAD ${selIdx+1}`;
      const sel=document.createElement('select'); sel.style.cssText='flex:1;background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:8px;padding:2px 4px;outline:none;';
      (state.voiceNames.length?state.voiceNames:['kick','snare','hat','clap','808','rim','reese','wobble','acid','stab','openhat','crash','laser','glitch','noise','riser','drone','scream','vinyl']).forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;if(n===pad.sound)o.selected=true;sel.appendChild(o);});
      sel.addEventListener('change',()=>_pub('ui:pad_assign',{index:selIdx,sound:sel.value}));
      const swatch=document.createElement('div'); swatch.style.cssText='width:24px;height:20px;border-radius:3px;border:1px solid var(--b2);overflow:hidden;flex-shrink:0;cursor:pointer;';
      const ci=document.createElement('input'); ci.type='color'; ci.value=pad.color; ci.style.cssText='width:200%;height:200%;margin:-25%;border:none;cursor:pointer;';
      ci.addEventListener('input',()=>_pub('ui:pad_assign',{index:selIdx,color:ci.value}));
      swatch.appendChild(ci);
      row.appendChild(lbl); row.appendChild(sel); row.appendChild(swatch); qa.appendChild(row);
    }

    /* Knobs */
    mkKnob(kRow,{label:'VOL',  min:0,  max:1,   value:.88,step:.01,unit:'',    eventKey:'volume',pub:_pub});
    mkKnob(kRow,{label:'PITCH',min:-12,max:12,  value:0,  step:1,  unit:'st',  eventKey:'pitch',pub:_pub});
    mkKnob(kRow,{label:'DECAY',min:.01,max:2,   value:.3, step:.01,unit:'s',   eventKey:'decay',pub:_pub});

    /* State sync from engine */
    sBus.subscribe('org:state_sync', d=>{
      state={...state,...d};
      if(d.pads){ renderPads(d.pads); if(selIdx!==null) renderQA(d.pads); }
      if(d.bank!==undefined){ Array.from(bankBar.children).forEach((b,i)=>{ const on=i===d.bank; b.style.color=on?'var(--accent)':'var(--dim)'; b.style.borderColor=on?'var(--accent)':'var(--b2)'; b.style.background=on?'rgba(0,255,136,.07)':'transparent'; }); }
      if(d.voiceNames) state.voiceNames=d.voiceNames;
    });
    sBus.subscribe('org:pad_lit', ({index,color})=>litPad(index,color));
  },
});

/* ═══════════════════════════════════════════════════════
   SEQUENCER
═══════════════════════════════════════════════════════ */
reg('sequencer', {
  category:'Audio — Sequencing', summary:'Step sequencer driving pads and synths over the shared clock.', needs:[],
  label:'Sequencer', icon:'⬛', accent:'#00d4ff',
  width:600, height:440, minWidth:420, minHeight:280,
  mountEngine(instanceId, intakeResult, sBus) {
    SequencerMod.mount(instanceId, sBus, KERNEL.audio, KERNEL.clock, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;';

    /* Header */
    const hdr=document.createElement('div'); hdr.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--b1);flex-shrink:0;background:var(--bg2);flex-wrap:wrap;';
    let playing=false;
    const btnPlay=mkBtn(null,'▶',()=>_pub('ui:play_press',{}));
    const btnRand=mkBtn(null,'RAND',()=>_pub('ui:randomize',{}));
    const btnClr =mkBtn(null,'CLR', ()=>_pub('ui:clear_pattern',{}));
    const bpmEl=document.createElement('div'); bpmEl.style.cssText='font-family:var(--orb);font-size:15px;font-weight:700;color:var(--accent);cursor:ns-resize;letter-spacing:.04em;min-width:42px;text-align:center;';
    bpmEl.textContent=KERNEL.clock.BPM;
    let _bd=false,_by=0,_bv=KERNEL.clock.BPM;
    bpmEl.addEventListener('pointerdown',e=>{_bd=true;_by=e.clientY;_bv=KERNEL.clock.BPM;bpmEl.setPointerCapture(e.pointerId);});
    bpmEl.addEventListener('pointermove',e=>{if(!_bd)return;KERNEL.clock.BPM=_bv+Math.round((_by-e.clientY)*.5);bpmEl.textContent=KERNEL.clock.BPM;_pub('ui:bpm_change',{bpm:KERNEL.clock.BPM});});
    bpmEl.addEventListener('pointerup',()=>_bd=false);
    const stepsSel=document.createElement('select'); stepsSel.style.cssText='background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:7.5px;padding:2px 4px;outline:none;cursor:pointer;';
    [16,32].forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;stepsSel.appendChild(o);});
    stepsSel.addEventListener('change',()=>_pub('ui:step_count_change',{steps:+stepsSel.value}));
    const lcdEl=document.createElement('div'); lcdEl.style.cssText='font-family:var(--mono);font-size:8.5px;color:var(--accent);min-width:28px;';lcdEl.textContent='—';
    const sep=()=>{const s=document.createElement('div');s.style.cssText='width:1px;height:14px;background:var(--b1);flex-shrink:0;';return s;};
    hdr.append(btnPlay,btnRand,btnClr,sep(),bpmEl,sep(),stepsSel,sep(),lcdEl);

    /* Grid */
    const scroll=document.createElement('div'); scroll.style.cssText='flex:1;overflow-y:auto;overflow-x:hidden;padding:6px 8px;min-height:0;';
    const grid=document.createElement('div');
    scroll.appendChild(grid);

    let cellEls=[];

    function renderGrid(tracks,steps) {
      grid.innerHTML=''; cellEls=[];
      tracks.forEach((track,ti)=>{
        const row=document.createElement('div'); row.style.cssText='display:grid;grid-template-columns:70px 1fr;gap:4px;margin-bottom:3px;align-items:center;';
        const nm=document.createElement('div'); nm.style.cssText='font-family:var(--raj);font-size:8.5px;font-weight:700;color:var(--dim2);text-align:right;padding-right:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; nm.textContent=track.sound.toUpperCase();
        const st=document.createElement('div'); st.style.cssText=`display:grid;grid-template-columns:repeat(${steps},1fr);gap:2px;`;
        const cs=[];
        for(let si=0;si<steps;si++){
          const cell=document.createElement('div'); cell.style.cssText=`aspect-ratio:1;border-radius:2px;cursor:pointer;background:${track.steps[si]?track.color:'var(--bg3)'};border:1px solid ${track.steps[si]?track.color:'var(--b1)'};opacity:${track.steps[si]?.85:1};transition:background .07s;`;
          if(si%4===0&&si>0) cell.style.marginLeft='2px';
          cell.addEventListener('click',()=>_pub('ui:step_toggle',{track:ti,step:si,value:track.steps[si]?0:1}));
          st.appendChild(cell); cs.push(cell);
        }
        cellEls.push(cs); row.appendChild(nm); row.appendChild(st); grid.appendChild(row);
      });
    }

    sBus.subscribe('org:grid_sync',({tracks,steps,playing:p,bpm})=>{
      renderGrid(tracks,steps); stepsSel.value=steps;
      bpmEl.textContent=bpm||KERNEL.clock.BPM;
      if(p!==undefined){ playing=p; btnPlay.textContent=p?'⏸':'▶'; btnPlay.dataset.on=p?'1':''; btnPlay.style.color=p?'var(--accent)':'var(--dim2)'; btnPlay.style.borderColor=p?'var(--accent)':'var(--b2)'; }
    });
    sBus.subscribe('org:state_sync',({playing:p})=>{
      if(p===undefined) return; playing=p; btnPlay.textContent=p?'⏸':'▶'; btnPlay.dataset.on=p?'1':''; btnPlay.style.color=p?'var(--accent)':'var(--dim2)'; btnPlay.style.borderColor=p?'var(--accent)':'var(--b2)';
    });
    sBus.subscribe('org:step_cursor',({step,bar})=>{
      lcdEl.textContent=`${bar+1}.${(step%4)+1}`;
      cellEls.forEach(row=>row.forEach((c,si)=>{ c.style.outline=si===step?'1px solid rgba(238,244,255,.85)':''; c.style.outlineOffset='-1px'; }));
    });
    sBus.subscribe('org:step_set',({track,step,value})=>{
      if(cellEls[track]?.[step]){ const c=cellEls[track][step]; c.style.background=value?'var(--accent)':'var(--bg3)'; c.style.borderColor=value?'var(--accent)':'var(--b1)'; }
    });

    wrap.appendChild(hdr); wrap.appendChild(scroll); content.appendChild(wrap);
  },
});

/* ═══════════════════════════════════════════════════════
   TIMELINE
═══════════════════════════════════════════════════════ */
reg('timeline', {
  category:'Audio — Sequencing', summary:'Multi-track audio clip timeline synced to the master transport.', needs:[],
  label:'Timeline', icon:'📼', accent:'#00d4ff',
  width:720, height:360, minWidth:480, minHeight:200,
  mountEngine(instanceId, intakeResult, sBus) {
    TimelineMod.mount(instanceId, sBus, KERNEL.audio, KERNEL.clock, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;';
    /* Header */
    const hdr=document.createElement('div'); hdr.style.cssText='display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--b1);background:var(--bg2);flex-shrink:0;flex-wrap:wrap;';
    let playing=false;
    const btnPlay=mkBtn(null,'▶',()=>_pub('ui:play_press',{}));
    const btnStop=mkBtn(null,'⏮',()=>{ _pub('ui:play_press',{}); setTimeout(()=>_pub('ui:play_press',{}),50); });
    const btnRec =mkBtn(null,'⏺',()=>btnRec.classList.toggle('rec-on')); btnRec.style.color='var(--accent3)';
    const timeEl=document.createElement('div'); timeEl.style.cssText='font-family:var(--orb);font-size:13px;font-weight:700;color:var(--accent);letter-spacing:.08em;min-width:84px;';timeEl.textContent='0:00.000';
    const bpmWrap=document.createElement('div'); bpmWrap.style.cssText='display:flex;align-items:center;gap:4px;cursor:ns-resize;';
    const bpmLbl=document.createElement('div'); bpmLbl.style.cssText='font-family:var(--mono);font-size:6.5px;color:var(--dim);letter-spacing:.1em;'; bpmLbl.textContent='BPM';
    const bpmVal=document.createElement('div'); bpmVal.style.cssText='font-family:var(--orb);font-size:13px;font-weight:700;color:var(--accent);min-width:38px;'; bpmVal.textContent=KERNEL.clock.BPM;
    let _bd=false,_by=0,_bv=KERNEL.clock.BPM;
    bpmWrap.addEventListener('pointerdown',e=>{_bd=true;_by=e.clientY;_bv=KERNEL.clock.BPM;bpmWrap.setPointerCapture(e.pointerId);});
    bpmWrap.addEventListener('pointermove',e=>{if(!_bd)return;KERNEL.clock.BPM=_bv+Math.round((_by-e.clientY)*.5);bpmVal.textContent=KERNEL.clock.BPM;});
    bpmWrap.addEventListener('pointerup',()=>_bd=false);
    bpmWrap.appendChild(bpmLbl); bpmWrap.appendChild(bpmVal);
    const addLaneBtn=mkBtn(null,'+ LANE',()=>_pub('ui:lane_add',{name:'Track',icon:'♪',color:'#00d4ff'}));
    const sep=()=>{const s=document.createElement('div');s.style.cssText='width:1px;height:14px;background:var(--b1);flex-shrink:0;';return s;};
    hdr.append(btnPlay,btnStop,btnRec,sep(),timeEl,sep(),bpmWrap,sep(),addLaneBtn);

    /* Ruler */
    const rulerRow=document.createElement('div'); rulerRow.style.cssText='display:flex;flex-shrink:0;height:22px;border-bottom:1px solid var(--b1);';
    const rulerLbl=document.createElement('div'); rulerLbl.style.cssText='width:88px;min-width:88px;background:var(--bg2);border-right:1px solid var(--b1);display:flex;align-items:center;padding:0 8px;font-family:var(--mono);font-size:6.5px;color:var(--dim);flex-shrink:0;'; rulerLbl.textContent='BARS';
    const rulerMarks=document.createElement('div'); rulerMarks.style.cssText='flex:1;position:relative;overflow:hidden;cursor:pointer;';
    const rulerCvs=document.createElement('canvas'); rulerCvs.style.cssText='position:absolute;inset:0;width:100%;height:100%;';
    rulerMarks.appendChild(rulerCvs); rulerRow.appendChild(rulerLbl); rulerRow.appendChild(rulerMarks);

    /* Lanes */
    const lanesScroll=document.createElement('div'); lanesScroll.style.cssText='flex:1;overflow-y:auto;overflow-x:hidden;position:relative;min-height:0;';
    const lanesWrap=document.createElement('div'); lanesWrap.style.position='relative';
    const emptyHint=document.createElement('div'); emptyHint.style.cssText='padding:16px;font-family:var(--mono);font-size:8px;color:var(--dim);text-align:center;pointer-events:none;'; emptyHint.textContent='Drop audio · click lane body to place clip · + LANE to add';
    lanesWrap.appendChild(emptyHint);
    const playheadEl=document.createElement('div'); playheadEl.style.cssText='position:absolute;top:0;bottom:0;width:1.5px;background:var(--accent);pointer-events:none;z-index:10;left:88px;';
    playheadEl.innerHTML='<div style="position:absolute;top:0;left:-4px;border:4px solid transparent;border-top-color:var(--accent);"></div>';
    lanesWrap.appendChild(playheadEl);
    lanesScroll.appendChild(lanesWrap);

    const addLaneRow=document.createElement('div'); addLaneRow.style.cssText='display:flex;align-items:center;justify-content:center;height:26px;gap:6px;cursor:pointer;font-family:var(--mono);font-size:7.5px;letter-spacing:.12em;color:var(--dim);border-top:1px solid var(--b1);transition:color .12s,background .12s;flex-shrink:0;';
    addLaneRow.innerHTML='<span>+</span><span>ADD LANE</span>';
    addLaneRow.addEventListener('click',()=>_pub('ui:lane_add',{name:'Track',icon:'♪',color:'#00d4ff'}));
    addLaneRow.addEventListener('mouseenter',()=>{addLaneRow.style.color='var(--accent)';addLaneRow.style.background='rgba(0,255,136,.04)';});
    addLaneRow.addEventListener('mouseleave',()=>{addLaneRow.style.color='var(--dim)';addLaneRow.style.background='';});

    wrap.appendChild(hdr); wrap.appendChild(rulerRow); wrap.appendChild(lanesScroll); wrap.appendChild(addLaneRow);
    content.appendChild(wrap);

    let _pxPerSec=80, _offset=0, _laneEls={};

    function drawRuler(cursor=0) {
      const rect=rulerMarks.getBoundingClientRect(); const W=rect.width,H=rect.height; if(!W) return;
      rulerCvs.width=W; rulerCvs.height=H;
      const ctx=rulerCvs.getContext('2d');
      const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#00ff88';
      ctx.clearRect(0,0,W,H);
      const beatSec=60/KERNEL.clock.BPM, barSec=beatSec*4;
      let t=Math.floor(_offset/barSec)*barSec;
      ctx.font='6.5px "Share Tech Mono",monospace'; ctx.textBaseline='middle';
      while(t<=_offset+W/_pxPerSec+barSec){
        const x=(t-_offset)*_pxPerSec;
        ctx.strokeStyle='rgba(42,60,88,.8)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
        for(let b=1;b<4;b++){const bx=x+b*beatSec*_pxPerSec;ctx.strokeStyle='rgba(42,60,88,.35)';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(bx,H*.5);ctx.lineTo(bx,H);ctx.stroke();}
        ctx.fillStyle=accent; ctx.fillText(`${Math.round(t/barSec)+1}`,x+3,H/2);
        t+=barSec;
      }
      const phX=(cursor-_offset)*_pxPerSec;
      ctx.strokeStyle=accent; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(phX,0); ctx.lineTo(phX,H); ctx.stroke();
    }

    rulerMarks.addEventListener('click',e=>{
      const r=rulerMarks.getBoundingClientRect();
      const sec=Math.max(0,_offset+(e.clientX-r.left)/_pxPerSec);
      _pub('ui:ruler_click',{position_sec:sec});
    });
    rulerMarks.addEventListener('wheel',e=>{
      e.preventDefault();
      _pxPerSec=Math.max(20,Math.min(400,_pxPerSec*(e.deltaY<0?1.12:.9)));
      _pub('ui:zoom_change',{px_per_sec:_pxPerSec});
    },{passive:false});

    function addLaneEl(lane) {
      if(_laneEls[lane.laneId]) return;
      emptyHint.style.display='none';
      const laneEl=document.createElement('div'); laneEl.style.cssText='display:flex;height:34px;border-bottom:1px solid var(--b1);';
      const lbl=document.createElement('div'); lbl.style.cssText='width:88px;min-width:88px;background:var(--bg2);border-right:1px solid var(--b1);display:flex;align-items:center;padding:0 7px;gap:4px;flex-shrink:0;overflow:hidden;';
      lbl.innerHTML=`<span style="font-size:11px;flex-shrink:0;">${lane.icon}</span><span style="font-family:var(--mono);font-size:7px;color:var(--dim2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${lane.name}</span>`;
      const xBtn=document.createElement('span'); xBtn.textContent='×'; xBtn.style.cssText='font-size:9px;color:var(--dim);cursor:pointer;flex-shrink:0;transition:color .12s;';
      xBtn.addEventListener('mouseenter',()=>xBtn.style.color='var(--accent3)');
      xBtn.addEventListener('mouseleave',()=>xBtn.style.color='var(--dim)');
      xBtn.addEventListener('click',()=>{_pub('ui:lane_remove',{laneId:lane.laneId});laneEl.remove();delete _laneEls[lane.laneId];});
      lbl.appendChild(xBtn);
      const body=document.createElement('div'); body.style.cssText='flex:1;position:relative;overflow:hidden;cursor:crosshair;';
      body.addEventListener('click',e=>{
        if(e.target.closest('.tl-clip')) return;
        const r=body.getBoundingClientRect();
        const sec=_offset+(e.clientX-r.left)/_pxPerSec;
        _pub('ui:clip_place',{laneId:lane.laneId,position_sec:sec,name:lane.name});
      });
      body.addEventListener('dragover',e=>e.preventDefault());
      body.addEventListener('drop',async e=>{
        e.preventDefault(); e.stopPropagation();
        const files=e.dataTransfer.files; if(!files.length) return;
        const results=await Intake.ingestAll(files,KERNEL.bus);
        results.filter(r=>r.id==='audio:sample').forEach(r=>{
          const rect=body.getBoundingClientRect();
          const sec=_offset+(e.clientX-rect.left)/_pxPerSec;
          _pub('ui:clip_place',{laneId:lane.laneId,position_sec:sec,name:r.name,assetId:r.hash});
          addClipEl(body,lane,{clipId:'c-'+Math.random().toString(36).slice(2),name:r.name,startSec:sec,durSec:4,color:lane.color,arrayBuffer:r.arrayBuffer});
        });
      });
      laneEl.appendChild(lbl); laneEl.appendChild(body);
      lanesWrap.insertBefore(laneEl,playheadEl);
      _laneEls[lane.laneId]={laneEl,body};
    }

    function addClipEl(body,lane,clip) {
      const el=document.createElement('div'); el.className='tl-clip';
      el.dataset.start=clip.startSec; el.dataset.dur=clip.durSec||4;
      el.style.cssText=`position:absolute;top:3px;height:28px;border-radius:3px;cursor:grab;display:flex;align-items:center;padding:0 6px;overflow:hidden;border:1px solid ${(clip.color||'#00d4ff')}44;background:${(clip.color||'#00d4ff')}18;min-width:16px;transition:border-color .1s;`;
      const wave=document.createElement('canvas'); wave.style.cssText='position:absolute;inset:0;border-radius:3px;opacity:.38;pointer-events:none;width:100%;height:100%;';
      const lbl=document.createElement('span'); lbl.style.cssText='font-family:var(--mono);font-size:6.5px;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;z-index:1;'; lbl.textContent=clip.name||'';
      const xBtn=document.createElement('span'); xBtn.textContent='×'; xBtn.style.cssText='position:absolute;right:3px;font-size:9px;color:rgba(255,255,255,.5);cursor:pointer;display:none;';
      xBtn.addEventListener('click',e=>{e.stopPropagation();_pub('ui:clip_remove',{clipId:el.dataset.clipId});el.remove();});
      el.addEventListener('mouseenter',()=>{el.style.borderColor=clip.color||'#00d4ff';xBtn.style.display='block';});
      el.addEventListener('mouseleave',()=>{el.style.borderColor=(clip.color||'#00d4ff')+'44';xBtn.style.display='none';});
      el.appendChild(wave); el.appendChild(lbl); el.appendChild(xBtn);
      el.dataset.clipId=clip.clipId||'';
      posClip(el); body.appendChild(el);
      if(clip.arrayBuffer){ const AC=KERNEL.audio.AC||KERNEL.audio.boot(); AC.decodeAudioData(clip.arrayBuffer.slice(0)).then(ab=>{const W=200,H=28;wave.width=W;wave.height=H;const ctx=wave.getContext('2d');ctx.strokeStyle=clip.color||'#00d4ff';ctx.lineWidth=1;ctx.beginPath();const data=ab.getChannelData(0),step=Math.ceil(data.length/W);for(let i=0;i<W;i++){let m=0;for(let j=0;j<step;j++)m=Math.max(m,Math.abs(data[i*step+j]||0));const h=m*H*.44;ctx.moveTo(i,H/2-h);ctx.lineTo(i,H/2+h);}ctx.stroke();}).catch(()=>{}); }
      let _cd=false,_csx=0,_css=0;
      el.addEventListener('pointerdown',e=>{if(e.target===xBtn)return;_cd=true;_csx=e.clientX;_css=parseFloat(el.dataset.start);el.setPointerCapture(e.pointerId);el.classList.add('selected');el.style.cursor='grabbing';e.stopPropagation();});
      el.addEventListener('pointermove',e=>{if(!_cd)return;const s=Math.max(0,_css+(e.clientX-_csx)/_pxPerSec);el.dataset.start=s;_pub('ui:clip_move',{clipId:el.dataset.clipId,position_sec:s});posClip(el);});
      el.addEventListener('pointerup',()=>{_cd=false;el.style.cursor='grab';el.classList.remove('selected');});
    }

    function posClip(el) {
      const s=parseFloat(el.dataset.start),d=parseFloat(el.dataset.dur)||4;
      el.style.left=(s-_offset)*_pxPerSec+'px';
      el.style.width=Math.max(16,d*_pxPerSec)+'px';
    }

    function reposAll() { document.querySelectorAll('.tl-clip').forEach(posClip); }

    sBus.subscribe('org:clip_sync',({lanes,clips,pxPerSec:px,offset,cursor,bpm})=>{
      if(px) _pxPerSec=px; if(offset!==undefined) _offset=offset;
      if(bpm) bpmVal.textContent=bpm;
      lanes.forEach(l=>addLaneEl(l));
      drawRuler(cursor||0);
    });
    sBus.subscribe('org:playhead_update',({position_sec,bar,beat})=>{
      const W=rulerMarks.offsetWidth;
      const phX=88+(position_sec-_offset)*_pxPerSec;
      playheadEl.style.left=phX+'px';
      const m=Math.floor(position_sec/60),s=Math.floor(position_sec%60),ms=Math.round((position_sec%1)*1000);
      timeEl.textContent=`${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
      if(phX>W*.82){_offset=position_sec-W*.2/_pxPerSec;reposAll();}
      drawRuler(position_sec);
    });
    sBus.subscribe('org:asset_loaded',({laneId,assetId,arrayBuffer,name})=>{
      const laneData=_laneEls[laneId];
      if(laneData && arrayBuffer) addClipEl(laneData.body,{laneId,color:'#00d4ff'},{clipId:'c-'+assetId,name,startSec:0,durSec:4,arrayBuffer,color:'#00d4ff'});
    });
    sBus.subscribe('org:state_sync',({playing:p})=>{
      if(p===undefined) return; playing=p; btnPlay.textContent=p?'⏸':'▶'; btnPlay.dataset.on=p?'1':''; btnPlay.style.color=p?'var(--accent)':'var(--dim2)'; btnPlay.style.borderColor=p?'var(--accent)':'var(--b2)';
    });

    window.addEventListener('resize', ()=>drawRuler());
    requestAnimationFrame(()=>drawRuler());
  },
});

/* ═══════════════════════════════════════════════════════
   SAMPLE PLAYER
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   SAMPLE PLAYER — waveform is the entire interface
   No knobs underneath. Everything happens on the canvas.
   Drag start/end handles directly on the waveform.
   Pitch bends by dragging vertically on the clip.
   Playhead scrubs on click.
═══════════════════════════════════════════════════════ */
reg('sample-player', {
  category:'Audio — Playback', summary:'Single-sample player with scrub and loop controls.', needs:[],
  label:'Sample', icon:'🎵', accent:'#aa44ff',
  width:420, height:280, minWidth:320, minHeight:220,
  mountEngine(instanceId, intakeResult, sBus) {
    SamplePlayerMod.mount(instanceId, sBus, KERNEL.audio, {}, intakeResult||null);
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--bg0);position:relative;';

    /* ── Name bar ── */
    const namebar = document.createElement('div');
    namebar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--b1);flex-shrink:0;background:var(--bg2);';
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-family:var(--mono);font-size:8px;color:var(--accent4);letter-spacing:.1em;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nameEl.textContent = intakeResult?.name || '⬇  drop audio here';

    /* Reverse + Loop pills */
    function mkPill(label, color, onToggle) {
      const p = document.createElement('div');
      p.style.cssText = `padding:2px 8px;border-radius:10px;border:1px solid ${color}44;font-family:var(--mono);font-size:6.5px;color:${color}44;letter-spacing:.1em;cursor:pointer;transition:all .18s;flex-shrink:0;`;
      p.textContent = label;
      let on = false;
      p.addEventListener('click', () => {
        on = !on;
        p.style.color       = on ? color : color+'44';
        p.style.borderColor = on ? color : color+'44';
        p.style.background  = on ? color+'18' : 'transparent';
        onToggle(on);
      });
      return p;
    }
    const loopPill    = mkPill('LOOP',    '#aa44ff', v => _pub('ui:config_change', { key:'loop',    value:v }));
    const reversePill = mkPill('REVERSE', '#ff2266', v => _pub('ui:config_change', { key:'reverse', value:v }));

    namebar.appendChild(nameEl);
    namebar.appendChild(loopPill);
    namebar.appendChild(reversePill);

    /* ── Main waveform canvas — fills all remaining space ── */
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;cursor:crosshair;';
    canvasWrap.title = 'Drag to scrub · drag handles to set start/end · drag up/down for pitch';
    const cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    canvasWrap.appendChild(cvs);

    /* Handle overlays — positioned absolutely on the canvas */
    function mkHandle(color, side) {
      const h = document.createElement('div');
      h.style.cssText = `position:absolute;top:0;bottom:0;width:3px;background:${color};cursor:ew-resize;z-index:10;opacity:.8;transition:opacity .1s;`;
      h.style[side] = 'auto';
      const cap = document.createElement('div');
      cap.style.cssText = `position:absolute;top:50%;transform:translateY(-50%);width:10px;height:20px;border-radius:${side==='left'?'0 3px 3px 0':'3px 0 0 3px'};background:${color};${side==='left'?'left:3px':'right:3px'};`;
      h.appendChild(cap);
      h.addEventListener('mouseenter', () => h.style.opacity='1');
      h.addEventListener('mouseleave', () => h.style.opacity='.8');
      canvasWrap.appendChild(h);
      return h;
    }
    const startHandle = mkHandle('#aa44ff','left');
    const endHandle   = mkHandle('#ff2266','right');

    /* ── Transport bar ── */
    const transport = document.createElement('div');
    transport.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 10px;border-top:1px solid var(--b1);flex-shrink:0;background:var(--bg2);';

    const playBtn = document.createElement('button');
    playBtn.style.cssText = 'width:32px;height:32px;border-radius:50%;border:1.5px solid #aa44ff;background:rgba(170,68,255,.1);color:#aa44ff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;outline:none;flex-shrink:0;';
    playBtn.textContent = '▶';
    playBtn.addEventListener('mouseenter', () => { playBtn.style.background='rgba(170,68,255,.25)'; playBtn.style.boxShadow='0 0 12px rgba(170,68,255,.4)'; });
    playBtn.addEventListener('mouseleave', () => { playBtn.style.background='rgba(170,68,255,.1)'; playBtn.style.boxShadow=''; });
    playBtn.addEventListener('click', () => { KERNEL.audio.boot(); _pub('ui:play_press', {}); });

    /* Pitch display — drag it */
    const pitchWrap = document.createElement('div');
    pitchWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:ns-resize;padding:0 6px;flex-shrink:0;';
    const pitchVal = document.createElement('div');
    pitchVal.style.cssText = 'font-family:var(--orb);font-size:14px;font-weight:700;color:#aa44ff;letter-spacing:.04em;min-width:36px;text-align:center;';
    pitchVal.textContent = '0st';
    const pitchLbl = document.createElement('div');
    pitchLbl.style.cssText = 'font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.12em;';
    pitchLbl.textContent = 'PITCH';
    pitchWrap.appendChild(pitchVal); pitchWrap.appendChild(pitchLbl);

    let _pd=false,_py=0,_pv=0;
    pitchWrap.addEventListener('pointerdown',e=>{ _pd=true;_py=e.clientY;_pv=_pitch;pitchWrap.setPointerCapture(e.pointerId); });
    pitchWrap.addEventListener('pointermove',e=>{ if(!_pd)return; _pitch=Math.max(-24,Math.min(24,_pv+Math.round((_py-e.clientY)*.2))); pitchVal.textContent=`${_pitch>0?'+':''}${_pitch}st`; _pub('ui:config_change',{key:'pitch',value:_pitch}); });
    pitchWrap.addEventListener('pointerup',()=>_pd=false);

    /* Gain bar */
    const gainWrap = document.createElement('div');
    gainWrap.style.cssText = 'flex:1;display:flex;align-items:center;gap:5px;';
    const gainLbl = document.createElement('div'); gainLbl.style.cssText='font-family:var(--mono);font-size:6.5px;color:var(--dim);letter-spacing:.1em;'; gainLbl.textContent='GAIN';
    const gainSlider = document.createElement('input'); gainSlider.type='range'; gainSlider.min=0; gainSlider.max=2; gainSlider.step=.01; gainSlider.value=1;
    gainSlider.style.cssText='flex:1;accent-color:#aa44ff;height:3px;cursor:pointer;';
    gainSlider.addEventListener('input', () => _pub('ui:config_change',{key:'gain',value:+gainSlider.value}));
    gainWrap.appendChild(gainLbl); gainWrap.appendChild(gainSlider);

    /* Time display */
    const timeEl = document.createElement('div');
    timeEl.style.cssText = 'font-family:var(--mono);font-size:7.5px;color:var(--dim2);letter-spacing:.06em;min-width:52px;text-align:right;flex-shrink:0;';
    timeEl.textContent = '0.00s';

    transport.appendChild(playBtn);
    transport.appendChild(pitchWrap);
    transport.appendChild(gainWrap);
    transport.appendChild(timeEl);

    root.appendChild(namebar);
    root.appendChild(canvasWrap);
    root.appendChild(transport);
    content.appendChild(root);

    /* ── Drop audio onto canvas ── */
    canvasWrap.addEventListener('dragover', e => { e.preventDefault(); cvs.style.outline='2px solid #aa44ff'; });
    canvasWrap.addEventListener('dragleave', () => cvs.style.outline='');
    canvasWrap.addEventListener('drop', async e => {
      e.preventDefault(); cvs.style.outline='';
      const results = await Intake.ingestAll(e.dataTransfer.files, KERNEL.bus);
      const audio = results.find(r => r.id === 'audio:sample');
      if (audio) KERNEL.bus.publish('intake:file', { ...audio, _targetInstanceId: instanceId });
    });

    /* ── State ── */
    let _peaks    = [];
    let _start    = 0;   /* normalized 0-1 */
    let _end      = 1;
    let _pitch    = 0;
    let _playhead = 0;
    let _playing  = false;
    let _duration = 0;
    let _dragging = null; /* 'start'|'end'|'scrub'|null */

    /* ── Canvas rendering ── */
    function draw() {
      requestAnimationFrame(draw);
      const W = cvs.offsetWidth, H = cvs.offsetHeight;
      if (!W || !H) return;
      if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }
      const ctx = cvs.getContext('2d');
      ctx.clearRect(0, 0, W, H);

      /* Background */
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, W, H);

      if (!_peaks.length) {
        /* Empty state — drop zone */
        ctx.strokeStyle = 'rgba(170,68,255,.2)';
        ctx.setLineDash([6,6]); ctx.lineWidth = 1;
        ctx.strokeRect(8, 8, W-16, H-16);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(170,68,255,.3)';
        ctx.font = '8px "Share Tech Mono",monospace'; ctx.textAlign='center';
        ctx.fillText('DROP AUDIO', W/2, H/2-8);
        ctx.fillStyle = 'rgba(170,68,255,.15)';
        ctx.font = '24px sans-serif';
        ctx.fillText('⬇', W/2, H/2+16);
        return;
      }

      const startX = _start * W;
      const endX   = _end   * W;

      /* Dimmed regions outside start/end */
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, 0, startX, H);
      ctx.fillRect(endX, 0, W-endX, H);

      /* Waveform — full width */
      const mid = H / 2;
      ctx.beginPath(); ctx.strokeStyle = 'rgba(170,68,255,.25)'; ctx.lineWidth = 1;
      _peaks.forEach((p, i) => {
        const x = (i / _peaks.length) * W;
        const h = p * mid * 0.85;
        ctx.moveTo(x, mid - h); ctx.lineTo(x, mid + h);
      }); ctx.stroke();

      /* Active region waveform — bright */
      ctx.beginPath(); ctx.strokeStyle = '#aa44ff'; ctx.lineWidth = 1.5;
      _peaks.forEach((p, i) => {
        const x = (i / _peaks.length) * W;
        if (x < startX || x > endX) return;
        const h = p * mid * 0.9;
        ctx.moveTo(x, mid - h); ctx.lineTo(x, mid + h);
      }); ctx.stroke();

      /* Glow on active region */
      if (_playing) {
        ctx.save();
        ctx.shadowColor = '#aa44ff'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.strokeStyle = 'rgba(170,68,255,.15)'; ctx.lineWidth = 3;
        _peaks.forEach((p, i) => {
          const x = (i / _peaks.length) * W;
          if (x < startX || x > endX) return;
          const h = p * mid * 0.9;
          ctx.moveTo(x, mid - h); ctx.lineTo(x, mid + h);
        }); ctx.stroke();
        ctx.restore();
      }

      /* Center line */
      ctx.strokeStyle = 'rgba(170,68,255,.15)'; ctx.lineWidth = .5;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();

      /* Start handle line */
      ctx.strokeStyle = '#aa44ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(startX, 0); ctx.lineTo(startX, H); ctx.stroke();

      /* End handle line */
      ctx.strokeStyle = '#ff2266'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(endX, 0); ctx.lineTo(endX, H); ctx.stroke();

      /* Handle caps */
      ctx.fillStyle = '#aa44ff';
      ctx.fillRect(startX, mid-12, 8, 24);
      ctx.fillStyle = '#ff2266';
      ctx.fillRect(endX-8, mid-12, 8, 24);

      /* Handle labels */
      ctx.fillStyle = '#aa44ff'; ctx.font = '6px "Share Tech Mono",monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${(_start*100).toFixed(0)}%`, startX+10, mid-4);
      ctx.fillStyle = '#ff2266'; ctx.textAlign = 'right';
      ctx.fillText(`${(_end*100).toFixed(0)}%`, endX-10, mid-4);

      /* Playhead */
      if (_playing || _playhead > 0) {
        const phX = (_start + _playhead * (_end - _start)) * W;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = .8;
        ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, H); ctx.stroke();
        ctx.globalAlpha = 1;
        /* Triangle cap */
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(phX-4, 0); ctx.lineTo(phX+4, 0); ctx.lineTo(phX, 8); ctx.fill();
      }

      /* Position DOM handles */
      startHandle.style.left = startX + 'px';
      endHandle.style.left   = (endX - 3) + 'px';
    }
    draw();

    /* ── Pointer interaction on canvas ── */
    function _pxToNorm(e) {
      const r = canvasWrap.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    }

    const HANDLE_THRESH = 12; /* px */
    canvasWrap.addEventListener('pointerdown', e => {
      const r   = canvasWrap.getBoundingClientRect();
      const x   = e.clientX - r.left;
      const W   = r.width;
      const sX  = _start * W;
      const eX  = _end   * W;
      if (Math.abs(x - sX) < HANDLE_THRESH)      _dragging = 'start';
      else if (Math.abs(x - eX) < HANDLE_THRESH) _dragging = 'end';
      else                                         _dragging = 'scrub';
      canvasWrap.setPointerCapture(e.pointerId);
    });

    canvasWrap.addEventListener('pointermove', e => {
      if (!_dragging) return;
      const n = _pxToNorm(e);
      if (_dragging === 'start') {
        _start = Math.max(0, Math.min(_end - 0.01, n));
        _pub('ui:config_change', { key:'start', value:_start });
      } else if (_dragging === 'end') {
        _end = Math.max(_start + 0.01, Math.min(1, n));
        _pub('ui:config_change', { key:'end', value:_end });
      } else {
        /* Scrub — seek playhead */
        const pos = Math.max(0, Math.min(1, (n - _start) / Math.max(0.001, _end - _start)));
        _pub('ui:scrub', { position: pos });
      }
    });
    canvasWrap.addEventListener('pointerup', () => { _dragging = null; });

    /* Click to play/stop */
    canvasWrap.addEventListener('click', e => {
      if (_dragging) return;
      KERNEL.audio.boot();
      _pub('ui:play_press', {});
    });

    /* ── Engine state ── */
    sBus.subscribe('org:waveform_ready', ({ peaks, duration_sec, name }) => {
      _peaks    = peaks;
      _duration = duration_sec;
      nameEl.textContent = name;
      timeEl.textContent = `${duration_sec.toFixed(2)}s`;
    });

    sBus.subscribe('org:playhead_update', ({ position_normalized }) => {
      _playhead = position_normalized;
    });

    sBus.subscribe('org:state_sync', ({ playing, name, duration_sec }) => {
      if (playing !== undefined) {
        _playing = playing;
        playBtn.textContent  = playing ? '⏸' : '▶';
        playBtn.style.borderColor = playing ? '#00ff88' : '#aa44ff';
        playBtn.style.color       = playing ? '#00ff88' : '#aa44ff';
        playBtn.style.background  = playing ? 'rgba(0,255,136,.15)' : 'rgba(170,68,255,.1)';
        if (playing && playBtn.style.boxShadow !== undefined) {
          playBtn.style.boxShadow = playing ? '0 0 12px rgba(0,255,136,.4)' : '';
        }
      }
      if (name) nameEl.textContent = name;
      if (duration_sec) { _duration = duration_sec; timeEl.textContent = `${duration_sec.toFixed(2)}s`; }
    });
  },
});

reg('lfo', {
  category:'Audio — Modulation', summary:'Low-frequency oscillator for modulating other mods\' parameters.', needs:[],
  label:'LFO', icon:'〰', accent:'#aa44ff',
  width:230, height:270, minWidth:190, minHeight:220,
  mountEngine(instanceId, intakeResult, sBus) { LFOEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:8px;height:100%;';
    mkSelect(wrap,{label:'SHAPE',options:['sine','triangle','square','sawtooth','S&H'],value:'sine',eventKey:'shape',pub:_pub});
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:8px;justify-content:center;';
    let rate=4,depth=.5;
    const rateK =mkKnob(kRow,{label:'RATE', min:.01,max:32, value:4,  step:.01,unit:'Hz',onChange:v=>rate=v});
    const depthK=mkKnob(kRow,{label:'DEPTH',min:0,  max:1,  value:.5, step:.01,unit:'',  onChange:v=>depth=v});
    mkKnob(kRow,{label:'PHASE',min:0,max:360,value:0,step:1,unit:'°'});
    wrap.appendChild(kRow);
    const scope=document.createElement('div'); scope.style.cssText='width:100%;height:52px;border-radius:4px;background:var(--bg2);border:1px solid var(--b1);overflow:hidden;position:relative;flex-shrink:0;';
    const cvs=document.createElement('canvas'); cvs.width=200;cvs.height=52;cvs.style.cssText='position:absolute;inset:0;width:100%;height:100%;'; scope.appendChild(cvs);
    mkToggle(wrap,{label:'BPM SYNC',value:false});
    mkToggle(wrap,{label:'BIPOLAR', value:true});
    wrap.appendChild(scope);
    content.appendChild(wrap);
    let shape='sine',ph=0;
    const ctx=cvs.getContext('2d');
    function draw(){ requestAnimationFrame(draw); ctx.clearRect(0,0,200,52); ctx.strokeStyle='rgba(170,68,255,.5)'; ctx.lineWidth=1.5; ctx.beginPath(); for(let x=0;x<200;x++){const t=(x/200)*Math.PI*4+ph;let y=shape==='sine'?Math.sin(t):shape==='triangle'?(2/Math.PI)*Math.asin(Math.sin(t)):shape==='square'?Math.sign(Math.sin(t)):shape==='sawtooth'?(t%(2*Math.PI))/Math.PI-1:(Math.random()*2-1)*.3+(Math.sin(t)*.7);const py=26+y*depth*18; x===0?ctx.moveTo(x,py):ctx.lineTo(x,py);} ctx.stroke(); ph+=rate*.01; }
    draw();
    KERNEL.bus.subscribe('ui:config_change',({key,value})=>{if(key==='shape')shape=value;});
  },
});

/* ═══════════════════════════════════════════════════════
   WOBBLE BASS
═══════════════════════════════════════════════════════ */
reg('wobble-bass', {
  category:'Audio — Bass Synths', summary:'Filter-wobble bass synth voice.', needs:[],
  label:'Wobble Bass', icon:'🔊', accent:'#ff2266',
  width:270, height:330, minWidth:220, minHeight:270,
  mountEngine(instanceId, intakeResult, sBus) { WobbleBassEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:8px;height:100%;';
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:6px;justify-content:center;flex-wrap:wrap;';
    mkKnob(kRow,{label:'PITCH', min:20, max:200,  value:110,step:1,  unit:'Hz',eventKey:'freq',  pub:_pub});
    mkKnob(kRow,{label:'CUTOFF',min:100,max:4000, value:600,step:10, unit:'Hz',eventKey:'cutoff',pub:_pub});
    mkKnob(kRow,{label:'RES',   min:.5, max:20,   value:4,  step:.1, unit:'',  eventKey:'res',   pub:_pub});
    mkKnob(kRow,{label:'RATE',  min:.5, max:16,   value:4,  step:.1, unit:'Hz',eventKey:'rate',  pub:_pub});
    mkKnob(kRow,{label:'DEPTH', min:100,max:3000, value:600,step:10, unit:'',  eventKey:'depth', pub:_pub});
    mkKnob(kRow,{label:'DRIVE', min:0,  max:1,    value:.4, step:.01,unit:'', eventKey:'drive',  pub:_pub});
    mkDiv(wrap);
    mkScope(wrap,{height:44,color:'rgba(255,34,102,.45)'});
    mkDiv(wrap);
    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:6px;';
    mkBtn(btnRow,'▶ HIT', ()=>_pub('ui:wobble_trigger',{vel:1}), {h:24,fs:8});
    const activeBtn=mkToggle(wrap,{label:'ACTIVE (SUSTAIN)',value:false,onChange:()=>_pub('ui:wobble_toggle',{})});
    wrap.appendChild(btnRow);
    mkSelect(wrap,{label:'WAVE',options:['sawtooth','square','triangle'],value:'sawtooth',eventKey:'waveform',pub:_pub});
    wrap.appendChild(kRow);
    content.appendChild(wrap);
    /* pad:trigger→wobble is wired inside WobbleBassEngine itself.
       ACTIVE now genuinely starts/stops the continuous LFO'd oscillator
       via ui:wobble_toggle instead of firing one dead 0.9s one-shot. */
  },
});

/* ═══════════════════════════════════════════════════════
   ACID SYNTH, REESE BASS, CHANNEL, XY PAD — compact versions
═══════════════════════════════════════════════════════ */
reg('acid-synth', {
  category:'Audio — Bass Synths', summary:'303-style acid bass synth with slide and accent.', needs:[],
  label:'Acid Synth', icon:'⚡', accent:'#00ff88',
  width:250, height:300, minWidth:210, minHeight:240,
  mountEngine(instanceId, intakeResult, sBus) { AcidSynthEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:8px;height:100%;';
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:6px;justify-content:center;flex-wrap:wrap;';
    mkKnob(kRow,{label:'PITCH', min:24, max:84,  value:45, step:1,  unit:'st',eventKey:'pitch', pub:_pub});
    mkKnob(kRow,{label:'CUTOFF',min:100,max:8000,value:300,step:10, unit:'Hz',eventKey:'cutoff',pub:_pub});
    mkKnob(kRow,{label:'RES',   min:0,  max:30,  value:6,  step:.5, unit:'',  eventKey:'res',   pub:_pub});
    mkKnob(kRow,{label:'ENV',   min:0,  max:1,   value:.4, step:.01,unit:'',  eventKey:'env',   pub:_pub});
    mkKnob(kRow,{label:'DECAY', min:.01,max:2,   value:.3, step:.01,unit:'s', eventKey:'decay', pub:_pub});
    mkScope(wrap,{height:44,color:'rgba(0,255,136,.4)'});
    mkDiv(wrap);
    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:6px;';
    mkBtn(btnRow,'▶ TRIGGER', ()=>_pub('ui:acid_trigger',{vel:1}), {h:24,fs:8});
    wrap.appendChild(btnRow);
    mkToggle(wrap,{label:'ACCENT',value:false,eventKey:'accent',pub:_pub});
    mkToggle(wrap,{label:'GLIDE', value:false,eventKey:'glide', pub:_pub});
    mkSelect(wrap,{label:'WAVE',options:['sawtooth','square'],value:'sawtooth',eventKey:'wave',pub:_pub});
    wrap.appendChild(kRow); content.appendChild(wrap);
    /* Note: pad:trigger→acid is wired inside AcidSynthEngine itself
       (mounted above). No shortcut re-triggering here — that used to
       double-fire the voice through window.PadsMod.VOICES.acid
       in addition to the engine's own trigger. */
  },
});

reg('reese-bass', {
  category:'Audio — Bass Synths', summary:'Detuned-stack Reese bass synth.', needs:[],
  label:'Reese Bass', icon:'🔈', accent:'#ff2266',
  width:240, height:290, minWidth:200, minHeight:230,
  mountEngine(instanceId, intakeResult, sBus) { ReeseBassEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:8px;height:100%;';
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:6px;justify-content:center;flex-wrap:wrap;';
    mkKnob(kRow,{label:'PITCH', min:20, max:120, value:55,step:1,  unit:'Hz',eventKey:'pitch', pub:_pub});
    mkKnob(kRow,{label:'DETUNE',min:0,  max:50,  value:10,step:.5, unit:'¢', eventKey:'detune',pub:_pub});
    mkKnob(kRow,{label:'CUTOFF',min:50, max:4000,value:400,step:10,unit:'Hz',eventKey:'cutoff', pub:_pub});
    mkKnob(kRow,{label:'SWEEP', min:.1, max:4,   value:.9, step:.05,unit:'s',eventKey:'sweep',  pub:_pub});
    mkKnob(kRow,{label:'GAIN',  min:0,  max:1,   value:.85,step:.01,unit:'', eventKey:'gain',   pub:_pub});
    mkScope(wrap,{height:44,color:'rgba(255,34,102,.4)'});
    mkDiv(wrap);
    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:6px;';
    mkBtn(btnRow,'▶ HIT', ()=>_pub('ui:reese_trigger',{vel:1}), {h:24,fs:8});
    const sustainBtn=mkBtn(btnRow,'◉ SUSTAIN', ()=>{
      sustainBtn.dataset.on = sustainBtn.dataset.on ? '' : '1';
      sustainBtn.style.borderColor = sustainBtn.dataset.on ? 'var(--accent)' : 'var(--b2)';
      sustainBtn.style.color = sustainBtn.dataset.on ? 'var(--accent)' : 'var(--dim2)';
      _pub('ui:reese_toggle',{});
    }, {h:24,fs:8});
    wrap.appendChild(btnRow);
    mkToggle(wrap,{label:'SUB OSC',value:true,eventKey:'sub',pub:_pub});
    wrap.appendChild(kRow); content.appendChild(wrap);
    /* pad:trigger→reese is wired inside ReeseBassEngine itself. */
  },
});

reg('channel', {
  category:'Audio — Mixing', summary:'Per-mod mixer channel: gain, pan, sends.', needs:[],
  label:'Channel', icon:'🎚', accent:'#6a88a8',
  width:160, height:380, minWidth:130, minHeight:280,
  mountEngine(instanceId, intakeResult, sBus) { ChannelEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;align-items:center;padding:8px;gap:6px;height:100%;';
    const lbl=document.createElement('div'); lbl.style.cssText='font-family:var(--mono);font-size:7px;letter-spacing:.14em;color:var(--dim2);'; lbl.textContent='CHANNEL';
    const meter=document.createElement('div'); meter.style.cssText='width:100%;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;border:1px solid var(--b1);';
    const fill=document.createElement('div'); fill.style.cssText='height:100%;width:8%;border-radius:3px;background:linear-gradient(90deg,var(--accent),#aaff44);transition:width .05s;'; meter.appendChild(fill);
    const faderWrap=document.createElement('div'); faderWrap.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:center;';
    const fader=document.createElement('input'); fader.type='range'; fader.min=0; fader.max=1; fader.step=.01; fader.value=1;
    fader.style.cssText='writing-mode:vertical-lr;direction:rtl;width:4px;height:80px;accent-color:var(--accent);cursor:pointer;appearance:slider-vertical;';
    faderWrap.appendChild(fader);
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:6px;justify-content:center;flex-wrap:wrap;';
    mkKnob(kRow,{label:'PAN',  min:-1,max:1,value:0, step:.01,unit:''});
    mkKnob(kRow,{label:'VERB', min:0, max:1,value:.2,step:.01,unit:''});
    mkKnob(kRow,{label:'DELAY',min:0, max:1,value:0, step:.01,unit:''});
    mkDiv(wrap);
    mkToggle(wrap,{label:'MUTE',value:false});
    mkToggle(wrap,{label:'SOLO',value:false});
    wrap.appendChild(lbl); wrap.appendChild(meter); wrap.appendChild(faderWrap); wrap.appendChild(kRow);
    content.appendChild(wrap);
    setInterval(()=>fill.style.width=(5+Math.random()*30)+'%',80);
  },
});

reg('xy-pad', {
  category:'Audio — Control', summary:'2D XY controller for mapping gestures to any parameter.', needs:[],
  label:'XY Ctrl', icon:'✛', accent:'#00d4ff',
  width:250, height:280, minWidth:200, minHeight:220,
  mountEngine(instanceId, intakeResult, sBus) { XYPadEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:8px;height:100%;';
    const selRow=document.createElement('div'); selRow.style.cssText='display:flex;gap:6px;';
    const xSel=document.createElement('select'); xSel.style.cssText='flex:1;background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:7.5px;padding:2px 4px;outline:none;';
    const ySel=xSel.cloneNode();
    ['cutoff','pitch','rate','gain','depth','decay'].forEach(o=>{[xSel,ySel].forEach(s=>{const op=document.createElement('option');op.value=o;op.textContent=o;s.appendChild(op);});});
    ySel.value='depth'; selRow.appendChild(xSel); selRow.appendChild(ySel);
    const xy=document.createElement('div'); xy.style.cssText='flex:1;background:var(--bg2);border:1px solid var(--b1);border-radius:4px;position:relative;cursor:crosshair;min-height:100px;';
    const dot=document.createElement('div'); dot.style.cssText='position:absolute;width:10px;height:10px;border-radius:50%;background:var(--accent2);box-shadow:0 0 8px var(--accent2);transform:translate(-50%,-50%);pointer-events:none;left:50%;top:50%;';
    const ch=document.createElement('div'); ch.style.cssText='position:absolute;height:1px;left:0;right:0;top:50%;background:rgba(0,212,255,.12);pointer-events:none;';
    const cv=document.createElement('div'); cv.style.cssText='position:absolute;width:1px;top:0;bottom:0;left:50%;background:rgba(0,212,255,.12);pointer-events:none;';
    xy.appendChild(ch); xy.appendChild(cv); xy.appendChild(dot);
    let active=false;
    xy.addEventListener('pointerdown',e=>{active=true;xy.setPointerCapture(e.pointerId);_m(e);});
    xy.addEventListener('pointermove',e=>{if(!active)return;_m(e);});
    xy.addEventListener('pointerup',()=>active=false);
    function _m(e){const r=xy.getBoundingClientRect();const px=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));const py=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));dot.style.left=(px*100)+'%';dot.style.top=(py*100)+'%';ch.style.top=(py*100)+'%';cv.style.left=(px*100)+'%';KERNEL.bus.publish('mod:xy',{x:px,y:py,xDest:xSel.value,yDest:ySel.value});}
    wrap.appendChild(selRow); wrap.appendChild(xy);
    content.appendChild(wrap);
  },
});

/* ═══════════════════════════════════════════════════════
   NEXUS DIAGNOSTIC NODES — 7 separate mods, one per
   NEXUS subsystem. No fabricated status: a card that can't
   be reached says UNREACHABLE, not a guess.

   Polling is NOT this card's own clock — it starts/stops with
   the global ▶ ⏺ transport bar (see nexus-node-core.js), so
   these stay agnostic the same way every audio mod reacts
   to seq:play/seq:stop instead of running its own timer.

   Diagnose routes through the Orchestrator for every node
   except the Orchestrator card itself, which diagnoses itself.
═══════════════════════════════════════════════════════ */
function _nexusCardUI(meta) {
  return function buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const root=document.createElement('div'); root.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;font-family:var(--mono);padding:8px;gap:6px;';

    const top=document.createElement('div'); top.style.cssText='display:flex;align-items:center;gap:5px;';
    const ic=document.createElement('span'); ic.textContent=meta.icon; ic.style.fontSize='11px';
    const lbl=document.createElement('span'); lbl.style.cssText=`font-size:7.5px;letter-spacing:.08em;color:${meta.accent};flex:1;font-weight:700;`; lbl.textContent=meta.label;
    const badge=document.createElement('span'); badge.style.cssText='font-size:6.5px;padding:2px 5px;border-radius:3px;letter-spacing:.06em;'; badge.textContent='CHECKING…';
    top.appendChild(ic); top.appendChild(lbl); top.appendChild(badge);

    const bar=document.createElement('div'); bar.style.cssText='height:3px;border-radius:2px;background:var(--bg3);overflow:hidden;flex-shrink:0;';
    const barFill=document.createElement('div'); barFill.style.cssText='height:100%;width:0%;background:var(--dim);transition:width .2s,background .2s;'; bar.appendChild(barFill);

    const body=document.createElement('div'); body.style.cssText='font-size:6.5px;color:var(--dim2);line-height:1.6;white-space:pre;flex:1;';

    const transportNote=document.createElement('div'); transportNote.style.cssText='font-size:6px;color:var(--dim);letter-spacing:.04em;';
    transportNote.textContent='waiting for ▶ PLAY (master transport)';

    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:4px;flex-wrap:wrap;';
    const diagBtn = mkBtn(null,'⚙ DIAGNOSE',   ()=>_pub('ui:diagnose',{}));
    const snapBtn = mkBtn(null,'▤ SNAPSHOTS',  ()=>_pub('ui:open-snapshots',{}));
    const ideaBtn = mkBtn(null,'✎ IDEARIUM',   ()=>_pub('ui:open-idearium',{}));
    btnRow.appendChild(diagBtn); btnRow.appendChild(snapBtn); btnRow.appendChild(ideaBtn);

    const diagResult=document.createElement('div'); diagResult.style.cssText='font-size:6px;color:var(--dim);line-height:1.5;white-space:pre;';

    root.appendChild(top); root.appendChild(bar); root.appendChild(body);
    root.appendChild(transportNote); root.appendChild(btnRow); root.appendChild(diagResult);
    content.appendChild(root);

    sBus.subscribe('org:state_sync', (s) => {
      if (s.online === null) {
        badge.textContent='CHECKING…'; badge.style.color='var(--dim)'; badge.style.background='var(--bg3)';
        barFill.style.width='30%'; barFill.style.background='var(--dim)';
        body.textContent=`PORT: ${meta.port}\nSTATUS: pending first check`;
      } else if (s.online) {
        badge.textContent='ONLINE'; badge.style.color='#00ff88'; badge.style.background='rgba(0,255,136,.12)';
        barFill.style.width='100%'; barFill.style.background='#00ff88';
        body.textContent=`PORT: ${meta.port}\nLATENCY: ${s.latencyMs}ms\nCHECKED: ${new Date(s.lastCheckedAt).toLocaleTimeString()}`;
      } else {
        badge.textContent='UNREACHABLE'; badge.style.color='#ff2266'; badge.style.background='rgba(255,34,102,.12)';
        barFill.style.width='100%'; barFill.style.background='#ff2266';
        body.textContent=`PORT: ${meta.port}\nERROR: ${s.error}\nCHECKED: ${new Date(s.lastCheckedAt).toLocaleTimeString()}`;
      }
      transportNote.textContent = s.playing
        ? (s.recording ? '⏺ recording — every poll logged to ledger' : '▶ live — polling on transport clock')
        : 'waiting for ▶ PLAY (master transport)';
      transportNote.style.color = s.recording ? '#ff2266' : (s.playing ? '#00ff88' : 'var(--dim)');
      diagBtn.disabled = !!s.diagnosing;
      diagBtn.textContent = s.diagnosing ? '⚙ DIAGNOSING…' : '⚙ DIAGNOSE';
      if (s.lastDiagnose) {
        const d=s.lastDiagnose;
        diagResult.textContent = d.ok
          ? `last diagnose: OK (${d.ms}ms) @ ${new Date(d.at).toLocaleTimeString()}`
          : `last diagnose: FAILED — ${d.error||'see response'} @ ${new Date(d.at).toLocaleTimeString()}`;
        diagResult.style.color = d.ok ? '#00ff88' : '#ff2266';
      }
    });
  };
}

reg('nexus-cortex', {
  label:'NEXUS_CORTEX', icon:'🧠', accent:'#00ff88',
  width:250, height:230, minWidth:200, minHeight:200,
  category:'NEXUS Diagnostic', summary:'Live status card for NEXUS subsystem on port 3748. Polling rides the global transport, not its own clock.',
  needs:[
    {key:'base', label:'CORTEX base URL', type:'url', default:'http://127.0.0.1:3748'},
    {key:'orchestratorBase', label:'Orchestrator base URL', type:'url', default:'http://127.0.0.1:9000'},
    {key:'diagnosePath', label:'Diagnose path', type:'string', default:'/diagnose'},
  ],
  mountEngine(instanceId, intakeResult, sBus, userConfig={}) { NexusCortexEngine.mount(instanceId, sBus, KERNEL.audio, userConfig); },
  buildUI: _nexusCardUI({label:'NEXUS_CORTEX', icon:'🧠', accent:'#00ff88', port:3748}),
});

reg('nexus-guardian', {
  label:'NEXUS_GUARDIAN', icon:'🛡️', accent:'#ffaa00',
  width:250, height:230, minWidth:200, minHeight:200,
  category:'NEXUS Diagnostic', summary:'Live status card for NEXUS subsystem on port 7820. Polling rides the global transport, not its own clock.',
  needs:[
    {key:'base', label:'GUARDIAN base URL', type:'url', default:'http://127.0.0.1:7820'},
    {key:'orchestratorBase', label:'Orchestrator base URL', type:'url', default:'http://127.0.0.1:9000'},
    {key:'diagnosePath', label:'Diagnose path', type:'string', default:'/diagnose'},
  ],
  mountEngine(instanceId, intakeResult, sBus, userConfig={}) { NexusGuardianEngine.mount(instanceId, sBus, KERNEL.audio, userConfig); },
  buildUI: _nexusCardUI({label:'NEXUS_GUARDIAN', icon:'🛡️', accent:'#ffaa00', port:7820}),
});

reg('nexus-bridge', {
  label:'NEXUS_BRIDGE', icon:'⬡', accent:'#00d4ff',
  width:250, height:230, minWidth:200, minHeight:200,
  category:'NEXUS Diagnostic', summary:'Live status card for NEXUS subsystem on port 9999. Polling rides the global transport, not its own clock.',
  needs:[
    {key:'base', label:'BRIDGE base URL', type:'url', default:'http://127.0.0.1:9999'},
    {key:'orchestratorBase', label:'Orchestrator base URL', type:'url', default:'http://127.0.0.1:9000'},
    {key:'diagnosePath', label:'Diagnose path', type:'string', default:'/diagnose'},
  ],
  mountEngine(instanceId, intakeResult, sBus, userConfig={}) { NexusBridgeEngine.mount(instanceId, sBus, KERNEL.audio, userConfig); },
  buildUI: _nexusCardUI({label:'NEXUS_BRIDGE', icon:'⬡', accent:'#00d4ff', port:9999}),
});

reg('nexus-orchestrator', {
  label:'ORCHESTRATOR', icon:'🌐', accent:'#ff2266',
  width:250, height:230, minWidth:200, minHeight:200,
  category:'NEXUS Diagnostic', summary:'Live status card for NEXUS subsystem on port 9000. Polling rides the global transport, not its own clock.',
  needs:[
    {key:'base', label:'ORCHESTRATOR base URL', type:'url', default:'http://127.0.0.1:9000'},
    {key:'orchestratorBase', label:'Orchestrator base URL', type:'url', default:'http://127.0.0.1:9000'},
    {key:'diagnosePath', label:'Diagnose path', type:'string', default:'/diagnose'},
  ],
  mountEngine(instanceId, intakeResult, sBus, userConfig={}) { NexusOrchestratorEngine.mount(instanceId, sBus, KERNEL.audio, userConfig); },
  buildUI: _nexusCardUI({label:'ORCHESTRATOR', icon:'🌐', accent:'#ff2266', port:9000}),
});

reg('nexus-diagnostic', {
  label:'DIAGNOSTIC', icon:'🩹', accent:'#aa44ff',
  width:250, height:230, minWidth:200, minHeight:200,
  category:'NEXUS Diagnostic', summary:'Live status card for NEXUS subsystem on port 7825. Polling rides the global transport, not its own clock.',
  needs:[
    {key:'base', label:'DIAGNOSTIC base URL', type:'url', default:'http://127.0.0.1:7825'},
    {key:'orchestratorBase', label:'Orchestrator base URL', type:'url', default:'http://127.0.0.1:9000'},
    {key:'diagnosePath', label:'Diagnose path', type:'string', default:'/diagnose'},
  ],
  mountEngine(instanceId, intakeResult, sBus, userConfig={}) { NexusDiagnosticEngine.mount(instanceId, sBus, KERNEL.audio, userConfig); },
  buildUI: _nexusCardUI({label:'DIAGNOSTIC', icon:'🩹', accent:'#aa44ff', port:7825}),
});

reg('nexus-architect', {
  label:'ARCHITECT', icon:'📐', accent:'#00ff88',
  width:250, height:230, minWidth:200, minHeight:200,
  category:'NEXUS Diagnostic', summary:'Live status card for NEXUS subsystem on port 3747. Polling rides the global transport, not its own clock.',
  needs:[
    {key:'base', label:'ARCHITECT base URL', type:'url', default:'http://127.0.0.1:3747'},
    {key:'orchestratorBase', label:'Orchestrator base URL', type:'url', default:'http://127.0.0.1:9000'},
    {key:'diagnosePath', label:'Diagnose path', type:'string', default:'/diagnose'},
  ],
  mountEngine(instanceId, intakeResult, sBus, userConfig={}) { NexusArchitectEngine.mount(instanceId, sBus, KERNEL.audio, userConfig); },
  buildUI: _nexusCardUI({label:'ARCHITECT', icon:'📐', accent:'#00ff88', port:3747}),
});

reg('nexus-idearium', {
  label:'IDEARIUM', icon:'💡', accent:'#ffaa00',
  width:250, height:230, minWidth:200, minHeight:200,
  category:'NEXUS Diagnostic', summary:'Live status card for NEXUS subsystem on port 4800. Polling rides the global transport, not its own clock.',
  needs:[
    {key:'base', label:'IDEARIUM base URL', type:'url', default:'http://127.0.0.1:4800'},
    {key:'orchestratorBase', label:'Orchestrator base URL', type:'url', default:'http://127.0.0.1:9000'},
    {key:'diagnosePath', label:'Diagnose path', type:'string', default:'/diagnose'},
  ],
  mountEngine(instanceId, intakeResult, sBus, userConfig={}) { NexusIdeariumEngine.mount(instanceId, sBus, KERNEL.audio, userConfig); },
  buildUI: _nexusCardUI({label:'IDEARIUM', icon:'💡', accent:'#ffaa00', port:4800}),
});

/* ── Scoped bus helper ──────────────────────────────────
   Engines publish to  org:EVENT:instanceId
   UI subscribes to    org:EVENT:instanceId
   Global topics (pad:trigger, seq:fire etc) remain global.
   This eliminates crosstalk between multiple instances. */
function _scopedBus(instanceId) {
  return {
    publish(topic, payload) {
      KERNEL.bus.publish(topic + ':' + instanceId, payload);
      /* also publish global for topics that need to be heard by other mods */
      KERNEL.bus.publish(topic, { ...payload, _from: instanceId });
    },
    subscribe(topic, fn) {
      return KERNEL.bus.subscribe(topic + ':' + instanceId, fn);
    },
    /* global subscribe — for pad:trigger, seq:fire, midi:note etc */
    global: KERNEL.bus,
  };
}

/* ── Public spawn function ─────────────────────────────── */
function spawn(id, pos = {}, intakeResult = null, userConfig = {}) {
  const def = DEFS[id];
  if (!def) { console.warn('[ERAVOS] unknown mod:', id); return null; }

  const instanceId = id + '-' + KERNEL.uuid();
  const x = pos.x ?? 80, y = pos.y ?? 80;

  const win = CanvasWM.create({
    id: instanceId,
    title: def.label,
    x, y,
    width:    def.width    || 300,
    height:   def.height   || 380,
    minWidth:  def.minWidth  || 200,
    minHeight: def.minHeight || 160,
  });

  /* Accent bar */
  if (win.bar) win.bar.style.borderTop = `2px solid ${def.accent || 'var(--accent)'}`;

  /* Tag content with instanceId */
  win.content.dataset.instanceId = instanceId;

  const sBus = _scopedBus(instanceId);

  /* ── ORDER: UI first, engine second ────────────────────
     UI subscribes before engine fires initial state sync.
     _pub is passed as a local arg so every event handler
     closes over the scoped version permanently — no module
     variable mutation, no restore needed.               */

  const _scopedPub = (topic, payload) => KERNEL.bus.publish(topic + ':' + instanceId, payload);

  if (def.buildUI) def.buildUI(win.content, intakeResult, instanceId, sBus, _scopedPub);
  if (def.mountEngine) def.mountEngine(instanceId, intakeResult, sBus, userConfig);

  KERNEL.bus.publish('canvas:mod-spawned', { instanceId, id, label: def.label, icon: def.icon, accent: def.accent });

  return { win, instanceId };
}

function defs() { return Object.values(DEFS); }

/* ═══════════════════════════════════════════════════════
   EDM LAB — Tranki / dubstep / wubs / bass drop studio
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   EDM LAB  — full production environment
   Three concurrent engines, each with its own unique interface:
     BASS ENGINE   — filter visualiser you interact with directly
     RHYTHM ENGINE — density-paint canvas (not a step grid)
     TENSION ENGINE — harmonic dissonance wheel + overtone display
   Drop trigger at the bottom fires everything simultaneously.
═══════════════════════════════════════════════════════ */
reg('edm-lab', {
  category:'Audio — Production', summary:'Full EDM build studio: bass, rhythm-density, and tension engines.', needs:[],
  label:'EDM Lab', icon:'⚡', accent:'#ff2266',
  width:860, height:620, minWidth:680, minHeight:500,
  mountEngine(instanceId, intakeResult, sBus) {
    EDMLabEngine.mount(instanceId, sBus, KERNEL.audio, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {

    /* ─────────────────────────────────────────────────────
       ROOT LAYOUT
       Three columns side by side + drop bar at bottom.
    ───────────────────────────────────────────────────── */
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--bg0);';

    const cols = document.createElement('div');
    cols.style.cssText = 'display:flex;flex:1;min-height:0;gap:1px;background:var(--b1);';

    /* ─────────────────────────────────────────────────────
       SHARED SECTION HEADER HELPER
    ───────────────────────────────────────────────────── */
    function mkSection(title, color, onToggle) {
      const wrap = document.createElement('div');
      wrap.style.cssText = `display:flex;flex-direction:column;flex:1;background:var(--bg1);min-width:0;`;

      const hdr = document.createElement('div');
      hdr.style.cssText = `display:flex;align-items:center;gap:7px;padding:7px 10px;border-bottom:1px solid var(--b1);flex-shrink:0;background:var(--bg2);`;

      const dot = document.createElement('div');
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${color};opacity:.4;flex-shrink:0;transition:opacity .2s,box-shadow .2s;cursor:pointer;`;
      dot.title = 'Toggle engine';
      dot.addEventListener('click', () => onToggle(dot));

      const lbl = document.createElement('div');
      lbl.style.cssText = `font-family:var(--orb);font-size:8px;font-weight:700;letter-spacing:.2em;color:${color};opacity:.7;`;
      lbl.textContent = title;

      const status = document.createElement('div');
      status.style.cssText = `font-family:var(--mono);font-size:6.5px;color:var(--dim);letter-spacing:.1em;margin-left:auto;`;
      status.textContent = 'OFF';

      hdr.appendChild(dot); hdr.appendChild(lbl); hdr.appendChild(status);
      wrap.appendChild(hdr);
      return { wrap, dot, status, color };
    }

    /* ═════════════════════════════════════════════════════
       COLUMN 1 — BASS ENGINE
       A filter frequency response curve you interact with.
       Drag the cutoff point on the curve itself.
       LFO makes the curve breathe live.
    ═════════════════════════════════════════════════════ */
    let bassRunning = false;

    const { wrap: bassWrap, dot: bassDot, status: bassStatus } = mkSection('BASS ENGINE', '#00ff88', (dot) => {
      bassRunning = !bassRunning;
      _pub('ui:bass-toggle', {});
      dot.style.opacity    = bassRunning ? '1' : '.4';
      dot.style.boxShadow  = bassRunning ? `0 0 8px #00ff88` : '';
      bassStatus.textContent = bassRunning ? 'ON' : 'OFF';
      bassStatus.style.color = bassRunning ? '#00ff88' : 'var(--dim)';
    });

    /* Filter curve canvas */
    const filterCanvas = document.createElement('canvas');
    filterCanvas.style.cssText = 'width:100%;flex:1;display:block;cursor:crosshair;';
    bassWrap.appendChild(filterCanvas);

    /* Bass params below canvas */
    const bassParams = document.createElement('div');
    bassParams.style.cssText = 'display:flex;flex-direction:column;gap:5px;padding:8px;border-top:1px solid var(--b1);flex-shrink:0;';

    /* Mini param rows */
    function mkParamRow(label, min, max, val, step, unit, color, onInput) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:7px;';
      const lbl = document.createElement('div');
      lbl.style.cssText = `font-family:var(--mono);font-size:6.5px;color:var(--dim2);letter-spacing:.1em;min-width:44px;flex-shrink:0;`;
      lbl.textContent = label;
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = val;
      slider.style.cssText = `flex:1;accent-color:${color};height:3px;cursor:pointer;`;
      const valEl = document.createElement('div');
      valEl.style.cssText = `font-family:var(--mono);font-size:6.5px;color:${color};min-width:32px;text-align:right;`;
      valEl.textContent = `${val}${unit}`;
      slider.addEventListener('input', () => {
        valEl.textContent = `${slider.value}${unit}`;
        onInput(+slider.value);
      });
      row.appendChild(lbl); row.appendChild(slider); row.appendChild(valEl);
      bassParams.appendChild(row);
      return slider;
    }

    const freqSlider  = mkParamRow('FREQ',   20,  220, 55,  1,   'Hz','#00ff88', v => _pub('ui:bass-param', { key:'freq',     val:v }));
    const cutSlider   = mkParamRow('CUTOFF', 80, 4000, 600, 10,  'Hz','#00ff88', v => _pub('ui:bass-param', { key:'cutoff',   val:v }));
    const resSlider   = mkParamRow('RES',    0.5, 20,  8,   0.5, '',  '#00ff88', v => _pub('ui:bass-param', { key:'res',      val:v }));
    const rateSlider  = mkParamRow('LFO Hz', 0.1, 16,  4,   0.1, 'Hz','#00d4ff', v => _pub('ui:bass-param', { key:'lfoRate',  val:v }));
    const depthSlider = mkParamRow('DEPTH',  0,  2000, 800, 10,  '',  '#00d4ff', v => _pub('ui:bass-param', { key:'lfoDepth', val:v }));
    const driveSlider = mkParamRow('DRIVE',  0,   1,   0.5, 0.01,'',  '#ff2266', v => _pub('ui:bass-param', { key:'drive',    val:v }));

    /* Waveform selector */
    const waveRow = document.createElement('div');
    waveRow.style.cssText = 'display:flex;gap:3px;';
    ['sawtooth','square','triangle','sine'].forEach(w => {
      const btn = document.createElement('button');
      btn.textContent = w.slice(0,3).toUpperCase();
      btn.style.cssText = `flex:1;height:18px;border-radius:2px;border:1px solid ${w==='sawtooth'?'#00ff88':'var(--b2)'};background:${w==='sawtooth'?'rgba(0,255,136,.1)':'transparent'};color:${w==='sawtooth'?'#00ff88':'var(--dim)'};font-family:var(--mono);font-size:6px;letter-spacing:.08em;cursor:pointer;transition:all .12s;outline:none;`;
      btn.addEventListener('click', () => {
        waveRow.querySelectorAll('button').forEach(b => { b.style.borderColor='var(--b2)'; b.style.color='var(--dim)'; b.style.background='transparent'; });
        btn.style.borderColor='#00ff88'; btn.style.color='#00ff88'; btn.style.background='rgba(0,255,136,.1)';
        _pub('ui:bass-param', { key:'wave', val:w });
      });
      waveRow.appendChild(btn);
    });
    bassParams.appendChild(waveRow);
    bassWrap.appendChild(bassParams);

    /* Filter canvas rendering */
    let _bassFilterPos = 0.5;
    let _draggingFilter = false;
    let _bassParams = { cutoff:600, res:8, lfoDepth:800 };

    function drawFilterCurve() {
      const W = filterCanvas.offsetWidth, H = filterCanvas.offsetHeight;
      if (!W || !H) return;
      filterCanvas.width = W; filterCanvas.height = H;
      const ctx = filterCanvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);

      /* Background grid */
      ctx.strokeStyle = 'rgba(42,60,88,.35)'; ctx.lineWidth = .5;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i*W/4,0); ctx.lineTo(i*W/4,H); ctx.stroke(); }
      for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0,i*H/3); ctx.lineTo(W,i*H/3); ctx.stroke(); }

      /* Frequency labels */
      ctx.fillStyle='rgba(100,136,168,.4)'; ctx.font='6px "Share Tech Mono",monospace'; ctx.textAlign='center';
      ['20Hz','200Hz','2kHz','20kHz'].forEach((l,i) => ctx.fillText(l, i*W/3+W/6, H-4));

      const cutoff   = _bassParams.cutoff;
      const res      = _bassParams.res;
      const depth    = _bassParams.depth || 800;
      const animated = _bassFilterPos; /* 0-1 animated position */

      /* Animated cutoff position */
      const animCut = Math.max(20, Math.min(20000, cutoff + (animated - 0.5) * depth * 2));
      const cutX    = (Math.log10(animCut) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20)) * W;

      /* Draw filter response curve */
      ctx.beginPath(); ctx.strokeStyle = bassRunning ? '#00ff88' : 'rgba(0,255,136,.3)'; ctx.lineWidth = 2;
      for (let px = 0; px < W; px++) {
        const freq = Math.pow(10, Math.log10(20) + (px/W) * (Math.log10(20000) - Math.log10(20)));
        const ratio = freq / animCut;
        /* Simplified 2nd-order lowpass response */
        const q     = res / 2;
        const denom = Math.sqrt(Math.pow(1 - ratio*ratio, 2) + Math.pow(ratio/q, 2));
        let   db    = -20 * Math.log10(Math.max(denom, 0.001));
        /* Resonance peak */
        if (Math.abs(ratio - 1) < 0.3) db += (res - 0.7) * 2;
        db = Math.max(-40, Math.min(12, db));
        const y = H * 0.5 - (db / 40) * H * 0.4;
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.stroke();

      /* Fill under curve */
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fillStyle = bassRunning ? 'rgba(0,255,136,.07)' : 'rgba(0,255,136,.03)';
      ctx.fill();

      /* Cutoff handle */
      ctx.beginPath();
      ctx.arc(cutX, H * 0.35, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88';
      ctx.fill();
      if (bassRunning) { ctx.shadowColor='#00ff88'; ctx.shadowBlur=10; ctx.fill(); ctx.shadowBlur=0; }

      /* LFO sweep indicator */
      const loX = Math.max(0, cutX - (depth/20000)*W*0.3);
      const hiX = Math.min(W, cutX + (depth/20000)*W*0.3);
      ctx.fillStyle = 'rgba(0,212,255,.12)';
      ctx.fillRect(loX, 0, hiX - loX, H);
    }

    /* Drag cutoff on canvas */
    filterCanvas.addEventListener('pointerdown', e => {
      _draggingFilter = true; filterCanvas.setPointerCapture(e.pointerId);
    });
    filterCanvas.addEventListener('pointermove', e => {
      if (!_draggingFilter) return;
      const r = filterCanvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const freq = Math.round(Math.pow(10, Math.log10(20) + x * (Math.log10(20000) - Math.log10(20))));
      _bassParams.cutoff = freq;
      cutSlider.value = Math.min(4000, freq);
      cutSlider.dispatchEvent(new Event('input'));
    });
    filterCanvas.addEventListener('pointerup', () => _draggingFilter = false);

    /* ═════════════════════════════════════════════════════
       COLUMN 2 — RHYTHM ENGINE
       A 2D density canvas. Paint with mouse/touch.
       Y = kit track, X = time in bar.
       Brightness = probability of firing.
       Current step scans across as a cursor.
    ═════════════════════════════════════════════════════ */
    let rhythmRunning = false;
    const TRACKS = 8, STEPS = 32;
    const KIT_NAMES  = ['KICK','SNARE','GALLOP','GALLOP2','OPEN HAT','CLAP','808','RISER'];
    const KIT_COLORS = ['#00ff88','#00ff88','#00d4ff','#00d4ff','#6a88a8','#00ff88','#ff2266','#aa44ff'];

    const { wrap: rhythmWrap, dot: rhythmDot, status: rhythmStatus } = mkSection('RHYTHM ENGINE', '#00d4ff', (dot) => {
      rhythmRunning = !rhythmRunning;
      _pub('ui:rhythm-toggle', {});
      dot.style.opacity    = rhythmRunning ? '1' : '.4';
      dot.style.boxShadow  = rhythmRunning ? '0 0 8px #00d4ff' : '';
      rhythmStatus.textContent = rhythmRunning ? 'ON' : 'OFF';
      rhythmStatus.style.color = rhythmRunning ? '#00d4ff' : 'var(--dim)';
    });

    /* Label column + canvas side by side */
    const rhythmBody = document.createElement('div');
    rhythmBody.style.cssText = 'display:flex;flex:1;min-height:0;';

    /* Track labels */
    const trackLabels = document.createElement('div');
    trackLabels.style.cssText = 'display:flex;flex-direction:column;width:56px;flex-shrink:0;border-right:1px solid var(--b1);';
    KIT_NAMES.forEach((name, i) => {
      const lbl = document.createElement('div');
      lbl.style.cssText = `flex:1;display:flex;align-items:center;justify-content:flex-end;padding-right:5px;font-family:var(--mono);font-size:6px;color:${KIT_COLORS[i]};letter-spacing:.06em;border-bottom:1px solid var(--b1);cursor:pointer;transition:background .12s;`;
      lbl.textContent = name;
      lbl.title = 'Click to clear / double-click to fill';
      lbl.addEventListener('click', () => _pub('ui:rhythm-clear', { track: i }));
      lbl.addEventListener('dblclick', () => {
        for(let s=0;s<STEPS;s++) densityCache[i][s] = 0.8;
        drawDensity();
      });
      trackLabels.appendChild(lbl);
    });

    /* Density canvas */
    const densityCanvas = document.createElement('canvas');
    densityCanvas.style.cssText = 'flex:1;display:block;cursor:crosshair;';
    rhythmBody.appendChild(trackLabels); rhythmBody.appendChild(densityCanvas);
    rhythmWrap.appendChild(rhythmBody);

    /* Preset row */
    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;gap:3px;padding:5px 8px;border-top:1px solid var(--b1);flex-shrink:0;';
    const presetLbl = document.createElement('div');
    presetLbl.style.cssText = 'font-family:var(--mono);font-size:6.5px;color:var(--dim);letter-spacing:.1em;display:flex;align-items:center;margin-right:3px;';
    presetLbl.textContent = 'PRESET';
    presetRow.appendChild(presetLbl);
    ['tranki','drop','build'].forEach(p => {
      const btn = document.createElement('button');
      btn.textContent = p.toUpperCase();
      btn.style.cssText = 'flex:1;height:18px;border-radius:2px;border:1px solid var(--b2);background:transparent;color:var(--dim2);font-family:var(--mono);font-size:6.5px;letter-spacing:.08em;cursor:pointer;transition:all .12s;outline:none;';
      btn.addEventListener('mouseenter', () => { btn.style.borderColor='#00d4ff'; btn.style.color='#00d4ff'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor='var(--b2)'; btn.style.color='var(--dim2)'; });
      btn.addEventListener('click', () => _pub('ui:rhythm-preset', { preset: p }));
      presetRow.appendChild(btn);
    });
    rhythmWrap.appendChild(presetRow);

    /* Local density cache for rendering */
    let densityCache = Array.from({ length: TRACKS }, () => new Float32Array(STEPS).fill(0));
    /* Default tranki pattern */
    [[0,8,16,24],[4,12,20,28],[0,2,3,6,8,10,11,14],[1,5,9,13],[],[4,12],[],[]].forEach((steps, ti) => {
      steps.forEach(s => densityCache[ti][s] = 0.85);
    });

    let _rhythmStep = 0;
    let _painting   = false;
    let _paintVal   = 1;
    let _lastPaintCell = null;

    function drawDensity() {
      const W = densityCanvas.offsetWidth, H = densityCanvas.offsetHeight;
      if (!W || !H) return;
      densityCanvas.width = W; densityCanvas.height = H;
      const ctx = densityCanvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);

      const cellW = W / STEPS, cellH = H / TRACKS;

      for (let ti = 0; ti < TRACKS; ti++) {
        for (let si = 0; si < STEPS; si++) {
          const d = densityCache[ti][si];
          if (d > 0) {
            const alpha = 0.15 + d * 0.75;
            ctx.fillStyle = KIT_COLORS[ti] + Math.round(alpha * 255).toString(16).padStart(2,'0');
            const pad = 1;
            ctx.fillRect(si*cellW+pad, ti*cellH+pad, cellW-pad*2, cellH-pad*2);
            /* Bar markers */
            if (si % 8 === 0) {
              ctx.fillStyle = 'rgba(255,255,255,.04)';
              ctx.fillRect(si*cellW, ti*cellH, cellW, cellH);
            }
          }
        }
      }

      /* Grid lines */
      ctx.strokeStyle = 'rgba(42,60,88,.4)'; ctx.lineWidth = .5;
      for (let si = 0; si <= STEPS; si++) {
        ctx.beginPath(); ctx.moveTo(si*cellW, 0); ctx.lineTo(si*cellW, H); ctx.stroke();
      }
      for (let ti = 0; ti <= TRACKS; ti++) {
        ctx.beginPath(); ctx.moveTo(0, ti*cellH); ctx.lineTo(W, ti*cellH); ctx.stroke();
      }

      /* Bar lines */
      ctx.strokeStyle = 'rgba(238,244,255,.15)'; ctx.lineWidth = 1;
      for (let b = 0; b <= 4; b++) {
        const x = b * W / 4;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      /* Step cursor */
      if (rhythmRunning) {
        const x = _rhythmStep * cellW;
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(x, 0, cellW, H);
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      /* Beat numbers */
      ctx.fillStyle = 'rgba(100,136,168,.3)'; ctx.font = '6px "Share Tech Mono",monospace'; ctx.textAlign='center';
      for (let b = 0; b < 4; b++) ctx.fillText(b+1, (b*8+4)*cellW, 8);
    }

    function _canvasToCell(e) {
      const r = densityCanvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const step  = Math.floor(x / r.width  * STEPS);
      const track = Math.floor(y / r.height * TRACKS);
      return { step: Math.max(0,Math.min(STEPS-1,step)), track: Math.max(0,Math.min(TRACKS-1,track)) };
    }

    densityCanvas.addEventListener('pointerdown', e => {
      _painting = true; densityCanvas.setPointerCapture(e.pointerId);
      const { step, track } = _canvasToCell(e);
      _paintVal = densityCache[track][step] > 0.5 ? 0 : 1; /* toggle erase/paint */
      _lastPaintCell = null;
      _doPaint(e);
    });
    densityCanvas.addEventListener('pointermove', e => { if (_painting) _doPaint(e); });
    densityCanvas.addEventListener('pointerup',   () => { _painting = false; _lastPaintCell = null; });

    function _doPaint(e) {
      const { step, track } = _canvasToCell(e);
      const key = `${track},${step}`;
      if (key === _lastPaintCell) return;
      _lastPaintCell = key;
      densityCache[track][step] = _paintVal;
      _pub('ui:rhythm-paint', { track, step, radius: 0, val: _paintVal });
      drawDensity();
    }

    /* ═════════════════════════════════════════════════════
       COLUMN 3 — TENSION ENGINE
       A dial from consonant to dissonant.
       Overtones shown as vertical bars spreading apart.
       Drag the dial clockwise = more tension.
    ═════════════════════════════════════════════════════ */
    let tensionRunning = false;
    let _tensionVal    = 0;
    let _tensionLevel  = 0.5;

    const { wrap: tensionWrap, dot: tensionDot, status: tensionStatus } = mkSection('TENSION ENGINE', '#aa44ff', (dot) => {
      tensionRunning = !tensionRunning;
      _pub('ui:tension-toggle', {});
      dot.style.opacity   = tensionRunning ? '1' : '.4';
      dot.style.boxShadow = tensionRunning ? '0 0 8px #aa44ff' : '';
      tensionStatus.textContent = tensionRunning ? 'ON' : 'OFF';
      tensionStatus.style.color = tensionRunning ? '#aa44ff' : 'var(--dim)';
    });

    /* Overtone display canvas */
    const overtoneCanvas = document.createElement('canvas');
    overtoneCanvas.style.cssText = 'width:100%;flex:1;display:block;';
    tensionWrap.appendChild(overtoneCanvas);

    /* Tension dial + label */
    const dialWrap = document.createElement('div');
    dialWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:10px 8px;border-top:1px solid var(--b1);flex-shrink:0;gap:8px;';

    /* Big tension dial as SVG */
    const dialSVG = document.createElementNS('http://www.w3.org/2000/svg','svg');
    dialSVG.setAttribute('width','120'); dialSVG.setAttribute('height','80');
    dialSVG.style.cursor = 'ew-resize';
    dialSVG.innerHTML = `
      <defs>
        <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#00ff88;stop-opacity:.6"/>
          <stop offset="50%" style="stop-color:#ffaa00;stop-opacity:.8"/>
          <stop offset="100%" style="stop-color:#ff2266;stop-opacity:1"/>
        </linearGradient>
      </defs>
      <!-- Track arc -->
      <path d="M 15 70 A 45 45 0 0 1 105 70" stroke="rgba(42,60,88,.8)" stroke-width="4" fill="none"/>
      <!-- Fill arc (dynamic) -->
      <path id="tArcFill" d="M 15 70 A 45 45 0 0 1 15 70" stroke="url(#arcGrad)" stroke-width="4" fill="none" stroke-linecap="round"/>
      <!-- Handle -->
      <circle id="tHandle" cx="15" cy="70" r="6" fill="#aa44ff" opacity=".8"/>
      <!-- Label -->
      <text x="60" y="52" text-anchor="middle" font-family="'Share Tech Mono',monospace" font-size="7" fill="rgba(100,136,168,.8)">CONSONANT</text>
      <text id="tValLabel" x="60" y="30" text-anchor="middle" font-family="'Orbitron',monospace" font-size="14" font-weight="900" fill="#aa44ff">0</text>
    `;

    /* Drag to turn dial */
    let _dialDragging = false, _dialStartX = 0, _dialStartVal = 0;
    dialSVG.addEventListener('pointerdown', e => { _dialDragging=true; _dialStartX=e.clientX; _dialStartVal=_tensionVal; dialSVG.setPointerCapture(e.pointerId); });
    dialSVG.addEventListener('pointermove', e => {
      if (!_dialDragging) return;
      const delta = (e.clientX - _dialStartX) * 0.8;
      _tensionVal = Math.max(0, Math.min(100, _dialStartVal + delta));
      _updateDial();
      _pub('ui:tension-val', { val: _tensionVal });
    });
    dialSVG.addEventListener('pointerup', () => _dialDragging = false);

    function _updateDial() {
      const t = _tensionVal / 100;
      /* Arc from 15,70 (left) to 105,70 (right) — semi-circle */
      const angle  = -Math.PI + t * Math.PI; /* -π to 0 */
      const cx = 60, cy = 70, r = 45;
      const hx = cx + r * Math.cos(angle);
      const hy = cy + r * Math.sin(angle);
      const large = t > 0.5 ? 1 : 0;
      const fillPath = `M 15 70 A 45 45 0 ${large} 1 ${hx.toFixed(1)} ${hy.toFixed(1)}`;
      dialSVG.querySelector('#tArcFill').setAttribute('d', fillPath);
      dialSVG.querySelector('#tHandle').setAttribute('cx', hx.toFixed(1));
      dialSVG.querySelector('#tHandle').setAttribute('cy', hy.toFixed(1));
      dialSVG.querySelector('#tValLabel').textContent = Math.round(_tensionVal);
      const color = _tensionVal < 33 ? '#00ff88' : _tensionVal < 66 ? '#ffaa00' : '#ff2266';
      dialSVG.querySelector('#tHandle').setAttribute('fill', color);
      dialSVG.querySelector('#tValLabel').setAttribute('fill', color);
      /* Label */
      const labelEl = dialSVG.querySelector('text:first-of-type');
      labelEl.textContent = _tensionVal < 20 ? 'CONSONANT' : _tensionVal < 50 ? 'TENSION' : _tensionVal < 80 ? 'DISSONANT' : 'CHAOS';
    }

    /* Level slider */
    const levelRow = document.createElement('div');
    levelRow.style.cssText = 'display:flex;align-items:center;gap:7px;width:100%;';
    const levelLbl = document.createElement('div'); levelLbl.style.cssText='font-family:var(--mono);font-size:6.5px;color:var(--dim2);letter-spacing:.1em;min-width:32px;'; levelLbl.textContent='LEVEL';
    const levelSlider = document.createElement('input'); levelSlider.type='range'; levelSlider.min=0; levelSlider.max=1; levelSlider.step=.01; levelSlider.value=.5;
    levelSlider.style.cssText = 'flex:1;accent-color:#aa44ff;height:3px;cursor:pointer;';
    levelSlider.addEventListener('input', () => _pub('ui:tension-level', { val: +levelSlider.value }));
    levelRow.appendChild(levelLbl); levelRow.appendChild(levelSlider);

    const freqRow = document.createElement('div');
    freqRow.style.cssText = 'display:flex;align-items:center;gap:7px;width:100%;';
    const freqLblT = document.createElement('div'); freqLblT.style.cssText='font-family:var(--mono);font-size:6.5px;color:var(--dim2);letter-spacing:.1em;min-width:32px;'; freqLblT.textContent='ROOT';
    const freqSliderT = document.createElement('input'); freqSliderT.type='range'; freqSliderT.min=40; freqSliderT.max=220; freqSliderT.step=1; freqSliderT.value=110;
    freqSliderT.style.cssText='flex:1;accent-color:#aa44ff;height:3px;cursor:pointer;';
    freqSliderT.addEventListener('input', () => _pub('ui:tension-freq', { val: +freqSliderT.value }));
    freqRow.appendChild(freqLblT); freqRow.appendChild(freqSliderT);

    dialWrap.appendChild(dialSVG); dialWrap.appendChild(levelRow); dialWrap.appendChild(freqRow);
    tensionWrap.appendChild(dialWrap);

    /* Overtone canvas rendering */
    let _overtones = [];
    function drawOvertones() {
      const W = overtoneCanvas.offsetWidth, H = overtoneCanvas.offsetHeight;
      if (!W || !H) return;
      overtoneCanvas.width = W; overtoneCanvas.height = H;
      const ctx = overtoneCanvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'var(--bg2)'; ctx.fillRect(0,0,W,H);

      if (!_overtones.length) {
        ctx.fillStyle = 'rgba(100,136,168,.2)'; ctx.font='7px "Share Tech Mono",monospace'; ctx.textAlign='center';
        ctx.fillText('ENABLE TENSION ENGINE', W/2, H/2);
        return;
      }

      const baseFreq = _overtones[0]?.freq || 110;
      const logMin = Math.log10(baseFreq * 0.9);
      const logMax = Math.log10(Math.max(..._overtones.map(o => o.freq)) * 1.1);

      _overtones.forEach((ot, i) => {
        const x    = ((Math.log10(ot.freq) - logMin) / (logMax - logMin)) * W;
        const barH = ot.amplitude * (H * 0.7);
        const y    = H - barH;
        const alpha= tensionRunning ? 0.6 + ot.amplitude * 0.4 : 0.2;
        const hue  = 270 - (_tensionVal / 100) * 120; /* purple → red */
        ctx.fillStyle = `hsla(${hue},80%,60%,${alpha})`;
        ctx.fillRect(x-2, y, 4, barH);
        if (tensionRunning) {
          ctx.shadowColor = `hsl(${hue},80%,60%)`; ctx.shadowBlur = 6 + ot.amplitude * 8;
          ctx.fillRect(x-2, y, 4, barH); ctx.shadowBlur = 0;
        }
        ctx.fillStyle = `hsla(${hue},60%,70%,.4)`;
        ctx.font='6px "Share Tech Mono",monospace'; ctx.textAlign='center';
        const ratio = ot.ratio.toFixed(2);
        ctx.fillText(ratio, x, H - 2);
      });

      /* Dissonance label */
      const label = _tensionVal < 20 ? 'HARMONIC' : _tensionVal < 50 ? 'TENSION' : _tensionVal < 80 ? 'DISSONANT' : 'CLUSTER';
      ctx.fillStyle = _tensionVal < 33 ? '#00ff88' : _tensionVal < 66 ? '#ffaa00' : '#ff2266';
      ctx.font = 'bold 8px "Share Tech Mono",monospace'; ctx.textAlign = 'right';
      ctx.fillText(label, W-6, 14);
    }

    /* ═════════════════════════════════════════════════════
       BOTTOM — BPM + DROP TRIGGER
    ═════════════════════════════════════════════════════ */
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--b2);background:var(--bg2);flex-shrink:0;height:54px;';

    /* BPM */
    const bpmBlock = document.createElement('div');
    bpmBlock.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:ns-resize;flex-shrink:0;';
    const bpmVal = document.createElement('div'); bpmVal.style.cssText='font-family:var(--orb);font-size:20px;font-weight:900;color:var(--accent);letter-spacing:.04em;'; bpmVal.textContent = KERNEL.clock.BPM;
    const bpmLbl = document.createElement('div'); bpmLbl.style.cssText='font-family:var(--mono);font-size:6.5px;color:var(--dim);letter-spacing:.14em;'; bpmLbl.textContent='BPM';
    bpmBlock.appendChild(bpmVal); bpmBlock.appendChild(bpmLbl);
    let _bbd=false,_bby=0,_bbv=KERNEL.clock.BPM;
    bpmBlock.addEventListener('pointerdown',e=>{_bbd=true;_bby=e.clientY;_bbv=KERNEL.clock.BPM;bpmBlock.setPointerCapture(e.pointerId);});
    bpmBlock.addEventListener('pointermove',e=>{if(!_bbd)return;const v=Math.max(60,Math.min(220,_bbv+Math.round((_bby-e.clientY)*.5)));bpmVal.textContent=v;_pub('ui:bpm',{val:v});});
    bpmBlock.addEventListener('pointerup',()=>_bbd=false);

    /* Separator */
    const sep = document.createElement('div'); sep.style.cssText='width:1px;height:32px;background:var(--b2);flex-shrink:0;';

    /* Status pills */
    const pills = document.createElement('div');
    pills.style.cssText = 'display:flex;gap:5px;flex-shrink:0;';
    function mkPill(label, color) {
      const p = document.createElement('div');
      p.style.cssText = `padding:2px 7px;border-radius:10px;border:1px solid ${color}44;font-family:var(--mono);font-size:6.5px;color:${color}44;letter-spacing:.1em;transition:all .2s;`;
      p.textContent = label;
      return p;
    }
    const bassPill    = mkPill('BASS',    '#00ff88');
    const rhythmPill  = mkPill('RHYTHM',  '#00d4ff');
    const tensionPill = mkPill('TENSION', '#aa44ff');
    pills.appendChild(bassPill); pills.appendChild(rhythmPill); pills.appendChild(tensionPill);

    /* DROP button */
    const dropBtn = document.createElement('button');
    dropBtn.style.cssText = 'margin-left:auto;height:38px;padding:0 28px;border-radius:4px;border:2px solid #ff2266;background:rgba(255,34,102,.1);color:#ff2266;font-family:var(--orb);font-size:13px;font-weight:900;letter-spacing:.22em;cursor:pointer;transition:all .18s;outline:none;flex-shrink:0;';
    dropBtn.textContent = '⚡ DROP';
    dropBtn.addEventListener('mouseenter', () => { dropBtn.style.background='rgba(255,34,102,.25)'; dropBtn.style.boxShadow='0 0 22px rgba(255,34,102,.4)'; });
    dropBtn.addEventListener('mouseleave', () => { dropBtn.style.background='rgba(255,34,102,.1)'; dropBtn.style.boxShadow=''; });
    dropBtn.addEventListener('click', () => {
      KERNEL.audio.boot(); _pub('ui:drop', {});
      dropBtn.style.transform='scale(.95)';
      setTimeout(()=>dropBtn.style.transform='',120);
    });

    bottomBar.appendChild(bpmBlock); bottomBar.appendChild(sep); bottomBar.appendChild(pills); bottomBar.appendChild(dropBtn);

    /* ─── Assemble ─── */
    cols.appendChild(bassWrap); cols.appendChild(rhythmWrap); cols.appendChild(tensionWrap);
    root.appendChild(cols); root.appendChild(bottomBar);
    content.appendChild(root);

    /* ─── Engine state sync ─── */
    sBus.subscribe('org:state-sync', state => {
      if (state.bass) {
        _bassFilterPos = state.bass.filterPos;
        _bassParams = { ...state.bass.params };
        bassPill.style.color       = state.bass.running ? '#00ff88' : '#00ff8844';
        bassPill.style.borderColor = state.bass.running ? '#00ff88' : '#00ff8844';
      }
      if (state.rhythm) {
        _rhythmStep = state.rhythm.step;
        if (state.rhythm.densityMap) densityCache = state.rhythm.densityMap.map(row => new Float32Array(row));
        rhythmPill.style.color       = state.rhythm.running ? '#00d4ff' : '#00d4ff44';
        rhythmPill.style.borderColor = state.rhythm.running ? '#00d4ff' : '#00d4ff44';
      }
      if (state.tension) {
        _overtones  = state.tension.overtones || [];
        tensionPill.style.color       = state.tension.running ? '#aa44ff' : '#aa44ff44';
        tensionPill.style.borderColor = state.tension.running ? '#aa44ff' : '#aa44ff44';
      }
    });

    sBus.subscribe('org:density-reset', ({ densityMap }) => {
      densityCache = densityMap.map(row => new Float32Array(row));
    });

    sBus.subscribe('org:drop-fired', () => {
      dropBtn.style.transform='scale(.92)';
      dropBtn.style.boxShadow='0 0 40px rgba(255,34,102,.8)';
      setTimeout(()=>{ dropBtn.style.transform=''; dropBtn.style.boxShadow=''; }, 400);
    });

    /* ─── Render loop ─── */
    function renderAll() {
      requestAnimationFrame(renderAll);
      drawFilterCurve();
      drawDensity();
      drawOvertones();
    }
    renderAll();
    _updateDial();
  },
});


/* ═══════════════════════════════════════════════════════
   CONTRAST ANALYSER — rebuilt
   FREQUENCY: hardware-style spectrum analyser
   DYNAMIC:   dual mirrored waveform, RMS overlay
   RHYTHMIC:  transient roll notation, tension arcs
   Each mode is a completely different visual language.
═══════════════════════════════════════════════════════ */
reg('contrast-analyser', {
  category:'Audio — Analysis', summary:'Frequency / dynamic / rhythmic contrast analyser between two sources.', needs:[],
  label:'Contrast Analyser', icon:'⟺', accent:'#00d4ff',
  width:760, height:500, minWidth:560, minHeight:360,
  mountEngine(instanceId, intakeResult, sBus) {
    ContrastAnalyserEngine.mount(instanceId, sBus, KERNEL.audio, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#010308;';

    /* ── Slot drop zones — top bar ── */
    const slotBar = document.createElement('div');
    slotBar.style.cssText = 'display:flex;gap:1px;flex-shrink:0;height:44px;border-bottom:1px solid var(--b1);background:var(--bg2);';

    function mkSlotZone(slot, color, label) {
      const z = document.createElement('div');
      z.style.cssText = `flex:1;display:flex;align-items:center;gap:8px;padding:0 12px;cursor:pointer;transition:background .15s;border-right:2px solid ${color}33;position:relative;`;
      const dot = document.createElement('div');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};opacity:.35;flex-shrink:0;transition:opacity .2s,box-shadow .2s;`;
      const nameEl = document.createElement('div');
      nameEl.style.cssText = `font-family:var(--mono);font-size:8px;color:${color};letter-spacing:.1em;opacity:.5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
      nameEl.textContent = `SLOT ${slot}  —  DROP AUDIO`;
      const durEl = document.createElement('div');
      durEl.style.cssText = `font-family:var(--mono);font-size:7px;color:var(--dim);letter-spacing:.06em;flex-shrink:0;`;
      z.appendChild(dot); z.appendChild(nameEl); z.appendChild(durEl);
      z.addEventListener('dragover', e => { e.preventDefault(); z.style.background=`${color}12`; });
      z.addEventListener('dragleave', () => z.style.background='');
      z.addEventListener('drop', async e => {
        e.preventDefault(); z.style.background='';
        const results = await Intake.ingestAll(e.dataTransfer.files, KERNEL.bus);
        const audio = results.find(r => r.id==='audio:sample');
        if (!audio) return;
        _pub('ui:slot-load', { slot, arrayBuffer: audio.arrayBuffer, name: audio.name });
        nameEl.textContent = audio.name;
        nameEl.style.opacity = '1';
        dot.style.opacity = '1';
        dot.style.boxShadow = `0 0 8px ${color}`;
        durEl.textContent = '…';
      });
      return { el: z, nameEl, durEl, dot };
    }

    const slotA = mkSlotZone('A', '#00d4ff', 'A');
    const slotB = mkSlotZone('B', '#aa44ff', 'B');
    slotBar.appendChild(slotA.el); slotBar.appendChild(slotB.el);

    /* ── Mode selector ── */
    const modeBar = document.createElement('div');
    modeBar.style.cssText = 'display:flex;gap:0;flex-shrink:0;border-bottom:1px solid var(--b1);';
    const MODES = [
      { id:'frequency', label:'FREQUENCY', desc:'Spectral content · clash zones', color:'#00ff88' },
      { id:'dynamic',   label:'DYNAMIC',   desc:'Energy shape · RMS comparison',  color:'#ffaa00' },
      { id:'rhythmic',  label:'RHYTHMIC',  desc:'Transient grid · tension arcs',  color:'#ff2266' },
    ];
    let activeMode = 'frequency';

    MODES.forEach(m => {
      const tab = document.createElement('div');
      tab.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5px 4px;cursor:pointer;border-right:1px solid var(--b1);border-bottom:2px solid transparent;transition:all .15s;`;
      tab.innerHTML = `<div style="font-family:var(--orb);font-size:7.5px;font-weight:700;letter-spacing:.14em;color:${m.color};opacity:.4;">${m.label}</div><div style="font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.06em;margin-top:2px;">${m.desc}</div>`;
      tab.dataset.mode = m.id;
      tab.addEventListener('click', () => {
        activeMode = m.id;
        _pub('ui:mode-change', { mode: m.id });
        Array.from(modeBar.children).forEach(t => {
          const on = t.dataset.mode === m.id;
          t.style.borderBottomColor = on ? m.color : 'transparent';
          t.style.background = on ? `${m.color}0a` : 'transparent';
          t.querySelector('div').style.opacity = on ? '1' : '.4';
        });
      });
      modeBar.appendChild(tab);
    });
    modeBar.children[0].style.borderBottomColor = '#00ff88';
    modeBar.children[0].style.background = '#00ff880a';
    modeBar.children[0].querySelector('div').style.opacity = '1';

    /* ── Main canvas ── */
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;';
    const cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    canvasWrap.appendChild(cvs);

    /* ── Bottom bar — score + analysis text + controls ── */
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 12px;border-top:1px solid var(--b1);background:var(--bg2);flex-shrink:0;';

    const scoreBlock = document.createElement('div');
    scoreBlock.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex-shrink:0;min-width:52px;';
    const scoreNum = document.createElement('div');
    scoreNum.style.cssText = 'font-family:var(--orb);font-size:22px;font-weight:900;color:#00ff88;letter-spacing:.04em;';
    scoreNum.textContent = '—';
    const scoreLbl = document.createElement('div');
    scoreLbl.style.cssText = 'font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.14em;';
    scoreLbl.textContent = 'SCORE';
    scoreBlock.appendChild(scoreNum); scoreBlock.appendChild(scoreLbl);

    const sep = document.createElement('div'); sep.style.cssText='width:1px;height:30px;background:var(--b2);flex-shrink:0;';

    const textEl = document.createElement('div');
    textEl.style.cssText = 'flex:1;font-family:var(--mono);font-size:7.5px;color:var(--dim2);letter-spacing:.06em;line-height:1.7;';
    textEl.textContent = 'Drop audio into both slots to begin analysis';

    /* BPM tap */
    const bpmBlock = document.createElement('div');
    bpmBlock.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;';
    const bpmVal = document.createElement('div');
    bpmVal.style.cssText = 'font-family:var(--orb);font-size:14px;font-weight:700;color:var(--dim2);letter-spacing:.04em;cursor:pointer;';
    bpmVal.textContent = '—';
    const bpmLbl = document.createElement('div');
    bpmLbl.style.cssText = 'font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.12em;';
    bpmLbl.textContent = 'TAP BPM';
    bpmBlock.appendChild(bpmVal); bpmBlock.appendChild(bpmLbl);
    bpmBlock.addEventListener('click', () => _pub('ui:tap-bpm', {}));
    bpmBlock.title = 'Tap repeatedly to set BPM';

    /* Sensitivity control */
    const sensBlock = document.createElement('div');
    sensBlock.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;';
    const sensLbl2 = document.createElement('div'); sensLbl2.style.cssText='font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.12em;'; sensLbl2.textContent='SENSITIVITY';
    const sensSlider = document.createElement('input'); sensSlider.type='range'; sensSlider.min=0; sensSlider.max=1; sensSlider.step=.05; sensSlider.value=.3;
    sensSlider.style.cssText='accent-color:#ff2266;height:3px;width:60px;cursor:pointer;';
    sensSlider.addEventListener('input', () => _pub('ui:config-change', { key:'sensitivity', value:+sensSlider.value }));
    sensBlock.appendChild(sensLbl2); sensBlock.appendChild(sensSlider);

    bottomBar.appendChild(scoreBlock); bottomBar.appendChild(sep); bottomBar.appendChild(textEl);
    bottomBar.appendChild(bpmBlock); bottomBar.appendChild(sensBlock);

    root.appendChild(slotBar); root.appendChild(modeBar);
    root.appendChild(canvasWrap); root.appendChild(bottomBar);
    content.appendChild(root);

    /* ── State ── */
    let state = {
      peaksA:[], peaksB:[], transientsA:[], transientsB:[],
      bpm:128, clash:0, displacement:0, dynContrast:0, text:'',
      peakDbA:0, peakDbB:0,
    };

    /* ── Render ── */
    function draw() {
      requestAnimationFrame(draw);
      const W = cvs.offsetWidth, H = cvs.offsetHeight;
      if (!W || !H) return;
      if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }
      const ctx = cvs.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#010308'; ctx.fillRect(0, 0, W, H);

      if (activeMode === 'frequency') _drawFreq(ctx, W, H);
      if (activeMode === 'dynamic')   _drawDyn(ctx, W, H);
      if (activeMode === 'rhythmic')  _drawRhythmic(ctx, W, H);
    }

    /* ─ FREQUENCY MODE ─
       Hardware spectrum analyser aesthetic.
       Vertical bars, log scale, A cyan B purple, clash region white.
       LED-style horizontal lines across background. */
    function _drawFreq(ctx, W, H) {
      const pA = state.peaksA, pB = state.peaksB;

      /* LED grid lines */
      ctx.strokeStyle = 'rgba(42,60,88,.3)'; ctx.lineWidth = .5;
      for (let i = 0; i < 10; i++) {
        const y = H - (i/9) * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      /* Frequency band markers */
      const bands = [
        { label:'20', freq:20 },{ label:'50', freq:50 },{ label:'100', freq:100 },
        { label:'200', freq:200 },{ label:'500', freq:500 },{ label:'1k', freq:1000 },
        { label:'2k', freq:2000 },{ label:'5k', freq:5000 },{ label:'10k', freq:10000 },
        { label:'20k', freq:20000 },
      ];
      const logMin = Math.log10(20), logMax = Math.log10(20000);
      bands.forEach(b => {
        const x = ((Math.log10(b.freq) - logMin) / (logMax - logMin)) * W;
        ctx.strokeStyle = 'rgba(42,60,88,.5)'; ctx.lineWidth = .5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H-14); ctx.stroke();
        ctx.fillStyle = 'rgba(100,136,168,.4)'; ctx.font='6px "Share Tech Mono",monospace'; ctx.textAlign='center';
        ctx.fillText(b.label, x, H-3);
      });

      if (!pA.length && !pB.length) {
        ctx.fillStyle='rgba(100,136,168,.2)'; ctx.font='8px "Share Tech Mono",monospace'; ctx.textAlign='center';
        ctx.fillText('DROP AUDIO INTO SLOTS A AND B', W/2, H/2);
        return;
      }

      /* Draw bars — both spectra as vertical bar chart */
      function drawBars(peaks, color, offset) {
        if (!peaks.length) return;
        const BAR_W = W / peaks.length;
        peaks.forEach((amp, i) => {
          const x = i * BAR_W + offset;
          const h = Math.max(1, amp * (H - 20));
          const y = H - 20 - h;
          /* Bar segments with LED style */
          const segs = Math.ceil(h / 4);
          for (let s = 0; s < segs; s++) {
            const sy = H - 20 - s * 4 - 3;
            const alpha = 0.4 + (s / segs) * 0.5;
            ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2,'0');
            ctx.fillRect(x, sy, BAR_W * 0.8, 2.5);
          }
          /* Peak cap */
          ctx.fillStyle = color;
          ctx.fillRect(x, y, BAR_W * 0.8, 1.5);
        });
      }

      /* Clash region first (white bg) */
      if (pA.length && pB.length) {
        const n = Math.min(pA.length, pB.length);
        const BAR_W = W / n;
        for (let i = 0; i < n; i++) {
          const overlap = Math.min(pA[i]||0, pB[i]||0);
          if (overlap > 0.08) {
            const h = overlap * (H - 20);
            ctx.fillStyle = `rgba(255,255,255,${overlap * 0.15})`;
            ctx.fillRect(i * BAR_W, H - 20 - h, BAR_W, h);
          }
        }
      }

      drawBars(pA, '#00d4ff', 0);
      drawBars(pB, '#aa44ff', 0);

      /* Score */
      const clash = state.clash;
      const clashColor = clash > 70 ? '#ff2266' : clash > 40 ? '#ffaa00' : '#00ff88';
      ctx.fillStyle = clashColor; ctx.font='bold 11px "Orbitron",monospace'; ctx.textAlign='right';
      ctx.fillText(`CLASH  ${clash}`, W-8, 16);

      /* Legend */
      ctx.fillStyle='#00d4ff'; ctx.font='7px "Share Tech Mono",monospace'; ctx.textAlign='left';
      ctx.fillText('▌ A', 6, 16);
      ctx.fillStyle='#aa44ff';
      ctx.fillText('▌ B', 26, 16);
    }

    /* ─ DYNAMIC MODE ─
       Dual mirrored waveform. A top half (inverted), B bottom.
       RMS average line. Peak dB labels. Energy delta shaded. */
    function _drawDyn(ctx, W, H) {
      const pA = state.peaksA, pB = state.peaksB;
      const mid = H / 2;

      /* Center axis */
      ctx.strokeStyle = 'rgba(42,60,88,.6)'; ctx.lineWidth = 1; ctx.setLineDash([3,5]);
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke(); ctx.setLineDash([]);

      /* Time grid — 4 sections */
      for (let i = 1; i < 4; i++) {
        const x = i * W / 4;
        ctx.strokeStyle = 'rgba(42,60,88,.3)'; ctx.lineWidth = .5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.fillStyle = 'rgba(100,136,168,.25)'; ctx.font='6.5px "Share Tech Mono",monospace'; ctx.textAlign='center';
        ctx.fillText(`${i*25}%`, x, H-4);
      }

      if (!pA.length && !pB.length) {
        ctx.fillStyle='rgba(100,136,168,.2)'; ctx.font='8px "Share Tech Mono",monospace'; ctx.textAlign='center';
        ctx.fillText('DROP AUDIO INTO SLOTS A AND B', W/2, mid); return;
      }

      function drawWaveform(peaks, color, yBase, dir, label) {
        if (!peaks.length) return;
        /* Filled shape */
        ctx.beginPath();
        peaks.forEach((amp, i) => {
          const x = (i / peaks.length) * W;
          const h = amp * (H * 0.42) * dir;
          i === 0 ? ctx.moveTo(x, yBase) : ctx.lineTo(x, yBase - h);
        });
        ctx.lineTo(W, yBase); ctx.lineTo(0, yBase); ctx.closePath();
        ctx.fillStyle = color + '22';
        ctx.fill();

        /* Outline */
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        peaks.forEach((amp, i) => {
          const x = (i / peaks.length) * W;
          const h = amp * (H * 0.42) * dir;
          i === 0 ? ctx.moveTo(x, yBase - h) : ctx.lineTo(x, yBase - h);
        }); ctx.stroke();

        /* Mirror ghost */
        ctx.beginPath(); ctx.strokeStyle = color+'44'; ctx.lineWidth = 0.8;
        peaks.forEach((amp, i) => {
          const x = (i / peaks.length) * W;
          const h = amp * (H * 0.42) * -dir;
          i === 0 ? ctx.moveTo(x, yBase - h) : ctx.lineTo(x, yBase - h);
        }); ctx.stroke();

        /* RMS average line */
        const rms = Math.sqrt(peaks.reduce((a,p)=>a+p*p,0)/peaks.length);
        const rmsY = yBase - rms * (H * 0.42) * dir;
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(0, rmsY); ctx.lineTo(W, rmsY); ctx.stroke(); ctx.setLineDash([]);

        /* Label */
        ctx.fillStyle = color; ctx.font='bold 8px "Share Tech Mono",monospace';
        ctx.textAlign = 'left'; ctx.fillText(label, 6, dir > 0 ? yBase - 8 : yBase + 14);
        ctx.font='6.5px "Share Tech Mono",monospace'; ctx.fillStyle = color+'88';
        if (label === 'A' && state.peakDbA) ctx.fillText(`${Math.round(state.peakDbA)}dB pk`, 18, dir > 0 ? yBase - 8 : yBase + 14);
        if (label === 'B' && state.peakDbB) ctx.fillText(`${Math.round(state.peakDbB)}dB pk`, 18, dir > 0 ? yBase - 8 : yBase + 14);
      }

      /* Energy delta shading between A and B at each point */
      if (pA.length && pB.length) {
        const n = Math.min(pA.length, pB.length);
        for (let i = 0; i < n-1; i++) {
          const x  = (i/n)*W, x2 = ((i+1)/n)*W;
          const aH = (pA[i]||0)*(H*.42), bH = (pB[i]||0)*(H*.42);
          if (Math.abs(aH-bH) > H*.05) {
            ctx.fillStyle='rgba(255,170,0,.04)';
            ctx.fillRect(x, mid-Math.max(aH,bH), x2-x, Math.abs(aH-bH));
          }
        }
      }

      drawWaveform(pA, '#00d4ff', mid, 1,  'A');
      drawWaveform(pB, '#aa44ff', mid, -1, 'B');

      /* Dynamic contrast score */
      const dc = state.dynContrast;
      const dcColor = dc > 50 ? '#00ff88' : dc > 20 ? '#ffaa00' : '#ff2266';
      ctx.fillStyle=dcColor; ctx.font='bold 11px "Orbitron",monospace'; ctx.textAlign='right';
      ctx.fillText(`CONTRAST  ${dc}`, W-8, 16);
    }

    /* ─ RHYTHMIC MODE ─
       Transient notation like a drum roll chart.
       A on top, B on bottom. Shared beat grid.
       Tension arcs where A falls between B's beats.
       Lock dots where they align.
       "Fighting the beat" is visible. */
    function _drawRhythmic(ctx, W, H) {
      const tA = state.transientsA, tB = state.transientsB;
      const mid = H / 2;
      const bpm = state.bpm || 128;
      const beatSec = 60 / bpm;
      const barSec  = beatSec * 4;

      const maxT = Math.max(
        tA.length ? tA[tA.length-1].time_sec + 0.5 : 0,
        tB.length ? tB[tB.length-1].time_sec + 0.5 : 0,
        barSec * 2
      );

      /* Bar/beat grid */
      let t = 0;
      while (t <= maxT) {
        const x = (t / maxT) * W;
        const isBar  = Math.abs(t % barSec) < 0.005;
        const isBeat = Math.abs(t % beatSec) < 0.005;
        const is16th = true;
        ctx.strokeStyle = isBar  ? 'rgba(238,244,255,.22)' :
                          isBeat ? 'rgba(238,244,255,.1)'  : 'rgba(238,244,255,.04)';
        ctx.lineWidth = isBar ? 1 : 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();

        if (isBar) {
          ctx.fillStyle = 'rgba(238,244,255,.3)'; ctx.font='6.5px "Share Tech Mono",monospace'; ctx.textAlign='left';
          ctx.fillText(`${Math.round(t/barSec)+1}`, x+3, 9);
        }
        t += beatSec / 4;
      }

      /* Triplet grid overlay (shows UKG gallop) */
      const tripletSec = beatSec / 3;
      let tt = 0;
      while (tt <= maxT) {
        const x = (tt / maxT) * W;
        ctx.strokeStyle = 'rgba(0,212,255,.06)';
        ctx.lineWidth = 0.5; ctx.setLineDash([1,3]);
        ctx.beginPath(); ctx.moveTo(x, mid*.2); ctx.lineTo(x, mid*.8); ctx.stroke(); ctx.setLineDash([]);
        tt += tripletSec;
      }

      if (!tA.length && !tB.length) {
        ctx.fillStyle='rgba(100,136,168,.2)'; ctx.font='8px "Share Tech Mono",monospace'; ctx.textAlign='center';
        ctx.fillText('DROP AUDIO INTO SLOTS A AND B', W/2, mid); return;
      }

      /* Midline */
      ctx.strokeStyle = 'rgba(42,60,88,.7)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke(); ctx.setLineDash([]);

      /* Tension arcs — where A falls between B's 16th grid positions */
      const grid16 = beatSec / 4;
      tA.forEach(ta => {
        let nearestB = null, nearestDist = Infinity;
        tB.forEach(tb => {
          const dist = Math.abs(ta.time_sec - tb.time_sec);
          if (dist < nearestDist) { nearestDist = dist; nearestB = tb; }
        });

        const gridDist = (ta.time_sec % grid16) / grid16;
        const isTension = gridDist > 0.18 && gridDist < 0.82;

        if (isTension && nearestB) {
          const x1 = (ta.time_sec / maxT) * W;
          const x2 = (nearestB.time_sec / maxT) * W;
          const cx = (x1 + x2) / 2;
          const depth = 20 + nearestDist * 80;
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255,170,0,.35)'; ctx.lineWidth = 1;
          ctx.moveTo(x1, mid - ta.amplitude * mid * 0.6);
          ctx.quadraticCurveTo(cx, mid - depth, x2, mid + nearestB.amplitude * mid * 0.6);
          ctx.stroke();

          /* TENSION label on strongest arcs */
          if (nearestDist > grid16 * 0.4 && ta.amplitude > 0.5) {
            ctx.fillStyle='rgba(255,170,0,.5)'; ctx.font='5.5px "Share Tech Mono",monospace'; ctx.textAlign='center';
            ctx.fillText('TENSION', cx, mid - depth - 4);
          }
        }

        /* Lock dots — where A and B agree */
        if (nearestDist < grid16 * 0.1 && nearestB) {
          const x = (ta.time_sec / maxT) * W;
          ctx.beginPath();
          ctx.arc(x, mid, 4, 0, Math.PI*2);
          ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
        }
      });

      /* A transients — upper half, downward spikes */
      tA.forEach(({ time_sec, amplitude }) => {
        const x = (time_sec / maxT) * W;
        const h = amplitude * (mid - 20) * 0.9;
        ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5 + amplitude * 0.5;
        ctx.beginPath(); ctx.moveTo(x, mid - 4); ctx.lineTo(x, mid - 4 - h); ctx.stroke();
        /* Horizontal tick at top */
        ctx.beginPath(); ctx.moveTo(x-3, mid-4-h); ctx.lineTo(x+3, mid-4-h); ctx.stroke();
        ctx.globalAlpha = 1;
      });

      /* B transients — lower half, upward spikes */
      tB.forEach(({ time_sec, amplitude }) => {
        const x = (time_sec / maxT) * W;
        const h = amplitude * (mid - 20) * 0.9;
        ctx.strokeStyle = '#aa44ff'; ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5 + amplitude * 0.5;
        ctx.beginPath(); ctx.moveTo(x, mid + 4); ctx.lineTo(x, mid + 4 + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x-3, mid+4+h); ctx.lineTo(x+3, mid+4+h); ctx.stroke();
        ctx.globalAlpha = 1;
      });

      /* Labels */
      ctx.fillStyle='#00d4ff88'; ctx.font='7px "Share Tech Mono",monospace'; ctx.textAlign='left'; ctx.fillText('A', 4, 14);
      ctx.fillStyle='#aa44ff88'; ctx.fillText('B', 4, H-5);

      /* Displacement score */
      const disp = state.displacement;
      const dispColor = disp > 60 ? '#ff2266' : disp > 30 ? '#ffaa00' : '#00ff88';
      ctx.fillStyle=dispColor; ctx.font='bold 11px "Orbitron",monospace'; ctx.textAlign='right';
      const dispLabel = disp > 70 ? 'FIGHTING' : disp > 35 ? 'TENSION' : 'LOCKED';
      ctx.fillText(`${dispLabel}  ${disp}`, W-8, 16);

      /* Triplet legend */
      ctx.strokeStyle='rgba(0,212,255,.3)'; ctx.setLineDash([1,3]); ctx.lineWidth=.5;
      ctx.beginPath(); ctx.moveTo(W-60, H-12); ctx.lineTo(W-50, H-12); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='rgba(0,212,255,.35)'; ctx.font='6px "Share Tech Mono",monospace'; ctx.textAlign='left';
      ctx.fillText('= TRIPLET GRID', W-48, H-9);
    }

    draw();

    /* Ruler click to set offset */
    canvasWrap.addEventListener('click', e => {
      if (activeMode !== 'rhythmic') return;
      const r = canvasWrap.getBoundingClientRect();
      const frac = (e.clientX - r.left) / r.width;
      const tA = state.transientsA, tB = state.transientsB;
      const maxT = Math.max(
        tA.length ? tA[tA.length-1].time_sec + .5 : 0,
        tB.length ? tB[tB.length-1].time_sec + .5 : 0,
        4
      );
      _pub('ui:config-change', { key:'offsetA', value: -(frac * maxT * 0.3) });
      _pub('ui:reanalyse', {});
    });

    /* ── State sync ── */
    sBus.subscribe('org:slot-loaded', ({ slot, name, duration, peaks, transients, peakDb: pDb, bpmResult }) => {
      if (slot === 'A') {
        slotA.nameEl.textContent = name;
        slotA.durEl.textContent  = duration ? `${duration.toFixed(1)}s` : '';
        state.peaksA      = peaks;
        state.transientsA = transients;
        state.peakDbA     = pDb;
      }
      if (slot === 'B') {
        slotB.nameEl.textContent = name;
        slotB.durEl.textContent  = duration ? `${duration.toFixed(1)}s` : '';
        state.peaksB      = peaks;
        state.transientsB = transients;
        state.peakDbB     = pDb;
      }
      if (bpmResult) {
        state.bpm = bpmResult.bpm;
        bpmVal.textContent  = bpmResult.bpm;
        bpmVal.style.color  = '#00ff88';
        bpmLbl.textContent  = `${Math.round(bpmResult.confidence*100)}% conf`;
      }
    });

    sBus.subscribe('org:analysis-ready', d => {
      Object.assign(state, d);
      const scoreMap = { frequency: d.clash, dynamic: d.dynContrast, rhythmic: d.displacement };
      const score = scoreMap[activeMode] ?? 0;
      scoreNum.textContent = score;
      scoreNum.style.color = score > 70 ? '#ff2266' : score > 40 ? '#ffaa00' : '#00ff88';
      scoreLbl.textContent = { frequency:'CLASH', dynamic:'CONTRAST', rhythmic:'TENSION' }[activeMode] || 'SCORE';
      textEl.textContent   = d.text || '';
      if (d.bpm) { bpmVal.textContent = d.bpm; bpmVal.style.color = '#00ff88'; }
    });

    sBus.subscribe('org:bpm-detected', ({ bpm: b, confidence }) => {
      state.bpm = b;
      bpmVal.textContent = b; bpmVal.style.color = '#00ff88';
      bpmLbl.textContent = `${Math.round(confidence*100)}% conf`;
    });
  },
});


/* ═══════════════════════════════════════════════════════
   BASS DROP BUILDER — horizontal timeline
   Four stages laid out in time. Drag boundaries to resize.
   Vocal clip sits on a lane above — drag to place.
   Firing shows a cursor sweeping through the stages.
═══════════════════════════════════════════════════════ */
reg('bass-drop-builder', {
  category:'Audio — Production', summary:'Four-stage tension-to-drop arrangement builder.', needs:[],
  label:'Bass Drop Builder', icon:'🔻', accent:'#ff2266',
  width:780, height:400, minWidth:580, minHeight:300,
  mountEngine(instanceId, intakeResult, sBus) {
    BassDropBuilderEngine.mount(instanceId, sBus, KERNEL.audio, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--bg0);';

    /* ── Top bar: BPM + controls + FIRE ── */
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid var(--b1);background:var(--bg2);flex-shrink:0;';

    /* BPM */
    const bpmBlock = document.createElement('div');
    bpmBlock.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:ns-resize;flex-shrink:0;';
    const bpmVal  = document.createElement('div'); bpmVal.style.cssText  = 'font-family:var(--orb);font-size:22px;font-weight:900;color:#ff2266;letter-spacing:.04em;'; bpmVal.textContent = KERNEL.clock.BPM;
    const bpmLbl2 = document.createElement('div'); bpmLbl2.style.cssText = 'font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.14em;'; bpmLbl2.textContent = 'BPM';
    bpmBlock.appendChild(bpmVal); bpmBlock.appendChild(bpmLbl2);
    let _bbd=false,_bby=0,_bbv=KERNEL.clock.BPM;
    bpmBlock.addEventListener('pointerdown',e=>{_bbd=true;_bby=e.clientY;_bbv=KERNEL.clock.BPM;bpmBlock.setPointerCapture(e.pointerId);});
    bpmBlock.addEventListener('pointermove',e=>{if(!_bbd)return;const v=Math.max(60,Math.min(220,_bbv+Math.round((_bby-e.clientY)*.5)));bpmVal.textContent=v;_pub('ui:config-change',{key:'bpm',value:v});});
    bpmBlock.addEventListener('pointerup',()=>_bbd=false);

    const tsep = () => { const s=document.createElement('div'); s.style.cssText='width:1px;height:28px;background:var(--b2);flex-shrink:0;'; return s; };

    /* Bass freq */
    const freqWrap = document.createElement('div'); freqWrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px;cursor:ns-resize;flex-shrink:0;';
    const freqVal  = document.createElement('div'); freqVal.style.cssText='font-family:var(--orb);font-size:14px;font-weight:700;color:#00ff88;'; freqVal.textContent='55Hz';
    const freqLbl  = document.createElement('div'); freqLbl.style.cssText='font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.1em;'; freqLbl.textContent='BASS FREQ';
    freqWrap.appendChild(freqVal); freqWrap.appendChild(freqLbl);
    let _fd=false,_fy=0,_fv=55;
    freqWrap.addEventListener('pointerdown',e=>{_fd=true;_fy=e.clientY;_fv=parseInt(freqVal.textContent);freqWrap.setPointerCapture(e.pointerId);});
    freqWrap.addEventListener('pointermove',e=>{if(!_fd)return;const v=Math.max(20,Math.min(220,_fv+Math.round((_fy-e.clientY)*.5)));freqVal.textContent=`${v}Hz`;_pub('ui:config-change',{key:'freq',value:v});});
    freqWrap.addEventListener('pointerup',()=>_fd=false);

    /* Drive */
    const driveWrap = document.createElement('div'); driveWrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px;cursor:ns-resize;flex-shrink:0;';
    const driveVal  = document.createElement('div'); driveVal.style.cssText='font-family:var(--orb);font-size:14px;font-weight:700;color:#ffaa00;'; driveVal.textContent='60%';
    const driveLbl  = document.createElement('div'); driveLbl.style.cssText='font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.1em;'; driveLbl.textContent='DRIVE';
    driveWrap.appendChild(driveVal); driveWrap.appendChild(driveLbl);
    let _dd=false,_dy2=0,_dv=0.6;
    driveWrap.addEventListener('pointerdown',e=>{_dd=true;_dy2=e.clientY;_dv=parseFloat(driveVal.textContent)/100;driveWrap.setPointerCapture(e.pointerId);});
    driveWrap.addEventListener('pointermove',e=>{if(!_dd)return;const v=Math.max(0,Math.min(1,_dv+(_dy2-e.clientY)*.005));driveVal.textContent=`${Math.round(v*100)}%`;_pub('ui:config-change',{key:'drive',value:v});});
    driveWrap.addEventListener('pointerup',()=>_dd=false);

    /* FIRE button */
    const fireBtn = document.createElement('button');
    fireBtn.style.cssText = 'margin-left:auto;height:38px;padding:0 28px;border-radius:4px;border:2px solid #ff2266;background:rgba(255,34,102,.1);color:#ff2266;font-family:var(--orb);font-size:13px;font-weight:900;letter-spacing:.22em;cursor:pointer;transition:all .18s;outline:none;flex-shrink:0;';
    fireBtn.textContent = '⚡ FIRE';
    fireBtn.addEventListener('mouseenter',()=>{fireBtn.style.background='rgba(255,34,102,.22)';fireBtn.style.boxShadow='0 0 20px rgba(255,34,102,.35)';});
    fireBtn.addEventListener('mouseleave',()=>{fireBtn.style.background='rgba(255,34,102,.1)';fireBtn.style.boxShadow='';});
    fireBtn.addEventListener('click',()=>{ KERNEL.audio.boot(); _pub('ui:fire',{}); });

    topBar.appendChild(bpmBlock); topBar.appendChild(tsep()); topBar.appendChild(freqWrap); topBar.appendChild(tsep()); topBar.appendChild(driveWrap); topBar.appendChild(tsep());
    topBar.appendChild(fireBtn);

    /* ── Vocal drop zone ── */
    const vocalBar = document.createElement('div');
    vocalBar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:0 12px;height:32px;border-bottom:1px solid var(--b1);background:rgba(255,34,102,.04);flex-shrink:0;cursor:pointer;transition:background .15s;';
    const vocalIcon = document.createElement('div'); vocalIcon.style.cssText='font-size:12px;flex-shrink:0;'; vocalIcon.textContent='🎤';
    const vocalName = document.createElement('div'); vocalName.style.cssText='font-family:var(--mono);font-size:8px;color:rgba(255,34,102,.6);letter-spacing:.1em;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; vocalName.textContent='DROP RAVEN VOICE CLIP';
    const vocalDur  = document.createElement('div'); vocalDur.style.cssText='font-family:var(--mono);font-size:7px;color:var(--dim);flex-shrink:0;';
    vocalBar.appendChild(vocalIcon); vocalBar.appendChild(vocalName); vocalBar.appendChild(vocalDur);
    vocalBar.addEventListener('dragover',e=>{e.preventDefault();vocalBar.style.background='rgba(255,34,102,.14)';});
    vocalBar.addEventListener('dragleave',()=>vocalBar.style.background='rgba(255,34,102,.04)');
    vocalBar.addEventListener('drop',async e=>{
      e.preventDefault(); vocalBar.style.background='rgba(255,34,102,.04)';
      const results = await Intake.ingestAll(e.dataTransfer.files, KERNEL.bus);
      const audio = results.find(r=>r.id==='audio:sample');
      if (audio) _pub('ui:load-vocal',{arrayBuffer:audio.arrayBuffer,name:audio.name});
    });

    /* ── Stage timeline canvas ── */
    const timelineWrap = document.createElement('div');
    timelineWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;';
    const cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:ew-resize;';
    timelineWrap.appendChild(cvs);

    /* ── Stage param panel — appears when stage is clicked ── */
    const stagePanel = document.createElement('div');
    stagePanel.style.cssText = 'display:none;flex-direction:column;gap:6px;padding:8px 12px;border-top:1px solid var(--b1);background:var(--bg2);flex-shrink:0;';

    root.appendChild(topBar); root.appendChild(vocalBar);
    root.appendChild(timelineWrap); root.appendChild(stagePanel);
    content.appendChild(root);

    /* ── Stage state ── */
    const STAGES = [
      { id:'tension', label:'TENSION',  color:'#aa44ff', dur:4.0,  desc:'Dissonance builds. Filter closes.' },
      { id:'slope',   label:'SLOPE',    color:'#ffaa00', dur:2.0,  desc:'Density increases. BPM feel rises.' },
      { id:'build',   label:'BUILD',    color:'#00d4ff', dur:4.0,  desc:'Wobble + sub + noise sweep.' },
      { id:'drop',    label:'DROP',     color:'#ff2266', dur:8.0,  desc:'Impact + Reese + neuro burst.' },
    ];

    let _vocalLoaded  = false;
    let _vocalDur     = 0;
    let _vocalPos     = 0;    /* normalized 0-1 across total timeline */
    let _running      = false;
    let _cursorPos    = 0;    /* 0-1 sweeping cursor */
    let _activeStage  = null;
    let _dragging     = null; /* { type:'boundary'|'vocal', index } */

    function totalDur() { return STAGES.reduce((s,st)=>s+st.dur,0); }

    /* Boundary x positions normalized 0-1 */
    function boundaries() {
      let acc = 0;
      return STAGES.map(st => { const x = acc/totalDur(); acc+=st.dur; return x; }).concat([1]);
    }

    /* ── Canvas rendering ── */
    function draw() {
      requestAnimationFrame(draw);
      const W = cvs.offsetWidth, H = cvs.offsetHeight;
      if (!W || !H) return;
      if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }
      const ctx = cvs.getContext('2d');
      ctx.clearRect(0, 0, W, H); ctx.fillStyle='#010308'; ctx.fillRect(0,0,W,H);

      const LABEL_H = 20;
      const VOCAL_H = 34;
      const STAGE_Y = LABEL_H + VOCAL_H;
      const STAGE_H = H - STAGE_Y - 20;
      const total   = totalDur();
      const bounds  = boundaries();

      /* ─ Time ruler ─ */
      const bpm = KERNEL.clock.BPM;
      const beatSec = 60/bpm, barSec = beatSec*4;
      ctx.fillStyle='var(--bg2)'; ctx.fillRect(0,0,W,LABEL_H);
      let t = 0;
      while (t <= total) {
        const x = (t/total)*W;
        const isBar = Math.abs(t%barSec)<.01;
        ctx.strokeStyle=isBar?'rgba(238,244,255,.2)':'rgba(238,244,255,.07)'; ctx.lineWidth=isBar?1:.5;
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,LABEL_H); ctx.stroke();
        if (isBar) {
          ctx.fillStyle='rgba(238,244,255,.3)'; ctx.font='6px "Share Tech Mono",monospace'; ctx.textAlign='left';
          ctx.fillText(`${t.toFixed(0)}s`, x+2, LABEL_H-4);
        }
        t += beatSec;
      }

      /* ─ Vocal lane ─ */
      ctx.fillStyle='rgba(255,34,102,.05)';
      ctx.fillRect(0, LABEL_H, W, VOCAL_H);
      ctx.strokeStyle='rgba(255,34,102,.2)'; ctx.lineWidth=.5;
      ctx.beginPath(); ctx.moveTo(0,LABEL_H+VOCAL_H); ctx.lineTo(W,LABEL_H+VOCAL_H); ctx.stroke();

      ctx.fillStyle='rgba(255,34,102,.25)'; ctx.font='6.5px "Share Tech Mono",monospace'; ctx.textAlign='left';
      ctx.fillText('VOCAL', 6, LABEL_H+VOCAL_H-6);

      if (_vocalLoaded) {
        const vx = _vocalPos * W;
        const vw = Math.max(20, (_vocalDur/total)*W);
        /* Clip body */
        ctx.fillStyle='rgba(255,34,102,.2)';
        ctx.fillRect(vx, LABEL_H+3, vw, VOCAL_H-8);
        ctx.strokeStyle='#ff2266'; ctx.lineWidth=1.5;
        ctx.strokeRect(vx, LABEL_H+3, vw, VOCAL_H-8);
        ctx.fillStyle='#ff2266'; ctx.font='7px "Share Tech Mono",monospace'; ctx.textAlign='left';
        ctx.fillText('🎤', vx+4, LABEL_H+VOCAL_H-9);
      } else {
        ctx.fillStyle='rgba(255,34,102,.15)'; ctx.font='7px "Share Tech Mono",monospace'; ctx.textAlign='center';
        ctx.fillText('← drag vocal clip here →', W/2, LABEL_H+VOCAL_H-8);
      }

      /* ─ Stage blocks ─ */
      STAGES.forEach((st, i) => {
        const x1 = bounds[i] * W;
        const x2 = bounds[i+1] * W;
        const isActive = _activeStage === st.id;

        /* Fill */
        ctx.fillStyle = st.color + (isActive ? '28' : '14');
        ctx.fillRect(x1+1, STAGE_Y, x2-x1-2, STAGE_H);

        /* Border */
        ctx.strokeStyle = st.color + (isActive ? 'cc' : '55');
        ctx.lineWidth = isActive ? 1.5 : 1;
        ctx.strokeRect(x1+1, STAGE_Y, x2-x1-2, STAGE_H);

        /* Waveform sketch — unique per stage */
        ctx.save();
        ctx.beginPath();
        ctx.rect(x1+1, STAGE_Y, x2-x1-2, STAGE_H);
        ctx.clip();
        ctx.strokeStyle = st.color+'88'; ctx.lineWidth = 1.2; ctx.beginPath();
        const pts = 80;
        for (let p = 0; p <= pts; p++) {
          const px = x1 + (p/pts)*(x2-x1);
          const progress = p/pts;
          let amp = 0;
          if (st.id==='tension') amp = Math.sin(p*.4)*Math.sin(p*.15+1)*progress*0.8 + Math.sin(p*.7)*progress*.3;
          if (st.id==='slope')   amp = (Math.sin(p*.6+p*.3)+Math.sin(p*1.1))*.5*progress;
          if (st.id==='build')   amp = (Math.sin(p*.08+p*.3)*Math.sin(p*.04))*0.8 + Math.sin(p*.5)*progress*.4;
          if (st.id==='drop')    amp = p===0?2:Math.sin(p*.2)*Math.exp(-p*.04)*2;
          const cy = STAGE_Y + STAGE_H/2 - amp*(STAGE_H*.38);
          p===0 ? ctx.moveTo(px,cy) : ctx.lineTo(px,cy);
        }
        ctx.stroke(); ctx.restore();

        /* Label */
        const blockW = x2 - x1;
        ctx.fillStyle = st.color; ctx.font=`bold ${Math.min(10,blockW*.07)}px "Orbitron",monospace`; ctx.textAlign='center';
        ctx.fillText(st.label, (x1+x2)/2, STAGE_Y + 14);
        ctx.fillStyle = st.color+'99'; ctx.font='6px "Share Tech Mono",monospace';
        ctx.fillText(`${st.dur.toFixed(1)}s`, (x1+x2)/2, STAGE_Y + 25);

        /* Duration handle — right edge */
        ctx.fillStyle = st.color+'cc';
        ctx.fillRect(x2-3, STAGE_Y, 3, STAGE_H);
        /* Handle grip dots */
        for (let d=0;d<3;d++) {
          ctx.fillStyle='rgba(255,255,255,.4)';
          ctx.fillRect(x2-2, STAGE_Y+STAGE_H/2-8+d*8, 1, 4);
        }
      });

      /* ─ Firing cursor ─ */
      if (_running) {
        const cx = _cursorPos * W;
        ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(cx, LABEL_H); ctx.lineTo(cx, H); ctx.stroke();
        ctx.fillStyle='white';
        ctx.beginPath(); ctx.moveTo(cx-4,LABEL_H); ctx.lineTo(cx+4,LABEL_H); ctx.lineTo(cx,LABEL_H+8); ctx.fill();
      }

      /* ─ Active stage glow ─ */
      if (_activeStage) {
        const i = STAGES.findIndex(s=>s.id===_activeStage);
        if (i>=0) {
          const x1=bounds[i]*W, x2=bounds[i+1]*W;
          ctx.save();
          ctx.shadowColor = STAGES[i].color; ctx.shadowBlur=16;
          ctx.strokeStyle = STAGES[i].color; ctx.lineWidth=2;
          ctx.strokeRect(x1+1,STAGE_Y,x2-x1-2,STAGE_H);
          ctx.restore();
        }
      }

      /* Total duration label */
      ctx.fillStyle='rgba(100,136,168,.4)'; ctx.font='6.5px "Share Tech Mono",monospace'; ctx.textAlign='right';
      ctx.fillText(`${total.toFixed(1)}s total`, W-6, H-5);
    }
    draw();

    /* ── Pointer interaction ── */
    const HANDLE_W = 10;
    const LABEL_H  = 20;
    const VOCAL_H  = 34;
    const STAGE_Y  = LABEL_H + VOCAL_H;

    function _getInteraction(e) {
      const r   = cvs.getBoundingClientRect();
      const x   = e.clientX - r.left;
      const y   = e.clientY - r.top;
      const W   = r.width;
      const H   = r.height;
      const total = totalDur();
      const bounds = boundaries();

      /* Vocal lane drag */
      if (y >= LABEL_H && y < LABEL_H + VOCAL_H && _vocalLoaded) {
        const vx = _vocalPos * W;
        const vw = Math.max(20, (_vocalDur/total)*W);
        if (x >= vx && x <= vx + vw) return { type:'vocal' };
      }

      /* Stage boundary handles */
      for (let i = 1; i < bounds.length - 1; i++) {
        const bx = bounds[i] * W;
        if (Math.abs(x - bx) < HANDLE_W && y >= STAGE_Y) return { type:'boundary', index:i };
      }

      /* Stage click to select */
      if (y >= STAGE_Y) {
        const frac = x / W;
        const idx  = bounds.findIndex((b,i) => frac >= b && frac < (bounds[i+1]||1));
        if (idx >= 0 && idx < STAGES.length) return { type:'stage', index:idx };
      }

      return null;
    }

    let _dragStartX = 0, _dragStartDur = 0, _dragStartVocalPos = 0;

    cvs.addEventListener('pointerdown', e => {
      const action = _getInteraction(e);
      if (!action) return;
      _dragging = action;
      _dragStartX = e.clientX;
      if (action.type === 'boundary') _dragStartDur = STAGES[action.index - 1].dur;
      if (action.type === 'vocal')    _dragStartVocalPos = _vocalPos;
      if (action.type === 'stage')    _selectStage(action.index);
      cvs.setPointerCapture(e.pointerId);
    });

    cvs.addEventListener('pointermove', e => {
      if (!_dragging) return;
      const r     = cvs.getBoundingClientRect();
      const dx    = e.clientX - _dragStartX;
      const total = totalDur();

      if (_dragging.type === 'boundary') {
        const idx = _dragging.index;
        const dSec = (dx / r.width) * total;
        const newDur = Math.max(0.5, _dragStartDur + dSec);
        STAGES[idx-1].dur = newDur;
        /* Push config update */
        const keys = ['tensionDur','slopeDur','buildDur'];
        _pub('ui:config-change', { key: keys[idx-1], value: newDur });
      }

      if (_dragging.type === 'vocal') {
        const newPos = Math.max(0, Math.min(0.95, _dragStartVocalPos + dx/r.width));
        _vocalPos = newPos;
        /* Convert to stage + offset */
        const absSec = newPos * totalDur();
        let acc = 0;
        for (let s = 0; s < STAGES.length; s++) {
          if (absSec < acc + STAGES[s].dur) {
            _pub('ui:config-change', { key:'vocalStage',  value: STAGES[s].id });
            _pub('ui:config-change', { key:'vocalOffset', value: absSec - acc });
            break;
          }
          acc += STAGES[s].dur;
        }
      }
    });

    cvs.addEventListener('pointerup', () => { _dragging = null; });

    /* Cursor style */
    cvs.addEventListener('mousemove', e => {
      const action = _getInteraction(e);
      cvs.style.cursor = action?.type === 'boundary' ? 'ew-resize' :
                         action?.type === 'vocal'    ? 'grab' :
                         action?.type === 'stage'    ? 'pointer' : 'default';
    });

    /* ── Stage panel (shown on stage click) ── */
    function _selectStage(idx) {
      _activeStage = STAGES[idx].id;
      stagePanel.style.display = 'flex';

      stagePanel.innerHTML = '';

      const st = STAGES[idx];
      const hdr = document.createElement('div');
      hdr.style.cssText = `display:flex;align-items:center;gap:8px;`;
      const dot = document.createElement('div'); dot.style.cssText=`width:8px;height:8px;border-radius:50%;background:${st.color};flex-shrink:0;box-shadow:0 0 6px ${st.color};`;
      const lbl = document.createElement('div'); lbl.style.cssText=`font-family:var(--orb);font-size:9px;font-weight:700;color:${st.color};letter-spacing:.16em;`; lbl.textContent=st.label;
      const desc= document.createElement('div'); desc.style.cssText=`font-family:var(--mono);font-size:7px;color:var(--dim2);letter-spacing:.06em;`; desc.textContent=st.desc;
      hdr.appendChild(dot); hdr.appendChild(lbl); hdr.appendChild(desc);
      stagePanel.appendChild(hdr);

      /* Stage-specific params */
      const paramRow = document.createElement('div');
      paramRow.style.cssText = 'display:flex;gap:14px;align-items:center;';

      function mkMiniParam(label, min, max, val, step, unit, key) {
        const wrap2 = document.createElement('div'); wrap2.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px;cursor:ns-resize;';
        const v  = document.createElement('div'); v.style.cssText=`font-family:var(--orb);font-size:12px;font-weight:700;color:${st.color};`; v.textContent=`${val}${unit}`;
        const l2 = document.createElement('div'); l2.style.cssText='font-family:var(--mono);font-size:6px;color:var(--dim);letter-spacing:.1em;'; l2.textContent=label;
        wrap2.appendChild(v); wrap2.appendChild(l2);
        let _d=false,_y=0,_v=val;
        wrap2.addEventListener('pointerdown',e=>{_d=true;_y=e.clientY;_v=parseFloat(v.textContent);wrap2.setPointerCapture(e.pointerId);});
        wrap2.addEventListener('pointermove',e=>{if(!_d)return;const nv=Math.max(min,Math.min(max,_v+(_y-e.clientY)*(max-min)/150));v.textContent=`${step<1?nv.toFixed(1):Math.round(nv)}${unit}`;_pub('ui:config-change',{key,value:+v.textContent.replace(unit,'')});});
        wrap2.addEventListener('pointerup',()=>_d=false);
        paramRow.appendChild(wrap2);
      }

      if (st.id==='tension') { mkMiniParam('INTENSITY',0,1,.6,.01,'',  'tensionIntensity'); }
      if (st.id==='slope')   { mkMiniParam('DENSITY',  0,1,.7,.01,'',  'slopeDensity'); }
      if (st.id==='build')   {
        mkMiniParam('W.RATE', .5,16,6,.5,'Hz','wobbleRate');
        mkMiniParam('W.CUTOFF',100,4000,600,10,'Hz','wobbleCutoff');
        mkMiniParam('W.RES',1,20,8,.5,'','wobbleRes');
      }
      if (st.id==='drop')    { mkMiniParam('DRIVE',0,1,.6,.01,'','drive'); }

      stagePanel.appendChild(paramRow);
    }

    /* ── Engine state sync ── */
    sBus.subscribe('org:state-sync', ({ running, vocalLoaded, vocalName, params }) => {
      if (running !== undefined) {
        _running = running;
        fireBtn.textContent  = running ? '■  STOP' : '⚡ FIRE';
        fireBtn.style.borderColor = running ? '#00ff88' : '#ff2266';
        fireBtn.style.color       = running ? '#00ff88' : '#ff2266';
        fireBtn.style.background  = running ? 'rgba(0,255,136,.1)' : 'rgba(255,34,102,.1)';
      }
      if (vocalLoaded !== undefined) _vocalLoaded = vocalLoaded;
      if (params) {
        ['tensionDur','slopeDur','buildDur'].forEach((k,i) => { if(params[k]) STAGES[i].dur=params[k]; });
      }
    });

    sBus.subscribe('org:vocal-loaded', ({ name, duration }) => {
      _vocalLoaded = true;
      _vocalDur    = duration || 3;
      vocalName.textContent = name;
      vocalName.style.color = '#ff2266';
      vocalBar.style.background = 'rgba(255,34,102,.08)';
    });

    sBus.subscribe('org:stage-active', ({ stage }) => {
      _activeStage = stage;
      /* Advance cursor to that stage's position */
      const bounds = boundaries();
      const idx    = STAGES.findIndex(s => s.id === stage);
      if (idx >= 0) _cursorPos = bounds[idx] + (bounds[idx+1]-bounds[idx])*0.5;
    });

    sBus.subscribe('org:drop-fired', () => {
      _running = true; _cursorPos = 0;
      fireBtn.style.boxShadow='0 0 30px rgba(255,34,102,.7)';
      let t = 0;
      const total = totalDur();
      const tick = () => {
        if (!_running || t >= 1) { _cursorPos=0; _running=false; fireBtn.style.boxShadow=''; return; }
        t += 0.016 / total;
        _cursorPos = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    sBus.subscribe('kernel:bpm-change', ({ BPM }) => { bpmVal.textContent = BPM; });
  },
});

/* ═══════════════════════════════════════════════════════
   SUPERSAW — 7-voice detuned unison lead
═══════════════════════════════════════════════════════ */
reg('supersaw', {
  category:'Audio — Lead Synths', summary:'7-voice detuned supersaw lead/pluck.', needs:[],
  label:'Supersaw', icon:'🌟', accent:'#ffd400',
  width:260, height:320, minWidth:220, minHeight:260,
  mountEngine(instanceId, intakeResult, sBus) { SupersawEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:8px;height:100%;';
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:6px;justify-content:center;flex-wrap:wrap;';
    mkKnob(kRow,{label:'PITCH', min:24,max:96,  value:60, step:1,  unit:'',  eventKey:'pitch', pub:_pub});
    mkKnob(kRow,{label:'VOICES',min:3, max:7,   value:7,  step:1,  unit:'',  eventKey:'voices',pub:_pub});
    mkKnob(kRow,{label:'DETUNE',min:0, max:50,  value:18, step:1,  unit:'¢', eventKey:'detune',pub:_pub});
    mkKnob(kRow,{label:'SPREAD',min:0, max:1,   value:.6, step:.01,unit:'',  eventKey:'spread',pub:_pub});
    mkKnob(kRow,{label:'CUTOFF',min:200,max:12000,value:5000,step:50,unit:'Hz',eventKey:'cutoff',pub:_pub});
    mkKnob(kRow,{label:'DECAY', min:.05,max:3,  value:.6, step:.01,unit:'s', eventKey:'decay', pub:_pub});
    mkScope(wrap,{height:44,color:'rgba(255,212,0,.45)'});
    mkDiv(wrap);
    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:6px;';
    mkBtn(btnRow,'▶ TRIGGER', ()=>_pub('ui:supersaw_trigger',{vel:1}), {h:24,fs:8});
    const sustainBtn=mkBtn(btnRow,'◉ SUSTAIN', ()=>{
      sustainBtn.dataset.on = sustainBtn.dataset.on ? '' : '1';
      sustainBtn.style.borderColor = sustainBtn.dataset.on ? 'var(--accent)' : 'var(--b2)';
      sustainBtn.style.color = sustainBtn.dataset.on ? 'var(--accent)' : 'var(--dim2)';
      _pub('ui:supersaw_toggle',{});
    }, {h:24,fs:8});
    wrap.appendChild(btnRow);
    wrap.appendChild(kRow); content.appendChild(wrap);
  },
});

/* ═══════════════════════════════════════════════════════
   SIDECHAIN — ducks master bus on kick/808/snare/clap
═══════════════════════════════════════════════════════ */
reg('sidechain-compressor', {
  category:'Audio — Dynamics', summary:'Ducks the master bus on a chosen trigger sound — the EDM pump.', needs:[],
  label:'Sidechain', icon:'🫀', accent:'#00d4ff',
  width:230, height:250, minWidth:200, minHeight:220,
  mountEngine(instanceId, intakeResult, sBus) { SidechainCompressorEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:10px;height:100%;';
    mkSelect(wrap,{label:'SOURCE',options:['kick','808','snare','clap'],value:'kick',eventKey:'source',pub:_pub});
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:8px;justify-content:center;';
    mkKnob(kRow,{label:'AMOUNT', min:0,   max:1,  value:.7, step:.01,unit:'',eventKey:'amount', pub:_pub});
    mkKnob(kRow,{label:'ATTACK', min:.001,max:.2, value:.005,step:.001,unit:'s',eventKey:'attack',pub:_pub});
    mkKnob(kRow,{label:'RELEASE',min:.02, max:1.5,value:.28,step:.01,unit:'s',eventKey:'release',pub:_pub});
    wrap.appendChild(kRow);
    mkToggle(wrap,{label:'ENABLED',value:true,eventKey:'enabled',pub:_pub});
    mkBtn(wrap,'TEST PUMP', ()=>_pub('ui:sidechain_test',{}), {h:22,fs:7});
    const info=document.createElement('div'); info.style.cssText='font-family:var(--mono);font-size:6px;color:var(--dim);line-height:1.5;';
    info.textContent='Ducks the shared master gain every time SOURCE fires on the bus — affects the whole mix, not just one channel.';
    wrap.appendChild(info);
    content.appendChild(wrap);
  },
});

/* ═══════════════════════════════════════════════════════
   MASTER FX — reverb / delay / compressor control surface
═══════════════════════════════════════════════════════ */
reg('master-fx', {
  category:'Audio — Mixing', summary:'Control surface for the shared reverb/delay/compressor send bus.', needs:[],
  label:'Master FX', icon:'🎛', accent:'#00ff88',
  width:280, height:300, minWidth:240, minHeight:260,
  mountEngine(instanceId, intakeResult, sBus) { MasterFXEngine.mount(instanceId, sBus, KERNEL.audio, {}); },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:10px;height:100%;';
    const revLbl=document.createElement('div'); revLbl.style.cssText='font-family:var(--mono);font-size:7px;letter-spacing:.14em;color:var(--accent);'; revLbl.textContent='REVERB SEND';
    wrap.appendChild(revLbl);
    const rRow=document.createElement('div'); rRow.style.cssText='display:flex;gap:8px;justify-content:center;';
    mkKnob(rRow,{label:'MIX',  min:0,  max:1, value:.35,step:.01,unit:'',eventKey:'reverbMix',  pub:_pub});
    mkKnob(rRow,{label:'SIZE', min:.2, max:6, value:2.4,step:.05,unit:'s',eventKey:'reverbTime', pub:_pub});
    mkKnob(rRow,{label:'DECAY',min:.5, max:8, value:3.2,step:.1,unit:'', eventKey:'reverbDecay',pub:_pub});
    wrap.appendChild(rRow);
    mkDiv(wrap);
    const delLbl=document.createElement('div'); delLbl.style.cssText='font-family:var(--mono);font-size:7px;letter-spacing:.14em;color:var(--accent2);'; delLbl.textContent='DELAY SEND';
    wrap.appendChild(delLbl);
    const dRow=document.createElement('div'); dRow.style.cssText='display:flex;gap:8px;justify-content:center;';
    mkKnob(dRow,{label:'MIX', min:0,  max:1,  value:.28,step:.01,unit:'',eventKey:'delayMix', pub:_pub});
    mkKnob(dRow,{label:'TIME',min:.02,max:1.5,value:.32,step:.01,unit:'s',eventKey:'delayTime',pub:_pub});
    mkKnob(dRow,{label:'FDBK',min:0,  max:.92,value:.35,step:.01,unit:'',eventKey:'delayFB',  pub:_pub});
    wrap.appendChild(dRow);
    mkDiv(wrap);
    const cLbl=document.createElement('div'); cLbl.style.cssText='font-family:var(--mono);font-size:7px;letter-spacing:.14em;color:var(--dim2);'; cLbl.textContent='MASTER COMPRESSOR';
    wrap.appendChild(cLbl);
    const cRow=document.createElement('div'); cRow.style.cssText='display:flex;gap:8px;justify-content:center;';
    mkKnob(cRow,{label:'THRESH',min:-60,max:0, value:-24,step:1,unit:'dB',eventKey:'compThresh',pub:_pub});
    mkKnob(cRow,{label:'RATIO', min:1,  max:20,value:12, step:1,unit:':1',eventKey:'compRatio', pub:_pub});
    wrap.appendChild(cRow);
    content.appendChild(wrap);
  },
});

/* ═══════════════════════════════════════════════════════
   PHOTO EDITOR — canvas filter pipeline, crop, PNG export
═══════════════════════════════════════════════════════ */
reg('photo-editor', {
  category:'Image', summary:'Raster image editor: filters, crop, PNG export.', needs:[],
  label:'Photo Editor', icon:'🖼', accent:'#00d4ff',
  width:380, height:460, minWidth:300, minHeight:360,
  mountEngine(instanceId, intakeResult, sBus, userConfig) {
    /* Mounted once inside buildUI instead — buildUI needs the live engine
       instance to call draw()/applyCrop()/exportPNG() directly, and
       spawn() runs buildUI before mountEngine, so mounting here too would
       create a second, independent, orphaned engine instance. */
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:8px;display:flex;flex-direction:column;gap:6px;height:100%;';

    const dropZone=document.createElement('div');
    dropZone.style.cssText='flex:1;min-height:120px;border:1px dashed var(--b2);border-radius:5px;position:relative;overflow:hidden;background:var(--bg2);display:flex;align-items:center;justify-content:center;';
    const canvas=document.createElement('canvas'); canvas.style.cssText='max-width:100%;max-height:100%;display:none;';
    const hint=document.createElement('div'); hint.style.cssText='font-family:var(--mono);font-size:7px;color:var(--dim);text-align:center;padding:8px;';
    hint.textContent='Drop an image here or click to choose a file';
    dropZone.appendChild(canvas); dropZone.appendChild(hint);
    wrap.appendChild(dropZone);

    const fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='image/*'; fileInput.style.display='none';
    wrap.appendChild(fileInput);

    let engine=null;
    let cropRect=null, cropStart=null;

    function redraw(){ if(engine) engine.draw(canvas); }

    async function handleFile(file){
      if(!file || !file.type.startsWith('image/')) return;
      await window.__photoEngines[instanceId].loadFile(file);
      engine = window.__photoEngines[instanceId];
      canvas.style.display='block'; hint.style.display='none';
      redraw();
    }

    dropZone.addEventListener('click', ()=>fileInput.click());
    fileInput.addEventListener('change', e=>handleFile(e.target.files[0]));
    dropZone.addEventListener('dragover', e=>{e.preventDefault(); dropZone.style.borderColor='var(--accent)';});
    dropZone.addEventListener('dragleave', ()=>dropZone.style.borderColor='var(--b2)');
    dropZone.addEventListener('drop', e=>{ e.preventDefault(); dropZone.style.borderColor='var(--b2)'; handleFile(e.dataTransfer.files[0]); });

    /* Crop by drag on the canvas */
    let cropBox=null;
    canvas.addEventListener('pointerdown', e=>{
      if(!engine || !engine.image) return;
      const r=canvas.getBoundingClientRect();
      const sx=canvas.width/r.width, sy=canvas.height/r.height;
      cropStart={x:(e.clientX-r.left)*sx, y:(e.clientY-r.top)*sy};
      if(cropBox) cropBox.remove();
      cropBox=document.createElement('div');
      cropBox.style.cssText='position:absolute;border:1.5px dashed var(--accent);pointer-events:none;';
      dropZone.appendChild(cropBox);
    });
    canvas.addEventListener('pointermove', e=>{
      if(!cropStart) return;
      const r=canvas.getBoundingClientRect();
      const cx=e.clientX-r.left, cy=e.clientY-r.top;
      const sx0=(cropStart.x/canvas.width)*r.width, sy0=(cropStart.y/canvas.height)*r.height;
      const x=Math.min(sx0,cx), y=Math.min(sy0,cy), w=Math.abs(cx-sx0), h=Math.abs(cy-sy0);
      cropBox.style.left=x+'px'; cropBox.style.top=y+'px'; cropBox.style.width=w+'px'; cropBox.style.height=h+'px';
      const sx=canvas.width/r.width, sy=canvas.height/r.height;
      cropRect={x:Math.min(cropStart.x,(cx)*sx), y:Math.min(cropStart.y,(cy)*sy), w:w*sx, h:h*sy};
    });
    canvas.addEventListener('pointerup', ()=>{ cropStart=null; });

    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:6px;';
    mkBtn(btnRow,'APPLY CROP', async ()=>{ if(engine && cropRect && cropRect.w>4 && cropRect.h>4){ await engine.applyCrop(canvas, cropRect); if(cropBox) cropBox.remove(); cropRect=null; redraw(); } }, {h:22,fs:7});
    mkBtn(btnRow,'⬇ EXPORT PNG', ()=>{ if(engine) engine.exportPNG(canvas); }, {h:22,fs:7});
    mkBtn(btnRow,'RESET', ()=>{ _pub('ui:config_change',{key:'__reset',value:true}); ['brightness','contrast','saturation','hue','blur','grayscale','invert','sepia'].forEach(k=>{}); redraw(); }, {h:22,fs:7});
    wrap.appendChild(btnRow);

    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:5px;justify-content:center;flex-wrap:wrap;';
    mkKnob(kRow,{label:'BRIGHT',min:0,max:2,  value:1,step:.01,unit:'',onChange:redraw,eventKey:'brightness',pub:_pub});
    mkKnob(kRow,{label:'CONTR', min:0,max:2,  value:1,step:.01,unit:'',onChange:redraw,eventKey:'contrast', pub:_pub});
    mkKnob(kRow,{label:'SAT',   min:0,max:3,  value:1,step:.01,unit:'',onChange:redraw,eventKey:'saturation',pub:_pub});
    mkKnob(kRow,{label:'HUE',   min:0,max:360,value:0,step:1,  unit:'°',onChange:redraw,eventKey:'hue',pub:_pub});
    mkKnob(kRow,{label:'BLUR',  min:0,max:20, value:0,step:.1, unit:'px',onChange:redraw,eventKey:'blur',pub:_pub});
    mkKnob(kRow,{label:'GRAY',  min:0,max:1,  value:0,step:.01,unit:'',onChange:redraw,eventKey:'grayscale',pub:_pub});
    mkKnob(kRow,{label:'INVERT',min:0,max:1,  value:0,step:.01,unit:'',onChange:redraw,eventKey:'invert',pub:_pub});
    mkKnob(kRow,{label:'SEPIA', min:0,max:1,  value:0,step:.01,unit:'',onChange:redraw,eventKey:'sepia',pub:_pub});
    wrap.appendChild(kRow);

    content.appendChild(wrap);

    /* PhotoEditorEngine keeps its own param state; buildUI needs a handle
       to call draw()/applyCrop()/exportPNG(). Stash instances by id since
       mountEngine runs in a different `this` context than buildUI. */
    window.__photoEngines = window.__photoEngines || {};
    window.__photoEngines[instanceId] = PhotoEditorEngine.mount(instanceId, sBus, {});
    engine = window.__photoEngines[instanceId];

    KERNEL.bus.subscribe('ui:config_change:' + instanceId, () => redraw());
  },
});

/* ═══════════════════════════════════════════════════════
   VIDEO EDITOR — trim + live filter + MediaRecorder export
═══════════════════════════════════════════════════════ */
reg('video-editor', {
  category:'Video', summary:'Trim, filter, and re-export video clips client-side.', needs:[],
  label:'Video Editor', icon:'🎬', accent:'#ff2266',
  width:400, height:480, minWidth:320, minHeight:380,
  mountEngine(instanceId, intakeResult, sBus) {},
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:8px;display:flex;flex-direction:column;gap:6px;height:100%;';

    const stage=document.createElement('div');
    stage.style.cssText='flex:1;min-height:140px;border:1px dashed var(--b2);border-radius:5px;position:relative;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;';
    const canvas=document.createElement('canvas'); canvas.style.cssText='max-width:100%;max-height:100%;display:none;';
    const hint=document.createElement('div'); hint.style.cssText='font-family:var(--mono);font-size:7px;color:var(--dim);text-align:center;padding:8px;';
    hint.textContent='Drop a video file here or click to choose one';
    stage.appendChild(canvas); stage.appendChild(hint);
    wrap.appendChild(stage);

    const fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='video/*'; fileInput.style.display='none';
    wrap.appendChild(fileInput);

    window.__videoEngines = window.__videoEngines || {};
    const engine = VideoEditorEngine.mount(instanceId, sBus, {});
    window.__videoEngines[instanceId] = engine;

    let rafId=null;
    function loop(){ engine.drawFrame(canvas); rafId=requestAnimationFrame(loop); }

    async function handleFile(file){
      if(!file || !file.type.startsWith('video/')) return;
      const v = await engine.loadFile(file);
      canvas.style.display='block'; hint.style.display='none';
      inSlider.max=v.duration; outSlider.max=v.duration; outSlider.value=v.duration;
      timeLbl.textContent = `0.00s → ${v.duration.toFixed(2)}s`;
      cancelAnimationFrame(rafId); loop();
    }

    stage.addEventListener('click', ()=>{ if(!engine.video) fileInput.click(); });
    fileInput.addEventListener('change', e=>handleFile(e.target.files[0]));
    stage.addEventListener('dragover', e=>{e.preventDefault(); stage.style.borderColor='var(--accent2)';});
    stage.addEventListener('dragleave', ()=>stage.style.borderColor='var(--b2)');
    stage.addEventListener('drop', e=>{ e.preventDefault(); stage.style.borderColor='var(--b2)'; handleFile(e.dataTransfer.files[0]); });

    const trimRow=document.createElement('div'); trimRow.style.cssText='display:flex;flex-direction:column;gap:3px;';
    const timeLbl=document.createElement('div'); timeLbl.style.cssText='font-family:var(--mono);font-size:6.5px;color:var(--dim2);'; timeLbl.textContent='0.00s → 0.00s';
    const inSlider=document.createElement('input'); inSlider.type='range'; inSlider.min=0; inSlider.max=1; inSlider.step=.01; inSlider.value=0;
    const outSlider=document.createElement('input'); outSlider.type='range'; outSlider.min=0; outSlider.max=1; outSlider.step=.01; outSlider.value=1;
    [inSlider,outSlider].forEach(s=>s.style.cssText='width:100%;accent-color:var(--accent2);');
    inSlider.addEventListener('input', ()=>{ _pub('ui:config_change',{key:'inPoint',value:parseFloat(inSlider.value)}); timeLbl.textContent=`${(+inSlider.value).toFixed(2)}s → ${(+outSlider.value).toFixed(2)}s`; });
    outSlider.addEventListener('input', ()=>{ _pub('ui:config_change',{key:'outPoint',value:parseFloat(outSlider.value)}); timeLbl.textContent=`${(+inSlider.value).toFixed(2)}s → ${(+outSlider.value).toFixed(2)}s`; });
    trimRow.appendChild(timeLbl); trimRow.appendChild(inSlider); trimRow.appendChild(outSlider);
    wrap.appendChild(trimRow);

    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;gap:5px;justify-content:center;flex-wrap:wrap;';
    mkKnob(kRow,{label:'BRIGHT',min:0,max:2,  value:1,step:.01,unit:'',eventKey:'brightness',pub:_pub});
    mkKnob(kRow,{label:'CONTR', min:0,max:2,  value:1,step:.01,unit:'',eventKey:'contrast', pub:_pub});
    mkKnob(kRow,{label:'SAT',   min:0,max:3,  value:1,step:.01,unit:'',eventKey:'saturation',pub:_pub});
    mkKnob(kRow,{label:'HUE',   min:0,max:360,value:0,step:1,  unit:'°',eventKey:'hue',pub:_pub});
    mkKnob(kRow,{label:'BLUR',  min:0,max:12, value:0,step:.1, unit:'px',eventKey:'blur',pub:_pub});
    mkKnob(kRow,{label:'GRAY',  min:0,max:1,  value:0,step:.01,unit:'',eventKey:'grayscale',pub:_pub});
    wrap.appendChild(kRow);

    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:6px;';
    const exportBtn=mkBtn(btnRow,'⏺ EXPORT WEBM', ()=>{
      exportBtn.textContent='● RECORDING…'; exportBtn.disabled=true;
      engine.exportClip(canvas, ()=>{ exportBtn.textContent='⏺ EXPORT WEBM'; exportBtn.disabled=false; });
    }, {h:22,fs:7});
    wrap.appendChild(btnRow);

    content.appendChild(wrap);
  },
});

/* ═══════════════════════════════════════════════════════
   SERIAL BRIDGE — Web Serial hardware I/O (robotics)
═══════════════════════════════════════════════════════ */
reg('serial-bridge', {
  category:'Robotics', summary:'Web Serial connection to real hardware — GRBL/Arduino/steppers.', needs:[],
  label:'Serial Bridge', icon:'🤖', accent:'#00ff88',
  width:300, height:340, minWidth:260, minHeight:280,
  mountEngine(instanceId, intakeResult, sBus) {
    window.__serialEngines = window.__serialEngines || {};
    window.__serialEngines[instanceId] = SerialBridgeEngine.mount(instanceId, sBus, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:8px;height:100%;';

    const statusRow=document.createElement('div'); statusRow.style.cssText='display:flex;align-items:center;gap:6px;';
    const led=document.createElement('div'); led.style.cssText='width:7px;height:7px;border-radius:50%;background:var(--dim);flex-shrink:0;';
    const statusTxt=document.createElement('div'); statusTxt.style.cssText='font-family:var(--mono);font-size:7px;color:var(--dim2);'; statusTxt.textContent='DISCONNECTED';
    statusRow.appendChild(led); statusRow.appendChild(statusTxt);
    wrap.appendChild(statusRow);

    if (typeof navigator === 'undefined' || !navigator.serial) {
      const warn=document.createElement('div'); warn.style.cssText='font-family:var(--mono);font-size:6.5px;color:#ff2266;line-height:1.5;';
      warn.textContent='Web Serial not available — needs a Chromium browser (Chrome/Edge/Opera). Firefox and Safari do not implement it.';
      wrap.appendChild(warn);
    }

    mkSelect(wrap,{label:'BAUD',options:[9600,19200,38400,57600,115200,250000],value:115200,eventKey:'baudRate',pub:_pub});
    mkSelect(wrap,{label:'MAP', options:[{v:'off',l:'off'},{v:'xy_to_gcode',l:'XY→G-code'},{v:'trigger_to_line',l:'trigger→line'}],value:'off',eventKey:'mapMode',pub:_pub});

    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:6px;';
    const connectBtn=mkBtn(btnRow,'CONNECT', ()=>_pub('ui:serial_connect',{}), {h:22,fs:7});
    const disconnectBtn=mkBtn(btnRow,'DISCONNECT', ()=>_pub('ui:serial_disconnect',{}), {h:22,fs:7});
    wrap.appendChild(btnRow);

    const cmdRow=document.createElement('div'); cmdRow.style.cssText='display:flex;gap:4px;';
    const cmdInput=document.createElement('input'); cmdInput.type='text'; cmdInput.placeholder='G1 X10 Y0 F1000';
    cmdInput.style.cssText='flex:1;background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:7.5px;padding:4px 6px;outline:none;';
    const sendBtn=mkBtn(cmdRow,'SEND', ()=>{ if(cmdInput.value.trim()){ _pub('ui:serial_send',{line:cmdInput.value.trim()}); cmdInput.value=''; } }, {h:24,fs:7});
    cmdInput.addEventListener('keydown', e=>{ if(e.key==='Enter') sendBtn.click(); });
    cmdRow.prepend(cmdInput);
    wrap.appendChild(cmdRow);

    const log=document.createElement('div');
    log.style.cssText='flex:1;min-height:70px;background:var(--bg2);border:1px solid var(--b1);border-radius:4px;padding:5px;font-family:var(--mono);font-size:6px;color:var(--dim2);overflow-y:auto;white-space:pre-wrap;';
    wrap.appendChild(log);

    function appendLog(line){ log.textContent += line + '\n'; log.scrollTop = log.scrollHeight; }

    sBus.subscribe('org:connected', ()=>{ led.style.background='var(--accent)'; led.style.boxShadow='0 0 5px var(--accent)'; statusTxt.textContent='CONNECTED'; appendLog('[connected]'); });
    sBus.subscribe('org:disconnected', ()=>{ led.style.background='var(--dim)'; led.style.boxShadow=''; statusTxt.textContent='DISCONNECTED'; appendLog('[disconnected]'); });
    sBus.subscribe('org:error', ({message})=>appendLog('[error] '+message));
    sBus.subscribe('org:tx', ({line})=>appendLog('→ '+line));
    sBus.subscribe('org:rx', ({line})=>appendLog('← '+line));

    content.appendChild(wrap);
  },
});

/* ═══════════════════════════════════════════════════════
   MACRO AUTOMATION — record/replay any mod's params
═══════════════════════════════════════════════════════ */
reg('macro-automation', {
  category:'Automation', summary:'Records and replays another mod\'s parameter changes over time.', needs:[],
  label:'Macro Automation', icon:'⏺', accent:'#ffaa00',
  width:280, height:320, minWidth:240, minHeight:270,
  mountEngine(instanceId, intakeResult, sBus) {
    window.__macroEngines = window.__macroEngines || {};
    window.__macroEngines[instanceId] = MacroAutomationEngine.mount(instanceId, sBus, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:8px;height:100%;';

    const targetSel=document.createElement('select');
    targetSel.style.cssText='background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:7.5px;padding:4px;outline:none;';
    function refreshTargets(){
      const cur=targetSel.value;
      targetSel.innerHTML='';
      const none=document.createElement('option'); none.value=''; none.textContent='— choose target —'; targetSel.appendChild(none);
      (KERNEL.registry.all()||[]).forEach(o=>{
        if(o.instanceId===instanceId) return;
        const opt=document.createElement('option'); opt.value=o.instanceId; opt.textContent=o.label+' ('+o.instanceId.slice(-5)+')';
        targetSel.appendChild(opt);
      });
      if(cur) targetSel.value=cur;
    }
    refreshTargets();
    targetSel.addEventListener('mousedown', refreshTargets);
    targetSel.addEventListener('change', ()=>_pub('ui:config_change',{key:'targetInstanceId',value:targetSel.value}));
    wrap.appendChild(targetSel);

    mkToggle(wrap,{label:'LOOP',value:true,eventKey:'loop',pub:_pub});
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;justify-content:center;';
    mkKnob(kRow,{label:'SPEED',min:.25,max:4,value:1,step:.05,unit:'x',eventKey:'speed',pub:_pub});
    wrap.appendChild(kRow);

    const statusTxt=document.createElement('div'); statusTxt.style.cssText='font-family:var(--mono);font-size:7px;color:var(--dim2);text-align:center;'; statusTxt.textContent='0 events recorded';
    wrap.appendChild(statusTxt);

    const btnRow=document.createElement('div'); btnRow.style.cssText='display:flex;gap:5px;flex-wrap:wrap;';
    const armBtn=mkBtn(btnRow,'⏺ ARM', ()=>_pub('ui:macro_arm',{}), {h:22,fs:7});
    mkBtn(btnRow,'■ STOP REC', ()=>_pub('ui:macro_stop_rec',{}), {h:22,fs:7});
    mkBtn(btnRow,'▶ PLAY', ()=>_pub('ui:macro_play',{}), {h:22,fs:7});
    mkBtn(btnRow,'■ STOP', ()=>_pub('ui:macro_stop',{}), {h:22,fs:7});
    mkBtn(btnRow,'CLEAR', ()=>_pub('ui:macro_clear',{}), {h:22,fs:7});
    wrap.appendChild(btnRow);

    sBus.subscribe('org:state_sync', ({recording,playing,count})=>{
      statusTxt.textContent = `${count||0} events` + (recording?' — RECORDING':'') + (playing?' — PLAYING':'');
      statusTxt.style.color = recording ? '#ff2266' : playing ? 'var(--accent)' : 'var(--dim2)';
    });
    sBus.subscribe('org:error', ({message})=>{ statusTxt.textContent=message; statusTxt.style.color='#ff2266'; });

    content.appendChild(wrap);
  },
});

/* ═══════════════════════════════════════════════════════
   WEBHOOK AUTOMATION — bus events → external HTTP triggers
═══════════════════════════════════════════════════════ */
reg('webhook-automation', {
  category:'Automation', summary:'Fires an HTTP request to an external automation tool on any bus event.', needs:[],
  label:'Webhook Automation', icon:'🌐', accent:'#ff2266',
  width:300, height:340, minWidth:260, minHeight:290,
  mountEngine(instanceId, intakeResult, sBus) {
    window.__webhookEngines = window.__webhookEngines || {};
    window.__webhookEngines[instanceId] = WebhookAutomationEngine.mount(instanceId, sBus, {});
  },
  buildUI(content, intakeResult, instanceId, sBus, _pub) {
    const wrap=document.createElement('div'); wrap.style.cssText='padding:10px;display:flex;flex-direction:column;gap:7px;height:100%;';

    const urlInput=document.createElement('input'); urlInput.type='text'; urlInput.placeholder='https://your-automation-tool/webhook/xyz';
    urlInput.style.cssText='background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:7px;padding:5px 6px;outline:none;';
    urlInput.addEventListener('change', ()=>_pub('ui:config_change',{key:'url',value:urlInput.value.trim()}));
    wrap.appendChild(urlInput);

    mkSelect(wrap,{label:'METHOD',options:['POST','GET'],value:'POST',eventKey:'method',pub:_pub});
    mkSelect(wrap,{label:'ON',options:[
      {v:'pad:trigger',l:'pad trigger'},{v:'kernel:bpm-change',l:'bpm change'},{v:'serial:rx',l:'serial rx'},
      {v:'photo:exported',l:'photo exported'},{v:'video:exported',l:'video exported'},{v:'org:pumped',l:'sidechain pump'}
    ],value:'pad:trigger',eventKey:'triggerTopic',pub:_pub});

    const filterInput=document.createElement('input'); filterInput.type='text'; filterInput.placeholder='sound filter (e.g. kick) — blank = any';
    filterInput.style.cssText='background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:7px;padding:5px 6px;outline:none;';
    filterInput.addEventListener('change', ()=>_pub('ui:config_change',{key:'soundFilter',value:filterInput.value.trim()}));
    wrap.appendChild(filterInput);

    mkToggle(wrap,{label:'NO-CORS (fire and forget)',value:false,eventKey:'noCors',pub:_pub});
    const kRow=document.createElement('div'); kRow.style.cssText='display:flex;justify-content:center;';
    mkKnob(kRow,{label:'RATE LIMIT',min:0,max:5000,value:250,step:10,unit:'ms',eventKey:'rateLimitMs',pub:_pub});
    wrap.appendChild(kRow);

    mkBtn(wrap,'TEST FIRE', ()=>_pub('ui:webhook_test',{}), {h:22,fs:7});

    const log=document.createElement('div');
    log.style.cssText='flex:1;min-height:50px;background:var(--bg2);border:1px solid var(--b1);border-radius:4px;padding:5px;font-family:var(--mono);font-size:6px;color:var(--dim2);overflow-y:auto;white-space:pre-wrap;';
    wrap.appendChild(log);
    sBus.subscribe('org:log', ({level,message})=>{ log.textContent += `[${level}] ${message}\n`; log.scrollTop=log.scrollHeight; });

    content.appendChild(wrap);
  },
});

return { spawn, defs, reg };
})();
