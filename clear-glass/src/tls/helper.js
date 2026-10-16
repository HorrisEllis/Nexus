'use strict';
/**
 * src/tls/helper.js — runs cg-tls-helper (clear-glass/tls-helper/), Clear Glass's TLS layer, and says what state it is in.
 * UUID: cg-tls-helper-host-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-16-tls-layer-phasemap.spec (TLS2)
 *
 * James, 2026-10-16: "fix it. i don't want the trouble again"
 *
 * In place of the Node proxy (src/tls/proxy.js, superseded and kept): the Go helper on the same port (:7703). This
 * module starts it, restarts it after a crash (five times in ten minutes, then it stays down and says why), stops it
 * with Clear Glass. While it is not running, no session is routed to it (src/net/service.js setTlsLayer(null)). A
 * missing binary or a failed start is a state with a reason, never an exception: the layer steps aside.
 *
 *   binaryPath(platform, arch)        the prebuilt binary for this machine, or null
 *   issuedByUs(certificate, caPem)    pure: an Electron certificate whose issuer is this CA (setCertificateVerifyProc)
 *   new TlsHelper({ port, dir, onState }) .start() .stop() .status()
 */
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const BIN_ROOT = path.join(__dirname, '..', '..', 'tls-helper', 'bin');
const OS = { win32: 'windows', darwin: 'darwin', linux: 'linux' };
const ARCH = { x64: 'amd64', arm64: 'arm64' };

function binaryPath(platform = process.platform, arch = process.arch, root = BIN_ROOT) {
  const os = OS[platform], a = ARCH[arch];
  if (!os || !a) return null;
  const p = path.join(root, `${os}-${a}`, os === 'windows' ? 'cg-tls-helper.exe' : 'cg-tls-helper');
  return fs.existsSync(p) ? p : null;
}

function defaultDir() {
  if (process.env.CG_TLS_LAYER_DIR) return process.env.CG_TLS_LAYER_DIR;
  return path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'tls-layer');
}

const _norm = (pem) => String(pem || '').replace(/-----[^-]+-----|\s+/g, '');
/** issuedByUs(certificate, caPem) — Electron's Certificate: its issuerCert is this CA (compared byte for byte) */
function issuedByUs(certificate, caPem) {
  if (!certificate || !caPem) return false;
  const issuer = certificate.issuerCert;
  return !!(issuer && issuer.data && _norm(issuer.data) === _norm(caPem));
}

class TlsHelper extends EventEmitter {
  constructor({ port = 7703, dir = defaultDir(), bin = undefined, upstreamCa = null, log = (m) => console.log(m), maxRestarts = 5, windowMs = 10 * 60 * 1000, spawnFn = spawn } = {}) {
    super();
    Object.assign(this, { port, dir, log, maxRestarts, windowMs, spawnFn, upstreamCa });
    this.bin = bin === undefined ? binaryPath() : bin;
    this.state = 'stopped'; this.why = null; this.caPem = null; this.caFingerprint = null; this.proc = null;
    this.restarts = []; this.stopping = false;
  }

  status() {
    return { state: this.state, port: this.state === 'running' ? this.port : null, why: this.why, bin: this.bin, caFingerprint: this.caFingerprint, restarts: this.restarts.length };
  }

  _set(state, why = null) {
    this.state = state; this.why = why;
    this.emit('state', this.status());
  }

  /** start() -> status. Resolves when the helper says ready, or with the reason it is not. */
  start() {
    if (this.state === 'running' || this.state === 'starting') return Promise.resolve(this.status());
    this.stopping = false;
    if (!this.bin) { this._set('unavailable', `no cg-tls-helper binary for ${process.platform}-${process.arch} (node clear-glass/tls-helper/build.js --all builds it; needs Go) — sessions are not routed through the TLS layer`); return Promise.resolve(this.status()); }
    this._set('starting');
    return new Promise((resolve) => {
      let proc;
      try { proc = this.spawnFn(this.bin, ['-listen', `127.0.0.1:${this.port}`, '-ca-dir', this.dir, '-exit-with-parent', ...(this.upstreamCa ? ['-upstream-ca', this.upstreamCa] : [])], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }   // stdin held open: when Clear Glass dies, the helper goes too (never an orphan on :7703) }
      catch (e) { this._set('unavailable', `could not start ${this.bin}: ${e.message}`); return resolve(this.status()); }
      this.proc = proc;
      let buf = '', settled = false;
      const settle = () => { if (!settled) { settled = true; resolve(this.status()); } };
      const timer = setTimeout(() => { if (this.state === 'starting') { try { proc.kill(); } catch (_) {} this._set('unavailable', 'cg-tls-helper did not say ready in 10 s'); settle(); } }, 10000);
      proc.stdout.on('data', (d) => {
        buf += d.toString();
        const nl = buf.indexOf('\n'); if (nl < 0 || settled) return;
        clearTimeout(timer);
        let msg = null; try { msg = JSON.parse(buf.slice(0, nl)); } catch (_) {}
        if (msg && msg.ready) {
          try { this.caPem = fs.readFileSync(msg.caPath, 'utf8'); } catch (e) { this.caPem = null; }
          this.caFingerprint = msg.caFingerprint || null;
          if (!this.caPem) { try { proc.kill(); } catch (_) {} this._set('unavailable', `cg-tls-helper started but its CA (${msg.caPath}) could not be read`); }
          else this._set('running');
        } else this._set('unavailable', `cg-tls-helper did not start: ${(msg && msg.error) || buf.slice(0, nl)}`);
        settle();
      });
      proc.stderr.on('data', (d) => { for (const l of String(d).split('\n').filter(Boolean)) this.log(l.startsWith('[cg-tls-helper]') ? l : `[cg-tls-helper] ${l}`); });
      proc.on('error', (e) => { clearTimeout(timer); this._set('unavailable', `cg-tls-helper: ${e.message}`); settle(); });
      proc.on('exit', (code, sig) => {
        clearTimeout(timer);
        this.proc = null;
        if (this.stopping) { this._set('stopped'); return settle(); }
        const now = Date.now();
        this.restarts = this.restarts.filter(t => now - t < this.windowMs);
        if (this.state === 'running' && this.restarts.length < this.maxRestarts) {
          this.restarts.push(now);
          this.log(`[cg-tls-helper] exited (${code ?? sig}) — restarting (${this.restarts.length}/${this.maxRestarts} in 10 min)`);
          this._set('stopped', `exited (${code ?? sig}); restarting`);
          setTimeout(() => { if (!this.stopping) this.start(); }, 500 * this.restarts.length);
        } else if (this.state !== 'unavailable') {
          this._set('failed', `cg-tls-helper exited (${code ?? sig})${this.restarts.length >= this.maxRestarts ? ` ${this.maxRestarts} times in 10 minutes — left down; sessions go direct` : ''}`);
        }
        settle();
      });
    });
  }

  stop() {
    this.stopping = true;
    if (this.proc) { try { this.proc.kill(); } catch (_) {} }
    else this._set('stopped');
  }

  /** getStats() — kept for main/index.js's state snapshot (the Node proxy had one) */
  getStats() { return this.status(); }
}

// the one helper Clear Glass runs (main/index.js sets it); contexts/manager.js reads its CA through current()
let _current = null;
function setCurrent(h) { _current = h; }
function current() { return _current; }

/** verifyProc(getHelper) -> a session.setCertificateVerifyProc callback: this CA's leaf certificates are trusted (0);
 *  every other certificate goes to Chromium's own verification (-3). Nothing is ever trusted blindly. */
function verifyProc(getHelper = current) {
  return (request, callback) => {
    const h = getHelper();
    callback(h && h.state === 'running' && h.caPem && issuedByUs(request && request.certificate, h.caPem) ? 0 : -3);
  };
}

module.exports = { TlsHelper, binaryPath, issuedByUs, verifyProc, defaultDir, setCurrent, current, BIN_ROOT };
