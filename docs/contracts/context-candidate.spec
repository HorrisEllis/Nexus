spec:
  meta:
    name:        context-candidate
    version:     0.1.0-schema
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-context-candidate-v1-0000-2026-0902-jamesbrooks-001
    purpose: >
      One piece of raw system context (a component, a gap, an event, a
      lattice edge, a chat exchange) and whether it earned a place in a
      synthesis-contract's `context.matched[]`. This is steps 8-10 of the
      contract-synthesis pipeline: a candidate that matches nothing below
      stays supporting evidence or gets discarded — it never becomes
      contract signal just because a tool call happened to return it.
      §NEW — nothing in the codebase does this filtering today (grep-
      checked: axiom_check tests a PROPOSED ACTION against axioms;
      parse_lenses tests a TEXT for gap patterns; neither scores a raw
      context candidate for contract-worthiness). The verdict vocabulary
      below (finding / abstain / unavailable / error) is deliberately
      reused, not invented — it's parse_lenses's own real convention
      ('a lens can return UNAVAILABLE... that is not a clean read'),
      applied here to the new matching problem instead of a fourth
      competing vocabulary joining bracket-syntax / fenced-block / TOOL_CALL:
      as yet another thing an agent has to guess between.

      §CORRECTED 2026-09-02 — James: "primitives, principles, and
      invariants are a boundary. contract schemas must have primitive."
      The original version of this gate checked a candidate against the
      WHOLE universe of axioms/components/§-principles, one gate per
      category. Wrong: that makes every contract re-derive its own
      relevance criteria from scratch. The calling synthesis-contract
      already DECLARES its boundary (synthesis-contract.spec#boundary —
      primitive + invariants[] + principles[], set once). This gate now
      takes that boundary as an input and checks ONE thing per candidate:
      is it in-bounds for THIS contract specifically. A candidate that
      would be a hard invariant match for some OTHER contract's primitive
      is correctly irrelevant here and should abstain, not find.

  candidate:
    id:
      type: string
      note: "stable id of the underlying thing — component id, gap id, event id, lattice edge key"

    kind:
      type: enum
      values: [component, gap, event, lattice_edge, chat_exchange, fault, pattern]

    source_tool:
      type: enum
      values: [loom_scan, nexus_map, meta_query, query_movement, agent_chat_search, fault_log]
      note: "which real tool call produced this candidate — always named, never implied"

    raw:
      type: object
      note: "the tool's actual return for this one item, unmodified — never summarized before the gate runs"

  # ── Input: the calling contract's own declared boundary ─────────────────
  # Not looked up fresh per candidate — passed in once per synthesis run,
  # same object for every candidate that run evaluates.
  boundary_input:
    primitive: "synthesis-contract.spec#boundary.primitive — required, non-null"
    invariants: "synthesis-contract.spec#boundary.invariants[] — Axiom ids"
    principles: "synthesis-contract.spec#boundary.principles[] — §-tags"
    intention: "synthesis-contract.spec#envelope.intention"

  # ── The gate — one in-bounds check, against THIS contract's boundary ────
  gate:
    in_bounds_check:
      verdict:
        type: enum
        values: [finding, abstain, unavailable, error]
      note: >
        finding = the candidate's own kind/raw content resolves to the
        SAME primitive the boundary declares (a component under that
        primitive, an event it emits, a gap tagged to it — not merely
        "an axiom exists somewhere that could apply"), AND does not
        violate any invariant in boundary.invariants, AND is consistent
        with every principle in boundary.principles. All three checked
        together, against the one declared boundary — not three separate
        universes to search.
        abstain = checked cleanly, candidate is simply outside this
        contract's primitive (correct and expected for most raw candidates
        — a fan-out query returns far more than one contract needs).
        unavailable = the boundary's own primitive/invariant/principle
        source couldn't be read this run — never silently folded into
        abstain, same as query_movement's blind[] convention.
        error = a hard invariant in boundary.invariants was violated.
        This is not a soft "not relevant" — it's a real hit that should
        surface, even though the candidate still won't enter matched[].

  disposition:
    type: enum
    values: [in_bounds, out_of_bounds, discarded]
    rule: >
      in_bounds     = gate returned finding.
      out_of_bounds = gate returned abstain — kept in the contract's
                      evidence trail (source_map) but never injected as
                      signal. Also the correct, expected outcome for a
                      hard-invariant error verdict: it's real information
                      (surfaced, e.g. to nexus_heal), but it still doesn't
                      belong in THIS contract's matched[].
      discarded     = not carried into the contract at all — reserved for
                      unavailable (never silently treated as either of the
                      above, per query_movement's own blind[] convention).
    only_in_bounds_reaches: "synthesis-contract.spec#envelope.context.matched[]"
