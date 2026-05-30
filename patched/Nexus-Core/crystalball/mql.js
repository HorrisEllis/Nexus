// ═══════════════════════════════════════════════════
// NEXUS — Memory Query Layer
// crystalball/mql.js
// UUID: nexus-cb-mql-0000-4000-0000-000000000040
//
// Five-lane parallel retrieval. Scored. Compressed.
// Recall-traced. Ollama receives assembled intelligence,
// not a log dump.
//
// Lanes:
//   A — Lexical:  keyword entity index
//   B — Causal:   ancestors + descendants of anchor
//   C — Failure:  open failures + fix_map
//   D — BEP:      pattern library match
//   E — Recency:  ring buffer tail + session calls
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { tokenize, jaccardScore } = require('./bep-engine');
const { extractEntities }        = require('./lattice-bridge');

// ── Token budget ───────────────────────────────────
const TOKEN_BUDGET_CHARS = 48_000; // ~12K tokens

// ── Source weights ─────────────────────────────────
const SOURCE_WEIGHTS = {
  'failures':    1.50,
  'fix_map':     1.40,
  'bep_patterns':1.35,
  'agent_calls': 1.20,
  'crystals':    1.30,
  'gaps':        1.15,
  'event_log':   0.80,
};

// ── Lane weights ───────────────────────────────────
const LANE_WEIGHTS = { A: 0.70, B: 1.00, C: 0.95, D: 0.90, E: 0.85 };

// ── Intent classifier (local, no LLM) ─────────────
function classifyIntent(text) {
  const lower = text.toLowerCase();
  if (/\b(why|fail|error|broke|crash|exception|undefined)\b/.test(lower))
    return { mode: 'debug_failure',  lanes: ['B', 'C', 'E'] };
  if (/\b(fill|gap|implement|stub|missing|build)\b/.test(lower))
    return { mode: 'gap_fill',       lanes: ['A', 'D', 'E'] };
  if (/\b(continue|resume|last|session|where were)\b/.test(lower))
    return { mode: 'session_resume', lanes: ['E', 'B', 'A'] };
  if (/\b(caused|trace|chain|upstream|downstream)\b/.test(lower))
    return { mode: 'causal_trace',   lanes: ['B', 'C'] };
  if (/\b(pattern|bep|reuse|similar|like this)\b/.test(lower))
    return { mode: 'pattern_lookup', lanes: ['D', 'A'] };
  if (/\b(crystal|stable|learned|known)\b/.test(lower))
    return { mode: 'crystal_query',  lanes: ['A', 'B'] };
  return                                { mode: 'general',        lanes: ['A', 'B', 'D', 'E'] };
}

// ══════════════════════════════════════════════════
// MemoryQueryLayer
// ══════════════════════════════════════════════════
class MemoryQueryLayer {
  constructor({ jaaDB, nexusKernel, latticeBridge, bepEngine, mcl }) {
    this._jaa = jaaDB;
    this._nk  = nexusKernel;
    this._lb  = latticeBridge;
    this._bep = bepEngine;
    this._mcl = mcl;
  }

  // ── Main query entry ──────────────────────────────
  async query(input, sessionId = null) {
    const qi      = this._interpretQuery(input, sessionId);
    const startMs = Date.now();

    // Fire all active lanes in parallel
    const [lA, lB, lC, lD, lE, lCryst] = await Promise.all([
      qi.lanes.includes('A') ? this._laneA(qi)           : [],
      qi.lanes.includes('B') ? this._laneB(qi)           : [],
      qi.lanes.includes('C') ? this._laneC(qi)           : { failures: [], fixes: [] },
      qi.lanes.includes('D') ? this._laneD(qi)           : [],
      qi.lanes.includes('E') ? this._laneE(qi.sessionId) : { ringTail: [], calls: [] },
      this._laneCrystals(qi),   // always check stable crystals
    ]);

    // Flatten with lane tags
    const all = [
      ...lA.map(i => ({ ...i, _lane: 'A', _sourceTable: i._sourceTable ?? 'event_log' })),
      ...lB.map(i => ({ ...i, _lane: 'B' })),
      ...(lC.failures ?? []).map(i => ({ ...i, _lane: 'C', _sourceTable: 'failures' })),
      ...(lC.fixes    ?? []).map(i => ({ ...i, _lane: 'C', _sourceTable: 'fix_map' })),
      ...lD.map(i => ({ ...i, _lane: 'D', _sourceTable: 'bep_patterns' })),
      ...(lE.ringTail ?? []).map(i => ({ ...i, _lane: 'E', _sourceTable: 'event_log' })),
      ...(lE.calls    ?? []).map(i => ({ ...i, _lane: 'E', _sourceTable: 'agent_calls' })),
      ...lCryst.map(i => ({ ...i, _lane: 'X', _sourceTable: 'crystals', _crystalState: i.state })),
    ];

    const now     = Date.now();
    const scored  = all.map(i => ({ ...i, _score: this._scoreItem(i, qi, now) }))
                       .sort((a, b) => b._score - a._score);

    const compressed = compress(scored, TOKEN_BUDGET_CHARS);

    // Recall trace — enables citation in Ollama prompt
    const traceId = `mql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const trace = {
      uuid:          traceId,
      queryIntent:   qi.mode,
      wall:          now,
      latencyMs:     now - startMs,
      lanes_fired:   qi.lanes,
      retrieval_counts: {
        A: lA.length, B: lB.length,
        C: (lC.failures?.length ?? 0) + (lC.fixes?.length ?? 0),
        D: lD.length,
        E: (lE.ringTail?.length ?? 0) + (lE.calls?.length ?? 0),
        X: lCryst.length,
      },
      final_included: compressed.included.length,
      items_used:     compressed.included.map(i => ({
        id:    i.uuid ?? i.id,
        type:  i.type ?? i.eventType ?? i._sourceTable,
        lane:  i._lane,
        score: Math.round((i._score ?? 0) * 100) / 100,
      })),
      truncated: compressed.truncated,
    };

    await this._jaa.insert('memory_queries', trace).catch(e => this._nk.emit('crystalball.mql.write.error', { op: 'trace.insert', traceId: trace.uuid, error: e.message }));

    this._nk.emit('crystalball.memory.retrieved', {
      queryId:   traceId,
      itemCount: compressed.included.length,
      intent:    qi.mode,
      latencyMs: now - startMs,
    });

    return { sections: compressed.sections, trace };
  }

  // ── Lane A: Lexical (entity index) ────────────────
  async _laneA(qi) {
    const ids = new Set();
    for (const kw of qi.keywords) {
      this._lb.queryByKeyword(kw, 30).forEach(id => ids.add(id));
    }
    if (!ids.size) return [];
    const resolved = await this._jaa.query('event_log', r => ids.has(r.uuid ?? r.id), 50);
    return dedup(resolved);
  }

  // ── Lane B: Causal ────────────────────────────────
  async _laneB(qi) {
    let anchorId = qi.anchorId;
    if (!anchorId && qi.entities.length) {
      const hits = await this._jaa.query('event_log',
        r => qi.entities.some(e => JSON.stringify(r.payload ?? {}).includes(e.value)), 5);
      anchorId = hits[0]?.uuid ?? hits[0]?.id;
    }
    if (!anchorId) return [];

    const chain = this._lb.causalChain(anchorId, 5);
    const desc  = this._lb.causalDescendants(anchorId, 3);
    return dedup([...chain, ...desc].map((n, i) => ({ ...(n ?? {}), _causalDistance: i })));
  }

  // ── Lane C: Failures + fixes ──────────────────────
  async _laneC(qi) {
    const failures = await this._jaa.query('failures', r =>
      !r.resolved && qi.keywords.some(kw =>
        ((r.type ?? '') + (r.code ?? '') + JSON.stringify(r.payload ?? {}))
          .toLowerCase().includes(kw)), 20);

    const fixes = [];
    for (const f of failures) {
      const fm = await this._jaa.query('fix_map', r => r.recurrenceKey === f.recurrenceKey, 5);
      fixes.push(...fm);
    }
    return { failures, fixes };
  }

  // ── Lane D: BEP match ─────────────────────────────
  async _laneD(qi) {
    const match = await this._bep.match(qi.intent, {});
    return match?.pattern ? [{ ...match.pattern, _bepScore: match.score, _bepMode: match.mode }] : [];
  }

  // ── Lane E: Recency ───────────────────────────────
  async _laneE(sessionId) {
    const ringTail = this._nk.snapshot(20);
    const calls    = sessionId
      ? await this._jaa.query('agent_calls', r => r.sessionId === sessionId, 5)
      : [];
    return { ringTail, calls };
  }

  // ── Lane X: Stable crystals (always) ──────────────
  async _laneCrystals(qi) {
    const crystals = this._mcl.stableCrystals;
    // Filter to crystals with relevant keywords in their fields
    return crystals.filter(c => {
      const text = JSON.stringify(c.fields ?? {}).toLowerCase();
      return qi.keywords.some(kw => text.includes(kw));
    }).slice(0, 10);
  }

  // ── Item scorer ───────────────────────────────────
  _scoreItem(item, qi, now) {
    const tw    = SOURCE_WEIGHTS[item._sourceTable ?? 'event_log'] ?? 0.80;
    const ageH  = (now - (item.wall ?? item._ts ?? item.createdAt ?? now)) / 3_600_000;
    const decay = Math.exp(-0.1 * ageH);
    const acc   = Math.log1p(item.accessCount ?? item.useCount ?? item.occurrenceCount ?? 0)
                / Math.log1p(100);
    const text  = JSON.stringify(item).toLowerCase();
    const kw    = qi.keywords.length
      ? qi.keywords.filter(k => text.includes(k)).length / qi.keywords.length
      : 0.5;
    const prox  = item._causalDistance != null ? Math.max(0, 1 - item._causalDistance / 10) : 0;
    const lw    = LANE_WEIGHTS[item._lane ?? 'A'];
    // Protected items (open failures, stable crystals) get score floor
    const floor = (item._sourceTable === 'failures' && !item.resolved)
               || item._crystalState === 'stable' ? 0.60 : 0;
    const failP = (item._sourceTable === 'fix_map'
      && (item.failCount ?? 0) > (item.successCount ?? 0)) ? 0.4 : 1.0;

    return Math.max(floor,
      tw * decay * (kw * 0.30 + prox * 0.25 + acc * 0.20 + lw * 0.25) * failP
    );
  }

  // ── Query interpreter ─────────────────────────────
  _interpretQuery(input, sessionId) {
    const text     = typeof input === 'string' ? input : (input?.text ?? '');
    const { mode, lanes } = classifyIntent(text);
    return {
      mode,
      lanes,
      intent:    text,
      keywords:  tokenize(text),
      entities:  extractEntities({ query: text }, ''),
      sessionId: sessionId ?? (typeof input === 'object' ? input?.sessionId : null),
      anchorId:  typeof input === 'object' ? input?.anchorId : null,
    };
  }
}

// ── Compress to token budget ───────────────────────
function compress(scored, budgetChars) {
  const seen     = new Set();
  const deduped  = scored.filter(i => {
    const id = i.uuid ?? i.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const sections = {
    stable_crystals: [],
    causal_thread:   [],
    known_failures:  [],
    fix_strategies:  [],
    bep_matches:     [],
    recent_state:    [],
    related_events:  [],
  };

  const included = [];
  let used = 0;
  let truncated = false;

  const PROTECTED = i =>
    (i._sourceTable === 'failures' && !i.resolved)
    || i._sourceTable === 'fix_map'
    || i._crystalState === 'stable';

  for (const item of deduped) {
    const sz = JSON.stringify(item).length;
    if (used + sz > budgetChars && !PROTECTED(item)) {
      truncated = true;
      continue;
    }
    used += sz;
    included.push(item);

    // Strip internal fields before sending to Ollama
    const { _lane, _score, _causalDistance, _sourceTable, _crystalState,
            _bepScore, _bepMode, ...clean } = item;
    const s = { ...clean, _relevance: Math.round((_score ?? 0) * 100) / 100 };

    if (item._crystalState === 'stable')        sections.stable_crystals.push(s);
    else if (item._lane === 'B')                sections.causal_thread.push(s);
    else if (item._sourceTable === 'failures')  sections.known_failures.push(s);
    else if (item._sourceTable === 'fix_map')   sections.fix_strategies.push(s);
    else if (item._lane === 'D')                sections.bep_matches.push(s);
    else if (item._lane === 'E')                sections.recent_state.push(s);
    else                                        sections.related_events.push(s);
  }

  return { sections, included, truncated, usedChars: used };
}

// ── Dedup by uuid/id ──────────────────────────────
function dedup(arr) {
  const seen = new Set();
  return arr.filter(i => {
    const id = i?.uuid ?? i?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

module.exports = { MemoryQueryLayer, classifyIntent };
