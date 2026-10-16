/* data/plugins (v10 eravos_dist/plugins, kept verbatim as data) */
window.ERAVOS_DATA = window.ERAVOS_DATA || {};
window.ERAVOS_DATA.plugins = {
"arp": {
"id": "arp",
"name": "SEQUENCE RUNNER",
"icon": "⟳",
"col": "#44ffaa",
"tag": "SEQUENCER",
"desc": "Step arpeggiator. 16 steps, chord modes, MIDI out.",
"module": "arpeggiator",
"visualizer": {
"type": "step_grid",
"color": "#44ffaa"
},
"params": [
{
"n": "Rate",
"k": "rate",
"v": 0.5,
"min": 1,
"max": 32,
"step": 1,
"unit": "div"
},
{
"n": "Octaves",
"k": "octs",
"v": 0.3,
"min": 1,
"max": 4,
"step": 1
},
{
"n": "Pattern",
"k": "pattern",
"v": 0,
"min": 0,
"max": 5,
"step": 1,
"type": "enum",
"options": [
"Up",
"Down",
"UpDown",
"Random",
"Chord",
"As Played"
]
},
{
"n": "Gate",
"k": "gate",
"v": 0.5,
"min": 0.01,
"max": 1
},
{
"n": "Swing",
"k": "swing",
"v": 0.5,
"min": 0,
"max": 1
},
{
"n": "Latch",
"k": "latch",
"v": 0,
"type": "toggle"
}
],
"presets": {
"TECHNO": {
"rate": 0.5,
"octs": 0.3,
"pattern": 0,
"gate": 0.4
},
"TRANCE": {
"rate": 0.25,
"octs": 0.5,
"pattern": 2,
"gate": 0.6,
"swing": 0.5
},
"ACID": {
"rate": 0.5,
"octs": 0.3,
"pattern": 0,
"gate": 0.25
}
}
},
"bitcrush": {
"id": "bitcrush",
"name": "8-BIT DESTROYER",
"icon": "👾",
"col": "#aaff00",
"tag": "GLITCH",
"desc": "Bit crusher + sample rate reducer. Glitch it. Break it.",
"module": "bitcrusher",
"visualizer": {
"type": "waveform",
"color": "#aaff00",
"style": "stepped"
},
"params": [
{
"n": "Bits",
"k": "bits",
"v": 0.7,
"min": 1,
"max": 16,
"step": 1,
"unit": "bit"
},
{
"n": "Sample Rate",
"k": "rate",
"v": 0.8,
"min": 0.01,
"max": 1,
"unit": "x"
},
{
"n": "Foldback",
"k": "fold",
"v": 0.3,
"min": 0,
"max": 1
},
{
"n": "Stutter",
"k": "stutter",
"v": 0.2,
"min": 0,
"max": 1
},
{
"n": "Noise Floor",
"k": "noise",
"v": 0.1,
"min": 0,
"max": 1
},
{
"n": "Mix",
"k": "mix",
"v": 0.6,
"min": 0,
"max": 1
}
],
"presets": {
"SUBTLE": {
"bits": 0.85,
"rate": 0.9,
"mix": 0.3
},
"CRUNCH": {
"bits": 0.5,
"rate": 0.6,
"fold": 0.4,
"mix": 0.7
},
"DESTROY": {
"bits": 0.1,
"rate": 0.2,
"fold": 0.8,
"stutter": 0.7,
"mix": 1
},
"NES": {
"bits": 0.5,
"rate": 0.4,
"mix": 0.8
}
}
},
"chorus": {
"id": "chorus",
"name": "DIMENSION X",
"icon": "✦",
"col": "#ff44aa",
"tag": "MODULATION",
"desc": "Thick stereo chorus/ensemble. Detuned supersaw width.",
"module": "chorus",
"visualizer": {
"type": "lissajous",
"color": "#ff44aa"
},
"params": [
{
"n": "Rate",
"k": "rate",
"v": 0.3,
"min": 0.01,
"max": 10,
"unit": "Hz"
},
{
"n": "Depth",
"k": "depth",
"v": 0.5,
"min": 0,
"max": 1
},
{
"n": "Mix",
"k": "mix",
"v": 0.5,
"min": 0,
"max": 1
},
{
"n": "Spread",
"k": "spread",
"v": 0.7,
"min": 0,
"max": 1
},
{
"n": "Detune",
"k": "detune",
"v": 0.4,
"min": 0,
"max": 100,
"unit": "ct"
},
{
"n": "Voices",
"k": "voices",
"v": 0.6,
"min": 2,
"max": 8,
"step": 1
}
],
"presets": {
"SUBTLE": {
"rate": 0.2,
"depth": 0.2,
"mix": 0.3,
"spread": 0.5
},
"WIDE": {
"rate": 0.3,
"depth": 0.6,
"mix": 0.6,
"spread": 0.9,
"detune": 0.5
},
"ENSEMBLE": {
"rate": 0.5,
"depth": 0.8,
"mix": 0.7,
"spread": 1,
"voices": 0.8
}
}
},
"comp": {
"id": "comp",
"name": "IRON FIST",
"icon": "⚙",
"col": "#ffaa00",
"tag": "DYNAMICS",
"desc": "Parallel brick-wall compressor. Glue, punch, sidechain.",
"module": "compressor",
"visualizer": {
"type": "gain_reduction",
"color": "#ffaa00"
},
"params": [
{
"n": "Threshold",
"k": "thresh",
"v": 0.4,
"min": -60,
"max": 0,
"unit": "dB"
},
{
"n": "Ratio",
"k": "ratio",
"v": 0.6,
"min": 1,
"max": 20,
"unit": ":1"
},
{
"n": "Attack",
"k": "attack",
"v": 0.3,
"min": 0.001,
"max": 1,
"unit": "s"
},
{
"n": "Release",
"k": "release",
"v": 0.5,
"min": 0.01,
"max": 3,
"unit": "s"
},
{
"n": "Makeup",
"k": "makeup",
"v": 0.6,
"min": 0,
"max": 24,
"unit": "dB"
},
{
"n": "Sidechain",
"k": "sc",
"v": 0,
"type": "toggle"
}
],
"presets": {
"GLUE": {
"thresh": 0.5,
"ratio": 0.4,
"attack": 0.4,
"release": 0.6,
"makeup": 0.5
},
"PUNCH": {
"thresh": 0.3,
"ratio": 0.8,
"attack": 0.1,
"release": 0.3,
"makeup": 0.7
},
"LIMIT": {
"thresh": 0.15,
"ratio": 1,
"attack": 0.05,
"release": 0.2,
"makeup": 0.9
},
"DRUMS": {
"thresh": 0.35,
"ratio": 0.7,
"attack": 0.2,
"release": 0.15
}
}
},
"curve": {
"id": "curve",
"name": "CURVE PERCUSSOR",
"icon": "〜",
"col": "#00ccff",
"tag": "PITCH FX",
"desc": "Draw pitch curves that slam edges and bounce. The QOTSA sound. Song for the Dead at 1:01 — draw the dive, let it ricochet.",
"module": "curve_percussor",
"visualizer": {
"type": "curve_canvas",
"color": "#00ccff",
"interactive": true
},
"params": [
{
"n": "Edge",
"k": "edge",
"v": 1,
"min": 0,
"max": 2,
"step": 1,
"type": "enum",
"options": [
"Left",
"Right",
"Both"
]
},
{
"n": "Decay",
"k": "decay",
"v": 0.6,
"min": 0.01,
"max": 0.99
},
{
"n": "Bounces",
"k": "bounces",
"v": 0.4,
"min": 1,
"max": 8,
"step": 1
},
{
"n": "Pitch Range",
"k": "range",
"v": 0.7,
"min": 0,
"max": 1
},
{
"n": "Duration",
"k": "dur",
"v": 0.5,
"min": 0.1,
"max": 2,
"unit": "s"
},
{
"n": "Mix",
"k": "mix",
"v": 0.9,
"min": 0,
"max": 1
}
],
"presets": {
"QOTSA DIVE": {
"edge": 1,
"decay": 0.62,
"bounces": 0.4,
"range": 0.88,
"dur": 0.45
},
"LASER": {
"edge": 1,
"decay": 0.45,
"bounces": 0.7,
"range": 1,
"dur": 0.3
},
"RICOCHET": {
"edge": 2,
"decay": 0.7,
"bounces": 0.8,
"range": 0.9,
"dur": 0.55
},
"SLOW FALL": {
"edge": 1,
"decay": 0.8,
"bounces": 0.3,
"range": 0.6,
"dur": 0.9
},
"BOTH WALLS": {
"edge": 2,
"decay": 0.75,
"bounces": 0.9,
"range": 1,
"dur": 0.6
}
},
"builtin_curves": {
"SONG FOR THE DEAD": {
"pts": [
{
"x": 0,
"y": 0.82
},
{
"x": 0.12,
"y": 0.78
},
{
"x": 0.25,
"y": 0.72
},
{
"x": 0.4,
"y": 0.62
},
{
"x": 0.55,
"y": 0.48
},
{
"x": 0.68,
"y": 0.32
},
{
"x": 0.8,
"y": 0.18
},
{
"x": 0.9,
"y": 0.08
},
{
"x": 0.97,
"y": 0.02
},
{
"x": 1,
"y": 0.01
}
],
"edge": "right",
"decay": 0.62,
"desc": "Pitch curves upward slowly, accelerating toward right edge, slams and bounces back mirrored"
},
"RICOCHET UP": {
"pts": [
{
"x": 0,
"y": 0.9
},
{
"x": 0.2,
"y": 0.7
},
{
"x": 0.4,
"y": 0.4
},
{
"x": 0.6,
"y": 0.2
},
{
"x": 0.8,
"y": 0.08
},
{
"x": 1.0,
"y": 0.02
}
],
"edge": "right",
"decay": 0.58
},
"LASER ZAP": {
"pts": [
{
"x": 0,
"y": 0.5
},
{
"x": 0.3,
"y": 0.05
},
{
"x": 0.6,
"y": 0.5
},
{
"x": 0.8,
"y": 0.8
},
{
"x": 1,
"y": 0.9
}
],
"edge": "both",
"decay": 0.5
},
"VOWEL FALL": {
"pts": [
{
"x": 0,
"y": 0.2
},
{
"x": 0.3,
"y": 0.4
},
{
"x": 0.5,
"y": 0.6
},
{
"x": 0.7,
"y": 0.82
},
{
"x": 1,
"y": 0.95
}
],
"edge": "right",
"decay": 0.7
}
}
},
"delay": {
"id": "delay",
"name": "ECHO CANYON",
"icon": "🌊",
"col": "#00d4ff",
"tag": "DELAY",
"desc": "Tape delay with ping-pong. Echo off the right edge.",
"module": "delay",
"visualizer": {
"type": "spectrogram",
"color": "#00d4ff"
},
"params": [
{
"n": "Time",
"k": "time",
"v": 0.5,
"min": 0.01,
"max": 2,
"unit": "s",
"snap": [
0.125,
0.25,
0.333,
0.5,
0.667,
1
]
},
{
"n": "Feedback",
"k": "fb",
"v": 0.38,
"min": 0,
"max": 0.98,
"unit": "%"
},
{
"n": "Tone",
"k": "tone",
"v": 0.7,
"min": 0,
"max": 1
},
{
"n": "Mix",
"k": "mix",
"v": 0.45,
"min": 0,
"max": 1
},
{
"n": "Ping-Pong",
"k": "ping",
"v": 1,
"min": 0,
"max": 1,
"type": "toggle"
},
{
"n": "Tape Wow",
"k": "wow",
"v": 0.2,
"min": 0,
"max": 1
}
],
"presets": {
"SHORT": {
"time": 0.12,
"fb": 0.2,
"mix": 0.3
},
"SLAP": {
"time": 0.08,
"fb": 0.15,
"mix": 0.4
},
"QUARTER": {
"time": 0.25,
"fb": 0.35,
"mix": 0.45
},
"PING": {
"time": 0.5,
"fb": 0.4,
"ping": 1,
"mix": 0.5
},
"WASH": {
"time": 0.667,
"fb": 0.65,
"tone": 0.5,
"mix": 0.6
}
}
},
"dist": {
"id": "dist",
"name": "DEVASTATOR",
"icon": "🔥",
"col": "#ff6b00",
"tag": "DISTORTION",
"desc": "Tube-saturated overdrive. Push into the red. The sound QOTSA lives in.",
"module": "distortion",
"visualizer": {
"type": "waveform",
"color": "#ff6b00"
},
"params": [
{
"n": "Drive",
"k": "drive",
"v": 0.5,
"min": 0,
"max": 1,
"curve": "exp",
"unit": "%"
},
{
"n": "Tone",
"k": "tone",
"v": 0.6,
"min": 0,
"max": 1,
"unit": "Hz"
},
{
"n": "Level",
"k": "level",
"v": 0.8,
"min": 0,
"max": 1,
"unit": "dB"
},
{
"n": "Mix",
"k": "mix",
"v": 0.7,
"min": 0,
"max": 1,
"unit": "%"
},
{
"n": "Pre-gain",
"k": "pregain",
"v": 0.4,
"min": 0,
"max": 1,
"unit": "dB"
},
{
"n": "Clip Mode",
"k": "clip",
"v": 0,
"min": 0,
"max": 2,
"step": 1,
"type": "enum",
"options": [
"Soft",
"Hard",
"Fuzz"
]
}
],
"presets": {
"CLEAN": {
"drive": 0.08,
"tone": 0.75,
"level": 0.7,
"mix": 0.25
},
"WARM": {
"drive": 0.38,
"tone": 0.6,
"level": 0.8,
"mix": 0.5
},
"HARD": {
"drive": 0.82,
"tone": 0.5,
"level": 0.9,
"mix": 0.8
},
"FUZZ": {
"drive": 0.95,
"tone": 0.35,
"level": 1,
"mix": 1,
"clip": 2
}
},
"routes": [
"pad",
"seq",
"bus"
],
"audio": {
"node": "WaveShaperNode",
"curve": "makeDistCurve(drive*400)",
"tone": "BiquadFilter(lowpass,200+tone*8000)"
}
},
"eq": {
"id": "eq",
"name": "SURGICAL EQ",
"icon": "📊",
"col": "#aaffdd",
"tag": "EQ",
"desc": "6-band parametric EQ. Cut, boost, shape anything.",
"module": "equalizer",
"visualizer": {
"type": "eq_curve",
"color": "#aaffdd",
"interactive": true
},
"params": [
{
"n": "Low Cut",
"k": "lc",
"v": 0.1,
"min": 20,
"max": 500,
"unit": "Hz"
},
{
"n": "Low Shelf",
"k": "ls",
"v": 0.5,
"min": -12,
"max": 12,
"unit": "dB"
},
{
"n": "Low Mid",
"k": "lm",
"v": 0.5,
"min": -12,
"max": 12,
"unit": "dB"
},
{
"n": "High Mid",
"k": "hm",
"v": 0.5,
"min": -12,
"max": 12,
"unit": "dB"
},
{
"n": "High Shelf",
"k": "hs",
"v": 0.5,
"min": -12,
"max": 12,
"unit": "dB"
},
{
"n": "High Cut",
"k": "hc",
"v": 0.9,
"min": 2000,
"max": 20000,
"unit": "Hz"
}
],
"presets": {
"FLAT": {
"ls": 0.5,
"lm": 0.5,
"hm": 0.5,
"hs": 0.5
},
"BASS BOOST": {
"ls": 0.75,
"lm": 0.55,
"hm": 0.45
},
"PRESENCE": {
"hm": 0.7,
"hs": 0.65,
"lc": 0.15
},
"TELEPHONE": {
"lc": 0.4,
"hc": 0.5
}
}
},
"filter": {
"id": "filter",
"name": "ACID QUEEN",
"icon": "⚗",
"col": "#00ff44",
"tag": "FILTER",
"desc": "TB-303 resonant filter. LFO, envelope, full wobble.",
"module": "filter",
"visualizer": {
"type": "frequency_response",
"color": "#00ff44"
},
"params": [
{
"n": "Cutoff",
"k": "cutoff",
"v": 0.5,
"min": 20,
"max": 20000,
"curve": "exp",
"unit": "Hz"
},
{
"n": "Resonance",
"k": "res",
"v": 0.6,
"min": 0,
"max": 30,
"unit": "Q"
},
{
"n": "LFO Rate",
"k": "lfoRate",
"v": 0.3,
"min": 0.01,
"max": 20,
"unit": "Hz"
},
{
"n": "LFO Depth",
"k": "lfoDepth",
"v": 0.4,
"min": 0,
"max": 1
},
{
"n": "Env Amt",
"k": "env",
"v": 0.2,
"min": -1,
"max": 1
},
{
"n": "Type",
"k": "type",
"v": 0,
"min": 0,
"max": 3,
"step": 1,
"type": "enum",
"options": [
"LP",
"HP",
"BP",
"Notch"
]
}
],
"presets": {
"OPEN": {
"cutoff": 0.85,
"res": 0.2
},
"SQUELCH": {
"cutoff": 0.3,
"res": 0.9,
"lfoRate": 0.4,
"lfoDepth": 0.7
},
"WOBBLE": {
"cutoff": 0.4,
"res": 0.7,
"lfoRate": 0.6,
"lfoDepth": 0.9
},
"ACID": {
"cutoff": 0.25,
"res": 1,
"env": 0.8,
"lfoRate": 0.25
}
}
},
"flanger": {
"id": "flanger",
"name": "JET STREAM",
"icon": "〰",
"col": "#00ffcc",
"tag": "MODULATION",
"desc": "Jet-engine flanger. Slow sweep to full jet pass.",
"module": "flanger",
"visualizer": {
"type": "comb_filter",
"color": "#00ffcc"
},
"params": [
{
"n": "Rate",
"k": "rate",
"v": 0.2,
"min": 0.01,
"max": 5,
"unit": "Hz"
},
{
"n": "Depth",
"k": "depth",
"v": 0.6,
"min": 0,
"max": 1
},
{
"n": "Feedback",
"k": "fb",
"v": 0.5,
"min": -1,
"max": 1
},
{
"n": "Delay",
"k": "delay",
"v": 0.4,
"min": 0.001,
"max": 0.02,
"unit": "s"
},
{
"n": "Mix",
"k": "mix",
"v": 0.5,
"min": 0,
"max": 1
},
{
"n": "Stereo",
"k": "stereo",
"v": 1,
"type": "toggle"
}
],
"presets": {
"SLOW": {
"rate": 0.05,
"depth": 0.4,
"mix": 0.5
},
"JET": {
"rate": 0.8,
"depth": 0.9,
"fb": 0.7,
"mix": 0.7
},
"SUBTLE": {
"rate": 0.15,
"depth": 0.3,
"mix": 0.3
}
}
},
"gate": {
"id": "gate",
"name": "DEATH GATE",
"icon": "⊘",
"col": "#cc0000",
"tag": "DYNAMICS",
"desc": "Rhythmic noise gate. Stutter patterns, trance gates.",
"module": "gate",
"visualizer": {
"type": "gate_pattern",
"color": "#cc0000"
},
"params": [
{
"n": "Threshold",
"k": "thresh",
"v": 0.4,
"min": -80,
"max": 0,
"unit": "dB"
},
{
"n": "Attack",
"k": "attack",
"v": 0.2,
"min": 0.001,
"max": 0.5,
"unit": "s"
},
{
"n": "Release",
"k": "release",
"v": 0.3,
"min": 0.001,
"max": 2,
"unit": "s"
},
{
"n": "Hold",
"k": "hold",
"v": 0.3,
"min": 0,
"max": 1,
"unit": "s"
},
{
"n": "Pattern",
"k": "pattern",
"v": 0.5,
"min": 0,
"max": 7,
"step": 1,
"type": "enum",
"options": [
"1/4",
"1/8",
"1/16",
"1/32",
"triplet",
"dotted",
"random",
"sidechain"
]
},
{
"n": "Depth",
"k": "depth",
"v": 1,
"min": 0,
"max": 1
}
],
"presets": {
"TRANCE": {
"thresh": 0.4,
"pattern": 2,
"attack": 0.01,
"release": 0.1
},
"STUTTER": {
"pattern": 3,
"attack": 0.001,
"release": 0.05,
"depth": 1
},
"PUMP": {
"thresh": 0.3,
"pattern": 1,
"attack": 0.05,
"release": 0.2
}
}
},
"glitch": {
"id": "glitch",
"name": "SIGNAL TERRORIST",
"icon": "⚠",
"col": "#ff0044",
"tag": "GLITCH",
"desc": "Stutter, repeat, buffer-mangle. Drops that break physics.",
"module": "glitcher",
"visualizer": {
"type": "waveform",
"color": "#ff0044",
"style": "glitch"
},
"params": [
{
"n": "Rate",
"k": "rate",
"v": 0.5,
"min": 0.01,
"max": 32,
"unit": "Hz"
},
{
"n": "Size",
"k": "size",
"v": 0.3,
"min": 0.001,
"max": 1,
"unit": "s"
},
{
"n": "Scatter",
"k": "scatter",
"v": 0.4,
"min": 0,
"max": 1
},
{
"n": "Bits",
"k": "bits",
"v": 0.6,
"min": 1,
"max": 16,
"step": 1
},
{
"n": "Reverse",
"k": "rev",
"v": 0.3,
"min": 0,
"max": 1
},
{
"n": "Chaos",
"k": "chaos",
"v": 0.2,
"min": 0,
"max": 1
}
],
"presets": {
"MILD": {
"rate": 0.2,
"size": 0.5,
"scatter": 0.2,
"chaos": 0.1
},
"MED": {
"rate": 0.5,
"size": 0.4,
"scatter": 0.5,
"chaos": 0.3
},
"CHAOS": {
"rate": 0.9,
"size": 0.2,
"scatter": 0.9,
"bits": 0.3,
"chaos": 0.9
},
"DROP": {
"rate": 0.8,
"scatter": 0.8,
"rev": 0.7,
"chaos": 0.7
}
}
},
"looper": {
"id": "looper",
"name": "INFINITE LOOP",
"icon": "∞",
"col": "#00d4ff",
"tag": "LOOPER",
"desc": "4-bar looper. Overdub, reverse, half-speed, stutter.",
"module": "looper",
"visualizer": {
"type": "waveform_loop",
"color": "#00d4ff"
},
"params": [
{
"n": "Length",
"k": "len",
"v": 0.5,
"min": 1,
"max": 16,
"step": 1,
"unit": "bars"
},
{
"n": "Overdub",
"k": "overdub",
"v": 0.8,
"min": 0,
"max": 1
},
{
"n": "Feedback",
"k": "fb",
"v": 0.6,
"min": 0,
"max": 1
},
{
"n": "Pitch",
"k": "pitch",
"v": 0.5,
"min": -12,
"max": 12,
"step": 1,
"unit": "st"
},
{
"n": "Reverse",
"k": "rev",
"v": 0,
"type": "toggle"
},
{
"n": "Half Speed",
"k": "half",
"v": 0,
"type": "toggle"
}
],
"presets": {
"STANDARD": {
"len": 0.25,
"overdub": 0.8,
"fb": 0.6
},
"AMBIENT": {
"len": 0.5,
"overdub": 0.9,
"fb": 0.85,
"pitch": 0.4
},
"DRONE": {
"len": 0.5,
"overdub": 1,
"fb": 0.95,
"half": 1
}
}
},
"osc2": {
"id": "osc2",
"name": "WAVEFORM LAB",
"icon": "〜",
"col": "#ff44ff",
"tag": "SYNTH",
"desc": "Dual oscillator synth. FM, ring mod, wavefold.",
"module": "oscillator",
"visualizer": {
"type": "waveform",
"color": "#ff44ff"
},
"params": [
{
"n": "Wave",
"k": "wave",
"v": 0,
"min": 0,
"max": 4,
"step": 1,
"type": "enum",
"options": [
"Sine",
"Saw",
"Square",
"Triangle",
"Noise"
]
},
{
"n": "Octave",
"k": "oct",
"v": 0.5,
"min": -3,
"max": 3,
"step": 1
},
{
"n": "Detune",
"k": "detune",
"v": 0.5,
"min": -100,
"max": 100,
"unit": "ct"
},
{
"n": "FM Ratio",
"k": "fm",
"v": 0.5,
"min": 0,
"max": 8
},
{
"n": "FM Depth",
"k": "fmdepth",
"v": 0.3,
"min": 0,
"max": 1
},
{
"n": "Wavefold",
"k": "fold",
"v": 0.2,
"min": 0,
"max": 1
}
],
"presets": {
"SAW": {
"wave": 1,
"oct": 0.5
},
"FM": {
"wave": 0,
"fm": 0.4,
"fmdepth": 0.6
},
"REESE": {
"wave": 1,
"detune": 0.52,
"oct": 0.3
},
"SUPERSAW": {
"wave": 1,
"detune": 0.6,
"fold": 0.2
}
}
},
"phaser": {
"id": "phaser",
"name": "PHASE SHIFT",
"icon": "⊕",
"col": "#ff9900",
"tag": "MODULATION",
"desc": "12-stage phaser. Notch comb sweeps.",
"module": "phaser",
"visualizer": {
"type": "frequency_response",
"color": "#ff9900"
},
"params": [
{
"n": "Rate",
"k": "rate",
"v": 0.3,
"min": 0.01,
"max": 8,
"unit": "Hz"
},
{
"n": "Depth",
"k": "depth",
"v": 0.7,
"min": 0,
"max": 1
},
{
"n": "Stages",
"k": "stages",
"v": 0.5,
"min": 2,
"max": 12,
"step": 2
},
{
"n": "Feedback",
"k": "fb",
"v": 0.4,
"min": -1,
"max": 1
},
{
"n": "Center",
"k": "center",
"v": 0.5,
"min": 200,
"max": 8000,
"unit": "Hz"
},
{
"n": "Mix",
"k": "mix",
"v": 0.5,
"min": 0,
"max": 1
}
],
"presets": {
"CLASSIC": {
"rate": 0.3,
"depth": 0.7,
"stages": 0.5,
"mix": 0.5
},
"SLOW": {
"rate": 0.05,
"depth": 0.9,
"stages": 0.8,
"mix": 0.6
},
"FAST": {
"rate": 2,
"depth": 0.6,
"mix": 0.4
}
}
},
"pitch": {
"id": "pitch",
"name": "PITCH DEMON",
"icon": "🎵",
"col": "#ff2266",
"tag": "PITCH",
"desc": "Pitch shifter + formant. Scream it up, drop it down.",
"module": "pitcher",
"visualizer": {
"type": "pitch_track",
"color": "#ff2266"
},
"params": [
{
"n": "Semitones",
"k": "semi",
"v": 0.5,
"min": -24,
"max": 24,
"step": 1,
"unit": "st"
},
{
"n": "Cents",
"k": "cents",
"v": 0.5,
"min": -100,
"max": 100,
"unit": "ct"
},
{
"n": "Formant",
"k": "formant",
"v": 0.5,
"min": -2,
"max": 2
},
{
"n": "Mix",
"k": "mix",
"v": 0.8,
"min": 0,
"max": 1
},
{
"n": "Tracking",
"k": "track",
"v": 0.7,
"min": 0,
"max": 1
},
{
"n": "Glide",
"k": "glide",
"v": 0.3,
"min": 0,
"max": 1,
"unit": "s"
}
],
"presets": {
"UP5": {
"semi": 0.7,
"mix": 0.8
},
"DOWN8": {
"semi": 0.2,
"mix": 0.9
},
"ROBOT": {
"semi": 0.5,
"cents": 0,
"formant": 0,
"track": 0
},
"CHIPMUNK": {
"semi": 0.9,
"formant": 0.8
}
}
},
"rev": {
"id": "rev",
"name": "VOID CHAMBER",
"icon": "⚡",
"col": "#aa44ff",
"tag": "REVERB",
"desc": "Convolution reverb. Hall, plate, void. Room to infinite space.",
"module": "reverb",
"visualizer": {
"type": "impulse",
"color": "#aa44ff"
},
"params": [
{
"n": "Size",
"k": "size",
"v": 0.7,
"min": 0.1,
"max": 10,
"unit": "s"
},
{
"n": "Decay",
"k": "decay",
"v": 0.6,
"min": 0.1,
"max": 1
},
{
"n": "Pre-delay",
"k": "pre",
"v": 0.2,
"min": 0,
"max": 0.2,
"unit": "s"
},
{
"n": "Tone",
"k": "tone",
"v": 0.5,
"min": 0,
"max": 1
},
{
"n": "Mix",
"k": "mix",
"v": 0.4,
"min": 0,
"max": 1
},
{
"n": "Shimmer",
"k": "shimmer",
"v": 0.2,
"min": 0,
"max": 1
}
],
"presets": {
"ROOM": {
"size": 0.2,
"decay": 0.3,
"pre": 0,
"mix": 0.2
},
"PLATE": {
"size": 0.5,
"decay": 0.5,
"mix": 0.35
},
"HALL": {
"size": 0.7,
"decay": 0.55,
"pre": 0.15,
"mix": 0.4
},
"CATHEDRAL": {
"size": 0.95,
"decay": 0.85,
"mix": 0.55
},
"VOID": {
"size": 1,
"decay": 0.9,
"shimmer": 0.8,
"mix": 0.7
}
}
},
"sampler": {
"id": "sampler",
"name": "SAMPLE FORGE",
"icon": "🎛",
"col": "#ffdd00",
"tag": "SAMPLER",
"desc": "Multi-sample player. Slice, pitch, reverse, envelope.",
"module": "sampler",
"visualizer": {
"type": "waveform_slices",
"color": "#ffdd00",
"interactive": true
},
"params": [
{
"n": "Pitch",
"k": "pitch",
"v": 0.5,
"min": -24,
"max": 24,
"step": 1,
"unit": "st"
},
{
"n": "Start",
"k": "start",
"v": 0,
"min": 0,
"max": 1
},
{
"n": "End",
"k": "end",
"v": 1,
"min": 0,
"max": 1
},
{
"n": "Attack",
"k": "attack",
"v": 0.1,
"min": 0,
"max": 1,
"unit": "s"
},
{
"n": "Release",
"k": "release",
"v": 0.3,
"min": 0,
"max": 3,
"unit": "s"
},
{
"n": "Reverse",
"k": "rev",
"v": 0,
"type": "toggle"
}
],
"presets": {
"NORMAL": {
"pitch": 0.5,
"start": 0,
"end": 1
},
"REVERSED": {
"rev": 1
},
"PITCHED": {
"pitch": 0.7
},
"SLICED": {
"start": 0.2,
"end": 0.8
}
}
},
"sidechain": {
"id": "sidechain",
"name": "PUMP ENGINE",
"icon": "♦",
"col": "#ff6600",
"tag": "DYNAMICS",
"desc": "Classic 4-on-the-floor sidechain pump. The Daft Punk compressor.",
"module": "sidechain",
"visualizer": {
"type": "gain_reduction",
"color": "#ff6600"
},
"params": [
{
"n": "Amount",
"k": "amt",
"v": 0.8,
"min": 0,
"max": 1
},
{
"n": "Attack",
"k": "attack",
"v": 0.3,
"min": 0.001,
"max": 0.1,
"unit": "s"
},
{
"n": "Release",
"k": "release",
"v": 0.5,
"min": 0.01,
"max": 1,
"unit": "s"
},
{
"n": "Rate",
"k": "rate",
"v": 0.5,
"min": 0,
"max": 3,
"step": 1,
"type": "enum",
"options": [
"1/4",
"1/8",
"1/16"
]
},
{
"n": "Shape",
"k": "shape",
"v": 0.5,
"min": 0,
"max": 1
},
{
"n": "Mix",
"k": "mix",
"v": 1,
"min": 0,
"max": 1
}
],
"presets": {
"DAFT PUNK": {
"amt": 0.85,
"attack": 0.02,
"release": 0.35,
"shape": 0.6
},
"SUBTLE": {
"amt": 0.4,
"attack": 0.05,
"release": 0.5
},
"HARD": {
"amt": 1,
"attack": 0.005,
"release": 0.2,
"shape": 0.8
}
}
},
"vocoder": {
"id": "vocoder",
"name": "ROBOT CHOIR",
"icon": "🤖",
"col": "#8888ff",
"tag": "SPECTRAL",
"desc": "16-band vocoder. Carrier/modulator. Robot, choir, talkbox.",
"module": "vocoder",
"visualizer": {
"type": "band_spectrum",
"color": "#8888ff"
},
"params": [
{
"n": "Bands",
"k": "bands",
"v": 0.5,
"min": 4,
"max": 32,
"step": 4
},
{
"n": "Carrier",
"k": "carrier",
"v": 0.5,
"min": 0,
"max": 3,
"step": 1,
"type": "enum",
"options": [
"Sawtooth",
"Square",
"Noise",
"Ext"
]
},
{
"n": "Pitch",
"k": "pitch",
"v": 0.5,
"min": -24,
"max": 24,
"step": 1,
"unit": "st"
},
{
"n": "Attack",
"k": "attack",
"v": 0.3,
"min": 0.001,
"max": 0.5
},
{
"n": "Release",
"k": "release",
"v": 0.4,
"min": 0.01,
"max": 2
},
{
"n": "Mix",
"k": "mix",
"v": 0.8,
"min": 0,
"max": 1
}
],
"presets": {
"ROBOT": {
"bands": 0.5,
"carrier": 1,
"mix": 1
},
"CHOIR": {
"bands": 0.8,
"carrier": 0,
"attack": 0.4,
"mix": 0.7
},
"TALKBOX": {
"bands": 0.6,
"carrier": 2,
"mix": 0.9
}
}
}
};
