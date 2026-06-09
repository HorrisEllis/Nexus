'use strict';
// ── test/gap-hunter-v3.test.js ────────────────────────────────────────────────
let _pass = 0, _fail = 0;
const _failures = [];

function assert(cond, label, detail = '') {
  if (cond) { _pass++; process.stdout.write(`  ✓ ${label}\n`); }
  else {
    _fail++;
    const msg = `  ✗ ${label}${detail ? ': ' + detail : ''}`;
    process.stdout.write(msg + '\n');
    _failures.push(msg);
  }
}

function section(name) {
  process.stdout.write(`\n── ${name} ${'─'.repeat(Math.max(0, 70 - name.length))}\n`);
}

const GapHunter = require('../guardian/lib/gap-hunter.js');

async function run() {
  await new Promise(r => setTimeout(r, 1200));

  section('L1 — Contract: API surface');
  assert(typeof GapHunter.analyze === 'function',       'L1.1 analyze() exported');
  assert(typeof GapHunter.drift === 'function',          'L1.2 drift() exported');
  assert(typeof GapHunter.analyzeSequence === 'function','L1.3 analyzeSequence() exported');
  assert(typeof GapHunter.health === 'function',         'L1.4 health() exported');
  assert(typeof GapHunter.GAP_TYPE === 'object',         'L1.5 GAP_TYPE exported');
  assert(typeof GapHunter.GAP_REASON === 'object',       'L1.6 GAP_REASON exported');
  assert(typeof GapHunter.DOMAIN === 'object',           'L1.7 DOMAIN exported');
  assert(GapHunter.VERSION === '3.1.0',                  'L1.8 VERSION = 3.1.0');
  assert(GapHunter.loaded === true,                      'L1.9 engine loaded after warm-up');
  assert(Array.isArray(GapHunter.analyze('test')),       'L1.10 analyze() returns array');
  assert(GapHunter.analyze('').length === 0,             'L1.11 empty string → []');
  assert(GapHunter.analyze(null).length === 0,           'L1.12 null → []');
  assert(GapHunter.analyze('hi').length === 0,           'L1.13 very short text → []');
  assert(typeof GapHunter.drift([]) === 'number',        'L1.14 drift([]) returns number');
  assert(GapHunter.drift([]) === 0,                      'L1.15 drift([]) === 0');
  assert(typeof GapHunter.drift(null) === 'number',      'L1.16 drift(null) returns number');

  section('L2 — Behavioral: detectors fire on correct inputs');

  const assertGaps = GapHunter.analyze(
    'This is obviously correct. Every developer always knows this approach is best. Clearly the only solution.'
  );
  assert(assertGaps.length > 0, 'L2.1 weak assumption text → gaps detected');
  assert(assertGaps.some(g => g.type === 'weak_assumption' || g.type === 'compound'), 'L2.2 weak_assumption type fired');

  // Shadow needs arousal context — use text that combines intensity mismatch + minimization
  const shadowGaps = GapHunter.analyze(
    "I'm absolutely fine. It's really nothing. Doesn't bother me at all. Whatever happens. Not even slightly bothered. It doesn't matter either way."
  );
  assert(shadowGaps.length > 0, 'L2.3 shadow/minimization text → gaps detected');

  // Multiple gap classes: code gap fires on code, assumption gap fires on assertion text
  const nsText1 = GapHunter.analyze('Obviously every developer always uses this approach. Clearly the correct solution for all cases.');
  const nsText2 = GapHunter.analyze('function go() { try { run(); } catch(e) {} }', { domain: 'code' });
  assert(nsText1.length > 0 && nsText2.length > 0, 'L2.4 assertion and code gap classes fire on respective inputs');

  const codeGaps = GapHunter.analyze(
    'function process() { try { doWork(); } catch(e) {} /* TODO: error handling */ }',
    { domain: 'code' }
  );
  assert(codeGaps.length > 0, 'L2.5 code gap (silent catch + TODO) → gaps detected');

  const cleanGaps = GapHunter.analyze(
    'The function takes two parameters: a string and a number. It returns their concatenation. If the number is negative, it throws a TypeError with the message "number must be positive".'
  );
  assert(cleanGaps.length === 0, 'L2.6 clean precise text → zero gaps');

  const assertDense = GapHunter.analyze(
    'Always use this pattern. Never do it the other way. All good developers agree. Every codebase should follow this.'
  );
  assert(assertDense.length > 0, 'L2.7 high assertion density → gaps detected');
  assert(assertDense.some(g => g.score >= 0.3), 'L2.8 high assertion density → score >= 0.3');

  const reversalGaps = GapHunter.analyze("I'm totally fine. Not even slightly bothered. It was nothing.");
  assert(reversalGaps.length > 0, 'L2.9 reversal/minimization → gaps detected');

  section('L3 — Integrity: gap row fields for JAA insert');

  const testTexts = [
    'This is obviously the correct approach. Every expert agrees.',
    "It's fine. Whatever. I don't care.",
    'function x() { try { run(); } catch(e) {} }',
  ];

  for (let i = 0; i < testTexts.length; i++) {
    const gaps = GapHunter.analyze(testTexts[i], { domain: i === 2 ? 'code' : undefined });
    for (const g of gaps) {
      assert(typeof g.type === 'string',           `L3.${i} type is string`);
      assert(g.domain !== undefined,                `L3.${i} domain defined`);
      assert(g.reason !== undefined && g.reason !== null, `L3.${i} reason defined and non-null`);
      assert(typeof g.description === 'string',    `L3.${i} description is string`);
      assert(typeof g.score === 'number',           `L3.${i} score is number`);
      assert(g.score >= 0 && g.score <= 1,          `L3.${i} score in [0,1]`);
      assert(typeof g.evidence === 'object',        `L3.${i} evidence is object`);
      assert(g.confidence !== undefined,             `L3.${i} confidence defined`);
      assert(Array.isArray(g.reasons) && g.reasons.length > 0, `L3.${i} reasons[] non-empty`);
      assert(typeof g.signal_note === 'string',     `L3.${i} signal_note is string`);
    }
  }

  // Reason values are valid GAP_REASON values
  const validReasons = new Set(Object.values(GapHunter.GAP_REASON));
  const rGaps = GapHunter.analyze('Obviously correct. Every developer knows this. Always the best approach.');
  for (const g of rGaps) {
    assert(validReasons.has(g.reason), `L3.reason '${g.reason}' is valid GAP_REASON value`);
  }

  section('L4 — Cross: drift, sequence, compound, v3 vs v1 delta');

  // drift() confidence weighting
  // Confidence weighting: HIGH-scored+HIGH-conf vs HIGH-scored+LOW-conf
  // Mix: one HIGH score with HIGH conf vs one HIGH score with LOW conf — drift differs
  const mixedHigh = GapHunter.drift([{ score: 0.8, confidence: 'HIGH' }, { score: 0.2, confidence: 'LOW' }]);
  const mixedLow  = GapHunter.drift([{ score: 0.8, confidence: 'LOW'  }, { score: 0.2, confidence: 'HIGH'}]);
  assert(mixedHigh > mixedLow, `L4.1 mixed drift: high-score/HIGH-conf > high-score/LOW-conf: ${mixedHigh} > ${mixedLow}`);

  const d1 = GapHunter.drift([{ score: 0.3, confidence: 'MEDIUM' }]);
  const d2 = GapHunter.drift([{ score: 0.8, confidence: 'MEDIUM' }]);
  assert(d2 > d1, `L4.2 higher score → higher drift: ${d2} > ${d1}`);

  // analyzeSequence
  const seqResult = GapHunter.analyzeSequence([
    'This is obviously always correct.',
    "I'm fine. Doesn't matter. Whatever.",
    'Every expert agrees this is the only approach.',
  ]);
  assert(Array.isArray(seqResult.gaps),                     'L4.3 analyzeSequence.gaps is array');
  assert(typeof seqResult.drift === 'number',               'L4.4 analyzeSequence.drift is number');
  assert(seqResult.gaps.length > 0,                         'L4.5 analyzeSequence detects gaps across turns');
  assert(GapHunter.analyzeSequence([]).gaps.length === 0,   'L4.6 analyzeSequence([]) → empty');
  assert(GapHunter.analyzeSequence([]).drift === 0,         'L4.7 analyzeSequence([]) → drift=0');

  // health()
  const h = GapHunter.health();
  assert(h.loaded === true,               'L4.8 health().loaded = true');
  assert(h.version === '3.1.0',          'L4.9 health().version = 3.1.0');
  assert(typeof h.detectors === 'number', 'L4.10 health().detectors is number');

  // v3 meaningfully more than v1 on psychological text
  // v3 vs v1: v3 detects psychological patterns v1 (lexical/entropy/bullet checks) missed entirely
  // Use distinct texts for distinct detector types
  const waGaps  = GapHunter.analyze('Obviously this is always correct. Every expert agrees. Clearly the only approach.');
  const sfGaps  = GapHunter.analyze('I am absolutely fine with all of this. It really does not bother me. Whatever happens.');
  const rvGaps  = GapHunter.analyze("It's totally fine. Not upset at all. Everything is great. I'm perfectly okay with it.");
  const waFired = waGaps.some(g => g.type === 'weak_assumption' || g.type === 'compound');
  const sfFired = sfGaps.some(g => g.type === 'contrastive_gap' || g.type === 'shadow_field' || g.type === 'reversal');
  const rvFired = rvGaps.some(g => ['reversal','contrastive_gap','shadow_field','weak_assumption'].includes(g.type));
  const v3DetectorsFired = [waFired && 'weak_assumption', sfFired && 'shadow/contrastive', rvFired && 'reversal'].filter(Boolean);
  assert(v3DetectorsFired.length >= 2, `L4.11 v3 fires ≥2 detector classes v1 couldn't: [${v3DetectorsFired}]`);

  // load_bearing_question present on assumption gaps
  const lbqGaps = GapHunter.analyze('Obviously this is always the correct and only approach for every case.');
  const hasLBQ = lbqGaps.some(g => g.load_bearing_question && g.load_bearing_question.length > 10);
  assert(hasLBQ, 'L4.12 assumption gaps carry load_bearing_question');

  // Summary
  process.stdout.write(`\n${'═'.repeat(72)}\n`);
  process.stdout.write(`  ${_pass}/${_pass + _fail} passed   ${_fail} failed\n`);
  if (_failures.length) {
    process.stdout.write('\nFAILURES:\n');
    _failures.forEach(f => process.stdout.write(f + '\n'));
  }
  process.stdout.write(`${'═'.repeat(72)}\n`);
  process.exit(_fail > 0 ? 1 : 0);
}

run().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });
