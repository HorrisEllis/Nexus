/* ═══════════════════════════════════════════════════════════
   MOD: DRUM MACHINE  v3.1.0
   Publishes org:* events on scoped sBus (instanceId-scoped).
   Global events (pad:trigger, pad:bank-change) on KERNEL.bus.
   ═══════════════════════════════════════════════════════════ */

window.PadsMod = (() => {
'use strict';

const BANKS = [
  { id:'A', pads:[
    {sound:'kick',color:'#00ff88'},{sound:'snare',color:'#00ff88'},
    {sound:'hat',color:'#00d4ff'},{sound:'clap',color:'#00ff88'},
    {sound:'808',color:'#ff2266'},{sound:'rim',color:'#6a88a8'},
    {sound:'reese',color:'#aa44ff'},{sound:'wobble',color:'#aa44ff'},
    {sound:'acid',color:'#ffaa00'},{sound:'stab',color:'#00d4ff'},
    {sound:'openhat',color:'#00d4ff'},{sound:'crash',color:'#00d4ff'},
    {sound:'laser',color:'#00ff88'},{sound:'glitch',color:'#6a88a8'},
    {sound:'noise',color:'#6a88a8'},{sound:'riser',color:'#aa44ff'},
  ]},
  { id:'B', pads:[
    {sound:'kick',color:'#ff2266'},{sound:'snare',color:'#ff2266'},
    {sound:'hat',color:'#6a88a8'},{sound:'clap',color:'#ff2266'},
    {sound:'808',color:'#ffaa00'},{sound:'rim',color:'#6a88a8'},
    {sound:'wobble',color:'#aa44ff'},{sound:'acid',color:'#ffaa00'},
    {sound:'stab',color:'#00d4ff'},{sound:'drone',color:'#aa44ff'},
    {sound:'openhat',color:'#00d4ff'},{sound:'crash',color:'#6a88a8'},
    {sound:'laser',color:'#ff2266'},{sound:'glitch',color:'#6a88a8'},
    {sound:'scream',color:'#ff2266'},{sound:'riser',color:'#aa44ff'},
  ]},
  { id:'C', pads:[
    {sound:'kick',color:'#aa44ff'},{sound:'snare',color:'#aa44ff'},
    {sound:'hat',color:'#00d4ff'},{sound:'clap',color:'#aa44ff'},
    {sound:'808',color:'#ff2266'},{sound:'rim',color:'#6a88a8'},
    {sound:'reese',color:'#aa44ff'},{sound:'wobble',color:'#00d4ff'},
    {sound:'acid',color:'#ffaa00'},{sound:'stab',color:'#00ff88'},
    {sound:'drone',color:'#aa44ff'},{sound:'crash',color:'#6a88a8'},
    {sound:'laser',color:'#00ff88'},{sound:'glitch',color:'#6a88a8'},
    {sound:'vinyl',color:'#6a88a8'},{sound:'riser',color:'#aa44ff'},
  ]},
];

const VOICES = {
  kick(t,v,p,a){const pitch=p.pitch??55,decay=p.decay??0.32;const g=a.gain(v*1.3),o=a.osc(pitch*3.2);o.frequency.setValueAtTime(pitch*3.6,t);o.frequency.exponentialRampToValueAtTime(pitch*0.33,t+decay);o.connect(g);a.send(g,false,false,true);g.gain.setValueAtTime(v*1.3,t);g.gain.exponentialRampToValueAtTime(0.001,t+decay+0.08);o.start(t);o.stop(t+decay+0.12);const nb=a.noise(0.015),ng=a.gain(v*0.5),nf=a.filter('bandpass',120,0.4);nb.connect(nf);nf.connect(ng);a.send(ng);ng.gain.setValueAtTime(v*0.5,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.015);nb.start(t);nb.stop(t+0.02);},
  snare(t,v,p,a){const tone=p.tone??220,decay=p.decay??0.21;const nb=a.noise(0.22),nf=a.filter('bandpass',1800,0.85),ng=a.gain(v*0.9);nb.connect(nf);nf.connect(ng);a.send(ng,true);ng.gain.setValueAtTime(v*0.9,t);ng.gain.exponentialRampToValueAtTime(0.001,t+decay);nb.start(t);nb.stop(t+decay+0.04);const o=a.osc(tone,'triangle'),og=a.gain(v*0.45);o.frequency.exponentialRampToValueAtTime(tone*0.35,t+0.14);o.connect(og);a.send(og);og.gain.setValueAtTime(v*0.45,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.17);o.start(t);o.stop(t+0.2);},
  hat(t,v,p,a){const tone=p.tone??8500,decay=p.decay??0.04;const nb=a.noise(decay+0.01),nf=a.filter('highpass',tone),ng=a.gain(v*0.52);nb.connect(nf);nf.connect(ng);a.send(ng);ng.gain.setValueAtTime(v*0.52,t);ng.gain.exponentialRampToValueAtTime(0.001,t+decay);nb.start(t);nb.stop(t+decay+0.01);},
  clap(t,v,p,a){[0,0.011,0.024].forEach(d=>{const nb=a.noise(0.1),nf=a.filter('bandpass',1500,1.1),ng=a.gain(v*0.68);nb.connect(nf);nf.connect(ng);a.send(ng,true);ng.gain.setValueAtTime(v*0.68,t+d);ng.gain.exponentialRampToValueAtTime(0.001,t+d+0.1);nb.start(t+d);nb.stop(t+d+0.12);});},
  '808'(t,v,p,a){const pitch=p.pitch??55,decay=p.decay??0.6;const o=a.osc(pitch*2,'sine'),of=a.filter('lowpass',280+pitch*0.5),og=a.gain(v*0.95);o.frequency.exponentialRampToValueAtTime(pitch*0.84,t+0.08);o.connect(of);of.connect(og);a.send(og,true,true);og.gain.setValueAtTime(v*0.95,t);og.gain.exponentialRampToValueAtTime(0.001,t+decay);o.start(t);o.stop(t+decay+0.1);},
  rim(t,v,p,a){const nb=a.noise(0.035),nf=a.filter('bandpass',2600,2.4),ng=a.gain(v*0.6);nb.connect(nf);nf.connect(ng);a.send(ng);ng.gain.setValueAtTime(v*0.6,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.035);nb.start(t);nb.stop(t+0.045);},
  reese(t,v,p,a){const pitch=p.pitch??55,cutoff=p.cutoff??400,sweep=p.sweep??0.9;const o1=a.osc(pitch,'sawtooth'),o2=a.osc(pitch*1.013,'sawtooth');const of=a.filter('lowpass',cutoff,2),og=a.gain(v*0.85);of.frequency.setValueAtTime(cutoff*0.45,t);of.frequency.linearRampToValueAtTime(cutoff*2.2,t+sweep*0.5);of.frequency.linearRampToValueAtTime(cutoff*0.45,t+sweep);o1.connect(of);o2.connect(of);of.connect(og);a.send(og,true,true);og.gain.setValueAtTime(v*0.85,t);og.gain.exponentialRampToValueAtTime(0.001,t+sweep+0.1);o1.start(t);o2.start(t);o1.stop(t+sweep+0.15);o2.stop(t+sweep+0.15);},
  wobble(t,v,p,a){const pitch=p.pitch??110,rate=p.rate??4,depth=p.depth??600;const o=a.osc(pitch,'sawtooth'),lfo=a.osc(rate,'sine'),lfoG=a.gain(depth);const of=a.filter('lowpass',600,4),og=a.gain(v*0.75);lfo.connect(lfoG);lfoG.connect(of.frequency);o.connect(of);of.connect(og);a.send(og,true,true);og.gain.setValueAtTime(v*0.75,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.9);o.start(t);lfo.start(t);o.stop(t+1);lfo.stop(t+1);},
  acid(t,v,p,a){const pitch=p.pitch??110,cutoff=p.cutoff??300,res=p.res??6;const o=a.osc(pitch,'sawtooth'),of=a.filter('lowpass',cutoff,res),og=a.gain(v*0.8);of.frequency.setValueAtTime(cutoff,t);of.frequency.exponentialRampToValueAtTime(cutoff*16,t+0.04);of.frequency.exponentialRampToValueAtTime(cutoff*1.3,t+0.3);o.connect(of);of.connect(og);a.send(og,false,true);og.gain.setValueAtTime(v*0.8,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.32);o.start(t);o.stop(t+0.38);},
  stab(t,v,p,a){const pitch=p.pitch??220,detune=p.detune??5;[-detune,-detune*0.4,0,detune*0.4,detune].forEach(det=>{const f=pitch*Math.pow(2,det/100),o=a.osc(f,'sawtooth'),og=a.gain(v*0.12);const fl=a.filter('lowpass',2400,1.5);o.connect(fl);fl.connect(og);a.send(og,true);og.gain.setValueAtTime(v*0.12,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.08);o.start(t);o.stop(t+0.1);});},
  openhat(t,v,p,a){const decay=p.decay??0.34;const nb=a.noise(decay+0.04),nf=a.filter('highpass',7000),ng=a.gain(v*0.48);nb.connect(nf);nf.connect(ng);a.send(ng,true);ng.gain.setValueAtTime(v*0.48,t);ng.gain.exponentialRampToValueAtTime(0.001,t+decay);nb.start(t);nb.stop(t+decay+0.04);},
  crash(t,v,p,a){const nb=a.noise(1),nf=a.filter('highpass',4400),ng=a.gain(v*0.48);nb.connect(nf);nf.connect(ng);a.send(ng,true);ng.gain.setValueAtTime(v*0.48,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.9);nb.start(t);nb.stop(t+1);},
  laser(t,v,p,a){const o=a.osc(180,'sine'),og=a.gain(v*0.8);o.frequency.setValueAtTime(180,t);o.frequency.exponentialRampToValueAtTime(3400,t+0.04);o.frequency.exponentialRampToValueAtTime(80,t+0.22);o.connect(og);a.send(og,true,true);og.gain.setValueAtTime(v*0.8,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.25);o.start(t);o.stop(t+0.3);},
  glitch(t,v,p,a){for(let i=0;i<5;i++){const d=i*0.018;const nb=a.noise(0.035),nf=a.filter('bandpass',800+i*900,2.2),ng=a.gain(v*0.38*(1-i*0.14));nb.connect(nf);nf.connect(ng);a.send(ng);ng.gain.setValueAtTime(v*0.38,t+d);ng.gain.exponentialRampToValueAtTime(0.001,t+d+0.035);nb.start(t+d);nb.stop(t+d+0.045);}},
  noise(t,v,p,a){const nb=a.noise(0.08),nf=a.filter('bandpass',2800,0.85),ng=a.gain(v*0.6);nb.connect(nf);nf.connect(ng);a.send(ng,true);ng.gain.setValueAtTime(v*0.6,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.08);nb.start(t);nb.stop(t+0.1);},
  riser(t,v,p,a){const o=a.osc(55,'sawtooth'),of=a.filter('lowpass',200),og=a.gain(0.45);o.frequency.exponentialRampToValueAtTime(4400,t+2);of.frequency.exponentialRampToValueAtTime(12000,t+2);o.connect(of);of.connect(og);a.send(og,true);og.gain.setValueAtTime(0.001,t);og.gain.linearRampToValueAtTime(0.5,t+1.6);og.gain.exponentialRampToValueAtTime(0.001,t+2);o.start(t);o.stop(t+2.1);},
  drone(t,v,p,a){const pitch=p.pitch??55;[1,2,3].forEach((h,i)=>{const o=a.osc(pitch*h*(1+(Math.random()-0.5)*0.005),'sawtooth');const og=a.gain(v*0.22/(i+1)),fl=a.filter('lowpass',200+pitch*h*0.8,1.5);o.connect(fl);fl.connect(og);a.send(og,true);og.gain.setValueAtTime(0,t);og.gain.linearRampToValueAtTime(v*0.2/(i+1),t+0.3);og.gain.exponentialRampToValueAtTime(0.001,t+2);o.start(t);o.stop(t+2.2);});},
  scream(t,v,p,a){const nb=a.noise(0.3),nf=a.filter('bandpass',1200+Math.random()*400,6),ng=a.gain(v*0.6);nb.connect(nf);nf.connect(ng);a.send(ng,true,false,true);ng.gain.setValueAtTime(0,t);ng.gain.linearRampToValueAtTime(v*0.7,t+0.04);ng.gain.exponentialRampToValueAtTime(0.001,t+0.32);nb.start(t);nb.stop(t+0.38);},
  vinyl(t,v,p,a){const nb=a.noise(0.18),nf=a.filter('highpass',2000),ng=a.gain(v*0.2);nb.connect(nf);nf.connect(ng);a.send(ng);ng.gain.setValueAtTime(v*0.2,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.18);nb.start(t);nb.stop(t+0.2);},
};

function mount(instanceId, sBus, audio, config = {}) {
  /* sBus.publish → org:EVENT:instanceId (scoped to this instance)
     KERNEL.bus.publish → global (heard by all mods)       */
  const gBus = KERNEL.bus;

  let curBank = 0;
  let volume  = config.volume ?? 0.88;
  let pitch   = config.pitch  ?? 0;
  let decay   = config.decay  ?? 0.3;
  const banks = BANKS.map(b => ({ ...b, pads: b.pads.map(p => ({ ...p })) }));

  function _fire(index, velocity) {
    if (!audio.AC) return;
    const pad = banks[curBank].pads[index];
    if (!pad) return;
    const voice = VOICES[pad.sound];
    if (voice) {
      const t = audio.AC.currentTime + 0.01;
      voice(t, velocity * volume, { pitch: Math.pow(2, pitch/12), decay }, audio);
    }
    gBus.publish('pad:trigger', { index, sound: pad.sound, velocity, bank: curBank, timestamp: audio.AC?.currentTime });
    sBus.publish('org:pad_lit', { index, color: pad.color, duration_ms: 130 });
  }

  function _setBank(bankIdx) {
    curBank = Math.max(0, Math.min(banks.length - 1, bankIdx));
    gBus.publish('pad:bank-change', { bank: curBank, pads: banks[curBank].pads });
    _syncUI();
  }

  function _syncUI() {
    sBus.publish('org:state_sync', {
      bank: curBank,
      pads: banks[curBank].pads,
      config: { volume, pitch, decay },
      voiceNames: Object.keys(VOICES),
    });
  }

  const _unsubs = [
    sBus.global.subscribe('ui:pad_press:' + instanceId,   ({ index, velocity }) => { if (typeof index === 'number') _fire(index, velocity ?? 0.9); }),
    sBus.global.subscribe('ui:bank_select:' + instanceId, ({ bank }) => _setBank(bank)),
    sBus.global.subscribe('ui:pad_assign:' + instanceId,  ({ index, sound, color }) => {
      if (typeof index === 'number' && sound) {
        banks[curBank].pads[index].sound = sound;
        if (color) banks[curBank].pads[index].color = color;
        _syncUI();
      }
    }),
    sBus.global.subscribe('ui:config_change:' + instanceId, ({ key, value }) => {
      if (key === 'volume') volume = value;
      if (key === 'pitch')  pitch  = value;
      if (key === 'decay')  decay  = value;
    }),
    gBus.subscribe('seq:fire', ({ track }) => {
      const pad = banks[curBank].pads[track];
      if (pad) sBus.publish('org:pad_lit', { index: track, color: pad.color, duration_ms: 100 });
    }),
    gBus.subscribe('midi:note', ({ note, velocity }) => {
      const idx = note - 36;
      if (idx >= 0 && idx < 16) _fire(idx, velocity);
    }),
  ];

  const KEY_MAP = { q:0,w:1,e:2,r:3,a:4,s:5,d:6,f:7,z:8,x:9,c:10,v:11,'1':12,'2':13,'3':14,'4':15 };
  const _keyHandler = ev => {
    if (ev.target.tagName === 'SELECT' || ev.target.tagName === 'INPUT') return;
    const i = KEY_MAP[ev.key?.toLowerCase()];
    if (i !== undefined) { KERNEL.audio.boot(); _fire(i, 0.9); }
  };
  document.addEventListener('keydown', _keyHandler);

  /* Push initial state — UI is already subscribed at this point */
  _syncUI();

  KERNEL.registry.register({
    instanceId, id: 'eravos.pads', label: 'Drum Machine',
    provides: ['capability.pad_trigger', 'capability.audio_out', 'capability.bank_select'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'midi_in', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'pads.hook.pad_trigger_out',  direction: 'out', event_type: 'pad:trigger',     contract_version: '1.0.0' },
      { hook_id: 'pads.hook.seq_fire_in',      direction: 'in',  event_type: 'seq:fire',        contract_version: '1.0.0' },
      { hook_id: 'pads.hook.midi_in',          direction: 'in',  event_type: 'midi:note',       contract_version: '1.0.0' },
      { hook_id: 'pads.hook.bank_change_out',  direction: 'out', event_type: 'pad:bank-change', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() {
      _unsubs.forEach(u => u());
      document.removeEventListener('keydown', _keyHandler);
      KERNEL.registry.unregister(instanceId);
    },
    fire: _fire, setBank: _setBank, syncUI: _syncUI,
  };
}

return { mount, BANKS, VOICES };
})();
