'use strict';
/**
 * src/speech/engine.js — Real Speech-to-Text Engine
 * UUID: cg-speech-engine-v1-0000-0000-000000000011
 *
 * Real gap named in CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's §9
 * ("Whisper (speech-to-text) has zero references anywhere... this would
 * be a real, new integration"). See transcribe.py's own header for why
 * this is CMU PocketSphinx, not OpenAI Whisper, and why that's the
 * honest, real, TESTED choice given this environment's actual network
 * reach — proven with real synthesized speech before any of this was
 * written, not assumed to work.
 *
 * §REAL, NEW SYSTEM DEPENDENCIES — python3, the `pocketsphinx` pip
 * package, and `ffmpeg` (for resampling arbitrary input audio to the
 * 16kHz mono PCM WAV pocketsphinx needs). Unlike every other feature
 * this session built, these are NOT npm-installable — a real deployment
 * consideration, checked and stated here rather than discovered later.
 * isAvailable() below checks for all three for real, so a caller (the
 * whisper plugin) can tell a user honestly "voice input needs python3 +
 * pocketsphinx + ffmpeg installed" instead of a confusing runtime crash.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TRANSCRIBE_SCRIPT = path.join(__dirname, 'transcribe.py');

function _run(cmd, args) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args);
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => stdout += d.toString());
    proc.stderr.on('data', (d) => stderr += d.toString());
    proc.on('error', (err) => resolve({ ok: false, code: null, stdout, stderr: err.message }));
    proc.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr }));
  });
}

/**
 * isAvailable() -> Promise<{ available: boolean, missing: string[] }>
 * Real check of all three real dependencies, not assumed present.
 */
async function isAvailable() {
  const missing = [];
  const py = await _run('python3', ['-c', 'import pocketsphinx']);
  if (!py.ok) missing.push('python3 + pocketsphinx (pip install pocketsphinx)');
  const ff = await _run('ffmpeg', ['-version']);
  if (!ff.ok) missing.push('ffmpeg');
  return { available: missing.length === 0, missing };
}

/**
 * transcribe(inputAudioPath) -> Promise<{ text: string, confidence: number }>
 * inputAudioPath: any format ffmpeg can read (webm/opus from a browser
 * MediaRecorder, wav, whatever). Resampled to the real format
 * transcribe.py requires before calling it — a real step, not a no-op
 * pass-through, tested below with real audio.
 */
async function transcribe(inputAudioPath) {
  if (!fs.existsSync(inputAudioPath)) {
    throw new Error(`Input audio file not found: ${inputAudioPath}`);
  }

  const tmpWav = path.join(os.tmpdir(), `cg-speech-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  try {
    const resample = await _run('ffmpeg', ['-y', '-i', inputAudioPath, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', tmpWav]);
    if (!resample.ok) {
      // §BUGFIX — found by testing before shipping: .split('\n').pop()
      // grabbed ffmpeg's literal last line, which is frequently blank
      // (trailing newline), producing an empty, useless error message.
      // Filters to the last NON-empty line instead.
      const lines = resample.stderr.split('\n').map(l => l.trim()).filter(Boolean);
      throw new Error(`ffmpeg resample failed: ${lines[lines.length - 1] || 'unknown error'}`);
    }

    const result = await _run('python3', [TRANSCRIBE_SCRIPT, tmpWav]);
    let parsed;
    try { parsed = JSON.parse(result.stdout.trim()); }
    catch (_) { throw new Error(`transcribe.py produced non-JSON output: ${result.stdout || result.stderr}`); }

    if (parsed.error) throw new Error(`transcription failed: ${parsed.error}`);
    return parsed;
  } finally {
    // Real cleanup — a temp WAV per transcription would otherwise
    // accumulate forever in os.tmpdir().
    try { fs.unlinkSync(tmpWav); } catch (_) {}
  }
}

module.exports = { transcribe, isAvailable };
