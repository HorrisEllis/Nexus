spec:
  meta:
    name:        handshake-ledger
    version:     0.1.0-spec
    status:      SPEC ONLY — nothing built. Written 2026-07-20, per §3.1
                 (spec before code) and because spec-drift reports 12 modules
                 with no spec; this must not become the thirteenth.
    uuid:        nexus-handshake-ledger-v0-0000-2026-0720-001
    purpose: >
      Signed receipts for every cross-system handoff, so RFR2's causal
      toolkit can VERIFY that a handoff succeeded rather than infer it from
      logs. The difference between "guardian probably received it" and a
      signed acknowledgement that it did.

  problem: >
    Cross-system interactions (orchestrator→cortex events, bridge-relayed
    requests, guardian job dispatch) currently prove delivery only by
    side-effects. When a handoff silently fails, nothing records that it
    LEFT one system and never ARRIVED at the other — the exact class of gap
    this repo has now found repeatedly (dead listeners, wrong event names,
    silent no-op writes).

  ingredients_already_real:
    - "interaction-contract — 39 passing tests; declares what each system's surface is"
    - "meta/rfr2/identity — deterministic contentHash (FNV-1a over type+payload+source), zero deps"
    - "orchestrator auth — NEXUS RSA-2048 keypair, loaded at boot, already used for the SNR gate"
    - "bridge — the single relay every cross-system request already flows through, with a replayed request ledger (§10.1: the one honest write authority for receipts)"
    - "meta/rfr2/query — CQL: FIND chains WHERE ... CAUSED_BY ... — the read/verification surface"

  receipt_row:
    table: handshake_ledger
    shape: >
      { uuid, handoffId, from, to, requestHash, responseHash|null,
        outcome: 'acknowledged'|'timeout'|'refused'|'error',
        ts, ackTs|null, signature }
    signing: >
      signature = RSA-SHA256 over canonicalize(handoffId+from+to+requestHash+
      outcome+ts) with the NEXUS private key. Verification needs only the
      public key — any system, or RFR2 offline, can audit without write access.

  laws:
    - "L1: bridge is the sole writer of handshake_ledger (§10.1)."
    - "L2: a receipt is written when the handoff LEAVES, outcome:'pending' is forbidden — the initial row is written with the request, and outcome is patched exactly once on ack/timeout. Two states on disk, never an eternal pending."
    - "L3: RFR2 CQL query 'FIND events WHERE type = handshake AND outcome != acknowledged' is the canonical unconfirmed-handoff audit — it must return [] on a healthy system."
    - "L4: receipts are long-tier (never decay) — the audit trail of what was promised is not memory, it is record (§7.4)."
    - "L5: signature verification failure is a gap of severity high, emitted as cortex.gap.found — a receipt that doesn't verify is worse than no receipt."

  build_order_when_started:
    - "1. fault classes + table schema (mirror fault-taxonomy.js's Phase-1 shape)"
    - "2. bridge write path + signing (raw code, testable without any consumer, §3.4)"
    - "3. ack patch path on response/timeout"
    - "4. RFR2 CQL surface + the L3 audit query as a test"
    - "5. gap-finder subscription for L5 verification failures"

  explicitly_not_in_scope_yet:
    - "per-system keypairs (NEXUS key signs everything in v1 — one key, one authority; per-system identity is a later version if ever needed)"
    - "receipts for in-process bus events (in-process delivery is synchronous; the ledger is for CROSS-PROCESS handoffs only)"
