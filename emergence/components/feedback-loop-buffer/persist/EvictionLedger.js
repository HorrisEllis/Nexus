'use strict';
/**
 * EvictionLedger — append-only NDJSON record of every eviction.
 *
 * WARP's own StreamLog already records every dispatch step (gate claimed,
 * axiom result) — but its entry shape is generic (§ generic across all
 * WARP consumers, by design). This ledger is the ring buffer's own
 * domain-specific record of *what value left the buffer and when*, which
 * StreamLog deliberately doesn't know about. Two ledgers, two owners
 * (§17.1): StreamLog owns dispatch history, this owns eviction history.
 *
 * Wired via Stream.on('ring:evicted', ...) — an observer, not a second
 * Gate, so it can never collide with the registered ring:push Gate
 * (§14.3 signature collision is a hard error) and can never block or
 * mutate the pipeline (§1.2-equivalent guarantee Stream.on() already
 * gives every observer).
 */

const fs = require('fs');
const path = require('path');

class EvictionLedger {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  /** Attach to a live WARP Stream. Call once per stream. */
  attach(stream) {
    stream.on('ring:evicted', (event) => {
      this.append({ value: event.data.value, index: event.data.index, ts: event.ts, uuid: event.uuid });
    });
  }

  append(entry) {
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
  }

  /** Last n eviction entries, oldest-first within the window. */
  tail(n = 50) {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  }

  count() {
    if (!fs.existsSync(this.filePath)) return 0;
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    return raw ? raw.split('\n').filter(Boolean).length : 0;
  }
}

module.exports = { EvictionLedger };
