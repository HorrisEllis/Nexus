# 0.60.454 — PIL3 slice a: Pillar's conformance, and its first finding

James, 2026-11-08: "Continue." · "Focus on primitives. Build using emerge right?"

- **Conformance in Emerge.** `pillar/conformance/conform.eg` is the judge, and `constraint.eg` holds 7 known answers for pillar:constraint.
  - The cases are derived from the contract, as data, and each carries its provenance.
  - A case without provenance is refused.
  - Nothing conforms without a boundary case and an adversarial case.
- **Emerge's JS core answered through its own harness** (`tests/modules/test-pillar-conform.test.js`), and Pillar judged. Pillar never runs foreign
  code.
- **Finding:** 6 of 7 pass. The JS core's `evaluate()` treats a needed field holding `null` as present, while the contract and Emerge's language
  say it is a gap. It is recorded, not fixed here; which side is right is his call.
- **Proof:** conform.test.eg 5/5; test-pillar-conform 3/3, registered in run-all.
- **Next:** pillar:history, run against Emerge's History and WARP's Ledger, with the differences named.
