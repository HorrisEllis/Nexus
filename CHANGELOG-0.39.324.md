# 0.39.324 — 2026-10-05

James: "can you benchmark it?"

`scripts/bench-warp2-vs-siso.mjs` (`node --expose-gc scripts/bench-warp2-vs-siso.mjs [N]`) runs SISO, WARP 1.x and WARP 2 on one workload: N causes, a handler turns each into an effect, and one in ten never got its effect. Logging is on in each. Results are the median of 7 runs on node v22:

| N | system | causes/sec | vs SISO | bytes held/cause | missing effects found | what caused an effect |
|---|---|---|---|---|---|---|
| 20000 | SISO | 185217 | 1.00x | 169 | cannot tell | cannot tell |
| 20000 | WARP 1.x | 152163 | 0.82x | 506 | cannot tell | cannot tell |
| 20000 | WARP 2 | 39016 | 0.21x | 1223 | 2000 (exact) | effect ← cause |
| 100000 | SISO | 196287 | 1.00x | 162 | cannot tell | cannot tell |
| 100000 | WARP 1.x | 121322 | 0.62x | 505 | cannot tell | cannot tell |
| 100000 | WARP 2 | 35836 | 0.18x | 1204 | 10000 (exact) | effect ← cause |

The benchmark found two WARP 2 bugs. Both are fixed in WARP 2.0.1.

- **Wrong answer:** WARP 2 reported 20000 of 20000 causes without their effect instead of 2000. An expectation could only be declared after its emit returned, and a synchronous handler had already produced the effect by then. Now `emit(..., { expect })` declares it with the link, before any handler runs. Test W2-07.
- **Slow:** WARP 2 was quadratic, at 0.01x SISO, because every emit scanned every open expectation. Open expectations are now indexed by effect and by cause link.

Where WARP 2's remaining time goes (CPU profile): about three quarters is the hash chain, which canonicalizes and hashes every ledger entry. That is what makes the ledger verifiable; it was not traded away.

`test-warp2` 7/7. WARP 1.x 43/43 and Emergence 155/155 are unchanged.
