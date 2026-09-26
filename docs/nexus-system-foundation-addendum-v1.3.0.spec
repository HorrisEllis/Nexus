spec:
  # ════════════════════════════════════════════════════════════════════════════
  # nexus-system-foundation-addendum-v1.3.0.spec
  #
  # STATUS: additive, REVERTIBLE. Nothing here removes or rewrites an
  # existing layer or an existing spec field. To revert: delete this file.
  # No existing .spec loses meaning without it — three new, optional-to-
  # adopt top-level sections are defined, that's all.
  #
  # WHY THIS EXISTS — James, 2026-09-01 (LM1 of docs/2026-09-01-living-model-
  # and-autonomous-pipeline-phasemap.spec): "I've got it. The .spec is the
  # living model." The phasemap's own real, checked finding: every system
  # spec already conforms to nexus-system-foundation's L0-L5 shape and
  # already carries meta/core/events/routes/handshake/modules/tests —
  # but nothing in that shape holds a system's HISTORY, its CURRENT OPEN
  # GAPS, or a real VERSION-HISTORY ledger. Those three things exist today,
  # scattered: history lives in git log and in this repo's session-based
  # docs/*.spec phasemaps; gaps live in cortex's `gaps` table (queryable,
  # but per-event, not per-system); version history lives in lib/version.js's
  # inline comments (real, but a wall of text, not a structured per-system
  # field — see version.js:42's own single `system` entry, over 8,000
  # characters of inline comment, unqueryable by any tool).
  #
  # This addendum is a SCHEMA, not a new storage mechanism (per LM1's own
  # explicit status text: "not a new storage mechanism, a real schema for
  # what already-existing .spec files should hold per system"). It does not
  # migrate lib/version.js's history, does not touch cortex's gaps table,
  # and does not build a watchdog (that's LM2, explicitly sequenced after
  # this). It only says: these three sections, in this shape, on every
  # system-local spec.
  # ════════════════════════════════════════════════════════════════════════════

  meta:
    name:        nexus-system-foundation-addendum
    version:     1.3.0
    extends:     nexus-system-foundation@1.1.0
    author:      james-brooks
    status:      proposed
    uuid:        nexus-system-foundation-addendum-v1-3-0000-2026-0901-jamesbrooks-001
    supersedes:  nothing — additive only
    revert: >
      Delete this file. No layer changes, no data migration, no field
      removed from any existing spec. Specs written against this addendum
      keep their history/gaps/version_history sections as inert extra
      YAML — nothing in loom/scanners or spec-drift.js reads them today,
      so nothing breaks by their absence OR their presence.
    purpose: >
      Defines three new, additive top-level sections every system-local
      .spec (<system>/spec/<system>.spec) should carry, closing LM1's
      real, checked gap: no per-system spec today holds intention/history/
      current-gaps/version-history in one place. "Intention" is already
      covered (every conforming spec has meta.purpose); "commands" is
      already covered (handshake.components[].grammar); "api-calls" is
      already covered (routes:); "channels" is already covered (events.
      emits/handles). Only history, gaps, and version_history are
      genuinely new.

  # ── AX-013: Per-System Living-Model Sections ────────────────────────────────
  # What's actually true today, measured 2026-09-01, not asserted:
  #   45 systems have a synced spec (checked via orchestrator/lib/
  #   spec-drift.js, live run). Zero of them — including the richest,
  #   e.g. ollama/spec/ollama.spec — have a history, gaps, or
  #   version_history section. History and rationale live entirely in
  #   lib/version.js's inline comments and in git log; neither is
  #   queryable per-system without grepping a multi-thousand-character
  #   string. Open gaps live in cortex's `gaps` table, keyed by dedup_key,
  #   not by system, and nothing joins them back to that system's own spec.

  axiom_AX-013:
    statement: >
      Every system-local spec (<system>/spec/<system>.spec) SHOULD carry
      three additional top-level sections — history, gaps, version_history
      — alongside meta/core/events/routes/handshake/modules/tests. This is
      a SHOULD, not a MUST (§17.2 — status stays Specified, not a breaking
      requirement retrofitted onto 45 already-synced systems in one pass).
      New specs written after this addendum lands MUST include the three
      sections; existing specs are migrated opportunistically, the next
      time that system's spec is touched for any other reason — same
      discipline this codebase already applies to layout migration
      (§legacy-flat -> standard, spec-drift.js's own `legacyLayout` check).
    shape:
      history: >
        A short, dated list of real turning points for this system —
        NOT a duplicate of lib/version.js's per-bump prose (that stays
        the detailed ledger) but the handful of entries someone new to
        the system would need to not re-discover a settled decision.
        Each entry: { date, summary }. summary is 1-3 sentences, written
        the same way this codebase's own commit messages are — states
        what was real and checked, not what was hoped.
      gaps: >
        The system's own currently-open, real gaps — a per-system MIRROR
        of a live query against cortex's `gaps` table (source: this
        system), not a hand-maintained duplicate ledger. Each entry:
        { id, type, summary, opened }. A spec's gaps: section is stale
        the moment it's written by hand; the real requirement (LM2,
        sequenced after this) is that it becomes a live-rendered view.
        Until LM2 lands, gaps: may be written by hand FROM a real query
        result, and each entry should say so, honestly, in a top-level
        comment or an `as_of` timestamp, so nobody trusts a hand-written
        list as if it were live.
      version_history: >
        A structured, per-system list mirroring lib/version.js's own
        comments for THIS system's entries only, plus the versionium
        commitId when one exists for that change. Each entry:
        { version, date, summary, versioniumCommitId }. versioniumCommitId
        is null for any change made before Versionium's per-commit
        snapshot capture existed (2026-08-30, per cortex/versionium/
        index.js's own §BUILD comment) or for any change versionium_commit
        was never called for — recorded as null, not omitted, so the gap
        in coverage is itself visible rather than silently absent.
    rationale: >
      Three sections, not one merged "history" blob, because each answers
      a different real question a builder asks: "what changed and why"
      (history), "what's still broken here" (gaps), "which exact commit
      is this version" (version_history). Collapsing them loses the
      ability to answer any one question without reading the others.
    non_goals: >
      This addendum does not build a watchdog that keeps these sections
      current (LM2), does not decide who is allowed to write to gaps:
      (LM6-adjacent — a spec's gaps section is a mirror, not a new
      authoring surface), and does not touch loom/scanners/spec-map.js's
      SPEC_DIRS allowlist, which is itself a separate, pre-existing gap
      (see honesty note below) unrelated to this schema addition.
    honesty_note_spec_map_coverage: >
      Checked while writing this addendum: loom/scanners/spec-map.js's
      own SPEC_DIRS constant is `['docs', 'warp/spec', 'cortex/spec',
      'idearium/spec', 'copilot/spec', 'bridge/spec']` — six locations.
      At least 24 other systems keep their canonical spec at
      <system>/spec/<system>.spec (confirmed via orchestrator/lib/
      spec-drift.js's own _loadSpecs(), which DOES walk every system
      directory and finds them). §6.3 coverage checking in loom's spec-
      map scanner therefore silently never sees roughly 24 real, synced
      specs. This is a real, pre-existing gap, NOT introduced by this
      addendum and NOT fixed here — flagged honestly per §8.4 (scan
      before assuming clean) rather than silently worked around or
      silently left undocumented. Candidate for its own small, separately-
      committable fix; out of LM1's scope as stated.

  # ── Compliance status at time of writing ────────────────────────────────────
  compliance:
    ax_013:
      adopted:
        - "(this session) clear-glass, loom, gap-finder, grammar-fallback,
           mutation-contract, open-loop-taxonomy, loop-topology — all newly
           written against this shape, closing 7 of orchestrator/lib/
           spec-drift.js's own live 'no spec' report."
      renamed_not_rewritten:
        - "ollama/spec/ollama.spec — content already real and rich (meta/
           core/events/routes/handshake/modules/tests/resilience all
           present); spec-drift.js reported it missing only because
           lib/version.js's code-version key is 'ollama-bridge' while the
           spec's own meta.name is 'ollama' — a naming mismatch, not
           missing content. Given a version_history section and its
           meta.name kept as 'ollama' (system-local convention, matching
           the directory); spec-drift.js's own name-matching (system,
           system.replace(/-/g,'_'), system.replace(/_/g,'-')) does not
           bridge 'ollama-bridge' <-> 'ollama' either direction — recorded
           as a second small honest gap in that matcher, not silently
           patched here (out of LM1 scope; a one-line fix for whoever
           picks up spec-drift.js next)."
      remaining_unresolved:
        - "divergence-watcher, macro-compiler, gap-loop — checked directly,
           NOT single-file, single-owner systems the way the other 8 are.
           divergence-watcher is a route alias (orchestrator/orchestrator.js
           forwards GET .../divergence-watcher to cortex's own
           /api/snapshots/divergence-watcher — the real logic, if it
           exists as more than a route name, lives in cortex, unconfirmed
           this pass). macro-compiler appears only as a comment reference
           in orchestrator/lib/sigma-compaction.js, with no dedicated
           module found. gap-loop is a label used across at least a dozen
           real files (guardian/event-taxonomy.js, orchestrator/lib/
           autonomous-loop.js, intelligence/gap/*, lib/reflection.js,
           lib/constitutional-ai.js, others) describing a conceptual loop-
           closure state, not one module. Writing a system spec for any of
           these three would either claim false single ownership or
           require a real design decision (which module IS the canonical
           owner, if any) that is not this addendum's call to make.
           Recorded here as the honest remainder of the 11 spec-drift.js
           found, not silently dropped."
