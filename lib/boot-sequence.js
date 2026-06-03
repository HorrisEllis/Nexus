'use strict';
/**
 * lib/boot-sequence.js
 * UUID: nexus-boot-seq-v1-0000-4000-0000-000000000001
 *
 * Gated boot engine. Used by every system.
 *
 * HARD phase: failure → print HALT banner → notify orchestrator → spawn diagnose → process.exit(1)
 * SOFT phase: failure → warn → continue in degraded mode
 *
 * §1.2  Nothing silently fails.
 * §3.1  Bottom-up gated build order.
 * §AXIOM Orchestrator is source of truth — every halt/complete notifies it first.
 */

const http         = require('http');
const path         = require('path');
const { randomUUID } = require('crypto');

const ORCH_PORT = parseInt(process.env.ORCHESTRATOR_PORT || '9000');
const DIAG     = path.join(__dirname, '..', 'cli', 'diagnose.js');

const C = {
  r:'\x1b[0m', b:'\x1b[1m', d:'\x1b[90m',
  red:'\x1b[31m', grn:'\x1b[32m', yel:'\x1b[33m', cyn:'\x1b[36m',
};

// ── fire-and-forget POST to orchestrator ledger ───────────────────────────────
function _post(type, payload) {
  try {
    const body = JSON.stringify({ system: payload.systemId || 'boot-seq', type, payload });
    const req  = http.request({
      hostname:'127.0.0.1', port:ORCH_PORT,
      path:'/api/ledger', method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
    });
    req.setTimeout(2000, () => req.destroy());
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

// ── spawn diagnose.js for a system, notify orchestrator when done ─────────────
function _diagnose(systemId, haltedAt) {
  try {
    const { spawn } = require('child_process');
    const proc = spawn(process.execPath, [DIAG, systemId], {
      detached: true, stdio: ['ignore','pipe','pipe'],
    });
    let out = '';
    proc.stdout?.on('data', d => { out += d; });
    proc.stderr?.on('data', d => { out += d; });
    proc.on('close', code => {
      const pass = (out.match(/✓/g) || []).length;
      const fail = (out.match(/✗/g) || []).length;
      const warn = (out.match(/⚠/g) || []).length;
      console.log(
        `${C.cyn}[diagnose] ${systemId}: ${pass}✓ ${fail}✗ ${warn}⚠ exit=${code}` +
        (fail === 0 ? ' — ALL PASS' : '') + C.r
      );
      _post(`${systemId}.diagnose.complete`, {
        systemId, haltedAt, pass, fail, warn,
        exitCode: code, fixed: fail === 0 && code === 0, ts: Date.now(),
      });
    });
    proc.unref();
  } catch (e) {
    console.warn(`[boot-seq] diagnose spawn failed: ${e.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
class BootSequence {
  /**
   * @param {string}  systemId   — e.g. 'cortex'
   * @param {number}  port       — what port this system serves
   * @param {string}  version    — semver
   * @param {string}  label      — display name
   * @param {number}  maxRetries — per-phase retry attempts before failing (default 1)
   */
  constructor({ systemId, port, version = '1.0.0', label, maxRetries = 1 }) {
    this.systemId   = systemId;
    this.port       = port;
    this.version    = version;
    this.label      = label || systemId;
    this.maxRetries = maxRetries;
    this._phases    = [];
    this._log       = [];
  }

  /**
   * Add a boot phase.
   *
   * @param {string}           name    — phase ID, e.g. 'storage.init'
   * @param {'HARD'|'SOFT'}    type    — HARD=halt on failure, SOFT=degrade
   * @param {string}           label   — human description
   * @param {async function}   fn      — the work to do
   */
  phase({ name, type = 'SOFT', label, fn }) {
    if (typeof fn !== 'function') throw new Error(`phase '${name}': fn must be a function`);
    this._phases.push({ name, type: type.toUpperCase(), label: label || name, fn });
    return this;
  }

  async run() {
    const seqId = randomUUID().slice(0, 8);
    const total = this._phases.length;

    // ── header ───────────────────────────────────────────────────────────────
    console.log(`\n${C.b}${C.cyn}⬡  BOOT  ${this.label.toUpperCase()}${C.r}  ${C.d}v${this.version} · ${total} phases · seq:${seqId}${C.r}`);
    _post(`${this.systemId}.boot.started`, {
      systemId: this.systemId, port: this.port,
      version: this.version, phases: total, seqId, ts: Date.now(),
    });

    for (let i = 0; i < this._phases.length; i++) {
      const ph     = this._phases[i];
      const isHard = ph.type === 'HARD';
      const tag    = isHard
        ? `${C.red}HARD${C.r}`
        : `${C.d}SOFT${C.r}`;

      process.stdout.write(
        `  ${C.d}[${i+1}/${total}]${C.r} ${tag}  ${ph.label.padEnd(46)} `
      );

      let lastErr = null;
      let ok      = false;
      const t0    = Date.now();

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          await ph.fn();
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < this.maxRetries) {
            process.stdout.write(`${C.yel}↺${C.r} `);
            await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
          }
        }
      }

      const ms = Date.now() - t0;
      this._log.push({
        uuid: randomUUID(), phase: ph.name, type: ph.type,
        label: ph.label, ok, ms, error: lastErr?.message || null,
      });

      if (ok) {
        console.log(`${C.grn}✓${C.r} ${C.d}${ms}ms${C.r}`);
        _post(`${this.systemId}.phase.ok`, {
          systemId: this.systemId, phase: ph.name, type: ph.type, ms, seqId,
        });
        continue;
      }

      // ── phase failed ──────────────────────────────────────────────────────
      const errMsg = (lastErr?.message || 'failed').slice(0, 80);
      console.log(`${C.red}✗${C.r}  ${C.red}${errMsg}${C.r}`);
      _post(`${this.systemId}.phase.failed`, {
        systemId: this.systemId, phase: ph.name, type: ph.type,
        ms, error: lastErr?.message, fatal: isHard, seqId,
      });

      if (isHard) {
        // ── HALT ─────────────────────────────────────────────────────────────
        console.error(`\n${C.red}${C.b}╔═════════════════════════════════════════════════════╗${C.r}`);
        console.error(`${C.red}${C.b}║  HALT  ${this.label.padEnd(12)}  phase: ${ph.name.padEnd(21)}║${C.r}`);
        console.error(`${C.red}${C.b}║  ${errMsg.padEnd(51)}║${C.r}`);
        console.error(`${C.red}${C.b}╚═════════════════════════════════════════════════════╝${C.r}`);
        console.error(`${C.cyn}  → notifying orchestrator + triggering auto-diagnose${C.r}\n`);

        // §AXIOM — orchestrator first
        _post(`${this.systemId}.boot.halted`, {
          systemId: this.systemId, port: this.port,
          haltedAt: ph.name, error: lastErr?.message,
          phasesCompleted: i, phasesTotal: total,
          log: this._log, seqId, ts: Date.now(),
        });

        // auto-diagnose
        _diagnose(this.systemId, ph.name);

        return { ok: false, haltedAt: ph.name, log: this._log, seqId };
      }

      // SOFT — degrade gracefully
      console.warn(`  ${C.yel}⚠${C.r}  ${ph.label} — degraded, continuing in standalone mode`);
    }

    // ── all phases passed ─────────────────────────────────────────────────────
    const pass = this._log.filter(p => p.ok).length;
    const soft = this._log.filter(p => !p.ok).length;
    console.log(
      `\n  ${C.grn}${C.b}✓ ${this.label} ready${C.r}  ${C.d}:${this.port}` +
      `  ${pass}/${total} pass${soft ? `  ${soft} degraded` : ''}${C.r}\n`
    );
    _post(`${this.systemId}.boot.complete`, {
      systemId: this.systemId, port: this.port, version: this.version,
      phases: total, pass, soft, seqId, ts: Date.now(),
    });

    return { ok: true, haltedAt: null, log: this._log, seqId };
  }
}

module.exports = { BootSequence };
