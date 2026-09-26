'use strict';
/**
 * cos/runtime/preload.cjs — loaded into every COS run (node --require) before
 * the code under test. Pure JS, no native parts.
 * UUID: cos-runtime-preload-v1-0000-2026-0926-001
 *
 * §0.39.261 — James: "i want the run button in cos to work fully, preferably in
 * js, invent anything needed." Two things a run needs that a plain child
 * process does not give:
 *
 *   PORT SHIFT (COS_PORT_SHIFT=1)
 *     Every server.listen(<port>) binds port 0 instead — the OS picks a free
 *     one — and the mapping requested -> actual is appended to
 *     COS_PORT_MAP_FILE as one JSON line. A Nexus kernel with a hardcoded port
 *     (guardian :7820, cortex :3748 …) can then boot from a branch while the
 *     live kernel keeps its own port, and the runner reads the map to probe
 *     the copy's /health.
 *
 *   NETWORK GUARD (COS_NET_ISOLATED=1)
 *     A compartment is networkIsolated by default (COS DEFAULT_NETWORK_CONFIG);
 *     until now that was a flag nothing enforced for process runs. Outbound
 *     TCP is refused unless it targets loopback on a port THIS process is
 *     listening on (itself, after the shift). So a booted branch copy cannot
 *     register with the live orchestrator, write to live cortex, or reach the
 *     internet. COS_NET_ALLOW=host:port,… widens it deliberately.
 *     Refusals are counted into the same map file ({ refused }).
 *
 * WHAT THIS IS NOT: a security boundary against hostile native code — a
 * process can still spawn children or open raw sockets through addons. It
 * stops ordinary JS networking (net/http/https/fetch via undici's net use),
 * which is what "a Nexus kernel booted from a branch" does. COS's qemu backend
 * remains the real boundary for untrusted code.
 */

const net = require('net');
const fs = require('fs');

const MAP_FILE = process.env.COS_PORT_MAP_FILE || null;
const SHIFT = process.env.COS_PORT_SHIFT === '1';
const ISOLATED = process.env.COS_NET_ISOLATED === '1';
const ALLOW = new Set(String(process.env.COS_NET_ALLOW || '').split(',').map(s => s.trim()).filter(Boolean));

const ownPorts = new Set();
function _record(obj) {
  if (!MAP_FILE) return;
  try { fs.appendFileSync(MAP_FILE, JSON.stringify({ ...obj, pid: process.pid, at: Date.now() }) + '\n'); } catch (_) {}
}

if (SHIFT) {
  const origListen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    let requested = null;
    // listen(port[, host][, backlog][, cb]) | listen({ port, host … }[, cb]) | listen(path) (IPC — untouched)
    if (typeof args[0] === 'number' || (typeof args[0] === 'string' && /^\d+$/.test(args[0]))) {
      requested = Number(args[0]);
      if (requested > 0) args[0] = 0;
    } else if (args[0] && typeof args[0] === 'object' && args[0].port !== undefined && !args[0].path) {
      requested = Number(args[0].port);
      if (requested > 0) args[0] = { ...args[0], port: 0 };
    }
    if (requested > 0) {
      this.once('listening', () => {
        const a = this.address();
        if (a && typeof a === 'object') { ownPorts.add(a.port); _record({ requested, actual: a.port }); }
      });
    }
    return origListen.apply(this, args);
  };
}

if (ISOLATED) {
  const LOOP = new Set(['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1', '0.0.0.0', undefined, null, '']);
  let refused = 0;
  const origConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    let opts = args[0];
    if (Array.isArray(opts)) opts = opts[0];                  // internal normalized form
    let port, host;
    if (opts && typeof opts === 'object') { port = Number(opts.port); host = opts.host; if (opts.path) return origConnect.apply(this, args); }
    else { port = Number(args[0]); host = typeof args[1] === 'string' ? args[1] : undefined; }
    const key = `${host || '127.0.0.1'}:${port}`;
    const allowed = ALLOW.has(key) || (LOOP.has(host) && ownPorts.has(port));
    if (!allowed) {
      refused++;
      _record({ refused: key, total: refused });
      const err = Object.assign(new Error(`connect ECONNREFUSED ${key} (COS network isolation — only this run's own ports are reachable)`), { code: 'ECONNREFUSED', errno: -111, syscall: 'connect', address: host || '127.0.0.1', port });
      process.nextTick(() => { this.destroy(err); });
      return this;
    }
    return origConnect.apply(this, args);
  };
}
