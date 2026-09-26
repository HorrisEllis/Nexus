/* ═══════════════════════════════════════════════════════════
   ORGANISM: TIMELINE  v3.1.0
   ═══════════════════════════════════════════════════════════ */
window.TimelineOrganism = (() => {
'use strict';

function mount(instanceId, sBus, audio, clock, config = {}) {
  const gBus = KERNEL.bus;
  let pxPerSec = 80, offset = 0, cursor = 0;
  let playing = false, startedAt = 0, cursorAtPlay = 0, _timer = null;
  let _lanes = [], _clipCount = 0;
  function _uid() { return Math.random().toString(36).slice(2,9); }

  function _addLane(opts) {
    const { name='Track', icon='♪', color='#00d4ff' } = opts;
    const laneId = 'lane-' + _uid();
    _lanes.push({ laneId, name, icon, color, clips: [] });
    _syncUI(); return laneId;
  }

  function _addClip(laneId, opts) {
    const lane = _lanes.find(l => l.laneId === laneId); if (!lane) return null;
    const clipId = 'clip-' + _uid();
    const { name, icon='♪', startSec=0, durSec=4, assetId=null } = opts;
    lane.clips.push({ clipId, name: name||lane.name, icon, startSec, durSec, assetId });
    _clipCount++;
    sBus.publish('org:clip_added', { clipId, laneId, startSec, durSec, name });
    return clipId;
  }

  function _play() {
    if (!audio.AC) return;
    playing=true; startedAt=audio.AC.currentTime; cursorAtPlay=cursor;
    gBus.publish('seq:play',{BPM:clock.BPM});
    sBus.publish('org:state_sync',{playing:true});
    _tick();
  }

  function _stop() {
    playing=false; clearTimeout(_timer); cursor=0; cursorAtPlay=0;
    gBus.publish('seq:stop',{});
    sBus.publish('org:state_sync',{playing:false,position_sec:0});
    _emitPH();
  }

  function _tick() {
    if (!playing) return;
    cursor = cursorAtPlay + (audio.AC.currentTime - startedAt);
    _emitPH();
    _timer = setTimeout(_tick, 16);
  }

  function _emitPH() {
    const t=cursor, beatSec=60/clock.BPM, bar=Math.floor(t/(beatSec*4))+1, beat=Math.floor((t%(beatSec*4))/beatSec)+1;
    sBus.publish('org:playhead_update',{position_sec:t,bar,beat,pxPerSec,offset});
  }

  function _syncUI() {
    sBus.publish('org:clip_sync',{
      lanes: _lanes.map(l=>({laneId:l.laneId,name:l.name,icon:l.icon,color:l.color})),
      clips: _lanes.flatMap(l=>l.clips.map(c=>({...c,laneId:l.laneId}))),
      pxPerSec, offset, cursor, bpm: clock.BPM,
    });
  }

  const _unsubs = [
    gBus.subscribe('ui:play_press:'+instanceId,  ()=>playing?_stop():_play()),
    gBus.subscribe('ui:ruler_click:'+instanceId, ({position_sec})=>{cursor=Math.max(0,position_sec);cursorAtPlay=cursor;_emitPH();}),
    gBus.subscribe('ui:zoom_change:'+instanceId, ({px_per_sec})=>{pxPerSec=Math.max(20,Math.min(400,px_per_sec));_syncUI();}),
    gBus.subscribe('ui:clip_place:'+instanceId,  ({laneId,position_sec,assetId,name})=>_addClip(laneId,{startSec:position_sec,name,assetId})),
    gBus.subscribe('ui:clip_move:'+instanceId,   ({clipId,position_sec})=>{_lanes.forEach(l=>{const c=l.clips.find(c=>c.clipId===clipId);if(c)c.startSec=Math.max(0,position_sec);});}),
    gBus.subscribe('ui:clip_remove:'+instanceId, ({clipId})=>{_lanes.forEach(l=>{l.clips=l.clips.filter(c=>c.clipId!==clipId);});sBus.publish('org:clip_removed',{clipId});}),
    gBus.subscribe('ui:lane_add:'+instanceId,    opts=>_addLane(opts)),
    gBus.subscribe('ui:lane_remove:'+instanceId, ({laneId})=>{_lanes=_lanes.filter(l=>l.laneId!==laneId);_syncUI();}),
    gBus.subscribe('intake:file', result=>{
      if(result.id==='audio:sample'){
        const laneId=_addLane({name:result.name,icon:'🎵',color:'#00d4ff'});
        _addClip(laneId,{startSec:cursor,name:result.name,durSec:4,assetId:result.hash});
        sBus.publish('org:asset_loaded',{laneId,assetId:result.hash,arrayBuffer:result.arrayBuffer,name:result.name});
      }
    }),
    gBus.subscribe('seq:play',()=>{if(!playing)_play();}),
    gBus.subscribe('seq:stop',()=>{if(playing)_stop();}),
  ];

  const _keyHandler = ev => {
    if(ev.target.tagName==='SELECT'||ev.target.tagName==='INPUT') return;
    if(ev.code==='Space'){ev.preventDefault();playing?_stop():_play();}
  };
  document.addEventListener('keydown', _keyHandler);

  _syncUI();

  KERNEL.registry.register({
    instanceId, id:'eravos.timeline', label:'Timeline',
    provides:['capability.timeline','capability.clip_store','capability.seek'],
    requires:['capability.audio_context'],
    permissions:['audio_out','audio_in','bus_publish','bus_subscribe','filesystem_read'],
    hooks:[
      {hook_id:'tl.hook.transport_in', direction:'in',  event_type:'seq:play',           contract_version:'1.0.0'},
      {hook_id:'tl.hook.stop_in',      direction:'in',  event_type:'seq:stop',           contract_version:'1.0.0'},
      {hook_id:'tl.hook.seek_out',     direction:'out', event_type:'timeline:seek',      contract_version:'1.0.0'},
      {hook_id:'tl.hook.clip_play_out',direction:'out', event_type:'timeline:clip_play', contract_version:'1.0.0'},
    ],
  });

  return {
    unmount(){_stop();_unsubs.forEach(u=>u());document.removeEventListener('keydown',_keyHandler);KERNEL.registry.unregister(instanceId);},
    play:_play, stop:_stop, addLane:_addLane, syncUI:_syncUI,
  };
}
return { mount };
})();

/* ── RECORDING extension — appended to timeline engine ──────
   Listens for transport:recorded and creates a new lane+clip
   with the captured buffer. Also listens to transport:play/stop
   to sync with master transport.                              */
(function _patchTimelineRecording() {
  const gBus = KERNEL.bus;

  gBus.subscribe('transport:recorded', ({ arrayBuffer, duration, mimeType }) => {
    /* Find any mounted timeline instance and give it the recording */
    const timelines = KERNEL.registry.getById('eravos.timeline');
    if (!timelines.length) return;
    /* Route to the first timeline that's alive */
    const tl = timelines[0];
    gBus.publish('intake:file', {
      id:          'audio:sample',
      name:        `recording_${new Date().toISOString().slice(11,19)}.webm`,
      arrayBuffer,
      hash:        Math.random().toString(36).slice(2),
      mimeType,
      icon:        '⏺',
      sizeBytes:   arrayBuffer.byteLength,
      file:        null,
    });
  });

  gBus.subscribe('transport:play', ({ BPM }) => {
    KERNEL.clock.BPM = BPM;
  });
})();
