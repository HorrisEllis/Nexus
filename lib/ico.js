'use strict';
// lib/ico.js — Input Compartment Output — Universal Substrate
// UUID: nexus-ico-substrate-v1-0000-4000-0000-000000000001
//
// Zero external deps. Node.js stdlib only.
//
// PIPE ORDER (by priority):
//   axioms    (-1) — hard constraints, immovable floor (§LAW I-VI + §1.1-§1.3)
//   snr         (0) — signal fidelity + health scoring, delta + sigma inline
//   compartment(10) — hot-reloadable system-specific transform (Ollama, guardian, etc.)
//   plugins   (20+) — registered plugins (RAID at 20, memory at 30)
//   crystal    (30) — high-health signals auto-crystallize to disk
//
// FOLDERS (auto-created per kernel instance):
//   input/       — incoming signals (uuid.pending.md / specid.pending.spec)
//   output/      — results
//   queue/       — queue state
//   ledger/      — per-stream append-only event logs
//   invariant/   — persistent key-value store (survives restarts)
//   failures/    — failure mode ledger (error + solution + friction score)
//   conversations/ — per-session conversation logs
//
// SEAM CONTRACT (SUBSTRATE_CONTRACT):
//   pipe(data, meta) → Promise<output | null>
//   null = dropped by axiom or SNR (logged, not silent)
//   invariant.get/set/del/all — persistent k/v
//   ledger.append/tail/fork   — append-only per-stream log

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// ── Math (from ICO — lens math, no deps) ─────────────────────────────────────

function fingerprint(data) {
  if (data === null || data === undefined) return '_null';
  if (Array.isArray(data))
    return '_array:' + [...new Set(data.map(x => typeof x))].sort().join(',');
  if (typeof data === 'object')
    return Object.keys(data).sort()
      .map(k => `${k}:${Array.isArray(data[k]) ? 'array' : typeof data[k]}`).join('|');
  return `_scalar:${typeof data}`;
}

function deltaScore(fp, priorFPs) {
  if (!priorFPs || !priorFPs.length) return 0;
  const curr  = new Set(fp.split('|'));
  const union = new Set(curr);
  let hit = 0;
  for (const p of priorFPs) for (const t of p.split('|')) union.add(t);
  for (const t of curr) if (priorFPs.some(p => p.split('|').includes(t))) hit++;
  return +(1 - hit / union.size).toFixed(4);
}

function sigmaOf(series) {
  if (series.length < 2) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  return +Math.sqrt(series.reduce((s, x) => s + (x - mean) ** 2, 0) / series.length).toFixed(4);
}

// ── ICO Instance ──────────────────────────────────────────────────────────────

class ICO extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string}   opts.root         — base directory for this kernel's data folders
   * @param {string}   opts.name         — kernel name (guardian, cortex, etc.)
   * @param {string}   opts.compartment  — path to hot-reloadable compartment/index.js
   * @param {object}   opts.ess          — ESSKernel instance (optional)
   */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(0);

    this.name  = opts.name  || 'ico';
    this.root  = path.resolve(opts.root || `data/${this.name}`);
    this._ess  = opts.ess   || null;

    // Folder layout
    this._dirs = {
      input:         path.join(this.root, 'input'),
      output:        path.join(this.root, 'output'),
      queue:         path.join(this.root, 'queue'),
      ledger:        path.join(this.root, 'ledger'),
      invariant:     path.join(this.root, 'invariant'),
      failures:      path.join(this.root, 'failures'),
      conversations: path.join(this.root, 'conversations'),
    };

    // Ensure all folders exist
    for (const d of Object.values(this._dirs)) {
      fs.mkdirSync(d, { recursive: true });
    }

    // Compartment path
    this._compartmentPath = opts.compartment ||
      path.join(path.dirname(this.root), 'compartment', 'index.js');

    // Plugin registry
    this._plugins = new Map();
    this._snrWindow = [];

    // SNR state
    this._snrLastF   = null;
    this._snrLastH   = null;
    this._snrSignal  = 0;
    this._snrNoise   = 0;

    // Register built-in plugins
    this._registerBuiltins();
  }

  // ── Plugin registry ───────────────────────────────────────────────────────

  register(plugin) {
    if (!plugin.name || typeof plugin.process !== 'function')
      throw new Error(`ICO.register: plugin missing name or process`);
    plugin.enabled    = plugin.enabled    ?? true;
    plugin.priority   = plugin.priority   ?? 20;
    plugin._in = plugin._out = plugin._dropped = 0;
    this._plugins.set(plugin.name, plugin);
    this.emit('ico:plugin:registered', { name: plugin.name, priority: plugin.priority });
    return this;
  }

  enable(name)  { const p = this._plugins.get(name); if (p) p.enabled = true;  }
  disable(name) { const p = this._plugins.get(name); if (p) p.enabled = false; }

  // ── Invariant — persistent k/v ────────────────────────────────────────────

  get invariant() {
    const dir = this._dirs.invariant;
    return {
      get: (key) => {
        const f = path.join(dir, key);
        if (!fs.existsSync(f)) return null;
        const raw = fs.readFileSync(f, 'utf8');
        try { return JSON.parse(raw); } catch { return raw; }
      },
      set: (key, val) => {
        fs.writeFileSync(path.join(dir, key),
          typeof val === 'string' ? val : JSON.stringify(val, null, 2));
        this.emit('ico:invariant:set', { key, ts: Date.now() });
      },
      del: (key) => {
        const f = path.join(dir, key);
        if (fs.existsSync(f)) fs.unlinkSync(f);
        this.emit('ico:invariant:del', { key, ts: Date.now() });
      },
      keys: () => fs.readdirSync(dir).filter(f => !f.startsWith('.')),
      all:  () => {
        const out = {};
        for (const k of fs.readdirSync(dir).filter(f => !f.startsWith('.'))) {
          const f = path.join(dir, k);
          const raw = fs.readFileSync(f, 'utf8');
          try { out[k] = JSON.parse(raw); } catch { out[k] = raw; }
        }
        return out;
      },
    };
  }

  // ── Ledger — append-only per-stream log ───────────────────────────────────
  // §CONSOLIDATION 2026-07-24 — this ledger was the "second root": every
  // append landed ONLY in data/<system>/ledger/<stream>/events.ndjson,
  // physically outside the canonical data/ledger/<system>/<component>/<day>
  // tree AND — the real cost — invisible to cortex's intelligence layer:
  // lib/component-ledger.js's whole design (James's spec, 2026-06-24) is
  // that a write lands in the physical day file + the JAA mirror + an
  // event_log breadcrumb so _scanPatterns() can see it. Service lifecycle
  // events (boot, stop, errors, heartbeats) reached none of that.
  //
  // Fix: append() now WRITES THROUGH to component-ledger. The canonical
  // tree is the shared truth (queryable, pattern-engine-visible); the
  // local ndjson stays as ico's PRIVATE working cache — tail()/fork()/
  // summarize() and their existing consumers (full.test.js, ico's own
  // fidelity fork at ~line 428) keep byte-identical behavior (§5.14).
  // That's a mirror relationship, not a second truth — the same one
  // component-ledger itself has with its JAA mirror. Write-through
  // failure is loud (§1.2) but never fatal: a service that dies of its
  // own telemetry is a worse failure than the one being recorded.
  get ledger() {
    const root = this._dirs.ledger;
    const icoName = this.name;
    return {
      _dir: (id) => {
        const d = path.join(root, id);
        fs.mkdirSync(d, { recursive: true });
        return d;
      },
      append: (id, event) => {
        const dir = path.join(root, id);
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(
          path.join(dir, 'events.ndjson'),
          JSON.stringify({ ...event, _ts: Date.now() }) + '\n'
        );
        // Canonical write-through — system/component/action are all
        // required by component-ledger's own §1.1 refusal; supplied, not
        // guessed: system is this ICO's name, component is the service
        // stream namespaced under it, action is the event's own type.
        // write()'s real signature has NO payload field (checked, not
        // assumed — a `payload:` key would be silently dropped by its
        // destructuring); `detail` is stored verbatim in the row and
        // forwarded into the event_log breadcrumb, so the full event
        // rides there.
        try {
          const { write } = require('./component-ledger');
          write({
            system:    icoName,
            component: `${icoName}.service.${id}`,
            action:    event.type || id,
            status:    event.status || 'ok',
            tags:      ['ico', 'service-lifecycle'],
            detail:    event,
          });
        } catch (e) {
          console.error(`[ico:${icoName}] canonical ledger write-through failed (stream '${id}'): ${e.message}`);
        }
      },
      tail: (id, n = 50) => {
        const f = path.join(root, id, 'events.ndjson');
        if (!fs.existsSync(f)) return [];
        const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
        return lines.slice(-n)
          .map(l => { try { return JSON.parse(l); } catch { return null; } })
          .filter(Boolean);
      },
      list: () => {
        if (!fs.existsSync(root)) return [];
        return fs.readdirSync(root)
          .filter(f => fs.statSync(path.join(root, f)).isDirectory());
      },
      fork: (fromId, toId, reason) => {
        const toDir = path.join(root, toId);
        fs.mkdirSync(toDir, { recursive: true });
        const src = path.join(root, fromId, 'events.ndjson');
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(toDir, 'forked-from.ndjson'));
        }
        this.ledger.append(toId, { _fork: true, from: fromId, reason });
        this.emit('ico:ledger:fork', { from: fromId, to: toId, reason, ts: Date.now() });
      },
      summarize: (id, stats) => {
        const f = path.join(root, id, 'summary.json');
        const prev = fs.existsSync(f) ?
          JSON.parse(fs.readFileSync(f, 'utf8') || '{}') : {};
        fs.writeFileSync(f, JSON.stringify({ ...prev, ...stats, _updated: Date.now() }, null, 2));
      },
    };
  }

  // ── Failures ledger ───────────────────────────────────────────────────────

  logFailure(id, { error, solution = null, friction = 0, source = null, ts = Date.now() } = {}) {
    const dir = this._dirs.failures;
    fs.appendFileSync(
      path.join(dir, `${id}.ndjson`),
      JSON.stringify({ error, solution, friction, source, ts }) + '\n'
    );
    this.emit('ico:failure', { id, error, friction, ts });
  }

  failureTail(id, n = 20) {
    const f = path.join(this._dirs.failures, `${id}.ndjson`);
    if (!fs.existsSync(f)) return [];
    const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  }

  // ── Conversation log ──────────────────────────────────────────────────────

  logConversation(sessionId, entry) {
    // 0.39.258 — one directory name, never a path (see lib/queue.js _safeSegment for the live failure this closes)
    const dir = path.join(this._dirs.conversations, String(sessionId == null ? '' : sessionId).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 120) || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'conversation.jsonl'),
      JSON.stringify({ ...entry, _ts: Date.now() }) + '\n'
    );
  }

  // ── PIPE — runs data through all enabled plugins in priority order ─────────

  async pipe(data, meta = {}) {
    meta.invariant    = meta.invariant    || this.invariant;
    meta.ledger       = meta.ledger       || this.ledger;
    meta.bus          = meta.bus          || this;
    meta.ts           = meta.ts           || Date.now();
    meta.kernelName   = this.name;

    let current = data;
    const ordered = [...this._plugins.values()]
      .sort((a, b) => (a.priority ?? 20) - (b.priority ?? 20));

    for (const plugin of ordered) {
      if (!plugin.enabled) continue;
      plugin._in++;
      try {
        const result = await plugin.process(current, meta, plugin.config || {});
        if (result === null || result === undefined) {
          plugin._dropped++;
          this.emit('ico:drop', { by: plugin.name, data: current, meta, ts: Date.now() });
          return null; // dropped — not silent, event emitted
        }
        current = result;
        plugin._out++;
      } catch (e) {
        // §1.2 — nothing silently fails
        this.logFailure(plugin.name, { error: e.message, friction: 1.0, source: 'pipe' });
        this.emit('ico:pipe:error', { plugin: plugin.name, error: e.message, ts: Date.now() });
        current = { _error: e.message, _plugin: plugin.name, data: current };
        plugin._out++;
      }
    }

    const out = { data: current, meta, ts: Date.now() };
    this.emit('ico:output', out);
    return current;
  }

  // ── Built-in plugins ──────────────────────────────────────────────────────

  _registerBuiltins() {
    // ── AXIOMS (priority -1) ─────────────────────────────────────────────────
    const _axioms = new Map();
    const self    = this;
    this._axioms  = _axioms;

    this.registerAxiom = (axiom) => {
      if (!axiom.name || typeof axiom.rule !== 'function')
        throw new Error(`ICO registerAxiom: bad axiom ${axiom.name}`);
      _axioms.set(axiom.name, axiom);
      self.emit('ico:axiom:registered', { name: axiom.name, ts: Date.now() });
    };

    // Default NEXUS axioms
    this.registerAxiom({
      name:      '§1.2-no-silent-fail',
      rule:      (d) => d !== undefined,
      violation: 'undefined signal — §1.2 violation',
    });

    this.register({
      name:        'axioms',
      description: 'hard constraint floor — §1.1-§1.3, §LAW_I-VI',
      priority:    -1,
      enabled:     true,
      config:      {},
      _violations: 0,
      process(data, meta) {
        // Hot-load invariant-defined axioms
        const rawRules = meta.invariant.get('axioms:rules');
        if (rawRules) {
          let rules;
          try { rules = Array.isArray(rawRules) ? rawRules : JSON.parse(rawRules); }
          catch { rules = []; }
          for (const r of rules) {
            if (!r.name || !r.test || _axioms.has(`inv:${r.name}`)) continue;
            try {
              // eslint-disable-next-line no-new-func
              self.registerAxiom({
                name:      `inv:${r.name}`,
                rule:      new Function('data', 'meta', `return !!(${r.test})`),
                violation: r.violation || r.name,
              });
            } catch(_) {}
          }
        }

        for (const axiom of _axioms.values()) {
          let passes;
          try { passes = axiom.rule(data, meta); } catch { passes = false; }
          if (!passes) {
            this._violations++;
            self.emit('ico:axiom:violation', {
              axiom:     axiom.name,
              violation: axiom.violation,
              data, meta, ts: Date.now(),
            });
            return null; // HARD DROP
          }
        }
        return data;
      },
    });

    // ── SNR + DELTA + SIGMA (priority 0) ────────────────────────────────────
    const snrWindow  = this._snrWindow;
    const ledger     = this.ledger;
    const icoSelf    = this;

    this.register({
      name:        'snr',
      description: 'signal fidelity + health + delta + sigma inline',
      priority:    0,
      enabled:     true,
      config:      {},
      _window:     [],
      _lastF:      null,
      _lastH:      null,
      _signal:     0,
      _noise:      0,

      process(data, meta, config) {
        const rawKeys  = meta.invariant.get('snr:keys');
        let keys = [];
        if (rawKeys) {
          try { keys = Array.isArray(rawKeys) ? rawKeys : JSON.parse(rawKeys); }
          catch {}
        }
        const mode      = String(meta.invariant.get('snr:mode') || 'all').trim();
        const threshold = +(meta.invariant.get('snr:threshold') ?? 0.8);
        const winSize   = +(meta.invariant.get('snr:window')    ?? 20);

        // Fidelity
        let fidelity = 1, missing = [];
        if (keys.length) {
          const obj  = (typeof data === 'object' && data !== null) ? data : { _raw: data };
          const hits = keys.filter(k => Object.prototype.hasOwnProperty.call(obj, k));
          missing    = keys.filter(k => !hits.includes(k));
          fidelity   = mode === 'any'
            ? (hits.length > 0 ? 1 : 0)
            : +(hits.length / keys.length).toFixed(4);
        }

        // Rolling window
        this._window.push(fidelity);
        if (this._window.length > winSize) this._window.shift();
        snrWindow.push(fidelity);
        if (snrWindow.length > winSize) snrWindow.shift();

        const sigma    = sigmaOf(this._window);
        const delta    = this._lastF === null ? 0 : +(fidelity - this._lastF).toFixed(4);
        this._lastF    = fidelity;
        const consist  = +Math.max(0, 1 - sigma).toFixed(4);
        const recency  = 1; // simplified — full version uses last-ts
        const health   = +(fidelity * consist * recency).toFixed(4);
        const strength = fidelity >= threshold ? 'high' : 'low';

        // SNR score in meta
        meta.snr = { fidelity, strength, sigma, delta, consistency: consist, health, ts: Date.now() };

        // Health boundary events
        if (this._lastH !== null) {
          if (this._lastH >= 0.4 && health < 0.4)
            icoSelf.emit('ico:snr:health', { state: 'degraded',  health, prev: this._lastH, ts: Date.now() });
          else if (this._lastH < 0.7 && health >= 0.7)
            icoSelf.emit('ico:snr:health', { state: 'recovered', health, prev: this._lastH, ts: Date.now() });
        }
        this._lastH = health;

        // Zero fidelity = noise → drop
        if (keys.length && fidelity === 0) {
          this._noise++;
          icoSelf.emit('ico:snr:noise', { data, missing, fidelity, meta, ts: Date.now() });
          return null;
        }
        this._signal++;

        // Delta lens — write to ledger
        const streamId  = meta.streamId || meta.src || 'default';
        const fp        = fingerprint(data);
        const recent    = ledger.tail(streamId, 50);
        const priorFPs  = recent.map(e => e._fp).filter(Boolean);
        const dScore    = deltaScore(fp, priorFPs);
        ledger.append(streamId, { _fp: fp, _delta: dScore, _fidelity: fidelity, _health: health });
        meta.lens = meta.lens || {};
        meta.lens.delta = { fp, delta: dScore, fidelity, health, stream: streamId, ts: Date.now() };

        // Fork ledger on high structural delta
        const deltaThreshold = +(meta.invariant.get('lens:delta:threshold') ?? 0.4);
        if (dScore > deltaThreshold && recent.length >= 3) {
          const forkId = `${streamId}~${Date.now()}`;
          ledger.fork(streamId, forkId, `delta ${dScore} > ${deltaThreshold}`);
          meta.lens.delta.forkedTo = forkId;
        }

        icoSelf.emit('ico:snr:score', { score: meta.snr, lens: meta.lens, ts: Date.now() });
        return data;
      },
    });

    // ── COMPARTMENT (priority 10) ────────────────────────────────────────────
    this.register({
      name:        'compartment',
      description: 'hot-reloadable system-specific transform center',
      priority:    10,
      enabled:     true,
      config:      {},
      process: (data, meta) => {
        const f = this._compartmentPath;
        if (!f || !fs.existsSync(f)) return data;
        try {
          delete require.cache[require.resolve(f)];
          return require(f)(data, meta);
        } catch (e) {
          this.logFailure('compartment', { error: e.message, friction: 0.8 });
          return { _compartment_error: e.message, data };
        }
      },
    });

    // ── CRYSTAL (priority 30) ────────────────────────────────────────────────
    this.register({
      name:        'crystal',
      description: 'high-health signals auto-crystallize to disk',
      priority:    30,
      enabled:     true,
      config:      { threshold: 0.8 },
      process: (data, meta, config) => {
        const health    = meta.snr?.health ?? 1;
        const threshold = config.threshold ?? 0.8;

        if (health < threshold) return data; // crystal never drops

        const hash = crypto.createHash('sha256')
          .update(JSON.stringify(data) + Date.now())
          .digest('hex').slice(0, 16);

        const crystal = { hash, data, snr: meta.snr || null, lens: meta.lens || null,
          formed: Date.now(), kernelName: this.name };

        const dir = path.join(this.root, 'crystals');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify(crystal, null, 2));

        meta.crystal = { hash, formed: true };
        this.emit('ico:crystal:formed', { hash, health, ts: Date.now() });
        return data;
      },
    });
  }

  // ── Input folder watcher ──────────────────────────────────────────────────

  watchInput(onSignal) {
    const dir = this._dirs.input;
    fs.watch(dir, (event, filename) => {
      if (!filename || !filename.includes('.pending')) return;
      setTimeout(() => {
        const filepath = path.join(dir, filename);
        if (!fs.existsSync(filepath)) return;
        try {
          const raw  = fs.readFileSync(filepath, 'utf8');
          let data;
          try { data = JSON.parse(raw); }
          catch { data = { _raw: raw, _file: filename }; }

          // Mark as processing
          const processingPath = filepath.replace('.pending', '.processing');
          fs.renameSync(filepath, processingPath);

          this.pipe(data, { src: 'file', file: filename }).then(result => {
            if (result !== null) {
              // Write to output
              const outFile = path.join(this._dirs.output, filename.replace('.pending', '.done'));
              fs.writeFileSync(outFile, typeof result === 'string' ?
                result : JSON.stringify(result, null, 2));
              fs.unlinkSync(processingPath);
              this.emit('ico:input:processed', { file: filename, ts: Date.now() });
              if (onSignal) onSignal(result, filename);
            } else {
              // Dropped — log to failures
              this.logFailure('input-drop', { error: `Signal dropped: ${filename}`, friction: 0.5 });
              fs.renameSync(processingPath, filepath.replace('.pending', '.dropped'));
            }
          });
        } catch (e) {
          this.logFailure('input-watch', { error: e.message, friction: 0.9 });
        }
      }, 50);
    });

    // Replay any .pending or .processing files from before restart
    for (const f of fs.readdirSync(dir)) {
      if (f.includes('.pending') || f.includes('.processing')) {
        // Rename .processing back to .pending (interrupted before completion)
        if (f.includes('.processing')) {
          const fp = path.join(dir, f);
          fs.renameSync(fp, fp.replace('.processing', '.pending'));
        }
        fs.watch(dir); // trigger the watcher
        this.emit('ico:input:replay', { file: f, ts: Date.now() });
      }
    }

    return this;
  }

  // ── Status ────────────────────────────────────────────────────────────────

  status() {
    return {
      name:     this.name,
      root:     this.root,
      plugins:  [...this._plugins.values()].map(p => ({
        name: p.name, priority: p.priority, enabled: p.enabled,
        in: p._in, out: p._out, dropped: p._dropped,
      })).sort((a, b) => a.priority - b.priority),
      invariant: this.invariant.keys().length + ' keys',
      ledgers:   this.ledger.list(),
      snr: {
        signal: this._snrSignal,
        noise:  this._snrNoise,
        window: this._snrWindow.slice(-5),
      },
    };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createICO(opts = {}) {
  return new ICO(opts);
}

module.exports = { ICO, createICO, fingerprint, deltaScore, sigmaOf };
