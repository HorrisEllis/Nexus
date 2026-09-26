/* ═══════════════════════════════════════════════════════════
   MASTER TRANSPORT  v1.0.0
   runtime/master-transport.js

   Single play/stop/record for the entire canvas.
   All mods that respond to seq:play / seq:stop sync here.

   RECORD: taps KERNEL.audio.dry via MediaStreamDestination,
   captures to ArrayBuffer, hands to timeline as a new clip.

   Exports: window.MasterTransport
   ═══════════════════════════════════════════════════════════ */
window.MasterTransport = (() => {
'use strict';

let _playing   = false;
let _recording = false;
let _recorder  = null;
let _chunks    = [];
let _startTime = 0;
let _bpm       = 128;

const gBus = () => KERNEL.bus;

function play() {
  if (_playing) return;
  _playing = true;
  _bpm = KERNEL.clock.BPM;
  gBus().publish('seq:play',  { BPM: _bpm });
  gBus().publish('transport:play', { BPM: _bpm, timestamp: Date.now() });
  _startTime = KERNEL.audio.AC?.currentTime || 0;
}

function stop() {
  if (!_playing && !_recording) return;
  _playing = false;
  gBus().publish('seq:stop', {});
  gBus().publish('transport:stop', { timestamp: Date.now() });
  if (_recording) _stopRecord();
}

function togglePlay() { _playing ? stop() : play(); }

function record() {
  if (_recording) { _stopRecord(); return; }
  const AC = KERNEL.audio.boot();
  if (!AC.createMediaStreamDestination) {
    gBus().publish('kernel:notify', { message: '⚠ Recording not supported in this browser' });
    return;
  }
  const dest   = AC.createMediaStreamDestination();
  KERNEL.audio.dry.connect(dest);

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';

  _recorder = new MediaRecorder(dest.stream, { mimeType });
  _chunks   = [];

  _recorder.ondataavailable = e => { if (e.data.size > 0) _chunks.push(e.data); };
  _recorder.onstop = async () => {
    const blob   = new Blob(_chunks, { type: mimeType });
    const ab     = await blob.arrayBuffer();
    const dur    = KERNEL.audio.AC ? (KERNEL.audio.AC.currentTime - _startTime) : 0;
    gBus().publish('transport:recorded', { arrayBuffer: ab, duration: dur, mimeType });
    gBus().publish('kernel:notify', { message: `⏺ Recorded ${dur.toFixed(1)}s` });
    KERNEL.audio.dry.disconnect(dest);
  };

  _recorder.start(100);
  _recording = true;
  _startTime = AC.currentTime;

  /* Auto-start playback with recording */
  if (!_playing) play();

  gBus().publish('transport:record-start', {});
  gBus().publish('kernel:notify', { message: '⏺ Recording…' });
}

function _stopRecord() {
  if (!_recorder || _recorder.state === 'inactive') return;
  _recorder.stop();
  _recording = false;
  gBus().publish('transport:record-stop', {});
}

function setBPM(bpm) {
  _bpm = Math.max(40, Math.min(240, Math.round(bpm)));
  KERNEL.clock.BPM = _bpm;
  gBus().publish('kernel:bpm-change', { BPM: _bpm });
}

/* Listen for mods that want to drive transport */
function _wire() {
  gBus().subscribe('ui:transport-play',   () => play());
  gBus().subscribe('ui:transport-stop',   () => stop());
  gBus().subscribe('ui:transport-record', () => record());
  gBus().subscribe('ui:transport-bpm',    ({ bpm }) => setBPM(bpm));
}
_wire();

return {
  play, stop, record, togglePlay, setBPM,
  get playing()   { return _playing; },
  get recording() { return _recording; },
  get BPM()       { return _bpm; },
};
})();
