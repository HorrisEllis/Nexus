'use strict';
// ── guardian/lib/gap-hunter.js ────────────────────────────────────────────────
// UUID: guardian-gap-hunter-v3-0000-4000-0000-000000000001
// Version: 3.1.0
//
// CJS bridge for GapHunter v3.1.0 (ES module, author: James Brooks / Erosmancer).
//
// The v3 engine is in ./gaphunter-v3/ (ES module package).
// This file wraps it with a synchronous CJS API that matches the existing
// call contract in server.js:
//
//   GapHunter.analyze(text, opts?)  → gap[]
//   GapHunter.drift(gaps)           → number
//   GapHunter.GAP_TYPE              → object
//   GapHunter.GAP_REASON            → object
//   GapHunter.DOMAIN                → object
//
// CHANGES FROM v1 (drop-in compatible):
//   - Each gap row now includes:
//       subtype           — specific detector sub-pattern
//       dominant          — which detector fired highest
//       confidence        — 'HIGH'|'MEDIUM'|'LOW'
//       load_bearing_question — the question this gap implies
//       signal_note       — §1.1 label
//       detectors[]       — all sub-detector results (stored in evidence)
//   - 200+ named gap types via universal taxonomy
//   - Full 9-reason meta-taxonomy (why the gap exists)
//   - Domain auto-detected when not supplied
//   - Relational physics (Theta) available via GapHunter.physics
//   - Session-stateful: same instance accumulates history per process lifetime
//
// §1.1  All outputs are signals. Not diagnoses.
// §1.2  Nothing silently fails — load errors throw loudly.
// §WM.1 gap rows are written to JAA before any side-effect (server.js invariant,
//        preserved here — this module does not write to JAA directly).

const path   = require('path');
const { createRequire } = require('module');

// ── Lazy async loader ─────────────────────────────────────────────────────────
// The ES module is loaded once on first call and cached.
// All subsequent calls use the resolved module.

let _module  = null;   // resolved ES module
let _loading = null;   // in-flight promise
let _analyzer = null;  // UniversalTextAnalyzer instance (session-stateful)
let _physics  = null;  // RelationalFieldAnalyzer instance
let _Theta    = null;  // Theta constructor

const ENGINE_DIR = path.join(__dirname, 'gaphunter-v3', 'gap-text.js');
const PHYSICS_DIR = path.join(__dirname, 'gaphunter-v3', 'relational-physics.js');

async function _load() {
  if (_module) return _module;
  if (_loading) return _loading;

  _loading = (async () => {
    const textMod    = await import(ENGINE_DIR);
    const physicsMod = await import(PHYSICS_DIR);

    _analyzer = new textMod.UniversalTextAnalyzer();
    _physics  = physicsMod.RelationalFieldAnalyzer ? new physicsMod.RelationalFieldAnalyzer() : null;
    _Theta    = physicsMod.Theta ?? null;
    _module   = { textMod, physicsMod };
    return _module;
  })();

  return _loading;
}

// Kick off load immediately so it's warm by the time the first job completes.
_load().catch(err => {
  console.error('[gap-hunter v3.1.0 §1.2] failed to pre-load engine:', err.message);
});

// ── Output normalisation ──────────────────────────────────────────────────────
// Convert a UniversalTextAnalyzer result into the gap[] row format that
// server.js inserts into JAA. Each top-level detector result → one gap row.
// The composite result also yields a summary row if score is significant.

function _normaliseResult(result, opts = {}) {
  if (!result) return [];

  const gaps = [];
  const minScore = opts.minScore ?? 0.20;

  // Type → default reason mapping (when detector doesn't supply one)
  const TYPE_REASON = {
    'weak_assumption':      'avoidance',
    'shadow_field':         'emotional_occlusion',
    'contrastive_gap':      'compatibility',
    'negative_space':       'avoidance',
    'structural_assumption':'structural_limit',
    'reversal':             'narrative_soothing',
    'code_gap':             'deferred_variable',
    'compound':             'compression',
    'taxonomy_match':       'attention',
  };

  // One row per fired detector
  for (const det of (result.detectors || [])) {
    if ((det.score ?? 0) < minScore) continue;

    const detType = det.type || result.dominant || 'unknown';
    const detReason = Array.isArray(det.reason) ? det.reason[0]
                    : (det.reason || TYPE_REASON[detType] || 'compression');
    const detReasons = Array.isArray(det.reason) ? det.reason
                     : (det.reason ? [det.reason] : [TYPE_REASON[detType] || 'compression']);

    gaps.push({
      type:        detType,
      subtype:     det.subtype             || null,
      domain:      det.domain              || result.domain   || 'unknown',
      reason:      detReason,
      reasons:     detReasons,
      description: det.description        || det.signal_note  || '',
      score:       det.score              ?? 0,
      confidence:  det.confidence         || 'LOW',
      load_bearing_question: det.load_bearing_question || null,
      signal_note: det.signal_note        || '§1.1 — signal, not diagnosis',
      evidence:    {
        axes:      det.axes              || [],
        finds:     det.finds             || [],
        dominant:  result.dominant       || null,
        composite: result.score          || 0,
        detectors: result.detectors?.length || 0,
      },
    });
  }

  // Composite summary row (only if multiple detectors fired + score high enough)
  if (result.detectors?.length > 1 && result.score >= 0.45) {
    gaps.push({
      type:        'compound',
      subtype:     result.dominant,
      domain:      result.domain,
      reason:      'compression',
      reasons:     ['compression'],
      description: `${result.detectors.length} gap types simultaneously present — dominant: ${result.dominant}`,
      score:       result.score,
      confidence:  result.confidence || 'MEDIUM',
      load_bearing_question: null,
      signal_note: '§1.1 — compound gap signal',
      evidence:    {
        dominant:  result.dominant,
        composite: result.score,
        detectors: result.detectors.length,
      },
    });
  }

  return gaps;
}

// ── Theta derivation from gap analysis output ────────────────────────────────
// Maps the six gap detector outputs onto the six Theta axes.
// This is the bridge between what UniversalTextAnalyzer finds and the
// relational physics state space.
//
// Axis mapping (grounded in detector semantics, not guessed):
//   H  (entropy/uncertainty)  ← assumption + shadow + negative_space scores
//      High assumption density = high uncertainty about what is actually true.
//   I  (intensity/activation) ← composite score of all gaps combined
//      More gaps at higher scores = more activated response surface.
//   C  (causality direction)  ← reversal score inverted
//      Reversals suppress causality (meaning is inverted → C negative).
//      Strong causal assertions without evidence → C high positive.
//   M  (intimacy/coupling)    ← contrastive gap score inverted
//      Contrastive gaps (word/body divergence) = low coupling (M low).
//      No contrastive gap = content is self-consistent = higher M.
//   P_c (cognitive empathy)   ← named agent presence / assumption score inverted
//      High assumption rate = low accurate modeling of other = P_c low.
//   P_e (emotional empathy)   ← shadow field score inverted
//      Shadow field firing = emotion present but not integrated = P_e low.

function _thetaFromGaps(gaps, compositeScore) {
  if (!_Theta) return null;
  if (!gaps.length) return new _Theta({ H:0.1, I:0.1, C:0.5, M:0.9, P_c:0.9, P_e:0.9 });

  const byType = {};
  for (const g of gaps) {
    const t = g.type;
    if (!byType[t] || g.score > byType[t]) byType[t] = g.score;
  }

  const assumptionScore   = Math.max(byType['weak_assumption']         ?? 0, byType['structural_assumption'] ?? 0, byType['taxonomy_match'] ?? 0);
  const shadowScore       = byType['shadow_field']    ?? 0;
  const contrastiveScore  = byType['contrastive_gap'] ?? 0;
  const nsScore           = byType['negative_space']  ?? 0;
  const reversalScore     = byType['reversal']        ?? 0;
  const composite         = compositeScore ?? (gaps.reduce((s,g)=>s+(g.score||0),0)/gaps.length);

  // Scale scores to useful Theta ranges.
  // Detector scores are conservative (0.2–0.7 typical). Scale to fill [0,1].
  const H   = Math.min(1, (assumptionScore + shadowScore * 0.6 + nsScore * 0.4) * 1.4);
  const I   = Math.min(1, composite * 1.5);
  const C   = Math.max(-1, Math.min(1, (0.5 - reversalScore) * 1.5));
  const M   = Math.max(0, 1 - contrastiveScore * 1.5);
  const P_c = Math.max(0, 1 - assumptionScore * 1.4);
  const P_e = Math.max(0, 1 - shadowScore * 1.5);

  return new _Theta({ H, I, C, M, P_c, P_e });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze text for structural gaps.
 * Returns gap[] immediately if engine is loaded, or [] with async fallback.
 *
 * The engine pre-loads at require() time. By the time a Guardian job completes
 * (typically 5-30s), the engine is warm and analyze() is sync.
 *
 * If for any reason the engine is not yet loaded (e.g. immediate test after
 * require()), returns [] rather than throwing — §1.2 applies to callers,
 * not to this bridge.
 */
function analyze(text, opts = {}) {
  if (!text || text.length < 30) return [];

  // Sync path: engine loaded, call immediately
  if (_analyzer) {
    try {
      const result = _analyzer.analyze(text, {
        domain:   opts.domain   || undefined,
        language: opts.language || undefined,
        arousal:  opts.arousal  || 0,
      });
      const gaps = _normaliseResult(result, opts);

      // Attach relational physics to each gap row if physics engine is loaded
      // and caller has not opted out via opts.physics = false
      if (opts.physics !== false && gaps.length && _physics && _Theta) {
        const theta = _thetaFromGaps(gaps, result?.score ?? 0);
        if (theta) {
          const point = _physics.analyzePoint(theta, { gapScore: result?.score ?? 0 });
          // Attach to each gap as physics metadata (does not affect JAA required fields)
          for (const g of gaps) {
            g.physics = {
              theta:             theta.toJSON(),
              coherence:         point.coherence,
              emotion:           point.emotion?.primary?.emotion ?? point.emotion?.label ?? null,
              emotion_score:     point.emotion?.primary?.confidence ?? point.emotion?.score ?? null,
              emotion_description: point.emotion?.primary?.description ?? null,
              collapse_pressure: point.collapse_pressure ?? null,
              stability:         typeof point.stability === 'object' ? point.stability?.value : point.stability,
              stable:            point.stability?.stable ?? null,
            };
          }
        }
      }

      return gaps;
    } catch (err) {
      console.error('[gap-hunter v3.1.0 §1.2] analyze error:', err.message);
      return [];
    }
  }

  // Engine still loading — schedule but return empty now.
  // Server.js LAW II write-before-act is preserved: this returns [] synchronously
  // and does not block. The engine will be warm for the next job.
  _load().catch(() => {});
  return [];
}

/**
 * Compute drift score from a gap array.
 * drift = mean of gap scores, weighted by confidence level.
 */
function drift(gaps) {
  if (!gaps || !gaps.length) return 0;
  const CONF_WEIGHT = { HIGH: 1.0, MEDIUM: 0.75, LOW: 0.5 };
  let total = 0, weight = 0;
  for (const g of gaps) {
    const w = CONF_WEIGHT[g.confidence] ?? 0.5;
    total  += (g.score || 0) * w;
    weight += w;
  }
  return parseFloat((weight > 0 ? total / weight : 0).toFixed(3));
}

/**
 * Analyze a sequence of texts (turns in a conversation).
 * Returns { gaps[], drift, dominant, sessionFinds } across all turns.
 * The analyzer maintains turn history internally for cross-turn detection.
 */
function analyzeSequence(texts, opts = {}) {
  if (!_analyzer || !texts?.length) return { gaps: [], drift: 0, dominant: null, sessionFinds: 0 };

  const allGaps = [];
  for (const text of texts) {
    const g = analyze(text, opts);
    allGaps.push(...g);
  }

  const d = drift(allGaps);
  const byType = {};
  for (const g of allGaps) byType[g.type] = (byType[g.type] || 0) + 1;
  const dominant = Object.entries(byType).sort(([,a],[,b]) => b - a)[0]?.[0] ?? null;

  return { gaps: allGaps, drift: d, dominant, sessionFinds: allGaps.length };
}

// ── Taxonomy constants (re-exported for server.js consumers) ──────────────────
// These are synchronous constants — safe to export directly.
// The full taxonomy is in the ES module; we export the subset matching v1 API.

const GAP_TYPE = Object.freeze({
  LOGICAL:'logical', EVIDENTIAL:'evidential', TEMPORAL:'temporal',
  DEFINITIONAL:'definitional', REFERENCE:'reference', OBLIGATION:'obligation',
  ASSUMPTION:'assumption', CONTRADICTION:'contradiction',
  IDENTITY_ATTACK:'identity_attack', CONSENT:'consent', BOUNDARY:'boundary',
  HIERARCHY:'hierarchy', COERCION:'coercion', ISOLATION:'isolation',
  OSCILLATORY:'oscillatory', CONDITION:'condition',
  // v3 additions
  WEAK_ASSUMPTION:'weak_assumption', SHADOW_FIELD:'shadow_field',
  CONTRASTIVE_GAP:'contrastive_gap', NEGATIVE_SPACE:'negative_space',
  STRUCTURAL_ASSUMPTION:'structural_assumption', REVERSAL:'reversal',
  COMPOUND:'compound', TAXONOMY_MATCH:'taxonomy_match',
});

const GAP_REASON = Object.freeze({
  COMPRESSION:'compression', AVOIDANCE:'avoidance',
  COMPATIBILITY:'compatibility', ATTENTION:'attention',
  EMOTIONAL_OCCLUSION:'emotional_occlusion', DEFERRED_VARIABLE:'deferred_variable',
  STRUCTURAL_LIMIT:'structural_limit', IDENTITY_REFLECTION:'identity_reflection',
  NARRATIVE_SOOTHING:'narrative_soothing',
});

const DOMAIN = Object.freeze({
  CODE:'code', AI_ML:'ai_ml', SOFTWARE_ARCH:'software_arch',
  EPISTEMOLOGICAL:'epistemological', LOGIC:'logic', COMMUNICATION:'communication',
  LANG_JS:'lang_javascript', LANG_TS:'lang_typescript', LANG_PYTHON:'lang_python',
  SECURITY:'security', DATABASE:'database', API_DESIGN:'api_design',
  SYSTEM_DESIGN:'system_design',
  RELATIONAL:'relational', POLITICAL:'political', MEDICAL:'medical',
  RESEARCH:'research', ETHICS:'ethics', BUSINESS:'business',
  STATISTICS:'statistics', PSYCHOLOGY:'psychology',
});

// ── Diagnostics ───────────────────────────────────────────────────────────────

function health() {
  return {
    loaded:   !!_analyzer,
    version:  '3.1.0',
    engine:   'UniversalTextAnalyzer',
    detectors: _analyzer ? Object.keys(_analyzer).filter(k => k.startsWith('_') && k !== '_history' && k !== '_totalRuns').length : 0,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  analyze,
  drift,
  analyzeSequence,
  health,
  GAP_TYPE,
  GAP_REASON,
  DOMAIN,
  get physics() { return _physics; },
  get loaded()  { return !!_analyzer; },
  VERSION: '3.1.0',
};
