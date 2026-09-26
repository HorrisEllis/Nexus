'use strict';
// ── Liminal meta-layer integration ────────────────────────────────────────────
// Extends gap detection with Liminal's 12 domain detectors.
// Falls back gracefully if meta layer not available.
let _liminal = null;
function _getLiminal() {
  if (_liminal !== null) return _liminal;
  try { _liminal = require('../liminal/index.js'); } catch(_) { _liminal = false; }
  return _liminal;
}
const { weakestLink, bottleneck } = require('../../meta/confidence.js');
/**
 * guardian/lib/gap-hunter.js — GapHunter v3
 * UUID: guardian-gap-hunter-v1-0000-4000-0000-000000000001
 *
 * Ported from userscript v8.3. Runs server-side so gap analysis
 * is persisted in JAA and visible in Forge Brain.
 *
 * Full gap taxonomy: 8 types × multiple domains × multiple reasons.
 * Applied to every completed AI response.
 */

const GAP_TYPE = Object.freeze({
  LOGICAL:'logical', EVIDENTIAL:'evidential', TEMPORAL:'temporal',
  DEFINITIONAL:'definitional', REFERENCE:'reference', OBLIGATION:'obligation',
  ASSUMPTION:'assumption', CONTRADICTION:'contradiction',
});

const GAP_REASON = Object.freeze({
  COMPRESSION:'compression', AVOIDANCE:'avoidance',
  COMPATIBILITY:'compatibility', ATTENTION:'attention',
  EMOTIONAL_OCCLUSION:'emotional_occlusion', DEFERRED_VARIABLE:'deferred_variable',
  STRUCTURAL_LIMIT:'structural_limit', IDENTITY_REFLECTION:'identity_reflection',
});

const DOMAIN = Object.freeze({
  CODE:'code', AI_ML:'ai_ml', SOFTWARE_ARCH:'software_arch',
  EPISTEMOLOGICAL:'epistemological', LOGIC:'logic', COMMUNICATION:'communication',
  LANG_JS:'lang_javascript', LANG_TS:'lang_typescript', LANG_PYTHON:'lang_python',
  SECURITY:'security', DATABASE:'database', API_DESIGN:'api_design',
  SYSTEM_DESIGN:'system_design',
});

/**
 * Analyze a response text for structural gaps.
 * Returns gap[] each with: type, domain, reason, description, score [0,1], evidence
 */
function analyze(text, opts = {}) {
  const gaps = [];
  if (!text || text.length < 50) return gaps;

  const minScore = opts.minScore ?? 0.25;
  const lines    = text.split('\n');
  const words    = text.toLowerCase().match(/\b\w+\b/g) || [];
  const wc       = words.length;

  // Bullet density
  const bd = lines.filter(l => /^\s*[-*•]|\d+\./.test(l)).length / Math.max(1, lines.length);
  if (bd > 0.5) {
    const s = Math.min(0.95, bd);
    if (s >= minScore) gaps.push({
      type: GAP_TYPE.ASSUMPTION, domain: DOMAIN.COMMUNICATION,
      reason: GAP_REASON.COMPRESSION,
      description: `High bullet density ${(bd*100).toFixed(0)}% — reasoning compressed, assumptions hidden`,
      score: s, evidence: { metric: bd, pattern: 'bullet_density' },
    });
  }

  // Lexical diversity
  const ld = wc > 5 ? new Set(words).size / wc : 1;
  if (ld < 0.35) {
    const s = Math.min(0.9, 1 - ld);
    if (s >= minScore) gaps.push({
      type: GAP_TYPE.OBLIGATION, domain: DOMAIN.COMMUNICATION,
      reason: GAP_REASON.STRUCTURAL_LIMIT,
      description: `Low lexical diversity (${ld}) — formulaic or repetitive phrasing`,
      score: s, evidence: { metric: ld, pattern: 'lexical_diversity' },
    });
  }

  // Shannon entropy
  const freq = {};
  for (const ch of text) freq[ch] = (freq[ch] || 0) + 1;
  let H = 0;
  for (const f of Object.values(freq)) { const p = f / text.length; H -= p * Math.log2(p); }
  H = parseFloat(H.toFixed(3));
  if (H < 3.2 && wc > 80) {
    const s = parseFloat(((4 - H) / 4).toFixed(3));
    if (s >= minScore) gaps.push({
      type: GAP_TYPE.TEMPORAL, domain: DOMAIN.AI_ML,
      reason: GAP_REASON.COMPRESSION,
      description: `Low entropy H=${H} — pre-planned or template content`,
      score: s, evidence: { metric: H, pattern: 'entropy' },
    });
  }

  // Hedge density
  const hedges = (text.match(/\b(might|may|could|perhaps|possibly|seems|appears|likely|probably|generally|often|sometimes|usually|arguably|potentially)\b/gi) || []).length;
  const hedgeRate = wc > 0 ? hedges / wc : 0;
  if (hedgeRate > 0.04) {
    const s = Math.min(0.85, hedgeRate * 10);
    if (s >= minScore) gaps.push({
      type: GAP_TYPE.ASSUMPTION, domain: DOMAIN.EPISTEMOLOGICAL,
      reason: GAP_REASON.AVOIDANCE,
      description: `High hedge density (${(hedgeRate*100).toFixed(1)}%) — epistemic evasion`,
      score: s, evidence: { metric: hedgeRate, pattern: 'hedge_rate' },
    });
  }

  // Truncation
  const lastLine = lines[lines.length - 1]?.trim() || '';
  if (wc > 200 && (lastLine.endsWith('...') || lastLine.endsWith('etc.') || lastLine.length < 12)) {
    gaps.push({
      type: GAP_TYPE.OBLIGATION, domain: DOMAIN.COMMUNICATION,
      reason: GAP_REASON.STRUCTURAL_LIMIT,
      description: 'Possible truncation — context window pressure',
      score: 0.75, evidence: { pattern: 'truncation' },
    });
  }

  // Code quality gaps
  if (text.includes('```') || text.includes('function ') || text.includes('const ')) {
    const todos = (text.match(/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/g) || []).length;
    if (todos > 0) gaps.push({
      type: GAP_TYPE.OBLIGATION, domain: DOMAIN.CODE,
      reason: GAP_REASON.DEFERRED_VARIABLE,
      description: `${todos} TODO/FIXME — §1.3 stub violation`,
      score: Math.min(0.9, 0.3 + todos * 0.15),
      evidence: { metric: todos, pattern: 'todo_count' },
    });

    const stubs = (text.match(/\/\/ stub|pass\s*$|throw new Error\(['"]not implemented/gim) || []).length;
    if (stubs > 0) gaps.push({
      type: GAP_TYPE.OBLIGATION, domain: DOMAIN.CODE,
      reason: GAP_REASON.DEFERRED_VARIABLE,
      description: `${stubs} stub/unimplemented — §1.3 violation`,
      score: 0.85, evidence: { metric: stubs, pattern: 'stubs' },
    });
  }

  // High assertion rate
  const asserts = (text.match(/\b(always|never|all|every|definitely|certainly|obviously|clearly)\b/gi) || []).length;
  const assertRate = wc > 0 ? asserts / wc : 0;
  if (assertRate > 0.02 && hedgeRate < 0.01 && wc > 100) {
    const s = Math.min(0.8, assertRate * 20);
    if (s >= minScore) gaps.push({
      type: GAP_TYPE.EVIDENTIAL, domain: DOMAIN.EPISTEMOLOGICAL,
      reason: GAP_REASON.IDENTITY_REFLECTION,
      description: 'High assertion density without evidence',
      score: s, evidence: { metric: assertRate, pattern: 'assertion_rate' },
    });
  }

  // ── Liminal meta-layer augmentation ─────────────────────────────────────
  const liminal = _getLiminal();
  if (liminal && text) {
    try {
      const lGaps = liminal.analyzeText(text);
      for (const lg of lGaps) {
        gaps.push({
          type: lg.type, reason: Array.isArray(lg.reason)?lg.reason[0]:lg.reason,
          score: lg.criticality, domain: lg.domain,
          description: lg.description, question: lg.question,
          evidence: lg.evidence || null,
          source: 'liminal/' + (lg.module||'unknown'),
        });
      }
      if (/function|catch|async|await|SELECT/.test(text)) {
        const cGaps = liminal.analyzeCode(text);
        for (const cg of cGaps) {
          gaps.push({
            type: cg.type, reason: Array.isArray(cg.reason)?cg.reason[0]:cg.reason,
            score: cg.criticality, domain: 'code',
            description: cg.description, evidence: cg.evidence || null,
            source: 'liminal/code',
          });
        }
      }
    } catch(_) {}
  }

  return gaps;
}

/**
 * Compute overall drift score from a gap array.
 *
 * §needs-2026-06-21 — BEHAVIOR CHANGE, not a tweak: this was
 * `total/gaps.length` (arithmetic mean). Per James's rule — confidence is
 * defined by the weakest claim, not diluted by averaging against stronger
 * ones — this now returns the weakest-link aggregate: min(effective scores),
 * where an item with no evidence object is discounted before the min is
 * taken (see lib/meta/confidence.js). The exported name and field (gapDrift)
 * are unchanged so existing callers in guardian/server.js don't need edits,
 * but the numbers they receive will now run lower and more conservative than
 * before, especially for responses mixing well-evidenced and unevidenced
 * gaps. That is the intended effect, not a regression.
 */
function drift(gaps) {
  return weakestLink(gaps);
}

// Same computation, named for what it actually is going forward.
const confidence = drift;

module.exports = { analyze, drift, confidence, bottleneck, GAP_TYPE, GAP_REASON, DOMAIN };
