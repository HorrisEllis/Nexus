/* ═══════════════════════════════════════════════════════════
   MOD: SEQUENCER  v4.0.0
   id: eravos.sequencer

   Timing: PrecisionClock (AudioWorklet lookahead scheduler).
   All synthesis scheduled against AudioContext.currentTime.
   No setTimeout for audio. setTimeout only for UI cursor.
   ═══════════════════════════════════════════════════════════ */
window.SequencerMod = (() => {
'use strict';

function mount(instanceId, sBus, audio, clock, config = {}) {
  const gBus = KERNEL.bus;

  let bpm        = config.bpm    ?? 128;
  let stepCount  = config.steps  ?? 16;
  let swing      = 0;
  let playing    = false;
  let recording  = false;

  const tracks = [
    {sound:'kick',   color:'#00ff88',steps:[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,...Array(16).fill(0)]},
    {sound:'snare',  color:'#00ff88',steps:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,...Array(16).fill(0)]},
    {sound:'hat',    color:'#00d4ff',steps:[0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,...Array(16).fill(0)]},
    {sound:'clap',   color:'#00ff88',steps:Array(32).fill(0)},
    {sound:'808',    color:'#ff2266',steps:Array(32).fill(0)},
    {sound:'rim',    color:'#6a88a8',steps:Array(32).fill(0)},
    {sound:'reese',  color:'#aa44ff',steps:Array(32).fill(0)},
    {sound:'wobble', color:'#aa44ff',steps:Array(32).fill(0)},
    {sound:'acid',   color:'#ffaa00',steps:Array(32).fill(0)},
    {sound:'stab',   color:'#00d4ff',steps:Array(32).fill(0)},
    {sound:'openhat',color:'#00d4ff',steps:Array(32).fill(0)},
    {sound:'crash',  color:'#00d4ff',steps:Array(32).fill(0)},
    {sound:'laser',  color:'#00ff88',steps:Array(32).fill(0)},
    {sound:'glitch', color:'#6a88a8',steps:Array(32).fill(0)},
    {sound:'noise',  color:'#6a88a8',steps:Array(32).fill(0)},
    {sound:'riser',  color:'#aa44ff',steps:Array(32).fill(0)},
  ];

  /* ── PrecisionClock ──────────────────────────────────── */
  let _pclock = null;
  let _cursorTimer = null;

  async function _initClock() {
    const AC = audio.boot();
    _pclock = new PrecisionClock(AC);
    await _pclock.boot();

    /* onStep fires from lookahead scheduler at a precise future time t */
    _pclock.onStep = (stepIdx, t) => {
      tracks.forEach((track, ti) => {
        if (!track.steps[stepIdx]) return;

        /* Schedule voice at exact AudioContext time t — NOT currentTime */
        const voices = window.PadsMod?.VOICES || window.EDMLabEngine?.VOICES;
        if (voices?.[track.sound]) {
          voices[track.sound](t, 0.88, {}, audio);
        }

        /* Bus publish — UI only, timing not critical */
        gBus.publish('seq:fire', {
          track: ti, step: stepIdx, sound: track.sound,
          timestamp: t,
        });
      });

      /* Schedule UI cursor update to fire at the right wall-clock time */
      const msFromNow = Math.max(0, (t - audio.AC.currentTime) * 1000);
      const capturedStep = stepIdx;
      clearTimeout(_cursorTimer);
      _cursorTimer = setTimeout(() => {
        sBus.publish('org:step_cursor', {
          step: capturedStep,
          bar:  Math.floor(capturedStep / 4),
        });
      }, msFromNow);
    };
  }

  async function _play() {
    if (!audio.AC) return;
    if (!_pclock) await _initClock();
    playing = true;
    clock.BPM = bpm;
    _pclock.start(bpm, stepCount, 4, swing);
    gBus.publish('seq:play', { BPM: bpm });
    sBus.publish('org:state_sync', { playing: true, bpm });
  }

  function _stop() {
    playing = false;
    if (_pclock) _pclock.stop();
    clearTimeout(_cursorTimer);
    gBus.publish('seq:stop', {});
    sBus.publish('org:state_sync', { playing: false, step: 0 });
  }

  function _syncUI() {
    sBus.publish('org:grid_sync', {
      tracks: tracks.map(t => ({
        sound: t.sound, color: t.color,
        steps: t.steps.slice(0, stepCount),
      })),
      steps: stepCount, playing, bpm: clock.BPM, swing,
    });
  }

  const _unsubs = [
    gBus.subscribe('ui:play_press:' + instanceId, () => playing ? _stop() : _play()),
    gBus.subscribe('ui:step_toggle:' + instanceId, ({ track, step, value }) => {
      if (tracks[track]) tracks[track].steps[step] = value ? 1 : 0;
    }),
    gBus.subscribe('ui:bpm_change:' + instanceId, ({ bpm: v }) => {
      bpm = Math.max(40, Math.min(240, Math.round(v)));
      clock.BPM = bpm;
      if (_pclock) _pclock.setBPM(bpm);
    }),
    gBus.subscribe('ui:step_count_change:' + instanceId, ({ steps }) => {
      stepCount = steps === 32 ? 32 : 16;
      if (_pclock && playing) { _stop(); _play(); } /* restart with new count */
      _syncUI();
    }),
    gBus.subscribe('ui:swing_toggle:' + instanceId, ({ value }) => {
      swing = value ? 0.12 : 0; /* 12% swing — Tranki feel */
      if (_pclock) _pclock.setSwing(swing);
    }),
    gBus.subscribe('ui:randomize:' + instanceId, () => {
      tracks.forEach((t,ti) => {
        t.steps = t.steps.map(() => Math.random() < .22 ? 1 : 0);
        if (ti === 0) { t.steps[0]=1; if(stepCount>8) t.steps[8]=1; }
      });
      _syncUI();
    }),
    gBus.subscribe('ui:clear_pattern:' + instanceId, () => {
      tracks.forEach(t => t.steps.fill(0));
      _syncUI();
    }),
    gBus.subscribe('pad:bank-change', ({ pads }) => {
      pads.forEach((p,i) => {
        if (tracks[i]) { tracks[i].sound=p.sound; tracks[i].color=p.color; }
      });
      _syncUI();
    }),
    gBus.subscribe('pad:trigger', ({ index }) => {
      if (recording && playing && tracks[index] && _pclock) {
        const s = _pclock.stepIdx;
        tracks[index].steps[s] = 1;
        sBus.publish('org:step_set', { track: index, step: s, value: 1 });
      }
    }),
    gBus.subscribe('seq:play', ({ BPM }) => {
      if (!playing) { bpm = BPM || bpm; _play(); }
    }),
    gBus.subscribe('seq:stop', () => { if (playing) _stop(); }),
    gBus.subscribe('kernel:bpm-change', ({ BPM }) => {
      bpm = BPM;
      if (_pclock) _pclock.setBPM(bpm);
      if (playing) { _stop(); _play(); }
    }),
  ];

  const _keyHandler = ev => {
    if (ev.target.tagName==='SELECT'||ev.target.tagName==='INPUT') return;
    if (ev.code==='Space') { ev.preventDefault(); playing ? _stop() : _play(); }
  };
  document.addEventListener('keydown', _keyHandler);

  _syncUI();

  KERNEL.registry.register({
    instanceId, id: 'eravos.sequencer', label: 'Sequencer',
    provides: ['capability.sequencer', 'capability.clock_source'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id:'seq.hook.fire_out',  direction:'out', event_type:'seq:fire',        contract_version:'1.0.0' },
      { hook_id:'seq.hook.play_out',  direction:'out', event_type:'seq:play',        contract_version:'1.0.0' },
      { hook_id:'seq.hook.stop_out',  direction:'out', event_type:'seq:stop',        contract_version:'1.0.0' },
      { hook_id:'seq.hook.bank_in',   direction:'in',  event_type:'pad:bank-change', contract_version:'1.0.0' },
      { hook_id:'seq.hook.record_in', direction:'in',  event_type:'pad:trigger',     contract_version:'1.0.0' },
    ],
  });

  return {
    unmount() {
      _stop();
      _unsubs.forEach(u => u());
      document.removeEventListener('keydown', _keyHandler);
      KERNEL.registry.unregister(instanceId);
    },
    play: _play, stop: _stop, syncUI: _syncUI,
  };
}

return { mount };
})();
