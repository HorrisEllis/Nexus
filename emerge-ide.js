'use strict';
// ════════════════════════════════════════════════════════════════════════════
// emerge-ide.js — entry point
// Compiled from emerge-ide.eg by the kernel.
// All comms through SISO bus. No JS beyond this file.
// node emerge-ide.js [--port 4242] [--model qwen2.5-coder:3b]
// ════════════════════════════════════════════════════════════════════════════

const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const { Bus, Event, Gate } = require('./src/siso');
const ollama = require('./src/ollama-runtime');

// ── Locate kernel & Load Spec ──────────────────────────────────────────────
const kernelPath = [
  path.join(__dirname, 'emerge-kernel.js'),
  path.join(__dirname, '..', 'emerge-kernel.js'),
].find(p => fs.existsSync(p));

if (!kernelPath) { console.error('[ide] emerge-kernel.js not found'); process.exit(1); }
const kernel = require(kernelPath);

const specPath = [
  path.join(__dirname, 'emerge.spec'),
  path.join(path.dirname(kernelPath), 'emerge.spec'),
].find(p => fs.existsSync(p));

if (specPath) {
  kernel.loadSpec(specPath);
  // Optional: Verify schema size after loading
  console.log(`[ide] schema loaded: ${kernel.SCHEMA.keywords.size} keywords`);
} else {
  console.warn('[ide] no emerge.spec found');
}
// ── Parse args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = Number(getArg('--port', process.env.EMERGE_PORT || 4242));
const DEF_MODEL = getArg('--model', 'qwen2.5-coder:1.5b');
const UI_DIR = path.join(__dirname, 'ui');
const IO_DIR = path.join(__dirname, 'io');

// ── SISO Bus ──────────────────────────────────────────────────────────────────
const bus            = new Bus();
const compilerStream = bus.stream('compiler');
const ioStream       = bus.stream('io');
const llmStream      = bus.stream('llm');
const voiceStream    = bus.stream('voice');
const uiStream       = bus.stream('ui');

// SSE clients
const sseClients = new Set();
function pushSSE(ev) {
  const data = `data: ${JSON.stringify({ type: ev.type, data: ev.data, ts: ev.ts })}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch(e) { sseClients.delete(res); }
  }
}
bus.onAny(pushSSE);

// ── SEAM: COMPILER_CONTRACT ───────────────────────────────────────────────────
ioStream.register(new Gate('io.compile', (ev) => {
  const { source, filename } = ev.data;
  try {
    const result = kernel.compile(source, filename);
    result.kernel.boot();
    compilerStream.emit(new Event('compiler.result', {
      filename, snr: result.snr, valid: result.valid,
      gaps: result.gaps, noise: result.noise.length,
      regime: result.kernel.status().regime,
      ir: {
        compartments: result.ir.compartments.length,
        loops: result.ir.loops.length,
        gaps: result.ir.gaps.length,
      },
    }));
  } catch(err) {
    compilerStream.emit(new Event('compiler.error', { filename, error: err.message }));
  }
}));

ioStream.register(new Gate('io.check', (ev) => {
  const { source, filename } = ev.data;
  try {
    const tokens              = kernel.tokenize(source);
    const { passed, noise, snr } = kernel.snrGate(tokens, filename);
    const ir                  = kernel.parse(passed);
    const validation          = kernel.validate(ir, filename);
    compilerStream.emit(new Event('compiler.check', {
      filename, snr, valid: validation.valid,
      gaps: validation.gaps, noise: noise.length, passed: passed.length,
    }));
  } catch(err) {
    compilerStream.emit(new Event('compiler.error', { filename, error: err.message }));
  }
}));

ioStream.register(new Gate('io.spec', (ev) => {
  try {
    const tmp = require('os').tmpdir() + '/emerge-hot.spec';
    fs.writeFileSync(tmp, ev.data.source);
    kernel.loadSpec(tmp);
    fs.copyFileSync(tmp, specPath || path.join(__dirname, 'emerge.spec'));
    compilerStream.emit(new Event('spec.updated', {
      keywords: kernel.SCHEMA.keywords.size,
      version:  kernel.SCHEMA.version,
    }));
  } catch(err) {
    compilerStream.emit(new Event('spec.error', { error: err.message }));
  }
}));

// ── SEAM: OLLAMA_CONTRACT ─────────────────────────────────────────────────────
let activeAbort = null;

llmStream.register(new Gate('llm.request', (ev) => {
  const { prompt, context, model, task } = ev.data;
  const m = model || DEF_MODEL;

  // Build Emerge-aware system prompt
  const system = [
    'You are an expert Emerge language assistant.',
    'Emerge is a signal-processing specification language with these axioms:',
    'NO_SILENT_DROP, GAP_IS_FIRST_CLASS, EXECUTION_IS_TRACEABLE, RECORD_IS_TRUTH.',
    'When writing code, use .eg Emerge grammar. Be concise.',
    context ? `\n\nCurrent editor context:\n${context.slice(0, 1500)}` : '',
  ].join(' ');

  if (activeAbort) { activeAbort(); activeAbort = null; }

  activeAbort = ollama.streamGenerate(
    { model: m, prompt, system, temperature: 0.2, max_tokens: 1024 },
    (tok) => llmStream.emit(new Event('llm.token', { text: tok, model: m })),
    ()    => llmStream.emit(new Event('llm.complete', { model: m })),
    (err) => llmStream.emit(new Event('llm.error', { error: err.message, model: m })),
  );
}));

compilerStream.register(new Gate('compiler.snapshot', () => {
  compilerStream.emit(new Event('compiler.snapshot.result', {
    ts:      Date.now(),
    regime:  'stable',
    schema:  { version: kernel.SCHEMA.version, keywords: kernel.SCHEMA.keywords.size },
    log:     bus.log().tail(30),
    streams: bus.streams(),
  }));
}));

// ── HTTP server ───────────────────────────────────────────────────────────────
const mime = f => ({'.html':'text/html','.js':'application/javascript',
  '.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(f)]||'text/plain';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  if (req.method==='OPTIONS') { res.writeHead(204); return res.end(); }

  const url = req.url.split('?')[0];

  // SSE
  if (url==='/events') {
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    res.write('retry:1000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // JSON endpoints
  if (req.method==='POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let d = {};
      try { d = JSON.parse(body); } catch(e){}

      if (url==='/compile')  { ioStream.emit(new Event('io.compile', d)); res.writeHead(202); return res.end('{}'); }
      if (url==='/check')    { ioStream.emit(new Event('io.check',   d)); res.writeHead(202); return res.end('{}'); }
      if (url==='/spec')     { ioStream.emit(new Event('io.spec',    d)); res.writeHead(202); return res.end('{}'); }
      if (url==='/snapshot') { compilerStream.emit(new Event('compiler.snapshot',{})); res.writeHead(202); return res.end('{}'); }
      if (url==='/chat')     {
        llmStream.emit(new Event('llm.request', {
          prompt: d.prompt, context: d.context,
          model: d.model || DEF_MODEL, task: 'chat',
        }));
        res.writeHead(202); return res.end('{}');
      }
      res.writeHead(404); res.end('{}');
    });
    return;
  }

  if (url==='/status') {
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({ streams: bus.streams(), log: bus.log().tail(20) }));
  }

  if (url==='/ollama-status') {
    ollama.ping().then(online => {
      if (!online) { res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({online:false})); }
      ollama.listModels().then(models => {
        uiStream.emit(new Event('ollama.models', { models }));
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ online:true, models }));
      });
    });
    return;
  }

  // Static files
  const filePath = url==='/'
    ? path.join(UI_DIR,'index.html')
    : path.join(UI_DIR, url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200,{'Content-Type': mime(filePath)});
    res.end(data);
  });
});

// ── Boot sequence ────────────────────────────────────────────────────────────

// 1. Start the server
server.listen(PORT, () => {
  console.log(`\n⬡  EMERGE IDE\n`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   model: ${DEF_MODEL}`);
  console.log(`   spec:  ${kernel.SCHEMA.keywords.size} keywords, ${kernel.SCHEMA.axioms.size} axioms`);
  console.log(`\n   voice: press V in the IDE to toggle`);
  console.log(`   drop .eg / .emerge / .spec onto the editor\n`);
  uiStream.emit(new Event('eidolon.ready', { port: PORT }));
});

// 2. Check Ollama
ollama.ping().then(online => {
  console.log(`   ollama: ${online ? '✓ online' : '✗ offline (start with: ollama serve)'}`);
  if (online) ollama.listModels().then(ms => {
    console.log(`   models: ${ms.map(m=>m.name).join(', ')||'none pulled'}`);
    uiStream.emit(new Event('ollama.models', { models: ms }));
  });
});

// 3. Compile all .eg files in ./io on boot
if (fs.existsSync(IO_DIR)) {
  for (const f of fs.readdirSync(IO_DIR).filter(f=>f.endsWith('.eg')||f.endsWith('.emerge'))) {
    const src = fs.readFileSync(path.join(IO_DIR, f), 'utf8');
    const r   = kernel.compile(src, f);
    console.log(`   ${f} — SNR ${(r.snr*100).toFixed(0)}% ${r.valid?'✓':'✗'}`);
  }
}

// 4. Lifecycle handlers
setTimeout(() => require('child_process').exec(`start http://localhost:${PORT}`), 800);
process.on('SIGINT', () => { console.log('\n[ide] stopped'); process.exit(0); });

  // Check ollama
  ollama.ping().then(online => {
    console.log(`   ollama: ${online ? '✓ online' : '✗ offline (start with: ollama serve)'}`);
    if (online) ollama.listModels().then(ms => {
      console.log(`   models: ${ms.map(m=>m.name).join(', ')||'none pulled'}`);
      uiStream.emit(new Event('ollama.models', { models: ms }));
    });
  });

  // Compile all .eg files in ./io on boot
  if (fs.existsSync(IO_DIR)) {
    for (const f of fs.readdirSync(IO_DIR).filter(f=>f.endsWith('.eg')||f.endsWith('.emerge'))) {
      const src = fs.readFileSync(path.join(IO_DIR, f), 'utf8');
      const r   = kernel.compile(src, f);
      console.log(`   ${f} — SNR ${(r.snr*100).toFixed(0)}% ${r.valid?'✓':'✗'}`);
    }
};

// Auto-open browser on Windows
setTimeout(() => require('child_process').exec(`start http://localhost:${PORT}`), 800);
process.on('SIGINT', () => { console.log('\n[ide] stopped'); process.exit(0); });

