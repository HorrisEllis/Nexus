'use strict';
/**
 * lib/lenses.js — parse ONE input through MANY lenses and contrast the readings.
 * comp_id: nexus.lib.lenses
 * UUID: nexus-lenses-v1-0000-2026-0809-001
 * Version: 0.1.0
 *
 * WHY (James, 2026-08-09: "parsing with different lenses").
 *
 * NEXUS already has several readers that each answer a different question about
 * the same text — liminal's 12 gap detectors, the intelligence intuition and
 * mastermind surfaces, adversarial, the axiom checker. Every one is reached
 * separately, and their answers are never put side by side. So nothing can
 * notice that two lenses DISAGREE, which is the most informative thing a set of
 * readers can produce.
 *
 * A lens is: a name, a question it answers, and a read(input) that returns a
 * finding or ABSTAINS. Abstention is first-class — a lens that cannot see is
 * silent, and silence is data (§12.5). It is not a zero.
 *
 * ── CONTRAST IS THE POINT ───────────────────────────────────────────────────
 * contrast() reports where lenses agree, where they disagree, and — the one that
 * matters most — where ONE lens fires alone. A single lens firing while every
 * other abstains is either the sharpest signal in the set or a false positive,
 * and either way it is the thing to look at. A count of findings hides it.
 *
 * lib/ is for agnostic tools. Every lens here is optional and degrades by name:
 * a missing reader is reported as UNAVAILABLE, never silently dropped, because a
 * lens that did not run and a lens that found nothing must never look alike.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function _opt(rel) { try { return require(path.join(ROOT, rel)); } catch (e) { return { __unavailable: e.message }; } }

// ── LENS: liminal — 12 domain-agnostic gap detectors ────────────────────────
const liminalLens = {
  name: 'liminal',
  question: 'what is structurally absent, avoided, or contradicted in this text?',
  read(input) {
    const L = _opt('meta/liminal');
    if (L.__unavailable) return { status: 'UNAVAILABLE', reason: L.__unavailable };
    if (typeof L.analyzeText !== 'function') return { status: 'UNAVAILABLE', reason: 'meta/liminal has no analyzeText' };
    let gaps;
    try { gaps = L.analyzeText(String(input).slice(0, 20000)) || []; }
    catch (e) { return { status: 'ERROR', reason: e.message }; }
    if (!gaps.length) return { status: 'ABSTAIN', reason: 'no detector fired' };
    return {
      status: 'FINDING',
      // §the whole point: liminal's callers keep gaps[0].criticality and throw
      // the rest away. Here every detector that fired is kept, by name.
      detectors: gaps.slice(0, 8).map(g => ({
        detector: g.detector || g.type || g.gapType || '?',
        criticality: g.criticality,
        reason: String(g.reason || g.gapReason || '').slice(0, 140),
      })),
      peak: Math.max(...gaps.map(g => g.criticality || 0)),
      fired: gaps.length,
    };
  },
};

// ── LENS: axioms — constitutional check ─────────────────────────────────────
const axiomLens = {
  name: 'axioms',
  question: 'does this violate a declared axiom?',
  read(input) {
    const A = _opt('copilot/axiom-manager');
    if (A.__unavailable) return { status: 'UNAVAILABLE', reason: A.__unavailable };
    let r;
    try { r = A.check(String(input).slice(0, 20000)); } catch (e) { return { status: 'ERROR', reason: e.message }; }
    // §FOUND 2026-08-08 — the axioms table is EMPTY, so check() returns
    // passed:true for everything including "I added a stub that returns fake
    // data". A gate with nothing in it must not report a pass.
    if (!r.axiomCount) {
      return { status: 'UNAVAILABLE',
        reason: 'axiom table is EMPTY (axiomCount 0) — this lens would pass everything, so it abstains rather than reporting a clean read' };
    }
    if (r.passed) return { status: 'ABSTAIN', reason: `checked against ${r.axiomCount} axioms, none violated` };
    return { status: 'FINDING', violations: r.violations, axiomCount: r.axiomCount };
  },
};

// ── LENS: edge-cases — named operational edge cases per system ──────────────
const edgeLens = {
  name: 'edge-cases',
  question: 'does this match a known edge case for this system?',
  read(input, opts = {}) {
    const E = _opt('lib/edge-cases.js');
    if (E.__unavailable) return { status: 'UNAVAILABLE', reason: E.__unavailable };
    if (typeof E.matchEdgeCase !== 'function') return { status: 'UNAVAILABLE', reason: 'edge-cases has no matchEdgeCase' };
    let m;
    try { m = E.matchEdgeCase(opts.system || 'cortex', String(input).slice(0, 4000)); }
    catch (e) { return { status: 'ERROR', reason: e.message }; }
    if (!m) {
      let gap = null;
      try { gap = E.coverageGap ? E.coverageGap(opts.system || 'cortex', String(input).slice(0, 200)) : null; } catch (_) {}
      return { status: 'ABSTAIN', reason: 'no known edge case matched', coverageGapRecorded: !!gap };
    }
    return { status: 'FINDING', match: m };
  },
};

// ── LENS: sigma — how far from baseline is this, structurally? ──────────────
const sigmaLens = {
  name: 'sigma',
  question: 'how unusual is this compared to the field baseline?',
  read(input, opts = {}) {
    const S = _opt('intelligence/cfr/sigma.js');
    if (S.__unavailable) return { status: 'UNAVAILABLE', reason: S.__unavailable };
    if (typeof S.computeSigma !== 'function') return { status: 'UNAVAILABLE', reason: 'cfr/sigma has no computeSigma' };
    if (!opts.event) return { status: 'ABSTAIN', reason: 'sigma reads an EVENT, not free text — pass opts.event' };
    let r;
    try { r = S.computeSigma(opts.event, opts.baseline || null, opts.cfrState || null, opts.intervalMs); }
    catch (e) { return { status: 'ERROR', reason: e.message }; }
    const val = typeof r === 'number' ? r : (r && r.sigma);
    if (!val) return { status: 'ABSTAIN', reason: 'no deviation from baseline' };
    return { status: 'FINDING', sigma: val, detail: typeof r === 'object' ? r : undefined };
  },
};

// ── LENS: shape — cheap structural read that needs nothing else ─────────────
const shapeLens = {
  name: 'shape',
  question: 'what shape is this input, independent of meaning?',
  read(input) {
    const s = String(input);
    const lines = s.split('\n');
    const findings = [];
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(s)) findings.push('empty catch block — a swallowed failure (§1.2)');
    if (/\bTODO\b|\bFIXME\b|\bstub\b|for now/i.test(s)) findings.push('unfinished marker (TODO/FIXME/stub/"for now")');
    if (/return\s+\[\s*\]\s*;?\s*$/m.test(s) && /catch/.test(s)) findings.push('returns [] from a catch — absence and failure made identical');
    if (/\|\|\s*['"]unknown['"]|\?\?\s*0\b/.test(s)) findings.push('default that can mask a missing field (|| "unknown", ?? 0)');
    if (!findings.length) return { status: 'ABSTAIN', reason: 'no structural marker found' };
    return { status: 'FINDING', markers: findings, lines: lines.length, chars: s.length };
  },
};

const LENSES = [liminalLens, axiomLens, edgeLens, sigmaLens, shapeLens];

/** list() — every lens and the question it answers. */
function list() { return LENSES.map(l => ({ name: l.name, question: l.question })); }

/**
 * parse(input, opts) -> readings from every lens (or the named subset).
 * Never throws. Every lens returns one of: FINDING | ABSTAIN | UNAVAILABLE | ERROR.
 */
function parse(input, opts = {}) {
  if (input === undefined || input === null || String(input).trim() === '') {
    return { ok: false, reason: 'parse(input) requires non-empty input' };
  }
  const want = opts.lenses && opts.lenses.length ? LENSES.filter(l => opts.lenses.includes(l.name)) : LENSES;
  const readings = {};
  for (const l of want) {
    try { readings[l.name] = { question: l.question, ...l.read(input, opts) }; }
    catch (e) { readings[l.name] = { question: l.question, status: 'ERROR', reason: e.message }; }
  }
  return { ok: true, readings, lensCount: want.length };
}

/**
 * contrast(parsed) -> where the lenses agree, disagree, and stand alone.
 * The disagreement IS the signal. A count of findings hides it.
 */
function contrast(parsed) {
  if (!parsed || !parsed.ok) return { ok: false, reason: 'contrast(parse(...)) needs a successful parse' };
  const r = parsed.readings;
  const names = Object.keys(r);
  const found = names.filter(n => r[n].status === 'FINDING');
  const abstained = names.filter(n => r[n].status === 'ABSTAIN');
  const blind = names.filter(n => r[n].status === 'UNAVAILABLE' || r[n].status === 'ERROR');

  const verdict =
    blind.length === names.length ? 'NO READING — every lens was blind' :
    found.length === 0 ? 'CLEAN across every lens that could see' :
    found.length === 1 ? `SOLE FINDING — only "${found[0]}" fired` :
    found.length === names.length - blind.length ? 'UNANIMOUS across every seeing lens' :
    'SPLIT';

  return {
    ok: true, verdict,
    found, abstained, blind,
    // A sole finding is either the sharpest signal in the set or a false
    // positive. Either way it is the thing to look at, and a total would bury it.
    soleFinding: found.length === 1 ? { lens: found[0], reading: r[found[0]] } : null,
    // §1.2 — blindness is reported at the top level. A "clean" verdict computed
    // from lenses that never ran is the failure this module exists to prevent.
    coverage: `${names.length - blind.length}/${names.length} lenses could see`,
    blindReasons: blind.map(n => ({ lens: n, reason: r[n].reason })),
  };
}

module.exports = { list, parse, contrast, LENSES, VERSION: '0.1.0' };
