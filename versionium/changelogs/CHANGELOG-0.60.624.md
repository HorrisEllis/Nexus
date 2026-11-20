# 0.60.624 — deterministic first, the test

James, 2026-11-20: "lets get that to 100%. What is the qaulity of code?"

## What changed
Read from the tenth build's tests (EMB3, run phrun-mwpce6bg-s4h8): the 3b's were close (every rewrite covered; one missing quote, one contradiction); DeepSeek 16b's parsed but contradicted itself (`===` kept on one line, rewritten on another; semicolons kept although the phase says remove them), and each model invented its own format for what the phase left unsaid (`fixes`). Accepted, DeepSeek's test could never be passed: the run ended contract-incomplete, and Idearium did not answer HTTP for about an hour while it ran.
- **Tests from the phase's examples** (lib/test-first.js `examplesFrom`, `fromExamples`): a phase may list `examples:` (`call(args) == expected`); its test is written from them by Nexus, no model, correct by construction, and still kept only if it fails on today's tree.
- **A self-contradicting test is refused** (`contradictions`, his Section 10, hostile verification): a model's test that expects one call two ways is refused before it is frozen, and the ladder climbs.
- **EMB3** got ten examples and its `fixes` defined: the kinds, each once, in the order met (`!`, `&&`, `||`, `===`, `!==`, `;`).

test-emerge-rung 12/12; the test from EMB3's examples parses.

## Files
- lib/test-first.js, idearium/api/index.js, docs/2026-10-17-pieces-not-order-phasemap.spec
