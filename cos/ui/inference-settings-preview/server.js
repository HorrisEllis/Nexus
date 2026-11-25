'use strict';
// cos/ui/inference-settings-preview/server.js — a PREVIEW (his rule: a preview on live data before any UI is built) of COS's settings for our own
// model server (PC18 settings_2026_11_24). James, 2026-11-24: "I want cos to have full extensive settings for all of this. Then we can hook it
// into the gates. Way too much we can do with this." Reads only: the models on his PC through our own inference/models.eg (Emerge), what is
// loaded (Ollama's /api/ps), the machine's memory (COS's /api/cos/usage), the bridge's current values (ollama/config.js). Nothing is saved.
//   node cos/ui/inference-settings-preview/server.js [--port 47140]
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..'), PORT = Number((process.argv.indexOf('--port') > -1 && process.argv[process.argv.indexOf('--port') + 1]) || 47140);
const STORE = path.join(os.homedir(), '.ollama', 'models'), ENGINE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'lib', 'ollama', 'llama-server.exe');
const get = (port, p) => new Promise((ok) => { const q = http.get({ host: '127.0.0.1', port, path: p, timeout: 5000 }, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try { ok(JSON.parse(t)); } catch (_) { ok(null); } }); }); q.on('error', () => ok(null)); q.on('timeout', () => { q.destroy(); ok(null); }); });
http.createServer(async (req, res) => {
  const send = (type, body) => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  if (req.url === '/data') {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'emerge/emerge/lang/eg.js'), 'run', path.join(__dirname, 'models.eg'), STORE.replace(/\\/g, '/'), ENGINE.replace(/\\/g, '/')], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    let found = { models: [], engine: '' }; try { found = JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch (_) {}
    const [ps, use] = await Promise.all([get(11434, '/api/ps'), get(7799, '/api/cos/usage')]);
    let bridge = {}; try { delete require.cache[require.resolve(path.join(ROOT, 'ollama', 'config.js'))]; const c = require(path.join(ROOT, 'ollama', 'config.js')); bridge = { KEEP_ALIVE: c.KEEP_ALIVE, KEEP_ALIVE_MAX_B: c.KEEP_ALIVE_MAX_B, KEEP_ALIVE_BIG: c.KEEP_ALIVE_BIG, MAX_CONCURRENT: c.MAX_CONCURRENT }; } catch (_) {}
    return send('application/json', JSON.stringify({ ...found, store: STORE, loaded: ((ps && ps.models) || []).map((m) => m.name), host: use && use.usage ? use.usage.host : null, freeMB: Math.round(os.freemem() / 1048576), totalMB: Math.round(os.totalmem() / 1048576), bridge }));
  }
  if (req.url.startsWith('/core/')) { const f = path.join(ROOT, 'cos', 'ui', 'core', path.basename(req.url)); if (fs.existsSync(f)) return send(f.endsWith('.css') ? 'text/css' : 'application/javascript', fs.readFileSync(f)); }
  send('text/html; charset=utf-8', fs.readFileSync(path.join(__dirname, 'index.html')));
}).listen(PORT, '127.0.0.1', () => console.log(`model server settings preview on http://127.0.0.1:${PORT}/`));
