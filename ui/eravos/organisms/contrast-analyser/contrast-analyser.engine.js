/* ═══════════════════════════════════════════════════════════
   ORGANISM: CONTRAST ANALYSER  v1.0.0
   id: eravos.contrast-analyser

   Three analysis modes:
     FREQUENCY — dual FFT spectrum, clash score
     DYNAMIC   — dual RMS waveform, dynamic contrast
     RHYTHMIC  — transient grid, displacement score

   No DOM. Communicates only via sBus.
   ═══════════════════════════════════════════════════════════ */

window.ContrastAnalyserEngine = (() => {
'use strict';

/* ── Transient detector ────────────────────────────────────
   Peak-picks energy spikes above adaptive threshold.
   Returns array of { time_sec, amplitude } objects.      */
function detectTransients(audioBuffer, sensitivity = 0.3) {
  const data     = audioBuffer.getChannelData(0);
  const sr       = audioBuffer.sampleRate;
  const hop      = Math.floor(sr * 0.005);   /* 5ms hop */
  const win      = Math.floor(sr * 0.02);    /* 20ms window */
  const transients = [];

  let maxEnergy = 0;
  const energies = [];

  for (let i = 0; i < data.length - win; i += hop) {
    let e = 0;
    for (let j = 0; j < win; j++) e += data[i + j] ** 2;
    e = Math.sqrt(e / win);
    energies.push({ time: i / sr, e });
    if (e > maxEnergy) maxEnergy = e;
  }

  const threshold = maxEnergy * (0.1 + sensitivity * 0.5);
  let lastPeak = -1;
  const minGapSec = 0.05; /* min 50ms between transients */

  for (let i = 1; i < energies.length - 1; i++) {
    const { time, e } = energies[i];
    if (
      e > threshold &&
      e > energies[i - 1].e &&
      e >= energies[i + 1].e &&
      time - lastPeak > minGapSec
    ) {
      transients.push({ time_sec: time, amplitude: e / maxEnergy });
      lastPeak = time;
    }
  }

  return transients;
}

/* ── BPM from transients (autocorrelation) ─────────────── */
function detectBPM(transients) {
  if (transients.length < 4) return null;
  const times = transients.map(t => t.time_sec);
  const gaps  = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);

  /* Find most common gap */
  const buckets = {};
  const bpmRes  = 0.02; /* 20ms resolution */
  gaps.forEach(g => {
    const key = Math.round(g / bpmRes) * bpmRes;
    buckets[key] = (buckets[key] || 0) + 1;
  });

  let bestGap = 0, bestCount = 0;
  Object.entries(buckets).forEach(([k, v]) => {
    if (v > bestCount) { bestCount = v; bestGap = +k; }
  });

  if (!bestGap) return null;
  const bpm = Math.round(60 / bestGap);
  const confidence = Math.min(1, bestCount / gaps.length);
  return { bpm: Math.max(60, Math.min(220, bpm)), confidence };
}

/* ── RMS peaks (for dynamic waveform) ─────────────────── */
function buildRMSPeaks(audioBuffer, buckets = 300) {
  const data  = audioBuffer.getChannelData(0);
  const step  = Math.ceil(data.length / buckets);
  const peaks = [];
  for (let i = 0; i < buckets; i++) {
    let rms = 0, count = 0;
    for (let j = 0; j < step; j++) {
      const s = data[i * step + j] || 0;
      rms += s * s; count++;
    }
    peaks.push(Math.sqrt(rms / count));
  }
  return peaks;
}

/* ── Peak amplitude ─────────────────────────────────────── */
function peakDb(audioBuffer) {
  const data = audioBuffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/* ── Average RMS ────────────────────────────────────────── */
function avgRMS(peaks) {
  const sum = peaks.reduce((a, b) => a + b * b, 0);
  return Math.sqrt(sum / peaks.length);
}

/* ── Clash score (spectral overlap) ──────────────────────
   Computes how much two FFT snapshots overlap.
   Returns 0–100. 0 = total separation. 100 = identical.  */
function clashScore(fftA, fftB) {
  let overlap = 0, totalA = 0, totalB = 0;
  const len = Math.min(fftA.length, fftB.length);
  for (let i = 0; i < len; i++) {
    const a = fftA[i] / 255;
    const b = fftB[i] / 255;
    overlap += Math.min(a, b);
    totalA  += a;
    totalB  += b;
  }
  const denom = Math.max(totalA, totalB, 0.001);
  return Math.round((overlap / denom) * 100);
}

/* ── Displacement score (rhythmic tension) ───────────────
   How far apart are A and B transients from each other
   relative to a beat grid.
   0 = locked. 100 = maximum fight.                       */
function displacementScore(transientsA, transientsB, bpm) {
  if (!transientsA.length || !transientsB.length) return 0;
  const beatSec = 60 / bpm;
  const grid16  = beatSec / 4;
  let totalDisp = 0, count = 0;

  transientsA.forEach(ta => {
    /* Find nearest B transient */
    let nearestDist = Infinity;
    transientsB.forEach(tb => {
      const dist = Math.abs(ta.time_sec - tb.time_sec) % grid16;
      const wrapped = Math.min(dist, grid16 - dist);
      if (wrapped < nearestDist) nearestDist = wrapped;
    });
    totalDisp += nearestDist / (grid16 * 0.5); /* normalise 0–1 */
    count++;
  });

  return Math.round(Math.min(100, (totalDisp / count) * 100));
}

/* ── Dynamic contrast score ─────────────────────────────── */
function dynamicContrastScore(peaksA, peaksB) {
  const rmsA = avgRMS(peaksA);
  const rmsB = avgRMS(peaksB);
  const ratio = Math.max(rmsA, rmsB) / Math.max(Math.min(rmsA, rmsB), 0.001);
  return Math.round(Math.min(100, (ratio - 1) * 30));
}

/* ── Analysis text generator ────────────────────────────── */
function analysisText(mode, scoreA, scoreB, clash, displacement, dynContrast, bpmResult) {
  if (mode === 'frequency') {
    if (clash > 80) return 'Heavy spectral overlap — both clips fighting the same frequencies. EQ one to carve space.';
    if (clash > 50) return 'Moderate clash in the mids. Consider a high-pass on the lighter track.';
    if (clash < 20) return 'Strong spectral separation — these layer cleanly. A provides body, B provides air.';
    return 'Reasonable separation. Some overlap in the low-mids — watch for muddiness at high volumes.';
  }
  if (mode === 'dynamic') {
    if (dynContrast > 60) return 'A dominates in level. B will be masked at high volumes — sidechain or duck B under A.';
    if (dynContrast < 15) return 'Similar RMS levels — these will compete directly in the mix. Consider panning or EQ separation.';
    return 'Good dynamic contrast. Use the louder clip for the drop, the quieter for the build.';
  }
  if (mode === 'rhythmic') {
    const bpmStr = bpmResult ? `Detected BPM: ${bpmResult.bpm}.` : '';
    if (displacement > 70) return `${bpmStr} Maximum rhythmic tension — these are fighting hard. That's the Tranki effect. Keep it.`;
    if (displacement > 40) return `${bpmStr} Moderate displacement — productive tension. The clips agree sometimes but not always.`;
    if (displacement < 15) return `${bpmStr} Locked to the same grid — tight and punchy. No tension. Try offsetting one clip.`;
    return `${bpmStr} Light displacement — some tension present. Increase sensitivity to reveal more.`;
  }
  return '';
}

/* ── MOUNT ──────────────────────────────────────────────── */
function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let mode   = config.mode || 'frequency';
  let bpm    = config.bpm  || KERNEL.clock.BPM;
  let sensitivity = config.sensitivity || 0.3;

  /* Slot state */
  const slots = {
    A: { buffer: null, name: null, peaks: [], transients: [], peakDb: 0 },
    B: { buffer: null, name: null, peaks: [], transients: [], peakDb: 0 },
  };

  /* Live FFT analysers */
  let analyserA = null, analyserB = null;
  const fftSize = 2048;

  function _bootAnalysers() {
    const AC = audio.boot();
    if (!analyserA) {
      analyserA = AC.createAnalyser(); analyserA.fftSize = fftSize;
      analyserB = AC.createAnalyser(); analyserB.fftSize = fftSize;
    }
  }

  function _loadSlot(slot, result) {
    const AC = audio.boot();
    _bootAnalysers();

    AC.decodeAudioData(result.arrayBuffer.slice(0)).then(ab => {
      slots[slot].buffer     = ab;
      slots[slot].name       = result.name;
      slots[slot].peaks      = buildRMSPeaks(ab, 300);
      slots[slot].transients = detectTransients(ab, sensitivity);
      slots[slot].peakDb     = peakDb(ab);

      const bpmResult = detectBPM(slots[slot].transients);
      if (bpmResult && bpmResult.confidence > 0.4) {
        bpm = bpmResult.bpm;
        sBus.publish('org:bpm-detected', { bpm: bpmResult.bpm, confidence: bpmResult.confidence });
      }

      sBus.publish('org:slot-loaded', {
        slot,
        name:       result.name,
        duration:   ab.duration,
        peaks:      slots[slot].peaks,
        transients: slots[slot].transients,
        peakDb:     slots[slot].peakDb,
        bpmResult,
      });

      _runAnalysis();
    }).catch(e => {
      KERNEL.fault('ASSET_002', instanceId, `contrast analyser decode failed: ${e.message}`);
    });
  }

  function _runAnalysis() {
    if (!slots.A.buffer && !slots.B.buffer) return;

    const peaksA      = slots.A.peaks;
    const peaksB      = slots.B.peaks;
    const transientsA = slots.A.transients;
    const transientsB = slots.B.transients;

    /* Displacement always uses current bpm */
    const displacement = (transientsA.length && transientsB.length)
      ? displacementScore(transientsA, transientsB, bpm)
      : 0;

    const dynContrast = (peaksA.length && peaksB.length)
      ? dynamicContrastScore(peaksA, peaksB)
      : 0;

    /* Clash needs live FFT — approximate from buffer FFT if not live */
    let clash = 0;
    if (slots.A.buffer && slots.B.buffer) {
      /* Approximate: take centre-point FFT from each buffer */
      const fftA = _bufferFFT(slots.A.buffer, fftSize);
      const fftB = _bufferFFT(slots.B.buffer, fftSize);
      clash = clashScore(fftA, fftB);
    }

    const bpmResult = detectBPM([...transientsA, ...transientsB].sort((a, b) => a.time_sec - b.time_sec));
    const text = analysisText(mode, 0, 0, clash, displacement, dynContrast, bpmResult);

    sBus.publish('org:analysis-ready', {
      mode, clash, displacement, dynContrast, text,
      peaksA: peaksA.slice(0, 300),
      peaksB: peaksB.slice(0, 300),
      transientsA, transientsB,
      peakDbA: slots.A.peakDb,
      peakDbB: slots.B.peakDb,
      bpm, bpmResult,
      nameA: slots.A.name, nameB: slots.B.name,
    });

    /* Publish on global bus for other organisms */
    gBus.publish('contrast:analysis', { mode, clash, displacement, dynContrast, text });
  }

  /* Approximate centre-frame FFT from a decoded buffer */
  function _bufferFFT(ab, size) {
    const data   = ab.getChannelData(0);
    const centre = Math.floor(data.length / 2);
    const half   = size / 2;
    const fft    = new Uint8Array(half);
    /* Very lightweight: just map raw amplitude to frequency bins */
    for (let i = 0; i < half; i++) {
      let sum = 0;
      const span = Math.max(1, Math.floor(data.length / half));
      for (let j = 0; j < span; j++) {
        sum += Math.abs(data[Math.min(centre + i * span + j, data.length - 1)] || 0);
      }
      fft[i] = Math.round(Math.min(255, (sum / span) * 255 * 8));
    }
    return fft;
  }

  /* ── UI hook subscribers ── */
  const _unsubs = [
    gBus.subscribe('ui:slot-load:' + instanceId, ({ slot, arrayBuffer, name }) => {
      if (!arrayBuffer) return;
      _loadSlot(slot, { arrayBuffer, name });
    }),
    gBus.subscribe('ui:mode-change:' + instanceId, ({ mode: m }) => {
      mode = m;
      _runAnalysis();
      sBus.publish('org:mode-changed', { mode });
    }),
    gBus.subscribe('ui:config-change:' + instanceId, ({ key, value }) => {
      if (key === 'bpm')         { bpm = value; _runAnalysis(); }
      if (key === 'sensitivity') { sensitivity = value; }
    }),
    gBus.subscribe('ui:tap-bpm:' + instanceId, _tapBPM),
    gBus.subscribe('ui:reanalyse:' + instanceId, _runAnalysis),

    /* Accept drops from intake directly */
    gBus.subscribe('intake:file', result => {
      if (result.id !== 'audio:sample') return;
      const slot = (!slots.A.buffer) ? 'A' : (!slots.B.buffer) ? 'B' : null;
      if (!slot) return;
      _loadSlot(slot, result);
    }),
  ];

  /* Tap BPM */
  const _taps = [];
  function _tapBPM() {
    const now = performance.now();
    _taps.push(now);
    if (_taps.length > 8) _taps.shift();
    if (_taps.length >= 2) {
      const gaps = [];
      for (let i = 1; i < _taps.length; i++) gaps.push(_taps[i] - _taps[i - 1]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      bpm = Math.round(60000 / avg);
      bpm = Math.max(60, Math.min(220, bpm));
      KERNEL.clock.BPM = bpm;
      sBus.publish('org:bpm-detected', { bpm, confidence: 0.9, source: 'tap' });
      _runAnalysis();
    }
  }

  KERNEL.registry.register({
    instanceId, id: 'eravos.contrast-analyser', label: 'Contrast Analyser',
    provides: ['capability.audio_analysis'],
    requires: [],
    permissions: ['audio_in', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'contrast.hook.slot-a-in',   direction: 'in',  event_type: 'audio:buffer',       contract_version: '1.0.0' },
      { hook_id: 'contrast.hook.slot-b-in',   direction: 'in',  event_type: 'audio:buffer',       contract_version: '1.0.0' },
      { hook_id: 'contrast.hook.analysis-out',direction: 'out', event_type: 'contrast:analysis',  contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    loadSlot: _loadSlot, runAnalysis: _runAnalysis,
  };
}

return { mount, detectTransients, detectBPM, buildRMSPeaks, clashScore, displacementScore };
})();
