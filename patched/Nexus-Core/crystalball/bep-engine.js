// ═══════════════════════════════════════════════════
// NEXUS — Behavioral Execution Pattern Engine
// crystalball/bep-engine.js
// UUID: nexus-cb-bep-0000-4000-0000-000000000020
//
// BEP is code memory. Adapted from CrystalBall's
// behavioral detection engine. Same composable
// detector architecture. Different domain.
//
// NOVEL OVER PLAIN CACHING:
//   Patterns carry not just input/output but a
//   behaviorGraph — the ordered invariant-checked
//   sequence of steps that made the output work.
//   Reuse = skip Ollama entirely.
//   Mutation = send only the delta to Ollama.
//   Partial = send the behaviorGraph as scaffold.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid } = require('../memory/jaa-db');

// ── EMA (Exponential Moving Average) ──────────────
const ema = (cur, val, a = 0.20) => cur == null ? val : cur * (1 - a) + val * a;

// ── FNV-1a hash (fast, no crypto dep needed) ──────
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── Tokenizer ─────────────────────────────────────
function tokenize(s) {
  return (s || '').toLowerCase()
    .split(/\W+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  'the','and','for','are','was','not','but','from','have',
  'this','that','with','will','been','has','had','its',
]);

// ── Jaccard similarity ─────────────────────────────
function jaccardScore(tokensA, tokensB) {
  const sa = new Set(tokensA);
  const sb = new Set(tokensB);
  const inter = [...sa].filter(x => sb.has(x)).length;
  return inter / (sa.size + sb.size - inter || 1);
}

// ══════════════════════════════════════════════════
// BEPEngine
// ══════════════════════════════════════════════════
class BEPEngine {
  constructor({ jaaDB, nexusKernel }) {
    this._jaa   = jaaDB;
    this._nk    = nexusKernel;
    this._cache = new Map(); // uuid → pattern (warm cache)
    this._dirty = new Set(); // uuids that need flushing
  }

  // ── Match: called before every Ollama request ───
  // Returns { mode, pattern, score } or null
  async match(intent, inputContract = {}) {
    // Step 1: Exact hash match → reuse immediately
    const exactKey = fnv1a(intent + JSON.stringify(inputContract));
    const exact    = await this._jaa.query('bep_patterns',
      r => r.intentHash === exactKey, 1);

    if (exact.length && exact[0].metrics.regressionCount <= 3) {
      this._updateAccess(exact[0]);
      this._nk.emit('crystalball.bep.matched', {
        patternId: exact[0].uuid, score: 1.0, reuseMode: 'reuse',
      });
      return { mode: 'reuse', pattern: exact[0], score: 1.0 };
    }

    // Step 2: Jaccard similarity over intent tokens + tags
    const allPatterns = [...this._cache.values()].filter(
      p => p.metrics.successRate > 0.5 && p.metrics.useCount > 2
        && p.metrics.regressionCount <= 3
    );

    // Also pull from JaaDB if cache is cold
    if (allPatterns.length < 5) {
      const fromDB = await this._jaa.query('bep_patterns',
        r => r.metrics?.successRate > 0.5 && r.metrics?.useCount > 2, 200);
      fromDB.forEach(p => { if (!this._cache.has(p.uuid)) this._cache.set(p.uuid, p); });
      allPatterns.push(...fromDB.filter(p => !allPatterns.find(a => a.uuid === p.uuid)));
    }

    const intentTokens = tokenize(intent);
    const scored = allPatterns.map(p => {
      const patternText = p.intent + ' ' + (p.tags ?? []).join(' ')
        + ' ' + (p.layer ?? '') + ' ' + (p.constraints ?? []).join(' ');
      return { ...p, _score: jaccardScore(tokenize(patternText), intentTokens) };
    }).filter(p => p._score > 0.25).sort((a, b) => b._score - a._score);

    if (!scored.length) return null;

    const best = scored[0];
    if (best.metrics.regressionCount > 3) {
      this._nk.emit('crystalball.bep.degraded_skip', { patternId: best.uuid });
      return null;
    }

    const mode = best._score > 0.75 ? 'mutation'
               : best._score > 0.40 ? 'partial'
               : null;

    if (!mode) return null;

    this._updateAccess(best);
    this._nk.emit('crystalball.bep.matched', {
      patternId: best.uuid, score: best._score, reuseMode: mode,
    });
    return { mode, pattern: best, score: best._score };
  }

  // ── Store a new pattern ──────────────────────────
  async store(pattern) {
    const p = {
      uuid:          pattern.uuid || uid(),
      version:       pattern.version || 1,
      intent:        pattern.intent,
      intentHash:    fnv1a((pattern.intent || '') + JSON.stringify(pattern.inputContract ?? {})),
      tags:          pattern.tags ?? [],
      layer:         pattern.layer ?? 'gate',
      inputContract: pattern.inputContract ?? {},
      outputContract:pattern.outputContract ?? {},
      behaviorGraph: pattern.behaviorGraph ?? { steps: [], invariants: [] },
      constraints:   pattern.constraints ?? [],
      failureModes:  pattern.failureModes ?? [],
      implementations: pattern.implementations ?? [],
      metrics: {
        useCount:        0,
        successRate:     0,
        avgLatencyMs:    0,
        regressionCount: 0,
        lastUsed:        null,
        ...(pattern.metrics ?? {}),
      },
      createdAt: pattern.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    await this._jaa.insert('bep_patterns', p);
    this._cache.set(p.uuid, p);
    this._nk.emit('crystalball.bep.stored', {
      patternId: p.uuid, intent: p.intent, version: p.version,
    });
    return p;
  }

  // ── Post-gate EMA update ─────────────────────────
  async onGateResult(patternId, passed, latencyMs = 0) {
    const p = this._cache.get(patternId)
      ?? (await this._jaa.query('bep_patterns', r => r.uuid === patternId, 1))[0];
    if (!p) return;

    p.metrics.successRate   = ema(p.metrics.successRate,  passed ? 1 : 0);
    p.metrics.avgLatencyMs  = ema(p.metrics.avgLatencyMs, latencyMs);
    p.metrics.useCount     += 1;
    p.metrics.lastUsed      = Date.now();
    if (!passed) {
      p.metrics.regressionCount += 1;
      if (p.metrics.regressionCount > 3)
        this._nk.emit('crystalball.bep.degrading', {
          patternId, regressionCount: p.metrics.regressionCount,
        });
    }
    p.updatedAt = Date.now();

    // Throttled flush — don't write on every gate event
    this._dirty.add(patternId);
    this._scheduledFlush();
    this._cache.set(p.uuid, p);
  }

  // ── Batch flush dirty patterns to JaaDB ─────────
  _scheduledFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(async () => {
      this._flushTimer = null;
      const batch = [...this._dirty];
      this._dirty.clear();
      for (const id of batch) {
        const p = this._cache.get(id);
        if (p) await this._jaa.insert('bep_patterns', p).catch(e => this._nk.emit('crystalball.bep.write.error', { op: 'pattern.update', patternId: p.uuid, error: e.message }));
      }
    }, 2000); // 2s debounce
  }

  _updateAccess(p) {
    p.metrics.useCount++;
    p.metrics.lastUsed = Date.now();
    this._dirty.add(p.uuid);
    this._scheduledFlush();
  }

  // ── Detectors (composable, same arch as CB) ──────
  // These run during store() to classify pattern quality

  static detectConstraintEscape(code) {
    // Analogous to CB's "hedge density detector"
    // Finds if generated code escapes its lineRange/import constraints
    const escapePatterns = [
      /require\s*\(\s*['"][^'"]+['"]\s*\)/g,  // unexpected require
      /import\s+.*from\s+['"][^'"]+['"]/g,     // unexpected import
      /process\.exit/g,                         // process control
      /eval\s*\(/g,                             // eval escape
    ];
    let count = 0;
    for (const pat of escapePatterns) {
      count += (code.match(pat) || []).length;
    }
    return count;
  }

  static detectScopeCreep(generatedLines, allowedLines) {
    // Analogous to CB's "shadow field detection"
    // If output exceeded allowed line range
    return generatedLines > allowedLines * 1.2;
  }

  get patternCount()  { return this._cache.size; }
  get topPatterns()   {
    return [...this._cache.values()]
      .sort((a, b) => b.metrics.successRate - a.metrics.successRate)
      .slice(0, 20);
  }
}

module.exports = { BEPEngine, fnv1a, tokenize, jaccardScore };
