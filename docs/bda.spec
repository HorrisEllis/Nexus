spec:
  meta:
    name:        bda
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    layer:       meta
    uuid:        nexus-bda-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Behavioral Drift Analyzer. 5-signal extraction per text: valence, certainty, openness, tension, selfref. Pendulum engine. Gap detector (12 named patterns). Hash-linked append-only observation ledger. path: lib/meta/bda/index.js


---
## ADDENDUM 2026-07-30 — RAID verification spine P4 (docs/raid-warp-verification-phasemap.spec)
meta/bda now has a NEW CONSUMER: RAID's verifyInIsolation (P4) instantiates a cached BDAKernel and calls observe({role:'assistant', text}) on each isolated consequential run, reading pendulum.regime. An unstable regime (DYSREGULATED/COLLAPSING) flags the run as drifted — a SOFT signal, non-blocking (§17.10). §0.1 note: the wire was corrected during build — meta/bda exports the BDAKernel CLASS (not a kernel() factory); one cached instance is used so observation history accumulates across runs (a fresh kernel per call always reads STABLE).
