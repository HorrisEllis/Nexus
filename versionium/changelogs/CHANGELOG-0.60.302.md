# 0.60.302 — the direction: COS becomes Nexus, an OS in time, emerge replaces the implementation

James, 2026-10-30:
> "cos becomes nexus."
> "i want to eventually make this into a os."
> "emerge will be replacing nexus."

Earlier the same day: "the plan it to rebuild nexus at somepoint. in my emerge coding language. from the bottom up in my own language."

## Recorded
- **Decision MG_D8** in `docs/2026-10-24-cos-manager-phasemap.spec`, with the coder's three readings, each to confirm:
  - **(a) COS is the product, named Nexus.** Today's systems become compartments inside it. Folders keep their names until a rename is phased.
  - **(b) The OS is his original design.** Compartment OS v1.6/1.7 (`cos/spec/cos-design-v1.7.0.md`, Rust/Cobalt, its own exe) was an OS from the start. The mapped steps point that way: COS boots alone (CS4a), machine compartments (VM1, CE1), and a version is the whole machine state (CS1). Booting on bare hardware is the end-state, not phased yet.
  - **(c) Emerge replaces the JavaScript implementation, one system at a time.** Each system is rebuilt from its spec in emerge. It runs as a branch beside the JS version, is benchmarked and friction-tested, and merges only when it is as good or better (MG26).
- **The architecture spec** gets an end-state addendum. The same registry, contract, handshake, bus and node architecture at every level is what carries over.

## Proof
- `test-substrate-spec` 3/3.
- `test-genesis-and-architecture-spec` 7/7.
- `phase-specs --check` reports no drift.

Records only. Nothing is renamed or built.
