# 0.60.453 — PIL2: Pillar's contracts, in Emerge

James, 2026-11-08: "Focus on primitives. Build using emerge right? And any tools or my framework to reduce tokens. Own."

- **`pillar/contracts/contracts.eg`:** one contract per primitive, in Emerge, each read from the code that implements it.
  - Each contract carries its meaning, what it takes, what it gives, how it fails, and where it came from.
  - 15 are grounded: Constraint, Transition, Observation, Gap, Lens, Seed, History, Level, Budget, Field and Identity (Emerge's core); Link and
    Expectation (WARP); Event and Gate (SISO).
  - **Relation is open:** it is ERAVOS's, and ERAVOS's spec is not in this repository. It is named as a gap, not invented.
- **Enforced:** `validate()` checks every field. Each concept exists once (PIL-001), so a second contract with the same meaning is refused, and
  both are named.
- **Pillar serves them.** Its `contracts` and `contract` hooks answer with the real contracts and name the open one.
- **Proof:** `eg test pillar/test/contracts.test.eg` 5/5, `pillar.test.eg` 4/4, test-pillar 5/5.
- **Found:** the ledger's text subset refused "≥" in a contract, so it is written ">=".
- **Next:**
  - PIL3: conformance cases per contract, checked in Emerge.
  - Relation, once ERAVOS's spec is attached.
