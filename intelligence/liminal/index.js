'use strict';
/**
 * lib/meta/liminal/index.js — Liminal Gap Detection System (CJS, all 12 modules)
 * UUID: nexus-liminal-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * 12 domain-agnostic gap detectors ported from Liminal v1.0.0.
 * Each produces GapSignal objects. §C1: pure functions, no shared state.
 * §C2: outputs are signals, not diagnoses. §1.2: nothing silent.
 *
 * Modules:
 *   code          — silent failure, unawaited promises, SQL injection, stubs
 *   assumption    — universalisation, causal leaps, "just works"
 *   contrastive   — belief-behavior gap, contradiction clusters, "fine" inversions
 *   structural    — presupposition loading, frame control, power geometry
 *   shadow        — pronoun displacement, intensity mismatch, over-apology
 *   negative_space— topic orbit, avoidance trajectory, vocabulary field absence
 *   relational    — gaslighting layers, guilt induction, triangulation, contempt
 *   oscillatory   — pendulum math, intermittent reinforcement, approach-retreat
 *   existential   — identity assumption, values-behavior gap, meaning SPOF
 *   field         — oscillation, edges, plateaus, convergence, fractals
 *   music         — rhyme scheme, structural gaps, harmonic tension, missing hook
 *   reversal      — "fine" meaning not fine, negation clusters, rhetorical accusations
 */

// ── Shared types ──────────────────────────────────────────────────────────────
const GAP_TYPE = Object.freeze({
  LOGICAL:'logical', EVIDENTIAL:'evidential', TEMPORAL:'temporal',
  DEFINITIONAL:'definitional', REFERENCE:'reference', OBLIGATION:'obligation',
  ASSUMPTION:'assumption', CONTRADICTION:'contradiction',
  IDENTITY_ATTACK:'identity_attack', CONSENT:'consent', BOUNDARY:'boundary',
  HIERARCHY:'hierarchy', COERCION:'coercion', ISOLATION:'isolation',
  OSCILLATORY:'oscillatory', CONDITION:'condition',
});

const GAP_REASON = Object.freeze({
  COMPRESSION:'compression', AVOIDANCE:'avoidance', COMPATIBILITY:'compatibility',
  ATTENTION:'attention', EMOTIONAL_OCCLUSION:'emotional_occlusion',
  NARRATIVE_SOOTHING:'narrative_soothing', IDENTITY_REFLECTION:'identity_reflection',
  DEFERRED_VARIABLE:'deferred_variable', STRUCTURAL_LIMIT:'structural_limit',
});

const GAP_CRIT = {
  [GAP_TYPE.ASSUMPTION]:1.00, [GAP_TYPE.IDENTITY_ATTACK]:1.00,
  [GAP_TYPE.COERCION]:1.00, [GAP_TYPE.ISOLATION]:0.95,
  [GAP_TYPE.CONTRADICTION]:0.80, [GAP_TYPE.OSCILLATORY]:0.85,
  [GAP_TYPE.CONSENT]:0.80, [GAP_TYPE.TEMPORAL]:0.75, [GAP_TYPE.LOGICAL]:0.70,
  [GAP_TYPE.EVIDENTIAL]:0.65, [GAP_TYPE.BOUNDARY]:0.65,
  [GAP_TYPE.HIERARCHY]:0.70, [GAP_TYPE.DEFINITIONAL]:0.60,
  [GAP_TYPE.OBLIGATION]:0.55, [GAP_TYPE.REFERENCE]:0.50,
};

function r4(v)           { return Math.round((v??0)*10000)/10000; }
function clamp(v,lo=0,hi=1){ return Math.max(lo,Math.min(hi,v)); }
function tok(text)       { return (text||'').toLowerCase().split(/\s+/).filter(Boolean); }
function mc(text,re)     { return ((text||'').match(re)||[]).length; }

class G {
  constructor(o) {
    this.type        = o.type;
    this.reason      = o.reason;
    this.criticality = r4(clamp(o.criticality ?? GAP_CRIT[o.type] ?? 0.5));
    this.domain      = o.domain  || 'generic';
    this.description = o.desc    || o.description || '';
    this.question    = o.q       || o.question    || '';
    this.module      = o.module  || 'liminal';
    // §needs-2026-06-21: evidence was never a field on this class — every
    // signal from this module shipped evidence:undefined downstream, which
    // JAA/cortex normalized to evidence:null with no way to tell "unmeasured"
    // from "measured but empty". Every detector below now passes a real
    // {metric, pattern} object; this is the structural fix, not per-call.
    this.evidence    = o.evidence || null;
    this.ts          = Date.now();
  }
}

function sig(type, crit, desc, mod, domain='generic', q='', reason=GAP_REASON.AVOIDANCE, evidence=null) {
  return new G({ type, criticality:crit, description:desc, module:'liminal/'+mod, domain, question:q, reason, evidence });
}

// ══ 1. CODE ══════════════════════════════════════════════════════════════════
function detectCode(text) {
  if (!text) return [];
  const out = [];
  const checks = [
    [/catch\s*\([^)]*\)\s*\{\s*\}/g,                  1.00, 'Silent failure — empty catch block (§1.2 violation)'],
    [/catch\s*\(_\)\s*\{\s*\}/g,                       1.00, 'Silent failure — catch(_) discards error'],
    [/console\.log.*(password|token|secret|apikey)/gi, 0.95, 'Credential in console.log — potential leak'],
    [/SELECT.*\$\{|INSERT.*\$\{|UPDATE.*\$\{/gi,       0.95, 'SQL injection risk — template literal in query'],
    [/new Function\(|eval\(/g,                         0.85, 'Dynamic code execution — security surface'],
    [/process\.exit\(\d+\)/g,                          0.70, 'process.exit in importable module — boot fragility'],
    [/\bTODO\b|\bFIXME\b|\bHACK\b|\bSTUB\b/gi,        0.65, 'Unresolved technical debt marker'],
    [/setTimeout\(.*,\s*0\)/g,                         0.60, 'Zero-delay timer — likely race condition workaround'],
    [/\.then\(\s*\)\s*;/g,                             0.75, 'Empty .then() — error swallowed'],
    [/throw new Error\(\s*\)/g,                        0.60, 'Empty error thrown — missing message'],
  ];
  for (const [rx, crit, desc] of checks) {
    if (rx.test(text)) out.push(sig(GAP_TYPE.OBLIGATION, crit, desc, 'code', 'code', '', GAP_REASON.AVOIDANCE,
      { pattern: rx.source, matches: mc(text, rx) }));
  }
  return out;
}

// ══ 2. ASSUMPTION ═════════════════════════════════════════════════════════════
function detectAssumption(text) {
  if (!text) return [];
  const out = [];
  const checks = [
    [/\b(obviously|clearly|of course|everyone knows|it.s obvious|naturally|needless to say)\b/gi, 0.70, 'Universalisation without evidence'],
    [/\balways\b.{0,20}\bnever\b|\bnever\b.{0,20}\balways\b/gi, 0.75, 'Absolute claim pair — likely load-bearing assumption'],
    [/\bjust\s+(works?|do|does|did|will|run|call|use)\b/gi, 0.60, 'Complexity minimization — "just" hides assumptions'],
    [/\byou\s+(always|never|should|shouldn.t|must|have to)\b/gi, 0.75, 'Universal behavioral attribution without evidence'],
    [/\bby definition\b|\bself-evidently\b|\bobviously\b/gi, 0.65, 'Definitional closure — treating assumption as axiom'],
  ];
  for (const [rx, crit, desc] of checks) {
    if (rx.test(text)) out.push(sig(GAP_TYPE.ASSUMPTION, crit, desc, 'assumption', 'communication', '', GAP_REASON.AVOIDANCE,
      { pattern: rx.source, matches: mc(text, rx) }));
  }
  return out;
}

// ══ 3. CONTRASTIVE ════════════════════════════════════════════════════════════
function detectContrastive(text) {
  if (!text) return [];
  const out = [];
  const dblQualifierRx = /\b(but|however|although|despite|yet)\b.{0,60}\b(but|however|although|despite|yet)\b/gi;
  if (dblQualifierRx.test(text))
    out.push(sig(GAP_TYPE.CONTRADICTION, 0.65, 'Multiple contradicting qualifiers — belief-behavior gap', 'contrastive', 'communication', '', GAP_REASON.AVOIDANCE,
      { pattern: dblQualifierRx.source, matches: mc(text, dblQualifierRx) }));
  const terminalMinimizerRx = /\b(fine|okay|ok|whatever|it.s fine|no worries|doesn.t matter)\b.{0,30}[.!]$/gim;
  if (terminalMinimizerRx.test(text))
    out.push(sig(GAP_TYPE.CONTRADICTION, 0.72, 'Terminal minimizer — "fine" as conversation-ender may mask unresolved state', 'contrastive', 'communication', '', GAP_REASON.AVOIDANCE,
      { pattern: terminalMinimizerRx.source, matches: mc(text, terminalMinimizerRx) }));
  const qualifierCount = mc(text, /\b(but|however)\b/gi);
  if (qualifierCount > 3)
    out.push(sig(GAP_TYPE.LOGICAL, 0.60, 'High qualifier density — possible belief-action gap', 'contrastive', 'communication', '', GAP_REASON.AVOIDANCE,
      { metric: qualifierCount, pattern: 'but|however_count' }));
  return out;
}

// ══ 4. STRUCTURAL ════════════════════════════════════════════════════════════
function detectStructural(text) {
  if (!text) return [];
  const out = [];
  const presup = [
    [/\bwhy (do|did|are|is|were|was) you\b/gi,     0.65, 'Accusatory why-question — presupposition of fault'],
    [/\bdon.t you think\b|\bdon.t you agree\b/gi,  0.62, 'Leading question — frame control'],
    [/\bof course you\b|\bnaturally you\b/gi,       0.60, 'Naturalisation — treating contested thing as given'],
    [/\beven you\b|\byou of all people\b/gi,        0.70, 'Hierarchy marker — position power move'],
    [/\banyone would\b|\beveryone knows\b/gi,       0.68, 'Consensus manufacture — false majority'],
  ];
  for (const [rx, crit, desc] of presup) {
    if (rx.test(text)) out.push(sig(GAP_TYPE.HIERARCHY, crit, desc, 'structural', 'communication', '', GAP_REASON.AVOIDANCE,
      { pattern: rx.source, matches: mc(text, rx) }));
  }
  return out;
}

// ══ 5. SHADOW ════════════════════════════════════════════════════════════════
function detectShadow(text) {
  if (!text) return [];
  const out = [];
  const words = tok(text);
  const wc = words.length;

  // A: Pronoun displacement — "you/they" instead of "I"
  const youCount = mc(text, /\byou\b/gi);
  const theyCount = mc(text, /\bthey\b|\bthem\b/gi);
  const iCount = mc(text, /\bi\b/gi);
  if (wc > 20 && (youCount + theyCount) > iCount * 2)
    out.push(sig(GAP_TYPE.ASSUMPTION, 0.68, 'Pronoun displacement — "you/they" dominant over "I", possible projection', 'shadow', 'psychological',
      'What is being attributed to others that may apply to the speaker?', GAP_REASON.AVOIDANCE,
      { metric: { youCount, theyCount, iCount }, pattern: 'pronoun_displacement' }));

  // B: Over-qualification (hedge density)
  const hedges = mc(text, /\b(sort of|kind of|maybe|perhaps|I guess|I think|I feel like|might be|could be|possibly|probably|somewhat)\b/gi);
  if (hedges / Math.max(1, wc) > 0.08)
    out.push(sig(GAP_TYPE.ASSUMPTION, 0.62, `Over-qualification — hedge density ${r4(hedges/wc)} (>0.08). Covering something with qualifiers.`, 'shadow', 'communication', '', GAP_REASON.AVOIDANCE,
      { metric: r4(hedges/wc), pattern: 'hedge_density' }));

  // C: Over-apology
  const apologies = mc(text, /\b(sorry|apologize|I.m sorry|forgive me|excuse me|pardon me)\b/gi);
  if (apologies > 2)
    out.push(sig(GAP_TYPE.CONTRADICTION, 0.60, `Over-apology pattern — ${apologies} apologies. May be aggression proxy or concealment.`, 'shadow', 'relational', '', GAP_REASON.AVOIDANCE,
      { metric: apologies, pattern: 'apology_count' }));

  // D: Intensity mismatch — mild words with high-arousal context
  const mildWords = mc(text, /\b(fine|okay|okay|sure|whatever|I guess|no big deal|it.s nothing)\b/gi);
  const highArousal = mc(text, /\b(angry|scared|devastated|overwhelmed|terrified|hurt|furious|heartbroken)\b/gi);
  if (mildWords > 0 && highArousal > 0)
    out.push(sig(GAP_TYPE.CONTRADICTION, 0.75, 'Intensity mismatch — mild surface words with high-arousal emotional context', 'shadow', 'psychological', '', GAP_REASON.AVOIDANCE,
      { metric: { mildWords, highArousal }, pattern: 'intensity_mismatch' }));

  return out;
}

// ══ 6. NEGATIVE SPACE ════════════════════════════════════════════════════════
const GRAVITY_WELLS = {
  // §needs-2026-06-21: each well now carries its own GAP_TYPE. The old code
  // wrote `GAP_TYPE.AVOIDANCE||GAP_TYPE.ASSUMPTION` — AVOIDANCE is a
  // GAP_REASON value, not a GAP_TYPE key (see enum above, line 27-34). It
  // doesn't exist on GAP_TYPE, so `||` always fell through to ASSUMPTION,
  // for every well, regardless of which one actually fired. `reason` was
  // already defaulting to GAP_REASON.AVOIDANCE via sig()'s 7th param — the
  // bug was a copy of that intent into the wrong slot.
  relationship_distress: {
    type: GAP_TYPE.EVIDENTIAL, // expected emotional disclosure never supplied
    approach: /\b(relationship|partner|together|us|we.ve been|things have been)\b/gi,
    expected: /\b(i feel|i need|i want|i.m hurt|i.m scared|i love|i miss)\b/gi,
  },
  anger_unexpressed: {
    type: GAP_TYPE.EVIDENTIAL, // same structural shape as above
    approach: /\b(it.s fine|no worries|doesn.t matter|all good|whatever)\b/gi,
    expected: /\b(upset|angry|frustrated|bothered|hurt|annoyed|bothers me)\b/gi,
  },
  accountability_avoided: {
    type: GAP_TYPE.OBLIGATION, // responsibility-taking is an unmet obligation, not an assumption
    approach: /\b(mistake|error|went wrong|didn.t work|failed|issue|problem)\b/gi,
    expected: /\b(i did|i caused|my responsibility|my fault|i should have|i chose)\b/gi,
  },
};

function detectNegativeSpace(text) {
  if (!text || tok(text).length < 6) return [];
  const out = [];
  for (const [name, well] of Object.entries(GRAVITY_WELLS)) {
    const approachCount = mc(text, well.approach);
    const hasExpected = well.expected.test(text);
    if (approachCount > 0 && !hasExpected) {
      // §needs-2026-06-21: was a flat 0.72 literal for all three wells, every
      // time — no signal grading at all. Now scaled by approach-match count:
      // one mention proves little (floor 0.5), repeated approach without
      // ever supplying the expected content is a stronger signal (cap 0.85).
      // Still a regex heuristic, not measured ground truth — hence the cap
      // below 0.9, and hence evidence carries the raw count for audit.
      const score = r4(clamp(0.5 + Math.min(0.35, (approachCount - 1) * 0.07)));
      out.push(sig(well.type, score,
        `Negative space — ${name.replace(/_/g,' ')}: topic approached but expected content absent`,
        'negative_space', 'communication',
        'What is being systematically avoided in the vicinity of this topic?',
        GAP_REASON.AVOIDANCE,
        { metric: { approachCount, expectedMatched: false }, pattern: name }));
    }
  }
  // Unresolved topic shifts
  const topicShiftRx = /\b(anyway|moving on|forget it|never mind|let.s not|can we not|drop it)\b/gi;
  if (topicShiftRx.test(text))
    out.push(sig(GAP_TYPE.TEMPORAL, 0.65, 'Unresolved topic shift — topic exit without resolution', 'negative_space', 'communication', '', GAP_REASON.AVOIDANCE,
      { pattern: topicShiftRx.source, matches: mc(text, topicShiftRx) }));
  return out;
}

// ══ 7. RELATIONAL ════════════════════════════════════════════════════════════
function detectRelational(text) {
  if (!text) return [];
  const out = [];
  const patterns = [
    [/\b(you.re (too|being) sensitive|you.re overreacting|that never happened|you imagined)\b/gi, 1.00, 'Gaslighting — reality denial'],
    [/\b(i was just joking|can.t you take a joke)\b/gi, 0.90, 'Gaslighting — joke deflection of harm'],
    [/\b(no one else has a problem|everyone else thinks|everyone agrees)\b/gi, 0.85, 'Triangulation — false consensus manufacture'],
    [/\b(you.re crazy|you.re paranoid|you.re imagining things)\b/gi, 1.00, 'Identity attack — sanity challenge'],
    [/\b(if you (really|truly) loved|if you cared about)\b/gi, 0.90, 'Guilt induction — conditional love frame'],
    [/\b(after everything i.ve done|look what i did for you)\b/gi, 0.85, 'Guilt leverage — obligation manufacturing'],
    [/\b(you always do this|you never|you.re always like this)\b/gi, 0.80, 'Overgeneralization — character attribution from behavior'],
    [/\b(i.m leaving|we.re done|forget it)\b.{0,30}\b(fine|whatever|okay)\b/gi, 0.78, 'Contempt-dismissal pattern'],
  ];
  for (const [rx, crit, desc] of patterns) {
    if (rx.test(text)) out.push(sig(GAP_TYPE.COERCION, crit, desc, 'relational', 'relational', '', GAP_REASON.AVOIDANCE,
      { pattern: rx.source, matches: mc(text, rx) }));
  }
  return out;
}

// ══ 8. OSCILLATORY ════════════════════════════════════════════════════════════
function detectOscillatory(series) {
  // series: array of numeric gap-pressure values over time
  if (!Array.isArray(series) || series.length < 6) return [];
  const out = [];
  const mean = series.reduce((a,b)=>a+b,0)/series.length;

  // Pendulum: count zero-crossings around mean
  let crossings = 0;
  const zc = [];
  for (let i=1;i<series.length;i++) {
    const p=series[i-1]-mean, c=series[i]-mean;
    if (p<0&&c>=0) { crossings++; zc.push({i,dir:'up'}); }
    else if (p>=0&&c<0) { crossings++; zc.push({i,dir:'down'}); }
  }
  const up = zc.filter(z=>z.dir==='up');
  const period = up.length>=2 ? Math.round(
    up.slice(1).reduce((s,u,i)=>s+(u.i-up[i].i),0)/(up.length-1)
  ) : null;
  const amplitude = r4((Math.max(...series)-Math.min(...series))/2);

  if (crossings > series.length * 0.35) {
    out.push(sig(GAP_TYPE.OSCILLATORY, 0.82,
      `Oscillatory pattern — ${crossings} zero-crossings, period≈${period||'?'} samples, amplitude=${amplitude}. System cycling without resolution.`,
      'oscillatory', 'field', 'What prevents commitment to either state?', GAP_REASON.AVOIDANCE,
      { metric: { crossings, period, amplitude, seriesLength: series.length }, pattern: 'zero_crossing_rate' }));
  }

  // Intermittent reinforcement signature: irregular amplitudes
  if (up.length >= 3) {
    const amplitudes = up.map((u,i) => i>0 ? Math.abs(series[u.i]-mean) : 0).filter(Boolean);
    const ampMean = amplitudes.reduce((a,b)=>a+b,0)/amplitudes.length;
    const ampVar  = amplitudes.reduce((s,a)=>s+(a-ampMean)**2,0)/amplitudes.length;
    const ampCV   = Math.sqrt(ampVar)/ampMean;
    if (ampCV > 0.5)
      out.push(sig(GAP_TYPE.OSCILLATORY, 0.78, 'Irregular oscillation amplitude — intermittent reinforcement signature', 'oscillatory', 'relational', '', GAP_REASON.AVOIDANCE,
        { metric: { ampMean: r4(ampMean), ampCV: r4(ampCV), sampleCount: amplitudes.length }, pattern: 'amplitude_coefficient_of_variation' }));
  }
  return out;
}

// ══ 9. EXISTENTIAL ════════════════════════════════════════════════════════════
function detectExistential(text) {
  if (!text || tok(text).length < 5) return [];
  const out = [];
  // Identity assumption
  const identityRx = /\b(i.m (not )?the kind of person|i.ve always been|that.s just who i am|i can.t change)\b/gi;
  if (identityRx.test(text))
    out.push(sig(GAP_TYPE.ASSUMPTION, 0.72, 'Identity fixation — self defined as fixed, closing off possibility', 'existential', 'psychological', 'What does this assumption protect?', GAP_REASON.AVOIDANCE,
      { pattern: identityRx.source, matches: mc(text, identityRx) }));
  // Values-behavior gap
  const valuesGapRx = /\b(i believe in|i value|i care about).{0,80}(but i|however i|yet i|although i)/gi;
  if (valuesGapRx.test(text))
    out.push(sig(GAP_TYPE.CONTRADICTION, 0.70, 'Values-behavior gap — stated value contradicted by described action', 'existential', 'existential', '', GAP_REASON.AVOIDANCE,
      { pattern: valuesGapRx.source, matches: mc(text, valuesGapRx) }));
  // Meaning SPOF
  const meaningSpofRx = /\b(without .{0,30}i have nothing|my whole life is|everything depends on|if .{0,20}fails i.m done)\b/gi;
  if (meaningSpofRx.test(text))
    out.push(sig(GAP_TYPE.LOGICAL, 0.80, 'Meaning single point of failure — entire identity/worth contingent on one thing', 'existential', 'existential', 'What happens to identity if this thing is removed?', GAP_REASON.AVOIDANCE,
      { pattern: meaningSpofRx.source, matches: mc(text, meaningSpofRx) }));
  // Purpose gap
  const purposeGapRx = /\b(what.s the point|nothing matters|why bother|what am i doing|i don.t know why i)\b/gi;
  if (purposeGapRx.test(text))
    out.push(sig(GAP_TYPE.CONDITION, 0.68, 'Purpose gap — meaning question surfacing', 'existential', 'existential', '', GAP_REASON.AVOIDANCE,
      { pattern: purposeGapRx.source, matches: mc(text, purposeGapRx) }));
  return out;
}

// ══ 10. FIELD ════════════════════════════════════════════════════════════════
function detectField(series) {
  if (!Array.isArray(series) || series.length < 4) return [];
  const out = [];
  const mean   = series.reduce((a,b)=>a+b,0)/series.length;
  const range  = Math.max(...series)-Math.min(...series);
  const std    = Math.sqrt(series.reduce((s,x)=>s+(x-mean)**2,0)/series.length);
  let crossings = 0;
  for (let i=1;i<series.length;i++) if ((series[i-1]-mean)*(series[i]-mean)<0) crossings++;

  if (crossings > series.length*0.3)
    out.push(sig(GAP_TYPE.OSCILLATORY, 0.75, `Signal oscillating — ${crossings}/${series.length} zero-crossings. Commitment gap.`, 'field', 'field', '', GAP_REASON.AVOIDANCE,
      { metric: { crossings, seriesLength: series.length }, pattern: 'zero_crossing_rate' }));
  if (range < 0.05 && series.length >= 8)
    out.push(sig(GAP_TYPE.TEMPORAL, 0.50, 'Signal plateau — no meaningful change. Stall or convergence.', 'field', 'field', '', GAP_REASON.AVOIDANCE,
      { metric: { range: r4(range), seriesLength: series.length }, pattern: 'plateau' }));
  // Hard edge: sudden large jump
  for (let i=1;i<series.length;i++) {
    const jump = Math.abs(series[i]-series[i-1]);
    if (jump > std*3)
      out.push(sig(GAP_TYPE.TEMPORAL, 0.72, `Hard edge at sample ${i} — jump of ${r4(jump)} (${r4(jump/std)}σ). Maximum information density.`, 'field', 'field', '', GAP_REASON.AVOIDANCE,
        { metric: { sampleIndex: i, jump: r4(jump), sigma: r4(jump/std) }, pattern: 'hard_edge' }));
  }
  return out;
}

// ══ 11. MUSIC ════════════════════════════════════════════════════════════════
function phonemes(w) {
  return (w||'').toLowerCase().replace(/[^a-z]/g,'')
    .replace(/qu/g,'kw').replace(/ph/g,'f').replace(/ck/g,'k')
    .replace(/gh/g,'').replace(/[aeiou]+/g,'V')
    .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g,'$1');
}
function rhymeSuffix(w,len=3) { return phonemes(w).slice(-len); }

function detectMusic(text) {
  if (!text) return [];
  const out = [];
  const lines = text.split(/\n/).filter(l=>l.trim().length>0);
  if (lines.length < 2) return [];

  // Rhyme scheme detection
  const endWords = lines.map(l=>l.trim().split(/\s+/).pop()?.replace(/[^a-z]/gi,'')||'');
  const suffixes = endWords.map(w=>rhymeSuffix(w));
  const seen = {}; let letter=0;
  const scheme = suffixes.map(s=>{
    if (!s) return '?';
    if (seen[s]==null) seen[s]=String.fromCharCode(65+letter++);
    return seen[s];
  });

  // Check for forced/broken rhyme
  const uniq = new Set(scheme.filter(s=>s!=='?'));
  if (uniq.size > lines.length/2)
    out.push(sig(GAP_TYPE.LOGICAL, 0.55, `Rhyme scheme incoherent — ${uniq.size} unique end sounds for ${lines.length} lines (${scheme.join('')})`, 'music', 'music', '', GAP_REASON.AVOIDANCE,
      { metric: { uniqueEndSounds: uniq.size, lineCount: lines.length, scheme: scheme.join('') }, pattern: 'rhyme_incoherence' }));

  // Structural gaps
  const hasChorus = /\b(chorus|hook|refrain)\b/gi.test(text);
  const hasBridge = /\b(bridge|breakdown|middle 8)\b/gi.test(text);
  const hasVerse  = /\b(verse|verse 1|verse 2)\b/gi.test(text);
  if (hasVerse && !hasChorus)
    out.push(sig(GAP_TYPE.OBLIGATION, 0.65, 'Structural gap — verses present but no chorus/hook declared', 'music', 'music', 'Where is the emotional apex? The hook lives at maximum gap-field pressure.', GAP_REASON.AVOIDANCE,
      { metric: { hasVerse, hasChorus }, pattern: 'verse_without_chorus' }));
  if (lines.length > 12 && !hasBridge)
    out.push(sig(GAP_TYPE.CONDITION, 0.50, 'Long form without bridge — potential tension plateau', 'music', 'music', '', GAP_REASON.AVOIDANCE,
      { metric: { lineCount: lines.length, hasBridge }, pattern: 'long_form_no_bridge' }));

  // Cliche density
  const clicheRx = /\b(heart of gold|stand the test of time|at the end of the day|when push comes to shove|fly like an eagle|stronger together|love is a battlefield)\b/gi;
  const cliches = mc(text, clicheRx);
  if (cliches > 1)
    out.push(sig(GAP_TYPE.ASSUMPTION, 0.58, `High cliché density (${cliches}) — borrowed language compressing original signal`, 'music', 'music', '', GAP_REASON.AVOIDANCE,
      { metric: cliches, pattern: 'cliche_density' }));

  return out;
}

// ══ 12. REVERSAL ════════════════════════════════════════════════════════════
function detectReversal(text) {
  if (!text) return [];
  const out = [];
  // "fine" inversions
  const fine_inversions = /\b(fine|okay|whatever|it.s fine|sure|go ahead|do what you want)\b.{0,40}[.!]/gi;
  const fineCount = mc(text, fine_inversions);
  if (fineCount > 1)
    out.push(sig(GAP_TYPE.CONTRADICTION, 0.72, 'Reversal pattern — repeated "fine/ok" terminators. Agreement as resistance.', 'reversal', 'communication', '', GAP_REASON.AVOIDANCE,
      { metric: fineCount, pattern: 'fine_inversion_count' }));
  // Negation clusters
  const negCount = mc(text, /\b(no|not|never|nothing|nobody|nowhere|neither)\b/gi);
  const wc = tok(text).length;
  if (wc > 10 && negCount/wc > 0.12)
    out.push(sig(GAP_TYPE.CONTRADICTION, 0.65, `Negation cluster — ${negCount}/${wc} words are negations (>${r4(negCount/wc*100)}%). What is being refused?`, 'reversal', 'communication', '', GAP_REASON.AVOIDANCE,
      { metric: { negCount, wc, ratio: r4(negCount/wc) }, pattern: 'negation_density' }));
  // Rhetorical accusation
  const accusationRx = /\b(so you.re saying|you think i.m|you.re accusing me of|you.re blaming)\b/gi;
  if (accusationRx.test(text))
    out.push(sig(GAP_TYPE.HIERARCHY, 0.70, 'Rhetorical accusation — restating other\'s words as attack', 'reversal', 'communication', '', GAP_REASON.AVOIDANCE,
      { pattern: accusationRx.source, matches: mc(text, accusationRx) }));
  return out;
}

// ══ Main entry points ════════════════════════════════════════════════════════
function analyzeCode(code)         { return detectCode(code).sort((a,b)=>b.criticality-a.criticality); }
function analyzeText(text)         { return [...detectAssumption(text),...detectContrastive(text),...detectStructural(text),...detectShadow(text),...detectNegativeSpace(text),...detectRelational(text),...detectReversal(text),...detectExistential(text)].sort((a,b)=>b.criticality-a.criticality); }
function analyzeField(series)      { return [...detectField(series),...detectOscillatory(series)].sort((a,b)=>b.criticality-a.criticality); }
function analyzeMusic(text)        { return detectMusic(text).sort((a,b)=>b.criticality-a.criticality); }
function analyzeRelational(text)   { return detectRelational(text); }

function analyze(input, opts={}) {
  const { mode='auto' } = opts;
  let out = [];
  if (typeof input === 'string') {
    if (mode==='code' || /function|class|catch\s*\(|async |await |SELECT|INSERT/i.test(input)) out.push(...detectCode(input));
    out.push(...analyzeText(input));
    if (mode==='music' || /verse|chorus|bridge|lyric/i.test(input)) out.push(...detectMusic(input));
  }
  if (Array.isArray(input) && input.every(x=>typeof x==='number')) out.push(...analyzeField(input));
  return out.sort((a,b)=>b.criticality-a.criticality);
}

module.exports = {
  analyze, analyzeCode, analyzeText, analyzeField, analyzeMusic, analyzeRelational,
  detectCode, detectAssumption, detectContrastive, detectStructural, detectShadow,
  detectNegativeSpace, detectRelational, detectOscillatory, detectExistential,
  detectField, detectMusic, detectReversal,
  GapSignal: G, GAP_TYPE, GAP_REASON,
  MODULE_ID: 'liminal', VERSION: '1.0.0',
};
