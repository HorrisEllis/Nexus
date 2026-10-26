# The memory kernel: take what is additive of both Cobalt and Nexus — keep the richer, fold in the missing
# His call: "take whats additive of both." §0.3 — lose nothing, keep both; the only removable thing is a true duplicate.
# Cobalt (his sealed zero-dep kernel: bus + content-hash-dedup ledger + registry + watchdog, nodes air-gapped) and Nexus
# (nexus-bus, ledger-*, loom+wires, Versionium, contract gates, RAID, node-export) overlap, but each has parts the other
# lacks. This map keeps Nexus's richer pieces and folds in ONLY what Cobalt genuinely adds — it does not adopt Cobalt
# wholesale (that would drop Versionium's chain, the contract gates, loom's wires), and does not keep two of anything.
# MAPPED 2026-10-26 before code (rule 1). This supersedes the gate-chain map (2026-10-26-gate-chain-memory, §0.3 kept): that
# proposed a new hash-linked chain, which Versionium (parentId) + the contract gates (at/hashes/depends_on) already are — so the
# real work was never a new chain, it is folding Cobalt's genuinely-additive parts into Nexus's substrate.

origin:
  date: 2026-10-26
  james: >-
    "take whats additive of both." (of Cobalt — /root/.claude uploads 6a5f2709-cobalt.zip, v1.4.0 sealed — and Nexus/Idearium)
  comparison_2026_10_26: >-
    Nexus already richer, kept as is: Versionium (parent-linked commit chain + snapshots + replay), contract gates (a DAG with
    evidence, resume checkpoints), loom (registry WITH real require/consumer wires), RAID (routing authority), node-export
    (timestamped, fingerprinted envelope). Cobalt adds four things Nexus lacks: (1) a content-hash DEDUP ledger — a repeated
    event becomes a COUNT, not N copies; (2) the truth / idea ledger split — authoritative vs cognition kept apart; (3) the
    air-gapped bus discipline — nodes emit events and never call each other, every event frozen; (4) a per-node WATCHDOG —
    silence / violation / disconnection detected per registered node. Everything else is a duplicate and is NOT doubled.

decisions:
  MK_D1_additive_union:
    status: DECIDED 2026-10-26 by James — "take whats additive of both"
    chosen: >-
      Fold Cobalt's four additive parts into Nexus's existing substrate (reuse, §8.6), keep Nexus's richer pieces untouched,
      adopt neither kernel wholesale. The content-hash dedup key reuses node-export's fingerprint. The chain/history stays
      Versionium; the gate record stays the contract; the registry stays loom. Cobalt's sealed-zero-dep §C1 "immutable core" is
      NOT adopted as a constraint on lib/ (Nexus's core evolves); only its parts are taken.

phases:
  MK1_dedup_ledger:
    status: OPEN
    layer: library
    depends_on: []
    files: [lib/ledger-writer.js]
    does: >-
      Fold Cobalt's "count, not copies" into Nexus's ledger: lib/ledger-writer gains an optional dedup mode — before appending,
      it keys the entry by content hash (node-export's fingerprint over {type, payload}); a hash already seen increments a count
      on the kept entry instead of appending a copy. Replays the seen-hashes on open (as Cobalt does). Opt-in per ledger so
      existing append-everything ledgers are unchanged (backward compatible); a repeated event returns { isNew:false, count }.
    proof: "test-ledger-dedup.test.js: a new event appends; the same event again increments count, no second row; count survives reopen (replayed); a non-dedup ledger behaves exactly as before"

  MK2_truth_and_idea_ledgers:
    status: OPEN
    layer: library
    depends_on: [MK1_dedup_ledger]
    files: [lib/ledger-store.js]
    does: >-
      Cobalt's L-2 split, over Nexus's own stores (not a new store): name two ledger scopes — `truth` (authoritative: what
      happened — events, gate passes, commits) and `idea` (cognition: proposals, hypotheses, notes — reusing lib/repo-notes'
      kinds). lib/ledger-store exposes them by name; a writer declares which it writes. Nothing is moved; it is a declared split
      so authoritative and speculative memory are never read as the same thing (§0.0 truth over coherence).
    proof: "test-ledger-split.test.js: truth and idea are separate scopes; an authoritative event lands in truth, a proposal in idea; reading truth never returns idea rows"

  MK3_air_gapped_bus:
    status: OPEN
    layer: library
    depends_on: []
    files: [lib/nexus/nexus-bus.js]
    does: >-
      Cobalt's two bus disciplines, added to lib/nexus/nexus-bus.js: (1) every emitted event is frozen (Object.freeze, deep) so a subscriber
      cannot mutate what another sees; (2) the "emit, don't call" rule — a node talks through the bus, not into another node —
      stated and, where nexus-bus is the path, checked. This REINFORCES the boundary ratchet (lib/system-boundary): the ratchet
      stops static cross-system requires; the frozen air-gapped bus is how decoupled systems still coordinate. No new bus.
    proof: "test-bus-airgap.test.js: an emitted event is frozen (a subscriber's mutation throws / does not leak to the next subscriber); the bus still delivers to all subscribers"

  MK4_per_node_watchdog:
    status: OPEN
    layer: integration
    depends_on: []
    files: [diagnostic/watchdog.js]
    does: >-
      Cobalt's per-node watchdog, over loom's registered nodes (not Cobalt's flat registry — loom is richer): a watcher per
      node that, from the bus, detects silence (no event within its expected interval), violation, and disconnection, and emits
      a diagnostic event. Folds into the diagnostic+healing system (docs/2026-10-24-diagnostic-and-healing-one-system) — a
      silent node is a finding there, not a new alarm path.
    proof: "test-node-watchdog.test.js: a node that goes silent past its interval raises a diagnostic event; a live node does not; a reconnect clears it"

order: >-
  MK1 (the dedup ledger — the headline additive: count not copies, reusing node-export's fingerprint) first; MK2 (the truth/idea
  split over the existing stores); MK3 (frozen, air-gapped nexus-bus — the decoupling discipline that pairs with the boundary
  ratchet); MK4 (per-node watchdog over loom, folded into diagnostic+healing). All four are folds into existing files (reuse),
  not new subsystems; Nexus's Versionium chain, contract gates, loom wires and RAID are kept untouched. Each phase specced again
  as .phase + .graph (his 2026-10-20); DG2 foresees any crossing. This supersedes the gate-chain map (§0.3, kept): the "chain"
  it proposed already exists (Versionium + contract hashes); the real work is these four folds.
