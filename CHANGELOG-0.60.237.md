# 0.60.237 — 2026-10-24

James: "b, tighten the crystallizer threshold." / "then look through nexus and document all proof."

> Renumbered from 0.60.231. The crystallizer work was built on the `claude/sleepy-gates-9lc085` branch as 0.60.231, in
> parallel with main, which independently used 0.60.231 for JA4 (the autofill learn-loop). Per main's own merge
> precedent (§0.3, nothing renumbered away, both kept), this release is numbered above main's latest (0.60.236) so both
> entries stand; `CHANGELOG-0.60.231.md` holds main's JA4.

Said after the analysis mapping RAID's signal-to-noise filter and intelligence/RFR2 against his INNOVATION TOOLKIT
framework (`docs/innovation-toolkit.framework`). That analysis found the framework's own named weak pillar living in the
code: the framework says **"intuition must be regulated and grounded"**, but the intelligence crystallizer crystallised
first and regulated later.

## The problem (grounded, from the code and the boot log)

`intelligence/index.js` crystallised a co-occurrence pattern the moment its count crossed a floor (3 for a rare pair, 10
for a common one) — at `confidence = count/20`, i.e. **15% confidence at count 3**. Once `crystallised: true` latched, it
went out on the bus and `liminal-space` and others held a belief off it. The lift/noise brake (`_scanMetaPatterns`, §1.5)
that could tell real signal from base-rate noise ran a `META_SCAN_MS` (3 minutes) **later**. The boot log showed the
cost: `135 co-patterns, 10 lift-confirmed signal` — 125 of 135 crystallised patterns were noise the brake walked back
after the fact.

## The fix — the regulator moved upstream, to the gate

`_coOccurrenceLift` (new, pure, exported) is an **event-level base-rate lift**: observed co-occurrences ÷ what pure
chance would produce (`freqA · freqB · window/span`). A co-occurrence now crystallises only when it:

1. clears the count floor — James's *"once twice three times it is a pattern"*, kept; **and**
2. beats chance by `CRYSTALLIZE_LIFT_MIN` (1.5 — the same bar `_scanMetaPatterns` uses downstream); **and**
3. is not a known structural noise type.

Otherwise it is **held as `status: 'hypothesis'`** (`crystallised: false`): kept, written and counted (§0.3), promoted
to crystallised only when it later earns it.

## Drift found and fixed on the way (§0.1)

The first cut passed the **cumulative** count to the lift while the frequencies are **windowed** (≤500). That ratio
drifts upward forever — over a long run it eventually crystallises *everything*. A test run caught it: a `noise::noise`
self-pair announced as crystallised. The lift now reads a **full-window** co-occurrence tally (`coOccurWindow`) over
full-window frequencies — a clean, drift-free, same-window ratio. The cumulative count drives only the floor and the
latch.

## Consumers & schema

`getContext` no longer feeds an ungrounded hypothesis as if settled. `intelligence/schemas/schema.bep_pattern` and
`intelligence/schemas.js` gain `lift` and `status`.

## Proof

| Suite | Result |
| --- | --- |
| intelligence.test.js | 15/15 |

- **D1/D2** prove a heartbeat pair that cannot beat base rate is held as a hypothesis and **never announced**.
- **F0–F5** prove the pure gate: a rare exclusive pair beats base rate; a loud chance-rate pair and a whole-stream burst
  do not; degenerate inputs return 0 (held); lift is monotone in observed.

## Also in this release — all proof documented

`docs/PROOF-INDEX.md` (new): a checkable catalog of every kind of proof in Nexus — scale (15 systems, ~525k LoC, 168
phasemaps, 1959 `.phase` nodes), the loom self-model (3588 components, 5080 wires), the suite, specs that compile, the
framework's empirical grounding, and honesty on the record. `docs/PROOF-OF-COMPETENCY.md` gains the crystallizer entry.

## Said, not hidden (§1.2)

`tests/modules/test-intelligence-bridge.js` requires `cortex/core/raid/intelligence-bridge`, a module that does not
exist in this checkout — a pre-existing missing module, not a behavioural failure. Not touched here.
