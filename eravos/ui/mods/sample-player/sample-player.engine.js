/* ═══════════════════════════════════════════════════════════
   MOD: SAMPLE PLAYER  v3.1.0
   ═══════════════════════════════════════════════════════════ */
window.SamplePlayerMod = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}, intakeResult = null) {
  const gBus = KERNEL.bus;
  let _buf=null, _src=null, _playing=false;
  let _looping=config.loop??false, _reverse=config.reverse??false;
  let gain=config.gain??1, pitch=config.pitch??0, start=config.start??0, end=config.end??1;
  let _name = intakeResult?.name ?? '(no file)';

  function _load(result) {
    _name = result.name;
    const AC = audio.boot();
    AC.decodeAudioData(result.arrayBuffer.slice(0)).then(ab => {
      _buf = ab;
      const peaks = _buildPeaks(ab, 200);
      sBus.publish('org:waveform_ready', { peaks, duration_sec: ab.duration, name: _name });
      sBus.publish('org:state_sync', { name: _name, duration_sec: ab.duration });
    }).catch(e => KERNEL.fault('ASSET_002', instanceId, `decode failed: ${e.message}`));
  }

  function _play() {
    if (!_buf) return;
    _stop();
    const AC = audio.AC;
    _src = AC.createBufferSource();
    _src.buffer = _buf;
    _src.loop   = _looping;
    _src.playbackRate.value = Math.pow(2, pitch/12) * (_reverse ? -1 : 1);
    const g = AC.createGain(); g.gain.value = gain;
    _src.connect(g); audio.send(g);
    const s = start * _buf.duration, dur = (end - start) * _buf.duration;
    _src.start(0, s, _looping ? undefined : dur);
    _playing = true;
    sBus.publish('org:state_sync', { playing: true });
    const startedAt = AC.currentTime;
    let frame;
    (function track() {
      if (!_playing) return;
      const pos = (AC.currentTime - startedAt) / _buf.duration;
      sBus.publish('org:playhead_update', { position_normalized: Math.min(1, Math.max(0, pos)) });
      frame = requestAnimationFrame(track);
    })();
    _src.onended = () => { _playing=false; cancelAnimationFrame(frame); sBus.publish('org:state_sync',{playing:false}); };
  }

  function _stop() {
    if (_src) { try { _src.stop(); } catch(e) {} _src=null; }
    _playing = false;
    sBus.publish('org:state_sync', { playing: false });
  }

  function _buildPeaks(ab, count) {
    const data=ab.getChannelData(0), step=Math.ceil(data.length/count), peaks=[];
    for(let i=0;i<count;i++){let max=0;for(let j=0;j<step;j++)max=Math.max(max,Math.abs(data[i*step+j]||0));peaks.push(max);}
    return peaks;
  }

  if (intakeResult?.arrayBuffer) setTimeout(()=>_load(intakeResult), 10);

  const _unsubs = [
    gBus.subscribe('ui:play_press:'+instanceId,   ()=>_playing?_stop():_play()),
    gBus.subscribe('ui:stop_press:'+instanceId,   ()=>_stop()),
    gBus.subscribe('ui:config_change:'+instanceId,({key,value})=>{
      if(key==='gain')gain=value; if(key==='pitch')pitch=value;
      if(key==='start')start=value; if(key==='end')end=value;
      if(key==='loop')_looping=value; if(key==='reverse')_reverse=value;
    }),
    gBus.subscribe('intake:file', result=>{
      if(result.id==='audio:sample' && result._targetInstanceId===instanceId) _load(result);
    }),
  ];

  KERNEL.registry.register({
    instanceId, id:'eravos.sample-player', label:_name,
    provides:['capability.audio_out','capability.sample_source'],
    requires:['capability.audio_context'],
    permissions:['audio_out','bus_publish','bus_subscribe','filesystem_read'],
    hooks:[
      {hook_id:'samp.hook.audio_out',  direction:'out',event_type:'audio:signal',contract_version:'1.0.0'},
      {hook_id:'samp.hook.trigger_in', direction:'in', event_type:'pad:trigger', contract_version:'1.0.0'},
    ],
  });

  return {
    unmount(){_stop();_unsubs.forEach(u=>u());KERNEL.registry.unregister(instanceId);},
    play:_play, stop:_stop, load:_load,
  };
}
return { mount };
})();
