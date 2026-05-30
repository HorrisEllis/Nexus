// ═══════════════════════════════════════════════════
// NEXUS — Intent Learner
// core/translation/learner.js
//
// Same Resonance/TrajectoryStore pattern as RAID learner,
// applied to human intent instead of agent capability.
//
// Builds IntentSignature per session:
//   - Which terms this user uses ambiguously
//   - Which concepts they consistently express clearly
//   - Vocabulary drift over time
//   - Alignment score trajectory
// ═══════════════════════════════════════════════════

'use strict';

const { kernel } = require('../../foundation/kernel');

const EMA_ALPHA = 0.2; // faster adaptation for user context

class IntentSignature {
  constructor(sessionId) {
    this.sessionId   = sessionId;
    this.sampleSize  = 0;
    this.updatedAt   = null;

    // Stable core — what this user reliably communicates
    this.core = {
      avgAlignmentScore: null,  // EMA of alignment scores over session
      avgGapsPerInput:   null,  // EMA of gap count
      avgClarityRatio:   null,  // confident concepts / total concepts
      preferredDomain:   null,  // most frequent domain
    };

    // Vocabulary: terms this user uses and how unambiguously
    this.vocabulary = new Map();
    // term → { count, avgAmbiguity, lastSeen, resolvedTo }

    // Fingerprint: what makes this user's communication unique
    this.fingerprint = {
      highClarityTerms:  [],  // terms they always use precisely
      lowClarityTerms:   [],  // terms they consistently use ambiguously
      dominantDomain:    null,
      prefersConcise:    null, // true if input length < 50 chars typically
      typicalInputLen:   null,
    };

    // Drift: is this user's communication improving or degrading?
    this.drift = {
      magnitude:      0,
      direction:      [],  // 'clarity_improving', 'ambiguity_increasing'
      isShifting:     false,
      lastShiftAt:    null,
    };

    // Domain frequency
    this._domainFreq = {};

    // History for drift detection
    this._history = {
      alignmentScores: [],
      gapCounts:       [],
      inputLengths:    [],
    };
  }

  record(obs) {
    const { input, normalized, gaps, alignmentScore } = obs;
    this.sampleSize++;
    this.updatedAt = Date.now();

    // EMA updates
    this.core.avgAlignmentScore = this._ema(this.core.avgAlignmentScore, alignmentScore);
    this.core.avgGapsPerInput   = this._ema(this.core.avgGapsPerInput,   gaps.length);

    const total     = normalized.concepts?.length || 1;
    const confident = (normalized.concepts || []).filter(c => !c.ambiguous).length;
    this.core.avgClarityRatio = this._ema(this.core.avgClarityRatio, confident / total);

    // Domain frequency
    const domain = normalized.domain || 'general';
    this._domainFreq[domain] = (this._domainFreq[domain] || 0) + 1;
    this.core.preferredDomain = Object.entries(this._domainFreq)
      .sort((a,b) => b[1] - a[1])[0]?.[0] || null;

    // Vocabulary update
    for (const concept of (normalized.concepts || [])) {
      const entry = this.vocabulary.get(concept.term) || { count:0, avgAmbiguity:0, lastSeen:null, resolvedTo:null };
      entry.count++;
      entry.avgAmbiguity  = this._ema(entry.avgAmbiguity, concept.ambiguous ? 1 : 0);
      entry.lastSeen      = Date.now();
      entry.resolvedTo    = concept.resolves;
      this.vocabulary.set(concept.term, entry);
    }

    // History
    this._history.alignmentScores.push(alignmentScore);
    this._history.gapCounts.push(gaps.length);
    this._history.inputLengths.push(input.length);
    Object.values(this._history).forEach(a => { if (a.length > 50) a.shift(); });

    this._detectDrift();
    this._updateFingerprint();
  }

  _ema(current, val) {
    if (current == null) return val;
    return current * (1 - EMA_ALPHA) + val * EMA_ALPHA;
  }

  _detectDrift() {
    const scores = this._history.alignmentScores;
    if (scores.length < 10) return;

    const recent = scores.slice(-5);
    const prior  = scores.slice(-10, -5);
    const rMean  = recent.reduce((a,b) => a+b,0) / 5;
    const pMean  = prior.reduce((a,b) => a+b,0) / 5;
    const delta  = rMean - pMean;
    const magnitude = Math.min(1, Math.abs(delta) * 3);

    const direction = [];
    if (delta > 0.05)  direction.push('clarity_improving');
    if (delta < -0.05) direction.push('ambiguity_increasing');

    const wasShifting = this.drift.isShifting;
    this.drift = {
      magnitude,
      direction,
      isShifting:  magnitude > 0.08,
      lastShiftAt: magnitude > 0.08 && !wasShifting ? Date.now() : this.drift.lastShiftAt,
    };

    if (this.drift.isShifting) {
      kernel.emit('translation.drift.detected', {
        sessionId:  this.sessionId,
        magnitude,
        direction,
        recentScore: rMean,
        priorScore:  pMean,
      });
    }
  }

  _updateFingerprint() {
    const entries = [...this.vocabulary.entries()];

    this.fingerprint.highClarityTerms = entries
      .filter(([,v]) => v.avgAmbiguity < 0.1 && v.count > 2)
      .map(([term]) => term);

    this.fingerprint.lowClarityTerms = entries
      .filter(([,v]) => v.avgAmbiguity > 0.7 && v.count > 1)
      .map(([term]) => term);

    this.fingerprint.dominantDomain  = this.core.preferredDomain;

    const lengths = this._history.inputLengths;
    if (lengths.length) {
      const avg = lengths.reduce((a,b) => a+b,0) / lengths.length;
      this.fingerprint.prefersConcise  = avg < 60;
      this.fingerprint.typicalInputLen = Math.round(avg);
    }
  }

  // Get disambiguation hint for a term based on past usage
  disambiguationHint(term) {
    const entry = this.vocabulary.get(term);
    if (!entry) return null;
    if (entry.avgAmbiguity < 0.2) {
      return { confident: true, likelyMeans: entry.resolvedTo };
    }
    return { confident: false, ambiguityRate: entry.avgAmbiguity };
  }

  toJSON() {
    return {
      sessionId:   this.sessionId,
      sampleSize:  this.sampleSize,
      updatedAt:   this.updatedAt,
      core:        this.core,
      fingerprint: this.fingerprint,
      drift:       this.drift,
      vocabulary:  Object.fromEntries(
        [...this.vocabulary.entries()].filter(([,v]) => v.count > 1)
      ),
    };
  }
}

class IntentLearner {
  constructor() {
    this._signatures = new Map();
  }

  record(sessionId, obs) {
    if (!this._signatures.has(sessionId)) {
      this._signatures.set(sessionId, new IntentSignature(sessionId));
    }
    this._signatures.get(sessionId).record(obs);
    kernel.emit('translation.learner.updated', {
      sessionId,
      sampleSize: this._signatures.get(sessionId).sampleSize,
      score:      obs.alignmentScore,
    });
  }

  signature(sessionId) {
    return this._signatures.get(sessionId)?.toJSON() || null;
  }

  // What questions should we ask this user proactively?
  // Based on their history of ambiguous terms
  proactiveQuestions(sessionId, ir) {
    const sig = this._signatures.get(sessionId);
    if (!sig) return [];

    return ir.needsClarification
      .filter(term => {
        const hint = sig.disambiguationHint(term);
        // If this user has used this term before and it was ambiguous, prioritize asking
        return !hint || !hint.confident;
      })
      .map(term => {
        const hint = sig.disambiguationHint(term);
        return {
          term,
          priority:  hint ? 'high' : 'medium',
          history:   hint,
        };
      });
  }

  allSignatures() {
    return Object.fromEntries(
      [...this._signatures.entries()].map(([id, s]) => [id, s.toJSON()])
    );
  }
}

module.exports = { IntentLearner, IntentSignature };
