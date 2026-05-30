// ═══════════════════════════════════════════════════
// NEXUS — Fix-Map Accumulator
// memory/fix-map.js
//
// Maps failure → fix with confidence EMA.
// Healer records every fix attempt here.
// MQL Lane C reads open failures + fix strategies.
//
// DESIGN:
//   Key = recurrenceKey (deterministic from failure
//         type + path + payload fingerprint).
//   Each key accumulates: successCount, failCount,
//   confidence (EMA), lastFix, allFixes[].
//
//   Confidence rises on success, falls on failure.
//   Below 0.3 → fix_map entry marked 'unreliable'.
//   Above 0.7 → entry promoted to 'proven'.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid }   = require('./jaa-db');
const crypto    = require('crypto');

const ema = (cur, val, a = 0.20) => cur == null ? val : cur * (1 - a) + val * a;

// ── Deterministic recurrence key ──────────────────
function recurrenceKey(failure) {
  const sig = JSON.stringify({
    type:  failure.type  ?? '',
    path:  failure.path  ?? '',
    code:  failure.code  ?? '',
    agent: failure.agentId ?? '',
  });
  return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 16);
}

class FixMap {
  constructor({ jaaDB, nexusKernel }) {
    this._jaa   = jaaDB;
    this._nk    = nexusKernel;
    this._map   = new Map();  // recurrenceKey → entry
    this._dirty = new Set();
  }

  // ── Wire to healer events ─────────────────────────
  attach() {
    // New failure → open an entry
    this._nk.on('gap.found', e => this._onFailure(e.payload, e.id));
    this._nk.on('gate.failed', e => this._onFailure(e.payload, e.id));

    // Healer resolved → record fix
    this._nk.on('healer.resolved', e => {
      const { gap, gapId } = e.payload;
      if (gap) this._onFixed(gap, e.payload.fixSpec, e.id);
    });

    // Healer exhausted → mark unresolvable
    this._nk.on('healer.exhausted', e => {
      const { gap } = e.payload;
      if (gap) this._onExhausted(gap, e.id);
    });

    this._nk.emit('fix_map.ready', {});
  }

  async _onFailure(payload, causedBy) {
    const key = recurrenceKey(payload);
    const existing = await this._load(key);

    const entry = existing ?? {
      uuid:          uid(),
      recurrenceKey: key,
      failureType:   payload.type  ?? 'unknown',
      failurePath:   payload.path  ?? '',
      agentId:       payload.agentId ?? null,
      severity:      payload.severity ?? 'medium',
      firstSeenAt:   Date.now(),
      lastSeenAt:    Date.now(),
      occurrenceCount: 0,
      successCount:  0,
      failCount:     0,
      confidence:    0.5,
      status:        'open',
      fixes:         [],
    };

    entry.occurrenceCount++;
    entry.lastSeenAt = Date.now();
    entry.status     = 'open';

    this._map.set(key, entry);
    this._dirty.add(key);
    this._scheduledFlush();
  }

  async _onFixed(gap, fixSpec, causedBy) {
    const key   = recurrenceKey(gap);
    const entry = await this._load(key) ?? await this._onFailure(gap, causedBy) ?? this._map.get(key);
    if (!entry) return;

    entry.successCount++;
    entry.confidence = ema(entry.confidence, 1);
    entry.status     = entry.confidence > 0.7 ? 'proven' : 'resolved';
    entry.lastFixAt  = Date.now();

    if (fixSpec) {
      entry.fixes.push({
        uuid:      uid(),
        fixSpec,
        success:   true,
        ts:        Date.now(),
        causedBy,
      });
      // Keep only last 10 fixes
      if (entry.fixes.length > 10) entry.fixes = entry.fixes.slice(-10);
    }

    this._map.set(key, entry);
    this._dirty.add(key);
    this._scheduledFlush();

    this._nk.emit('fix_map.confidence_updated', {
      recurrenceKey: key,
      confidence:    entry.confidence,
      status:        entry.status,
    });
  }

  async _onExhausted(gap, causedBy) {
    const key   = recurrenceKey(gap);
    const entry = this._map.get(key);
    if (!entry) return;
    entry.failCount++;
    entry.confidence = ema(entry.confidence, 0);
    entry.status     = entry.confidence < 0.3 ? 'unreliable' : 'open';
    this._dirty.add(key);
    this._scheduledFlush();
  }

  async _load(key) {
    if (this._map.has(key)) return this._map.get(key);
    const rows = await this._jaa.query('fix_map', r => r.recurrenceKey === key, 1);
    if (rows.length) { this._map.set(key, rows[0]); return rows[0]; }
    return null;
  }

  _scheduledFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(async () => {
      this._flushTimer = null;
      for (const key of [...this._dirty]) {
        const e = this._map.get(key);
        if (e) await this._jaa.insert('fix_map', e).catch(err => this._nk.emit('memory.fixmap.write.error', { op: 'entry.flush', error: err.message }));
      }
      this._dirty.clear();
    }, 2000);
  }

  // ── Query API (for MQL Lane C) ────────────────────
  async openFailures(limit = 20) {
    return this._jaa.query('fix_map', r => r.status === 'open', limit);
  }

  async provenFixes(limit = 10) {
    return this._jaa.query('fix_map', r => r.status === 'proven', limit);
  }

  async forGap(gap) {
    return this._load(recurrenceKey(gap));
  }

  get stats() {
    const all = [...this._map.values()];
    return {
      total:      all.length,
      open:       all.filter(e => e.status === 'open').length,
      resolved:   all.filter(e => e.status === 'resolved').length,
      proven:     all.filter(e => e.status === 'proven').length,
      unreliable: all.filter(e => e.status === 'unreliable').length,
    };
  }
}

module.exports = { FixMap, recurrenceKey };
