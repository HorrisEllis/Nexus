/* ═══════════════════════════════════════════════════════════
   MOD: VIDEO EDITOR  v1.0.0
   id: eravos.video-editor

   Loads a local video into a hidden <video> element, draws each
   frame through a Canvas2D filter pipeline, trims to [in,out],
   and re-encodes the filtered range (with original audio) to
   WebM via canvas.captureStream() + MediaRecorder. No server,
   no external transcoder.
   ═══════════════════════════════════════════════════════════ */

window.VideoEditorEngine = (() => {
'use strict';

function mount(instanceId, sBus, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, grayscale: 0,
    inPoint: 0, outPoint: null,
  };

  let _video    = null; /* hidden HTMLVideoElement, the decode source */
  let _recorder = null;
  let _chunks   = [];
  let _rafId    = null;

  function filterString(p = _params) {
    return [
      `brightness(${p.brightness})`,
      `contrast(${p.contrast})`,
      `saturate(${p.saturation})`,
      `hue-rotate(${p.hue}deg)`,
      `blur(${p.blur}px)`,
      `grayscale(${p.grayscale})`,
    ].join(' ');
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.src = url; v.muted = false; v.playsInline = true; v.crossOrigin = 'anonymous';
      v.addEventListener('loadedmetadata', () => {
        _video = v;
        _params.outPoint = v.duration;
        sBus.publish('org:video_loaded', { duration: v.duration, w: v.videoWidth, h: v.videoHeight });
        resolve(v);
      }, { once: true });
      v.addEventListener('error', reject, { once: true });
    });
  }

  /* Draw current video frame into canvas with live filters. Caller drives
     the requestAnimationFrame loop from buildUI (so it can stop cleanly
     when the window is closed) and calls this once per frame. */
  function drawFrame(canvas) {
    if (!_video) return;
    const ctx = canvas.getContext('2d');
    if (canvas.width !== _video.videoWidth || canvas.height !== _video.videoHeight) {
      canvas.width = _video.videoWidth; canvas.height = _video.videoHeight;
    }
    ctx.filter = filterString();
    ctx.drawImage(_video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
  }

  function _pickMime() {
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const c of candidates) if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    return 'video/webm';
  }

  /* Play [inPoint, outPoint] once, recording the filtered canvas + original
     audio track to a WebM blob, then trigger a download. */
  function exportClip(canvas, onDone) {
    if (!_video) return;
    const mime = _pickMime();
    const canvasStream = canvas.captureStream(30);
    let audioTracks = [];
    try { audioTracks = _video.captureStream ? _video.captureStream().getAudioTracks() : []; } catch (e) { audioTracks = []; }
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    _chunks = [];
    _recorder = new MediaRecorder(combined, { mimeType: mime });
    _recorder.ondataavailable = e => { if (e.data.size) _chunks.push(e.data); };
    _recorder.onstop = () => {
      const blob = new Blob(_chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'eravos-video-export.webm'; a.click();
      gBus.publish('video:exported', { instanceId, size: blob.size, mime });
      sBus.publish('org:exported', { size: blob.size, mime });
      if (onDone) onDone();
    };

    _video.currentTime = _params.inPoint;
    const outT = _params.outPoint ?? _video.duration;

    const pump = () => {
      drawFrame(canvas);
      if (_video.currentTime >= outT || _video.paused && _video.currentTime >= outT - 0.02) {
        _video.pause();
        _recorder.stop();
        cancelAnimationFrame(_rafId);
        return;
      }
      _rafId = requestAnimationFrame(pump);
    };

    _recorder.start();
    _video.play().then(() => { _rafId = requestAnimationFrame(pump); });
  }

  function _updateParam(key, val) {
    if (key in _params) _params[key] = val;
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => _updateParam(key, value)),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.video-editor',
    label:    'Video Editor',
    provides: ['capability.video_edit', 'capability.video_export'],
    requires: [],
    permissions: ['filesystem_read', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'video.hook.exported', direction: 'out', event_type: 'video:exported', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() {
      cancelAnimationFrame(_rafId);
      if (_video) { try { _video.pause(); } catch (e) {} }
      _unsubs.forEach(u => u());
      KERNEL.registry.unregister(instanceId);
    },
    loadFile, drawFrame, exportClip, filterString,
    get video()  { return _video; },
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
