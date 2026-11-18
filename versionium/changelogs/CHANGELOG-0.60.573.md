# 0.60.573: Intelligence sees its own peak (IP13 expanded)

James, 2026-11-18: "Yes, add peak"

Why: its first self-scan (0.60.572) found 80 MB of heap at rest, so the 382 MB that crashed it was a spike at start that a scan of now cannot see.

- `intelligence/self/door.js`: `peakRssMB`, the highest resident memory since the process started (process.resourceUsage().maxRSS; no poll), and `startedAt`.
- `intelligence/self/scan.eg`: the peak in every why; a peak near or past the heap cap is verdict `spiked`, a gap, even when now is low
  (resident memory, said as such, not the heap).

Proof: eg test intelligence/self/scan.eg 3/3; tests/modules/test-intelligence-self.test.js 6/6.
