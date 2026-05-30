// ═══════════════════════════════════════════════════
// NEXUS — Feedback Weighter
// memory/feedback-weighter.js
//
// Human-in-the-loop ratings → retrieval weight updates.
//
// DESIGN OVER ALTERNATIVES:
//   A global rating store that agents poll would break
//   Law III (direct calls). Instead: ratings arrive on
//   the bus as feedback.submitted events. Each rated
//   item carries a traceId that links back to the MQL
//   recall trace, so every piece of retrieved context
//   that contributed to a good (or bad) output gets
//   reinforced (or penalised).
//
//   This closes the loop: good memory recall → better
//   output → positive feedback → those memories surface
//   higher next time. Bad recall → negative feedback →
//   deprioritised. Self-improving without training.
//
//   Weight update: EMA(alpha=0.25) on retrievalWeight
//   field per JaaDB record. MQL scorer reads this field
//   as a multiplier on top of the decay/recency formula.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid } = require('./jaa-db');

const ema = (cur, val, a = 0.25) => cur == null ? val : cur * (1 - a) + val * a;

// Score normalisation: 1–10 rating → 0.0–1.0 signal
const normalise = score => Math.max(0, Math.min(1, (score - 1) / 9));

class FeedbackWeighter {
  constructor({ jaaDB, nexusKernel }) {
    this._jaa  = jaaDB;
    this._nk   = nexusKernel;
    this._log  = [];   // in-memory recent history
  }

  attach() {
    // Primary trigger: human submits a rating
    this._nk.on('feedback.submitted', e => this._onFeedback(e));

    // Implicit feedback: gate pass after a recall = weak positive
    this._nk.on('gate.passed', e => {
      if (e.payload.recallTraceId) {
        this._applyWeightDelta(e.payload.recallTraceId, 0.65, 'gate_pass');
      }
    });

    // Gate fail after recall = weak negative
    this._nk.on('gate.failed', e => {
      if (e.payload.recallTraceId) {
        this._applyWeightDelta(e.payload.recallTraceId, 0.35, 'gate_fail');
      }
    });

    this._nk.emit('feedback_weighter.ready', {});
  }

  async _onFeedback(event) {
    const { traceId, score, comment, agentId, callId } = event.payload ?? {};
    if (!score || score < 1 || score > 10) return;

    const signal = normalise(score);

    // Persist feedback score
    await this._jaa.insert('feedback_scores', {
      uuid:      uid(),
      traceId,
      agentId,
      callId,
      score,
      signal,
      comment:   comment ?? '',
      wall:      Date.now(),
      causedBy:  event.id,
    }).catch(e => this._nk.emit('memory.feedback.write.error', { op: 'rating.store', error: e.message }));

    // Propagate weight delta to recalled items
    if (traceId) {
      await this._applyWeightDelta(traceId, signal, 'hitl');
    }

    // Update agent self-model with HITL signal
    if (agentId) {
      this._nk.emit('ase.hitl.signal', {
        agentId,
        signal,
        score,
        traceId,
      });
    }

    this._log.unshift({ traceId, score, signal, wall: Date.now() });
    if (this._log.length > 200) this._log.pop();

    this._nk.emit('feedback_weighter.applied', {
      traceId,
      score,
      signal,
      agentId,
    }, { causedBy: event.id });
  }

  async _applyWeightDelta(traceId, signal, source) {
    // Look up which items were used in this recall trace
    const traces = await this._jaa.query('memory_queries', r => r.uuid === traceId, 1);
    if (!traces.length) return;

    const trace = traces[0];
    const items = trace.items_used ?? [];

    for (const item of items) {
      // Update retrievalWeight on the source record
      await this._updateItemWeight(item, signal, source);
    }
  }

  async _updateItemWeight(item, signal, source) {
    const { id, type } = item;
    if (!id || !type) return;

    // Map item type → JaaDB table
    const tableMap = {
      bep_patterns: 'bep_patterns',
      crystals:     'crystals',
      failures:     'failures',
      fix_map:      'fix_map',
      event_log:    'event_log',
      agent_calls:  'agent_calls',
    };
    const table = tableMap[type] ?? 'event_log';

    const records = await this._jaa.query(table, r => (r.uuid ?? r.id) === id, 1);
    if (!records.length) return;

    const rec = records[0];
    const currentWeight = rec.retrievalWeight ?? 0.50;
    const newWeight     = ema(currentWeight, signal);

    await this._jaa.update(table, id, { retrievalWeight: newWeight })
      .catch(() => {
        // update requires uuid — fall back to insert with merged record
        this._jaa.insert(table, { ...rec, retrievalWeight: newWeight }).catch(e => this._nk.emit('memory.feedback.write.error', { op: 'weight.update', table, error: e.message }));
      });
  }

  // ── Stats for admin panel ─────────────────────────
  get recentFeedback() { return this._log.slice(0, 20); }

  async avgScore(last = 50) {
    const rows = await this._jaa.query('feedback_scores', () => true, last);
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + r.score, 0) / rows.length;
  }
}

module.exports = { FeedbackWeighter };
