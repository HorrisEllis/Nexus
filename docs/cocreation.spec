spec:
  meta:
    name:        cocreation
    version:     0.1.0
    status:      proposed
    purpose: >
      The protocol two or more peers use to jointly act on shared mutable
      state in real time — where "shared mutable state" is deliberately
      unspecified: a screen buffer, a document, a game world, a canvas.
      Agnostic on purpose. Remote desktop, collaborative research/editing,
      co-creation tools, and multiplayer gaming are not four protocols or
      four siblings of this one — they are four state *shapes* riding the
      same protocol. If a mechanism only makes sense for one of those
      shapes, it does not belong here; it belongs in that app's own gate
      and grammar, one layer up.
    non_goals: >
      Not a rendering layer. Not a transport (kern already proved that
      point — TCP today, WebRTC/WebSocket/QUIC/local IPC tomorrow, same
      interface). Not a generation/verification engine (that's warp's
      job, consumed here as a hook, not reimplemented). Does not know
      what a "screen" or a "document" or a "tick" is, and must never
      learn — the moment this spec encodes a domain concept, the
      agnosticism invariant (I8 below) is already broken.
    built_on: >
      kern supplies identity, authentication, capability grammar, and
      causal-chain mechanics. warp supplies verification (Axiom) and
      generation dispatch where a mutation's content needs to be produced,
      not just applied. cocreation does not reimplement either — it is
      the discipline that sits between "a peer wants to change shared
      state" and "the state actually changed," using both.

  # ── Invariants first. Every primitive below exists because one of these
  # ── would not hold without it — nothing here is decorative.
  invariants:
    I1_attribution:
      "No mutation is ever applied to shared state without being
       traceable to a specific, cryptographically authenticated identity.
       Anonymous mutation is not a degraded mode — it is not a mode."
    I2_authorization:
      "No mutation is applied merely because it was signed by someone.
       It must also fall within a capability grant that peer actually
       negotiated for this session. Being a valid identity proves who
       sent it, not that they were allowed to."
    I3_causal_order:
      "Every applied mutation has a well-defined position in a causal
       chain relative to every other mutation any peer has seen — not
       wall-clock order, not arrival order. Two peers who have received
       the same set of mutations agree on their order without negotiating
       it."
    I4_verify_before_apply:
      "A mutation is verified against declared invariants BEFORE it is
       considered part of the causal chain, never after. 'Applied, then
       corrected' is not an acceptable reading of this invariant — a
       rejected mutation never entered the chain other peers converge on."
    I5_no_silent_failure:
      "A mutation that fails authorization, verification, or ordering is
       rejected loudly, attributably, and specifically — which check
       failed, whose mutation, why. Silent drop and silent pass are both
       violations; there is no third, quieter option."
    I6_deterministic_convergence:
      "Current state is never something a peer maintains by accumulating
       side effects — it is always the causal chain replayed through one
       pure, deterministic reducer. Two peers with the same chain and the
       same reducer reach bit-identical state. State is a derived value,
       not a stored one."
    I7_transport_agnosticism:
      "Nothing above requires a specific transport. The chain, the grants,
       the identities, and the reducer are meaningful before any bytes
       cross a wire and after the connection is gone."
    I8_domain_agnosticism:
      "Nothing in this spec is allowed to know what the shared state
       represents. A mutation's payload is opaque to the protocol layer —
       readable only by the app-supplied reducer and the app-supplied
       verifier. This is the invariant every other primitive here answers
       to; a mechanism that requires knowing 'this is a screen' does not
       belong in cocreation, full stop."

  # ── Primitives — each one exists to hold exactly one invariant above.
  # ── Marked with what already exists (reuse) vs what's net-new.
  primitives:
    Peer:
      holds: I1
      is: "an Ed25519 identity + fingerprint, exactly kern's identity
           primitive (see the kern/bridge-identity/signaling-envelope
           reconciliation notes — domain-separated signing required,
           still open)."
      status: REUSE — kern identity.js, pending the reconciliation fixes
              already flagged (domain separation, fingerprint format).

    Grant:
      holds: I2
      is: "the intersection of two peers' declared grammars for this
           session — what this peer is authorized to mutate, and how,
           for the lifetime of this session. Not global permission;
           scoped to the negotiated session."
      status: REUSE — kern grammar.js's intersect(), kern handshake.js's
              session storage of that intersection, gated at dispatch by
              authorize.js (the patch already written for kern/cli.js).
              Blocked on: handshake.js's session key never reaching the
              initiator (see prior audit) — a Grant without a working
              session is authorization theater over an unencrypted wire.

    Mutation:
      holds: I4, I8
      is: "{ actor: Peer.fingerprint, intent: <opaque payload>, parent:
           hash of the last mutation this one was proposed against,
           proposedAt: logical position, not wall-clock }. `intent` is
           never interpreted by cocreation — only by the app's reducer
           and verifier. A Mutation is a proposal until step
           verify_and_order below admits it; before that it has no
           standing in anyone's state."
      status: NET-NEW at this exact shape, but structurally identical to
              kern's pulse envelope minus the domain-specific sigma/delta/
              regime fields — those are kern's own drift-scoring concern,
              not cocreation's.

    Chain:
      holds: I3, I6
      is: "append-only, hash-linked, one entry per admitted Mutation.
           Current state = reduce(Chain, initialState, appReducer)."
      status: REUSE — kern ledger.js's chaining mechanics AS-IS, with two
              fixes required before this can hold I3 for real: (a)
              entries must be signed per-entry, not just hash-chained
              locally (ledger.js currently only hash-chains; tamper-
              evidence depends on trusting the process that wrote the
              file — see audit notes) — a Mutation's entry needs the
              proposer's signature over the entry itself, not just the
              proposer's signature over the original wire envelope; (b)
              chain sync between peers does not exist yet (mesh.js never
              gossips ledger entries) — I3 requires peers to actually
              converge on the same chain, which requires a sync
              mechanism this spec does not yet define.

    Verify:
      holds: I4, I5
      is: "a hook — the app supplies Axioms (warp's primitive) that run
           against a proposed Mutation's `intent` before the Mutation is
           admitted to the Chain. Hard failure = rejected, logged with
           which axiom and why, never admitted. This is exactly warp's
           axiom-gate (dispatch/index.js step 4) — and exactly why that
           step had to actually check output content before cocreation
           could depend on it. Prior to the v1.4.1 patch, this hook would
           have been decorative."
      status: REUSE — warp Axiom + unifiedDispatch step 4, post-patch
              only. Do not build cocreation's Verify hook against
              pre-patch warp.

    Reducer:
      holds: I6, I8
      is: "app-supplied pure function: (state, Mutation) -> state. The
           only place a Mutation's opaque `intent` is actually
           interpreted into a meaning ('move cursor', 'insert paragraph',
           'apply damage'). cocreation supplies the fold; the app
           supplies the function being folded."
      status: REUSE — this is structurally kern replay.js's
              replay(nodeHex, fromSeq, reducer, initialState) almost
              exactly, generalized from "reconstruct one node's sigma/
              delta history" to "reconstruct any app's shared state from
              its Chain." The mechanism kern already built for its own
              forensic replay is the same mechanism cocreation needs for
              live convergence — one primitive, two uses.

  # ── The mutation lifecycle — one path, same discipline as warp's
  # ── unified_dispatch: not several bolted-on checks, one linear pipeline
  # ── an intent takes from proposal to (maybe) becoming part of shared
  # ── state.
  mutation_lifecycle:
    trigger: "a peer wants to change shared state — calls propose(intent)"
    steps:
      1_authenticate:
        invariant: I1
        mechanism: "kern gate.js — signature verify, fingerprint match,
                     replay check via monotonic seq, timing window."
        fail: "reject, logged, never reaches step 2."

      2_authorize:
        invariant: I2
        mechanism: "authorize.js against this session's Grant — is this
                     actor's declared intent-shape within what their
                     grammar was negotiated to emit, per the app's own
                     grammar schema for this Mutation's shape."
        fail: "reject, logged with reason (not_granted / no_session /
                field_type_mismatch), never reaches step 3."

      3_verify:
        invariant: I4, I5
        mechanism: "app-supplied Axioms run against intent via warp's
                     axiom gate. Hard failure rejects; soft failure is
                     recorded but does not block, same severity split as
                     warp already defines."
        fail: "reject, logged with which axiom and why, never reaches
                step 4 — this is the actual gate that decides whether an
                intent becomes real, and it runs before ordering, not
                after (I4 again: never 'ordered then corrected')."

      4_order:
        invariant: I3
        mechanism: "admitted intent becomes a Mutation, hash-chained onto
                     the proposer's view of the Chain's tip, signed
                     per-entry (see Chain's open fix above)."
        emits: "the admitted Mutation, broadcast to the mesh."

      5_converge:
        invariant: I6
        mechanism: "every peer that receives the Mutation appends it to
                     their own Chain (if their tip matches the
                     Mutation's declared parent — see conflict handling
                     below) and re-derives state via Reducer. No peer's
                     state is ever mutated directly; it is always
                     recomputed."

    conflict_handling: >
      Two peers proposing against the same parent hash concurrently is
      not an error condition — it is the expected case in any live
      cocreation session. This spec does not mandate one resolution
      strategy (last-write-wins, OT, CRDT-style merge, app-level manual
      resolution) because the correct strategy depends on what the
      Reducer is folding — text needs different conflict handling than
      cursor position needs different handling than game state. What
      cocreation DOES mandate: a fork (two Mutations with the same
      parent) is detected structurally (same mechanism as kern's
      ledger.verify() parent-chain check), never silently resolved by
      "whichever arrived at this peer first" — that would violate I3 for
      any peer whose network ordering differed. Resolution policy is a
      Reducer-adjacent hook, not a protocol-layer default.

  # ── Extension points — the only way an app attaches, same discipline
  # ── as warp's Stream.hook().
  hooks:
    reducer:      "required. (state, Mutation) -> state. The only place
                   `intent` is interpreted."
    verify:       "required. Axiom[] — app declares what a valid intent
                   looks like for its own state shape."
    grammar:      "required. kern grammar schema declaring what intent
                   shapes this peer accepts/emits — the basis Grant is
                   computed from."
    conflict:     "optional. (localTip, incomingMutation) -> resolution.
                   Absent = fork is surfaced to the app layer, unresolved,
                   rather than the protocol layer guessing."

  # ── Explicitly open — not solved by this spec, listed so nothing here
  # ── is mistaken for a finished substrate.
  open_gaps:
    - "Chain sync between peers (I3, I6 depend on it) — kern's mesh.js
       broadcasts pulses, never gossips ledger entries. Without this,
       'peers converge on the same chain' is aspirational, same category
       of gap as kern's own README claiming a 'shared ledger' that the
       code never actually shares."
    - "Session key exchange (Grant depends on a working session) — kern
       handshake.js's AES-256-GCM key never reaches the initiator. A
       Grant computed over a session that was never actually encrypted is
       authorization on top of a broken confidentiality layer."
    - "Per-entry signing on Chain — ledger.js hash-chains but does not
       sign each entry; I3's 'traceable causal order' currently means
       'traceable if you trust whoever wrote the file.'"
    - "Identity reconciliation across kern / bridge-identity /
       signaling-envelope — Peer needs one canonical fingerprint format
       and domain-separated signing before it can be treated as a single
       primitive rather than three compatible-by-luck ones."
    - "Conflict resolution policy is deliberately unspecified per state
       shape (see conflict_handling) — each app (remote desktop, collab
       doc, game) will need its own, and none is written yet."
