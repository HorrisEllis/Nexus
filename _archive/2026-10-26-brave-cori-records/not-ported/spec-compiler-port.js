'use strict';
/**
 * lib/spec-compiler-port.js — the kernel's one door to the spec compiler, which is Idearium's (idearium/spec-compiler/).
 * comp_id: nexus.lib.spec-compiler-port
 * Map: docs/2026-10-24-emerge-warp-system-phasemap.spec EW2/EW3 (the design, decided by his axioms: §5.2 one door, DB6 a capability is a
 * route, §1.2 nothing fails silently).
 *
 * James, 2026-10-24: "okay warp and emerge. / spec compiler, ide, and idearium" · "we don't need to do anything that's not, more, like,
 * redefining those boundaries"
 *
 * The compiler moved into Idearium; four callers live outside it (lib/build-pipeline.js, lib/spec-collect.js, guardian/server.js,
 * copilot/module-builder.js). Requiring idearium/ from any of them is a crossing (two of them upward from the kernel), so none does:
 *   in the Idearium process   Idearium provides the compiler at boot (provide()), and the port calls it in-process
 *   in any other process      the port posts to Idearium's routes: POST /api/compiler/{compile,pipeline,t2} (port from IDEARIUM_PORT, or
 *                             Idearium's entry in lib/nexus-self/systems.js)
 *   neither                   it says so (ok: false, why), never a silent fallback
 * Over HTTP a t2 run's progress comes back as a list with the result and is replayed to onProgress in order; it is not live.
 *
 *   provide({ compile, pipeline, t2 })                 Idearium's boot; returns the previous provider
 *   compile(specPath, outDir, opts)   → the compiler's index.compile result      (T0/T1)
 *   pipeline(specPath, outDir, opts)  → the compiler's pipeline.compile result
 *   t2(specPath, outDir, opts)        → t2-gate.run's result; opts.onProgress(node, status, detail) is called for each step
 *   via()                             → 'in-process' | 'route'
 */
const http = require('http');

const MODULE_ID = 'nexus.lib.spec-compiler-port';
const VERSION = '1.0.0';
let _impl = null;

function provide(impl) { const prev = _impl; _impl = impl || null; return prev; }
function via() { return _impl ? 'in-process' : 'route'; }

function _port() {
  if (process.env.IDEARIUM_PORT) return parseInt(process.env.IDEARIUM_PORT, 10);
  try { const s = require('./nexus-self/systems.js').get('idearium'); if (s && s.port) return s.port; } catch (_) {}
  return 4800;
}

function _post(action, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: _port(), path: `/api/compiler/${action}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 10 * 60 * 1000 }, (res) => {
      let buf = ''; res.on('data', c => { buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (_) { resolve({ ok: false, error: `Idearium answered ${res.statusCode} with no JSON`, why: `Idearium answered ${res.statusCode} with no JSON` }); } });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Idearium did not answer the compiler route in 10 minutes', why: 'Idearium did not answer the compiler route in 10 minutes' }); });
    req.on('error', (e) => resolve({ ok: false, error: `the spec compiler is Idearium's and Idearium is not reachable on :${_port()} (${e.code || e.message})`, why: `the spec compiler is Idearium's and Idearium is not reachable on :${_port()} (${e.code || e.message})` }));
    req.write(data); req.end();
  });
}

function _clean(opts) { const o = { ...(opts || {}) }; delete o.onProgress; return o; }

async function compile(specPath, outDir, opts = {}) {
  if (_impl && _impl.compile) return _impl.compile(specPath, outDir, opts);
  return _post('compile', { specPath, outputDir: outDir, opts: _clean(opts) });
}

async function pipeline(specPath, outDir, opts = {}) {
  if (_impl && _impl.pipeline) return _impl.pipeline(specPath, outDir, opts);
  return _post('pipeline', { specPath, outputDir: outDir, opts: _clean(opts) });
}

async function t2(specPath, outDir, opts = {}) {
  if (_impl && _impl.t2) return _impl.t2(specPath, outDir, opts);
  const r = await _post('t2', { specPath, outputDir: outDir, opts: _clean(opts) });
  if (typeof opts.onProgress === 'function') for (const p of (r && r.progress) || []) { try { opts.onProgress(p.node || null, p.status, p.detail || null); } catch (_) {} }
  return r && Object.prototype.hasOwnProperty.call(r, 'result') ? r.result : r;
}

module.exports = { MODULE_ID, VERSION, provide, via, compile, pipeline, t2 };
