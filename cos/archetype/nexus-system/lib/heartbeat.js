'use strict';
// lib/heartbeat.js — the system's pulse: every interval, <system>.heartbeat with its uptime, each node type's count
// and the problems the index refused. An index behind its files shows here as drift.
class Heartbeat {
  constructor({ system, index, bus, intervalMs = 30000 }) {
    Object.assign(this, { system, index, bus, intervalMs });
    this.startedAt = Date.now(); this.beats = 0; this.timer = null;
  }

  snapshot() {
    return { system: this.system, ok: !this.index.problems.length, uptimeMs: Date.now() - this.startedAt, beats: this.beats,
      counts: this.index.counts(), problems: this.index.problems.slice(0, 20) };
  }

  beat() { this.beats++; const s = this.snapshot(); this.bus.emit(`${this.system}.heartbeat`, s); return s; }

  start() { if (!this.timer && this.intervalMs > 0) { this.timer = setInterval(() => this.beat(), this.intervalMs); this.timer.unref(); } return this; }

  stop() { clearInterval(this.timer); this.timer = null; }
}

module.exports = { Heartbeat };
