'use strict';
/**
 * guardian/lib/detector.js — Response Quality Detector
 * UUID: guardian-detector-v1-0000-4000-0000-000000000001
 *
 * Ported from userscript v8.3 Detector object.
 * Runs server-side so detection results are persisted in JAA, not localStorage.
 *
 * Three detection axes:
 *   truncation — response cut short (context window pressure, incomplete)
 *   sigma      — behavioral deviation (missing code blocks, low diversity)
 *   delta      — content deviation (missing keywords, stubs, axiom violations)
 *
 * composite = truncation×0.5 + sigma×0.3 + delta×0.2
 * passed = composite < 0.35 AND !truncated
 */

const Detector = {
  profile(chunk) {
    const lines = chunk.split('\n'), words = chunk.match(/\b\w+\b/g)||[];
    const codeBlocks = (chunk.match(/```/g)||[]).length / 2;
    return {
      words: words.length, chars: chunk.length,
      codeBlocks: Math.ceil(codeBlocks),
      headers: lines.filter(l => /^#{1,4}\s/.test(l)).length,
      musts: (chunk.match(/\b(MUST|REQUIRED|SHALL|CRITICAL)\b/g)||[]).length,
      hasSeamContract: /SEAM CONTRACT|SEAM VERDICT/i.test(chunk),
      minResponseChars: Math.max(200, chunk.length * 0.4),
      maxResponseChars: chunk.length * 8,
    };
  },

  truncation(response, profile) {
    if (!response || response.length < 40)
      return { truncated:true, score:1.0, reason:'empty_or_tiny' };
    const lines = response.trim().split('\n');
    const last = lines[lines.length-1]?.trim() || '';
    // The SEAM protocol's own designed terminator — "SEAM VERDICT: PASS" /
    // "SEAM VERDICT: FAIL", verbatim from the prompt template this detector
    // is grading against — doesn't end in [.!?:)\]'"] at all, with or
    // without a trailing emoji (✔️/❌ etc., which models commonly add and
    // which the old emoji-blind regex also choked on). The old check flagged
    // every well-formed SEAM VERDICT line as mid_sentence_end unconditionally
    // — confirmed live: identical composite score across 9 straight retries
    // on content that varied each time, meaning it was never reading content
    // at all. A real verdict format gets a real pass here, not a punctuation
    // guess.
    const isSeamVerdictLine = /SEAM\s+VERDICT\s*:\s*(PASS|FAIL)\s*[^\w]{0,10}$/i.test(last);
    if (!isSeamVerdictLine && last.length > 0 && !last.match(/[.!?:)\]'"]$/) && last.length < 80)
      return { truncated:true, score:0.85, reason:'mid_sentence_end' };
    if (response.length < profile.minResponseChars) {
      const ratio = response.length / profile.minResponseChars;
      return { truncated:true, score:parseFloat((1-ratio).toFixed(3)), reason:'too_short', ratio };
    }
    if (profile.hasSeamContract && !/SEAM VERDICT/i.test(response))
      return { truncated:true, score:0.75, reason:'missing_seam_verdict' };
    return { truncated:false, score:0 };
  },

  sigma(response, profile) {
    const signals = []; let score = 0;
    const gotCodeBlocks = (response.match(/```/g)||[]).length / 2;
    if (profile.codeBlocks > 0 && gotCodeBlocks === 0) {
      signals.push({ type:'missing_code_blocks', expected:profile.codeBlocks, got:0 });
      score += 0.3;
    }
    const ratio = response.length / Math.max(1, profile.chars);
    if (ratio < 0.3) { signals.push({ type:'too_short', ratio }); score += 0.25; }
    const words = response.toLowerCase().match(/\b\w+\b/g) || [];
    const ld = words.length > 5 ? new Set(words).size / words.length : 1;
    if (ld < 0.25 && words.length > 100) {
      signals.push({ type:'low_lexical_diversity', ld }); score += 0.2;
    }
    const hedgeRate = words.length > 0
      ? (response.match(/\b(might|may|could|perhaps|possibly|seems|appears)\b/gi)||[]).length / words.length
      : 0;
    if (hedgeRate > 0.08) {
      signals.push({ type:'high_hedge_rate', hedgeRate:parseFloat(hedgeRate.toFixed(3)) });
      score += 0.15;
    }
    if (profile.musts > 2) {
      const addressed = (response.match(/\b(implement|complete|done|added|created|built|resolved)\b/gi)||[]).length;
      if (addressed === 0) {
        signals.push({ type:'mandatory_reqs_unaddressed', musts:profile.musts }); score += 0.2;
      }
    }
    return { score:parseFloat(Math.min(1,score).toFixed(3)), signals, deviating:score >= 0.4 };
  },

  delta(response, chunkContent, axioms = []) {
    const issues = []; let score = 0;
    for (const axiom of axioms) {
      if (axiom.startsWith('!')) {
        const pat = axiom.slice(1);
        if (response.toLowerCase().includes(pat.toLowerCase())) {
          issues.push({ axiom, type:'axiom_violation', detail:`Forbidden: "${pat}"` });
          score += 0.35;
        }
      } else {
        if (!response.toLowerCase().includes(axiom.toLowerCase())) {
          issues.push({ axiom, type:'axiom_missing', detail:`Required: "${axiom}"` });
          score += 0.2;
        }
      }
    }
    const kws = [
      ...(chunkContent.match(/`([^`]{2,40})`/g)||[]).map(m => m.replace(/`/g,'')),
      ...(chunkContent.match(/\b([A-Z][a-zA-Z]{3,}(?:Store|Client|Engine|Manager|Service|Handler|Router|Bus))\b/g)||[]),
    ].filter((v,i,a) => a.indexOf(v) === i).slice(0, 20);
    const missing = kws.filter(kw => !response.includes(kw)).length;
    if (kws.length > 0 && missing/kws.length > 0.6) {
      issues.push({ type:'keyword_coverage_low', missingRate:parseFloat((missing/kws.length).toFixed(2)), total:kws.length });
      score += (missing/kws.length) * 0.3;
    }
    const stubs = (response.match(/\bTODO\b|\bFIXME\b|\/\/ stub|throw new Error\(['"]not implemented/gi)||[]).length;
    if (stubs > 0) {
      issues.push({ type:'stubs_in_response', count:stubs });
      score += Math.min(0.4, stubs * 0.12);
    }
    return { score:parseFloat(Math.min(1,score).toFixed(3)), issues, deviating:score >= 0.35 };
  },

  evaluate(response, chunkContent, profile, axioms = []) {
    const trunc = Detector.truncation(response, profile);
    const sig   = Detector.sigma(response, profile);
    const delt  = Detector.delta(response, chunkContent, axioms);
    const composite = parseFloat((trunc.score*0.5 + sig.score*0.3 + delt.score*0.2).toFixed(3));
    const passed = composite < 0.35 && !trunc.truncated;
    return {
      passed, composite, truncation:trunc, sigma:sig, delta:delt,
      summary: passed
        ? `Δ=${composite} — accepted`
        : `Δ=${composite} — ${trunc.truncated ? 'TRUNCATED:'+trunc.reason : sig.deviating ? 'SIGMA:'+sig.signals.map(s=>s.type).join(',') : 'DELTA:'+delt.issues.map(i=>i.type).join(',')}`,
    };
  },
};

module.exports = { Detector };
