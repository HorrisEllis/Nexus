'use strict';
/**
 * lib/ollama-port.js — the kernel's door to the ollama bridge for every system that is not the bridge.
 * comp_id: nexus.lib.ollama-port
 * Map: docs/2026-10-24-loom-into-cos-phasemap.spec LM_D1 / LM1 (decided by his axioms: §5.2 one door, DB6 a capability is a route, §1.2).
 *
 * James, 2026-10-07: "make sure the ollama additions stay with ollama" · 2026-10-24: "Do it." (Loom first, into its compartment)
 *
 * A system that wants one model call used to require ollama/lib/ollama-client.js into its own process. That is a crossing, and a COS
 * compartment cannot load it. The call is still the bridge's (continued when cut, recorded on its tape):
 *   in the bridge's process   the bridge provides callOllamaRaw (provide()), and the port calls it in-process
 *   in any other process      the port posts to the bridge's POST /api/generate (OLLAMA_BRIDGE_PORT, or its entry in lib/nexus-self/systems.js)
 *   neither                   { ok: false, error, unreachable: true } — the caller decides what to do, and says it
 *
 *   provide({ generate })                                                 the bridge's boot
 *   generate({ model, prompt, system, temperature, maxTokens, timeoutMs, caller }) → { ok, text } | { ok: false, error, unreachable? }
 *   via()                                                                 'in-process' | 'route'
 */
const http = require('http');

const MODULE_ID = 'nexus.lib.ollama-port';
const VERSION = '1.0.0';
let _impl = null;

function provide(impl) { const prev = _impl; _impl = impl || null; return prev; }
function via() { return _impl ? 'in-process' : 'route'; }

function _port() {
  if (process.env.OLLAMA_BRIDGE_PORT) return parseInt(process.env.OLLAMA_BRIDGE_PORT, 10);
  try { const s = require('./nexus-self/systems.js').get('ollama-bridge'); if (s && s.port) return s.port; } catch (_) {}
  return 3749;
}

async function generate({ model, prompt, system, temperature, maxTokens, timeoutMs = 120000, caller } = {}) {
  if (!caller) return { ok: false, error: 'caller required: the tape names who asked' };
  if (_impl && _impl.generate) {
    try { return { ok: true, text: String(await _impl.generate({ model, prompt, system, temperature, maxTokens, timeoutMs, caller }) || '') }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  const data = JSON.stringify({ model, prompt, system, temperature, maxTokens, timeoutMs, caller });
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: _port(), path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: timeoutMs + 15000 }, (res) => {
      let buf = ''; res.on('data', c => { buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (_) { resolve({ ok: false, error: `the ollama bridge answered ${res.statusCode} with no JSON` }); } });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `the ollama bridge did not answer in ${timeoutMs + 15000} ms` }); });
    req.on('error', (e) => resolve({ ok: false, unreachable: true, error: `the ollama bridge is not answering on :${_port()} (${e.code || e.message})` }));
    req.write(data); req.end();
  });
}

module.exports = { MODULE_ID, VERSION, provide, via, generate };
