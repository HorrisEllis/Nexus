'use strict';

const http = require('http');
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

function streamGenerate(opts, onToken, onDone, onError) {
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
    let buf = '';
    res.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try { const o = JSON.parse(line); if (o.response) onToken(o.response); if (o.done) onDone(o); }
        catch(e) {}
      }
    });
    res.on('end', () => onDone({}));
  });
  req.on('error', onError || console.error);
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

module.exports = { ping, listModels, streamGenerate, bestFor, MODEL_CATALOG };
