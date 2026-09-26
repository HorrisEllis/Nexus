'use strict';

const http = require('http');
// §CONFIG 2026-08-23 — real, shared model config, not this file's own
// separate hardcode. idearium/agent-suite/index.js and
// orchestrator/lib/autonomous-loop.js already require this module for its
// MODEL_CATALOG/bestFor() — re-exporting the real default/fallback here
// too means they can converge on the one real config without adding a
// second new require path.
const { DEFAULT_MODEL, FALLBACK_MODEL } = require('./config.js');
function normalizeEndpoint(url) {
  if (!url) return 'http://localhost:11434';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `http://${url}`;
  }
  return url;
}

const ENDPOINT = normalizeEndpoint(process.env.OLLAMA_HOST);

async function ping() {
  return new Promise(resolve => {
    const url = new URL('/api/tags', ENDPOINT);

    const req = http.get(url, res =>
      resolve(res.statusCode === 200)
    );

    req.on('error', () => resolve(false));

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function listModels() {
  return new Promise((resolve) => {
    http.get(`${ENDPOINT}/api/tags`, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).models||[]); } catch(e){ resolve([]); } });
    }).on('error', () => resolve([]));
  });
}

// FIX (James, 2026-06-19 — "ollama isn't working"): this function had two
// silent-hang paths. (1) It never checked res.statusCode — Ollama returns a
// non-200 with a JSON error body (e.g. {"error":"model 'x' not found, try
// pulling it first"}) for a missing/unpulled model. That JSON line has
// neither `.response` nor `.done`, so the old code did nothing at all: no
// token, no onDone, no onError. The job sat "delivered" forever. (2) there
// was no timeout — if Ollama (or the network) just stops responding mid
// generation, the request hangs indefinitely with the same dead silence.
// Both are now real, named errors instead of an indefinite hang.
function streamGenerate(opts, onToken, onDone, onError) {
  const fail = (msg) => { if (onError) onError(new Error(msg)); else console.error(new Error(msg)); };

  const body = JSON.stringify({
    model: opts.model, prompt: opts.prompt, stream: true,
    system: opts.system || 'You are an expert Emerge language assistant. Emerge is a signal-processing specification language. Respond concisely in Emerge grammar where possible.',
    options: { temperature: opts.temperature??0.2, num_predict: opts.max_tokens??2048 },
  });
  const url = new URL(`${ENDPOINT}/api/generate`);
  const req = http.request({
    hostname: url.hostname, port: url.port||11434,
    path: url.pathname, method: 'POST',
    headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, res => {
    // FIX: a non-2xx response from Ollama means the request itself was
    // rejected (bad model name, malformed body, etc.) — the body is a JSON
    // error object, not a token stream. Surface it instead of trying (and
    // failing silently) to parse it as generation output.
    if (res.statusCode < 200 || res.statusCode >= 300) {
      let errBuf = '';
      res.on('data', c => { errBuf += c; });
      res.on('end', () => {
        let detail = errBuf;
        try { detail = JSON.parse(errBuf).error || errBuf; } catch(_) {}
        fail(`ollama HTTP ${res.statusCode} for model "${opts.model}": ${detail}`);
      });
      return;
    }

    let buf = '';
    let sawAnyToken = false;
    res.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const o = JSON.parse(line);
          // FIX: Ollama can also stream a 200-status response that turns
          // into a JSON error line mid-stream — surface that too, instead
          // of silently dropping it (the old catch(e){} swallowed both a
          // genuine JSON.parse failure AND a valid-JSON error object).
          if (o.error) { fail(`ollama generation error for model "${opts.model}": ${o.error}`); return; }
          if (o.response) { sawAnyToken = true; onToken(o.response); }
          if (o.done) onDone(o);
        }
        catch(e) { /* genuinely malformed line — not the model's error JSON, ignore as before */ }
      }
    });
    res.on('end', () => {
      if (!sawAnyToken) fail(`ollama closed the stream for model "${opts.model}" with no tokens and no done marker — likely the model failed to load`);
      else onDone({});
    });
  });

  // FIX: idle timeout — fires if the socket goes quiet for too long, at any
  // point (connecting, waiting on a slow model load, or mid-generation).
  // Default generous (model load can be slow); callers can override.
  const timeoutMs = opts.timeoutMs ?? 120_000;
  req.setTimeout(timeoutMs, () => {
    req.destroy();
    fail(`ollama request timed out after ${timeoutMs}ms (model "${opts.model}") — is the ollama service running and the model pulled?`);
  });

  req.on('error', (err) => fail(`ollama request failed: ${err.message} — is the ollama service running at ${ENDPOINT}?`));
  req.write(body); req.end();
  return () => req.destroy();
}

const MODEL_CATALOG = [
  { id:'qwen2.5-coder:1.5b', fitness:0.78, vram:1.5, speed:0.98, best:['completion','inline_assist'] },
  { id:'qwen2.5-coder:3b',   fitness:0.83, vram:3.0, speed:0.90, best:['code_gen','gap_resolution','explanation'] },
  { id:'qwen2.5-coder:7b',   fitness:0.88, vram:6.5, speed:0.75, best:['full_generation','architecture_review'] },
  { id:'qwen2.5-coder:14b',  fitness:0.94, vram:12.0,speed:0.55, best:['complex_generation','spec_writing'] },
  { id:'deepseek-coder-v2:16b',fitness:0.95,vram:14.0,speed:0.45,best:['large_generation','architecture'] },
  { id:'phi3.5:3.8b',        fitness:0.82, vram:3.5, speed:0.88, best:['explanation','chat','voice_response'] },
  { id:'gemma3:4b',          fitness:0.81, vram:3.8, speed:0.85, best:['chat','voice_response'] },
];

function bestFor(task) {
  return MODEL_CATALOG.filter(m=>m.best.some(b=>b.includes(task))).sort((a,b)=>b.fitness-a.fitness)[0] || MODEL_CATALOG[0];
}

module.exports = { ping, listModels, streamGenerate, bestFor, MODEL_CATALOG, DEFAULT_MODEL, FALLBACK_MODEL };
