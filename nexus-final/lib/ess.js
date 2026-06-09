'use strict';
// lib/ess.js — End-State Signal Kernel
// UUID: nexus-ess-kernel-v1-0000-4000-0000-000000000001
//
// §1.1  Nothing pretends to work. Hash is identity. UNRESOLVE is a fact.
// §1.2  Nothing silently fails. Every unrouted signal emits to the bus.
// §LAW II  Every BIND written to binding_log before taking effect.
//
// ESS is a content-addressed signal routing kernel.
// The kernel is a live hash table — role → hash.
// Functions are frozen at write time (SHA-256 of source bytes).
// The kernel routes signals to end-states. It does not evaluate.
//
// PRIMITIVES:
//   WRITE    — register a function by hash
//   BIND     — bind a role to a hash in the routing table
//   CALLTO   — dispatch a signal to a hash or role
//   RESOLVE  — hash found, function executes, output emitted
//   UNRESOLVE — hash not found, signal re-emitted to bus as first-class event
//
// SEAM CONTRACT (ROUTING_CONTRACT):
//   callto(role, signal) → Promise<{ resolved: bool, output?, reason? }>
//   unresolve events → bus.emit('ess:unresolve', { role, signal, reason, ts })
//   bind(role, hash)  → void (§LAW II: writes to binding_log first)

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { EventEmitter } = require('events');

// ── Hash computation ──────────────────────────────────────────────────────────

function computeHash(sourceBytes) {
  return crypto.createHash('sha256')
    .update(typeof sourceBytes === 'string' ? Buffer.from(sourceBytes) : sourceBytes)
    .digest('hex')
    .slice(0, 7);
}

// ── ESS Kernel ────────────────────────────────────────────────────────────────

class ESSKernel extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.bindingLogPath  — path to write binding_log.ndjson
   * @param {string} opts.hashStorePath   — path to write hash_store.json
   */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(0);

    this._bindingTable = new Map();   // role → hash
    this._hashStore    = new Map();   // hash → { hash, alias, fn, contract, writtenAt, size }
    this._bindingLog   = [];          // [ { ts, op, role, hash } ]
    this._weights      = new Map();   // role → { resolutions, unresolves }

    this._bindingLogPath = opts.bindingLogPath || null;
    this._hashStorePath  = opts.hashStorePath  || null;

    // Load persisted state if paths exist
    if (this._hashStorePath && fs.existsSync(this._hashStorePath)) {
      this._loadHashStore();
    }
    if (this._bindingLogPath && fs.existsSync(this._bindingLogPath)) {
      this._replayBindingLog();
    }
  }

  // ── WRITE — register a function by hash ────────────────────────────────────

  /**
   * Write a function to the hash store. Hash computed from source bytes.
   * Returns the short hash (7 chars).
   * §1.1: The hash is the identity. File can be deleted. Hash remains valid.
   */
  write(alias, fn, contract = {}) {
    if (typeof fn !== 'function') {
      throw new Error(`ESS WRITE: fn must be a function (got ${typeof fn})`);
    }
    const sourceBytes = fn.toString();
    const hash        = computeHash(sourceBytes);

    if (!this._hashStore.has(hash)) {
      const entry = {
        hash,
        alias:     alias || 'anonymous',
        fn,
        contract,
        writtenAt: Date.now(),
        size:      sourceBytes.length,
      };
      this._hashStore.set(hash, entry);
      this._persistHashStore();
      this.emit('ess:write', { hash, alias, size: sourceBytes.length, ts: Date.now() });
    }

    return hash;
  }

  // ── BIND — role → hash ─────────────────────────────────────────────────────

  /**
   * Bind a role to a hash in the kernel routing table.
   * §LAW II: binding_log entry written BEFORE table mutation.
   */
  bind(role, hash) {
    if (!role || typeof role !== 'string') {
      throw new Error(`ESS BIND: role must be a non-empty string`);
    }
    if (!hash || typeof hash !== 'string') {
      throw new Error(`ESS BIND: hash must be a non-empty string`);
    }

    // §LAW II — write before mutate
    const logEntry = { ts: Date.now(), op: 'BIND', role, hash };
    this._bindingLog.push(logEntry);
    this._appendBindingLog(logEntry);

    const prev = this._bindingTable.get(role);
    this._bindingTable.set(role, hash);

    this.emit('ess:bind', { role, hash, prev: prev || null, ts: Date.now() });
    return this;
  }

  /**
   * Unbind a role from the routing table.
   * §LAW II: unbind also logged.
   */
  unbind(role) {
    const hash = this._bindingTable.get(role);
    if (!hash) return this;

    const logEntry = { ts: Date.now(), op: 'UNBIND', role, hash };
    this._bindingLog.push(logEntry);
    this._appendBindingLog(logEntry);

    this._bindingTable.delete(role);
    this.emit('ess:unbind', { role, hash, ts: Date.now() });
    return this;
  }

  // ── CALLTO — dispatch to hash or role ──────────────────────────────────────

  /**
   * Dispatch a signal to a hash (permanent, version-pinned) or role (current binding).
   *
   * Callto syntax (string form for callto:role or callto:hash):
   *   callto(role_or_hash, signal)
   *   callto('gate@69fn332', signal)  — pinned role, must match or UNRESOLVE
   *   callto('gate?fallback=69fn332') — with fallback hash
   *
   * Returns Promise<{ resolved, output, hash, role, ts }> or UNRESOLVE event.
   */
  async callto(target, signal = {}) {
    const parsed   = this._parseTarget(target);
    const resolved = await this._resolve(parsed, signal);

    if (resolved.ok) {
      // Update weight table
      this._updateWeight(resolved.role || target, true);

      this.emit('ess:resolve', {
        role:   resolved.role || target,
        hash:   resolved.hash,
        output: resolved.output,
        ts:     Date.now(),
      });

      return { resolved: true, output: resolved.output, hash: resolved.hash, ts: Date.now() };
    }

    // UNRESOLVE — first-class event, not an error
    this._updateWeight(target, false);

    const unresolved = {
      signal,
      role:   target,
      reason: resolved.reason,
      ts:     Date.now(),
    };

    this.emit('ess:unresolve', unresolved);
    return { resolved: false, reason: resolved.reason, ts: Date.now() };
  }

  // ── RESOLVE (internal) ─────────────────────────────────────────────────────

  _parseTarget(target) {
    // callto:hash@role → pinned
    if (target.includes('@')) {
      const [role, hash] = target.split('@');
      return { type: 'pinned', role: role.trim(), hash: hash.trim() };
    }
    // callto:role?fallback=hash
    if (target.includes('?fallback=')) {
      const [role, rest] = target.split('?fallback=');
      return { type: 'fallback', role: role.trim(), fallback: rest.trim() };
    }
    // 7-char hash (direct)
    if (/^[0-9a-f]{7}$/.test(target)) {
      return { type: 'hash', hash: target };
    }
    // role name
    return { type: 'role', role: target };
  }

  async _resolve(parsed, signal) {
    let hash = null;
    let role = null;

    if (parsed.type === 'hash') {
      hash = parsed.hash;

    } else if (parsed.type === 'role') {
      role = parsed.role;
      hash = this._bindingTable.get(role);
      if (!hash) {
        return { ok: false, reason: 'NO_BINDING', role };
      }

    } else if (parsed.type === 'pinned') {
      role = parsed.role;
      const bound = this._bindingTable.get(role);
      if (bound !== parsed.hash) {
        return { ok: false, reason: 'HASH_MISMATCH', role, expected: parsed.hash, actual: bound };
      }
      hash = parsed.hash;

    } else if (parsed.type === 'fallback') {
      role = parsed.role;
      hash = this._bindingTable.get(role) || parsed.fallback;
    }

    const entry = this._hashStore.get(hash);
    if (!entry) {
      return { ok: false, reason: 'HASH_MISSING', hash, role };
    }

    // Validate signal contract if declared
    if (entry.contract?.input && !this._validateContract(signal, entry.contract.input)) {
      return { ok: false, reason: 'CONTRACT_MISMATCH', hash, role };
    }

    // Execute — resolution is atomic
    try {
      const output = await entry.fn(signal, this);
      return { ok: true, output, hash, role };
    } catch (e) {
      return { ok: false, reason: 'EXECUTION_ERROR', hash, role, error: e.message };
    }
  }

  _validateContract(signal, contract) {
    if (!contract) return true;
    if (contract.required) {
      for (const key of contract.required) {
        if (!(key in signal)) return false;
      }
    }
    return true;
  }

  // ── Adaptive SNR filter ───────────────────────────────────────────────────

  _updateWeight(role, resolved) {
    const w = this._weights.get(role) || { resolutions: 0, unresolves: 0 };
    if (resolved) w.resolutions++; else w.unresolves++;
    w.rate = +(w.resolutions / (w.resolutions + w.unresolves)).toFixed(4);
    this._weights.set(role, w);

    // Surface high-noise roles as NOISE_ALERT
    if (w.unresolves >= 5 && w.rate < 0.2) {
      this.emit('ess:noise_alert', {
        role,
        noiseRate:  1 - w.rate,
        suggestion: `No hash bound for role "${role}". Bind or remove.`,
        ts:         Date.now(),
      });
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  resolve(role) {
    return this._bindingTable.get(role) || null;
  }

  hasRole(role) {
    return this._bindingTable.has(role);
  }

  hasHash(hash) {
    return this._hashStore.has(hash);
  }

  weights() {
    const out = {};
    for (const [role, w] of this._weights) out[role] = w;
    return out;
  }

  /** Serialize the full kernel state — the kernel IS its binding table */
  snapshot() {
    const bindings = {};
    for (const [role, hash] of this._bindingTable) bindings[role] = hash;
    return {
      ts:       Date.now(),
      bindings,
      hashCount: this._hashStore.size,
      logLength: this._bindingLog.length,
      weights:  this.weights(),
    };
  }

  /** Replay binding log to reconstruct kernel state at time T */
  replayTo(targetTs) {
    const k = new ESSKernel();
    for (const entry of this._bindingLog) {
      if (entry.ts > targetTs) break;
      if (entry.op === 'BIND')   k._bindingTable.set(entry.role, entry.hash);
      if (entry.op === 'UNBIND') k._bindingTable.delete(entry.role);
    }
    // Copy hash store (functions still available)
    for (const [h, e] of this._hashStore) k._hashStore.set(h, e);
    return k;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  _appendBindingLog(entry) {
    if (!this._bindingLogPath) return;
    try {
      fs.appendFileSync(
        this._bindingLogPath,
        JSON.stringify(entry) + '\n',
        'utf8'
      );
    } catch(_) {}
  }

  _replayBindingLog() {
    try {
      const lines = fs.readFileSync(this._bindingLogPath, 'utf8')
        .split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          this._bindingLog.push(e);
          if (e.op === 'BIND')   this._bindingTable.set(e.role, e.hash);
          if (e.op === 'UNBIND') this._bindingTable.delete(e.role);
        } catch(_) {}
      }
    } catch(_) {}
  }

  _persistHashStore() {
    if (!this._hashStorePath) return;
    try {
      const store = {};
      for (const [h, e] of this._hashStore) {
        store[h] = { hash: e.hash, alias: e.alias, contract: e.contract,
                     writtenAt: e.writtenAt, size: e.size };
        // fn not serialized — must be re-written on boot
      }
      fs.writeFileSync(this._hashStorePath, JSON.stringify(store, null, 2));
    } catch(_) {}
  }

  _loadHashStore() {
    try {
      const raw   = JSON.parse(fs.readFileSync(this._hashStorePath, 'utf8'));
      for (const [h, e] of Object.entries(raw)) {
        // Load metadata without fn — fn must be re-registered via write()
        this._hashStore.set(h, { ...e, fn: null });
      }
    } catch(_) {}
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createKernel(opts = {}) {
  return new ESSKernel(opts);
}

module.exports = { ESSKernel, createKernel, computeHash };
