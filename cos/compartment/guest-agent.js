'use strict';
/**
 * cos/compartment/guest-agent.js — qemu-guest-agent (QGA) client.
 * Status: pre-release · §2026-09-21 for cos/testenv's vm backend.
 *
 * QGA speaks newline-delimited JSON over the virtio-serial channel that
 * qemu-runtime's buildQemuArgs() opens when vmConfig.guestAgent is set
 * (org.qemu.guest_agent.0). Unlike QMP there is no greeting: a client must
 * guest-sync first, because the channel can hold stale bytes from an earlier
 * client. The sync id is echoed back; anything before it is discarded.
 *
 * Only the commands a test environment needs: guest-sync, guest-ping,
 * guest-exec (with captured output) and guest-exec-status. Output comes back
 * base64 in out-data / err-data, per the QGA schema.
 * https://www.qemu.org/docs/master/interop/qemu-ga-ref.html
 *
 * COS-1: every failure is a thrown, readable error naming what the agent said.
 */
const net = require('net');

class GuestAgentError extends Error {
  constructor(message, detail = null) { super(message); this.name = 'GuestAgentError'; this.detail = detail; }
}

class GuestAgentClient {
  constructor(addr) { this.addr = addr; this.sock = null; this._buf = ''; this._waiters = []; }

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const sock = this.addr.transport === 'unix' ? net.createConnection(this.addr.path) : net.createConnection(this.addr.port, this.addr.host);
      const t = setTimeout(() => { sock.destroy(); reject(new GuestAgentError('guest agent connect timed out')); }, timeoutMs);
      sock.once('connect', () => { clearTimeout(t); this.sock = sock; resolve(this); });
      sock.once('error', (e) => { clearTimeout(t); reject(new GuestAgentError(`guest agent connect failed: ${e.message}`)); });
      sock.on('data', (c) => this._onData(c));
      sock.on('close', () => { for (const w of this._waiters.splice(0)) w.reject(new GuestAgentError('guest agent channel closed')); });
    });
  }

  _onData(chunk) {
    // A 0xFF sentinel may precede a sync response; it is not JSON.
    this._buf += chunk.toString('utf8').replace(/\xff/g, '');
    let i;
    while ((i = this._buf.indexOf('\n')) >= 0) {
      const line = this._buf.slice(0, i).trim(); this._buf = this._buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch (_) { continue; }
      const w = this._waiters[0];
      if (!w) continue;
      if (w.syncId !== undefined && !(msg.return === w.syncId)) continue; // stale bytes before our sync
      this._waiters.shift();
      if (msg.error) w.reject(new GuestAgentError(`guest agent error: ${msg.error.desc || msg.error.class}`, msg.error));
      else w.resolve(msg.return);
    }
  }

  execute(command, args = undefined, { timeoutMs = 10000, syncId } = {}) {
    if (!this.sock) return Promise.reject(new GuestAgentError('guest agent not connected'));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { const i = this._waiters.indexOf(w); if (i >= 0) this._waiters.splice(i, 1); reject(new GuestAgentError(`guest agent ${command} timed out`)); }, timeoutMs);
      const w = { syncId, resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } };
      this._waiters.push(w);
      this.sock.write(JSON.stringify(args === undefined ? { execute: command } : { execute: command, arguments: args }) + '\n');
    });
  }

  async sync(timeoutMs = 5000) {
    const id = Math.floor(Math.random() * 2 ** 31);
    const got = await this.execute('guest-sync', { id }, { timeoutMs, syncId: id });
    if (got !== id) throw new GuestAgentError(`guest-sync returned ${got}, expected ${id}`);
    return true;
  }

  ping(timeoutMs = 5000) { return this.execute('guest-ping', undefined, { timeoutMs }); }

  /**
   * run(path, args, { timeoutMs, env, pollMs }) -> { exitCode, signal, stdout, stderr, timedOut }
   * guest-exec starts the process; guest-exec-status is polled until exited.
   */
  async run(pathOrBin, argv = [], { timeoutMs = 30000, env = null, pollMs = 200 } = {}) {
    const started = await this.execute('guest-exec', { path: pathOrBin, arg: argv, 'capture-output': true, ...(env ? { env } : {}) });
    const pid = started && started.pid;
    if (typeof pid !== 'number') throw new GuestAgentError('guest-exec returned no pid', started);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.execute('guest-exec-status', { pid });
      if (st.exited) {
        const dec = (b) => (b ? Buffer.from(b, 'base64').toString('utf8') : '');
        return { exitCode: typeof st.exitcode === 'number' ? st.exitcode : null, signal: st.signal ?? null,
                 stdout: dec(st['out-data']), stderr: dec(st['err-data']), truncated: !!(st['out-truncated'] || st['err-truncated']), timedOut: false };
      }
      if (Date.now() > deadline) return { exitCode: null, signal: null, stdout: '', stderr: '', timedOut: true };
      await new Promise(r => setTimeout(r, pollMs));
    }
  }

  close() { if (this.sock) { try { this.sock.destroy(); } catch (_) {} this.sock = null; } }
}

/** connectWhenReady(addr, { timeoutMs }) — retry until the guest's agent answers a sync (boot takes time). */
async function connectWhenReady(addr, { timeoutMs = 180000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const c = new GuestAgentClient(addr);
    try { await c.connect(2000); await c.sync(3000); return c; }
    catch (e) { last = e; c.close(); await new Promise(r => setTimeout(r, intervalMs)); }
  }
  throw new GuestAgentError(`guest agent never became ready within ${timeoutMs}ms${last ? `: ${last.message}` : ''}`);
}

module.exports = { GuestAgentClient, GuestAgentError, connectWhenReady };
