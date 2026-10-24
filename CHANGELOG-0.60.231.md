# 0.60.231 — 2026-10-24

James: "b, tighten the crystallizer threshold."

Said after the analysis mapping RAID's signal-to-noise filter and intelligence/RFR2 against his INNOVATION TOOLKIT
framework (`docs/innovation-toolkit.framework`). That analysis found the framework's own named weak pillar living in the
code: the framework says **"intuition must be regulated and grounded"**, but the intelligence crystallizer did the
opposite — it crystallised first and regulated later.

## The problem (grounded, from the code and the boot log)

`intelligence/index.js` crystallised a co-occurrence pattern the moment its count crossed a floor (3 for a rare pair, 10
for a common one) — at `confidence = count/20`, i.e. **15% confidence at count 3**. Once `crystallised: true` latched, it
went out on the bus and `liminal-space` and others held a belief off it. The lift/noise brake (`_scanMetaPatterns`, §1.5)
that could tell real signal from base-rate noise ran a `META_SCAN_MS` (3 minutes) **later**, over the table as a whole.
The accelerator was upstream; the regulator was downstream. The boot log showed the cost: `135 co-patterns, 10
lift-confirmed signal` — 125 of 135 crystallised patterns were noise the brake had to walk back after the fact.

## The fix — the regulator moved upstream, to the gate

`_coOccurrenceLift` (new, pure, exported) is an **event-level base-rate lift**: observed co-occurrences ÷ what pure
chance would produce (`freqA · freqB · window/span`). A co-occurrence now crystallises only when it:

1. clears the count floor — James's *"once twice three times it is a pattern"*, kept; **and**
2. beats chance by `CRYSTALLIZE_LIFT_MIN` (1.5 — the same bar `_scanMetaPatterns` uses downstream); **and**
3. is not a known structural noise type.

Otherwise it is **held as `status: 'hypothesis'`** (`crystallised: false`): kept, written and counted (§0.3, lose
nothing), promoted to crystallised only when it later earns it. This is the second, event-level lift that
`_scanMetaPatterns`' own comment calls *"the honest one"* it could not compute downstream (it has only pattern-level
participation). So it belongs at the gate.

## Drift found and fixed on the way (§0.1, evidence over assumption)

The first cut passed the **cumulative** count to the lift while the frequencies are **windowed** (≤500). That ratio
drifts upward forever — over a long run it eventually crystallises *everything*, the exact inflation the gate exists to
stop. A test run caught it: a `noise::noise` self-pair announced as crystallised. The lift now reads a **full-window**
co-occurrence tally (`coOccurWindow`, no cursor gate) over full-window frequencies — a clean, drift-free, same-window
ratio. The cumulative count drives only the floor and the latch.

## Consumers

`getContext` no longer feeds an ungrounded hypothesis as if settled: a `co_occurrence` with `status: 'hypothesis'` is
excluded even when its count-derived confidence reads ≥0.6. Rows without a status (precursor, bottleneck, older rows) are
unaffected.

## Schema

`intelligence/schemas/schema.bep_pattern` and `intelligence/schemas.js` gain `lift` (number) and `status`
(`'crystallised' | 'hypothesis'`).

## Proof

| Suite | Result |
| --- | --- |
| intelligence.test.js | 15/15 |

- **D1/D2** now prove a heartbeat co-occurrence that cannot beat base rate is held as a hypothesis and **never announced**
  (the old tests asserted the opposite — the un-regulated policy; inverted here to the correct one).
- **F0–F5** prove the pure gate directly: a rare exclusive pair over a real time span beats base rate (would
  crystallise); a loud chance-rate pair and a whole-stream burst do not; degenerate/missing inputs return 0 (held, never
  a false positive); lift rises monotonically with observed co-occurrences.

## Said, not hidden (§1.2)

`tests/modules/test-intelligence-bridge.js` is red on main for an unrelated reason: it requires
`cortex/core/raid/intelligence-bridge`, a module that does not exist in this checkout. Not caused by this change, and not
touched here — flagged for a separate decision.
