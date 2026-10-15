'use strict';
/**
 * clear-glass/src/net/transport-host.js — tor with Snowflake as its bridge, run as an isolated child (NP1, 0.60.60). Everything impure is injected.
 * comp_id: cg.net.transport-host
 *
 * What this is NOT: it adds no cryptography. The path is already encrypted at every hop that matters (WebRTC/DTLS to the Snowflake proxy, Tor's layered
 * encryption across three relays, TLS to the site); a home-made layer on top would add nothing and could only add bugs. What this adds is ISOLATION:
 *   - its own data directory (0700), wiped on request, nothing of Nexus inside it
 *   - SOCKS and control ports bound to 127.0.0.1 only, on random ports
 *   - control by cookie file inside that directory (no password in a config, none in the process list)
 *   - an empty environment: no Nexus secrets leak into the child
 *   - killed with the app; restarted with backoff if it dies by itself; never restarted after a deliberate stop
 * It needs two programs it does not ship: `tor` and a Snowflake client (snowflake-client / the Tor pluggable transport). Detect them, or set their paths.
 * It also needs a Snowflake BRIDGE LINE from the Tor Project (Tor Browser ships the current one). The line changes over time, so this code does not
 * carry one: set it with `net bridge <line>`. Without it, start() refuses and says so.
 */
const { EventEmitter } = require('events');
const path = require('path');

const STATES = ['stopped', 'starting', 'bootstrapping', 'ready', 'failed', 'stopping'];

function torrc({ dataDir, socksPort, controlPort, snowflakePath, bridgeLine }) {
  if (!/^Bridge\s+snowflake\s/i.test(bridgeLine || '') && !/^snowflake\s/i.test(bridgeLine || '')) throw new Error('the bridge line must start with "snowflake " (a Snowflake bridge line from the Tor Project)');
  const bl = bridgeLine.replace(/^Bridge\s+/i, '');
  return [
    `DataDirectory ${dataDir}`,
    `SocksPort 127.0.0.1:${socksPort}`,
    `ControlPort 127.0.0.1:${controlPort}`,
    'CookieAuthentication 1',
    `CookieAuthFile ${path.join(dataDir, 'control_auth_cookie')}`,
    'ClientOnly 1', 'SafeSocks 1', 'AvoidDiskWrites 1', 'Log notice stdout',
    'UseBridges 1',
    `ClientTransportPlugin snowflake exec ${snowflakePath}`,
    `Bridge ${bl}`,
    '',
  ].join('\n');
}

class TransportHost extends EventEmitter {
  /**
   * @param {object} d  spawn(cmd,args,opts)->child, fs, dir, which(name)->path|null, pickPort()->Promise<number>, setTimer, clearTimer, config:{torPath,snowflakePath,bridgeLine}
   */
  constructor(d = {}) {
    super();
    this.d = { setTimer: setTimeout, clearTimer: clearTimeout, maxRestarts: 5, ...d };
    this.state = 'stopped'; this.progress = 0; this.error = null; this.restarts = 0;
    this.socksPort = null; this.controlPort = null; this.child = null; this.intentional = false; this._timer = null; this._runDir = null;
  }
  _set(state, extra = {}) { this.state = state; Object.assign(this, extra); this.emit('state', this.status()); }
  status() { return { state: this.state, progress: this.progress, error: this.error, socksPort: this.state === 'ready' ? this.socksPort : null, controlPort: this.controlPort, restarts: this.restarts, dir: this._runDir }; }

  detect() {
    const c = this.d.config || {};
    const tor = c.torPath || this.d.which('tor'); const snow = c.snowflakePath || this.d.which('snowflake-client');
    return { tor: tor || null, snowflake: snow || null, bridgeLine: c.bridgeLine ? 'set' : null,
      missing: [!tor && 'tor', !snow && 'snowflake-client', !c.bridgeLine && 'a Snowflake bridge line (net bridge <line>)'].filter(Boolean) };
  }

  async start() {
    if (['starting', 'bootstrapping', 'ready'].includes(this.state)) return { ok: true, already: true, ...this.status() };
    const det = this.detect();
    if (det.missing.length) { this._set('failed', { error: `cannot start: missing ${det.missing.join(', ')}` }); return { ok: false, error: this.error }; }
    this.intentional = false;
    return this._launch(det);
  }

  async _launch(det) {
    const { fs, dir } = this.d;
    try {
      this._set('starting', { error: null, progress: 0 });
      this._runDir = path.join(dir, `run-${this.d.now ? this.d.now() : Date.now()}`);
      fs.mkdirSync(this._runDir, { recursive: true, mode: 0o700 });
      this.socksPort = await this.d.pickPort(); this.controlPort = await this.d.pickPort();
      const rc = path.join(this._runDir, 'torrc');
      fs.writeFileSync(rc, torrc({ dataDir: this._runDir, socksPort: this.socksPort, controlPort: this.controlPort, snowflakePath: det.snowflake, bridgeLine: this.d.config.bridgeLine }), { mode: 0o600 });
      const child = this.d.spawn(det.tor, ['-f', rc], { env: {}, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
      this.child = child;
      const onLine = (buf) => {
        for (const line of String(buf).split(/\r?\n/)) {
          const m = /Bootstrapped (\d+)%/.exec(line);
          if (m) { const p = +m[1]; this._set(p >= 100 ? 'ready' : 'bootstrapping', { progress: p }); if (p >= 100) this.restarts = 0; }
        }
      };
      child.stdout && child.stdout.on('data', onLine); child.stderr && child.stderr.on('data', onLine);
      child.on('error', (e) => this._died(`could not run tor: ${e.message}`));
      child.on('exit', (code, sig) => this._died(`tor exited (${sig || code})`));
      return { ok: true, ...this.status() };
    } catch (e) { this._set('failed', { error: e.message }); return { ok: false, error: e.message }; }
  }

  _died(why) {
    this.child = null;
    if (this.intentional) { this._set('stopped', { progress: 0, socksPort: null }); return; }
    // not asked to stop: the route is DOWN now (state != ready), so the policy compiles to the blackhole until it is back
    this._set('failed', { error: why, socksPort: null });
    if (this.restarts >= this.d.maxRestarts) { this._set('failed', { error: `${why}; gave up after ${this.restarts} restarts` }); return; }
    const wait = Math.min(30000, 1000 * 2 ** this.restarts); this.restarts++;
    this._timer = this.d.setTimer(() => { if (!this.intentional) this._launch(this.detect()); }, wait);
  }

  /** stop({ wipe }) — deliberate. wipe removes the data directory (circuits, guards, cookie): the next start is a fresh one. */
  async stop({ wipe = false } = {}) {
    this.intentional = true;
    if (this._timer) { this.d.clearTimer(this._timer); this._timer = null; }
    const child = this.child; const dirToWipe = this._runDir;
    if (child) { this._set('stopping'); try { child.kill('SIGTERM'); } catch (_) { /* already gone */ } this.child = null; }
    this._set('stopped', { progress: 0, socksPort: null });
    let wiped = null;
    if (wipe && dirToWipe) {
      try { this.d.fs.rmSync(dirToWipe, { recursive: true, force: true }); wiped = true; this._runDir = null; }
      catch (e) { wiped = false; this.error = `stopped, but the data directory could not be wiped: ${e.message}`; }   // §1.2: not silent
    }
    return { ok: wiped !== false, wiped, ...this.status() };
  }
}

module.exports = { TransportHost, torrc, STATES };
