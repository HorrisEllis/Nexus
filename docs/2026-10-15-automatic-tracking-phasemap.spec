# docs/2026-10-15-automatic-tracking-phasemap.spec
# Everything tracked, mapped, versioned and snapshotted without being asked — gate by gate.
# Registered in docs/SPEC-REGISTRY.spec. Follows docs/2026-10-15-one-contract-raid-releases-phasemap.spec (RN1 done).

origin:
  date: 2026-10-15
  james: >-
    "then each gate tags and tracks progress through the system.  can you hook in the memory from the plan panel, for
    context? like have a contract panel with context using the dependancy. specs, phases, architecture need to be updated
    with addendums. like everything is tracked, mapped, versioned, changes are snapshotted, the tool for copying specific
    lines, work surface, all need to be automatic. like no progress lost, or history, the system knows whats happening,
    etc. like gates are a lot. does this make sense. it all exists. just need it to be automatic, routed intelligently,
    using multiaccounts, intent, and fallback, tools and macros to be made for repeat processes, component store to be
    expanded each component. its all supposed to interconnect. im a systems thinker. loom was supposed to rrack this,
    then i migrated to architect."
  reading: >-
    The coder's reading: the gate is the unit everything hangs off. When a gate moves, the system should — with no one
    asking — tag it, snapshot it, log it, give the next brick the context its dependencies need, write the addendum,
    file the component, and route the work to the right agent/account. Each of those exists alone; the gate does not yet
    call them. This map is the wiring, not new systems.

found:
  # §8.6 — what already exists, read from source on 2026-10-15
  - "gate commits + rewind: contract-gates schedule({ versioning }) records the commit a gate passed at (GS1, 0.60.39)"
  - "tags: versionium/lib/releases.js tag() — immovable names on commits (RN1, 0.60.41)"
  - "decisions per brick: lib/replay-engine.js logDecision under the RAID run (GS1)"
  - "activity: lib/activity-log/compartment.js record() — the repo's durable log"
  - "memory: lib/agent-memory.js recall({ agentId, query }) — already used by the repo agent and the phase build (index.js ~6555, ~8471); the Plan panel does not show it"
  - "dependencies: lib/phase-plan.js depsOf, loom impact (nexus_loom_impact), lib/component-store.js _depsOf"
  - "lines: lib/line-edit.js readRange / applyEdits (checksummed) — the line tool"
  - "every write is a commit: lib/repo-versions.js touched() — VR1; the work surface is lib/repo-inject.js"
  - "routing: lib/model-door.js + lib/route-eligibility.js (RT1), lib/intent-classifier.js, lib/account-registry.js, ladders with fallback"
  - "components: lib/component-store.js put({ project, path, content, contract, builtBy }) — written by decompose and idearium builds"
  - "repeat processes: lib/cg-learning.js (Clear Glass macros), the activity log holds the sequences"
  - "addenda: docs/*.spec by hand today; lib/spec-document.js reads specs"
  - "self-model: loom registry (loom/maps, bootstrap) AND architect's hook registry (architect/registry-components.js) — two"

open_decision:
  LA0_loom_or_architect:
    asked: "loom was supposed to rrack this, then i migrated to architect."
    context: >-
      docs/2026-09-19-architect-blueprint-forge-idearium-phasemap.spec D1 asked this on 2026-09-19 and no answer is
      recorded. Today loom is the one that is current: every phase this week wired loom (bootstrap regenerates 7,900+
      wires from source); architect's registry is a hand-written route list (registry-components.js) with its own hooks.
    options:
      a: "loom stays the self-model (data); architect is the surface that draws and edits it — one truth, two views"
      b: "architect becomes the self-model; loom's scanner feeds architect's registry; loom/maps retire into it"
    coder_recommends: >-
      a — it is D1's 'b' from 2026-09-19 (point architect's canvas at loom's registry): loom's data is live and
      scanned from source; architect's is declared by hand, which is the 'declared ≠ served' trap. To confirm.
    status: DECIDED (2026-10-15) — see addendum

phases:
  # order: bottom-up. Each phase: backend → API → command → UI, versioned, tested, merged.

  GT2_each_gate_tags_and_reports:
    status: DONE (0.60.42)
    files: [cortex/core/raid/contract-gates.js, cortex/core/raid/contract-intake.js, idearium/api/index.js]
    does: >-
      One progress event per gate move (READY/RUNNING/PASSED/FAILED/SPLIT/REWOUND/INDIVISIBLE), from the scheduler's own
      log. On PASSED: the gate's commit is tagged in Versionium (gate/<contract>/<gate>, immovable); every move is a row
      in the repo's activity log, a bus event, and already a replay decision. The run's progress (n of m bricks,
      current, last tag) is one query.
    proof: "a 3-brick contract → 3 tags on 3 commits, 1 activity row per move, progress reads 3/3; a retry does not re-tag"

  KT1_observations_on_a_semantic_tree:
    status: OPEN (added 2026-10-15, see addendum)
    depends_on: [GT2_each_gate_tags_and_reports]
    files: [lib/knowledge-tree.js (new — a projection plus one observations table), lib/code-intel/cards.js, lib/component-store.js, lib/atlas-generate.js]
    does: >-
      One tree, read from what exists: system (its atlas) → component (component store / loom) → file → chunk (code-intel
      cards: uses / usedBy). Observations attach at any node, keyed by path: what happened there (gate PASS/FAIL with its
      GT1 class, rewinds, the provider that passed, fault_log rows, his notes and decisions, the spec that owns it) — each
      citing its source row, never summarised away. A node's view rolls its children's up (this module fails on context
      3 times; this file's last 4 bricks passed on qwen). Written automatically by GT2's gate events and FR1's reports.
    proof: "a run's gate failures on lib/x.js appear on lib/x.js, roll up to its component and system, each citing its gate"

  CX1_context_from_the_dependencies:
    status: OPEN
    depends_on: [KT1_observations_on_a_semantic_tree]
    files: [lib/contract-context.js (new — a composer, nothing stored), cortex/core/raid/contract-adapters.js]
    does: >-
      contextFor(contract, gate) composes, from what exists: its dependencies' passed outputs (depsOf, their gate
      commits), the exact lines it touches (line-edit readRange around the declarations it names — code-intel decls),
      the spec section it came from (spec-digest), what loom says depends on its file (impact), and the agent's memory of
      this work (agent-memory recall). Budgeted (tokens), ranked, each piece saying where it came from. The agent
      executor puts it in the brief; the same object is the panel's data.
    proof: "a brick depending on another gets that brick's exports and lines, not the whole file; budget holds"

  CP1_the_contract_panel:
    status: OPEN
    depends_on: [CX1_context_from_the_dependencies]
    files: [idearium/ui/js/contract-panel.js (new), idearium/ui/js/plan-panel.js, idearium/api/index.js]
    does: >-
      In the Plan: a Contract panel — the gates as a tree (splits nested), each with status, tag, commit, failure class,
      and its context (dependencies, lines, spec, memory) opened from CX1; compare/diff from GS1. The memory the Plan
      already uses is shown here. Command: repo contract <repo> <phase> --context <gate>.
    proof: "Clear Glass drives the panel over a real run: tree, a gate's context, its diff"

  AU1_addenda_written_for_you:
    status: OPEN
    depends_on: [GT2_each_gate_tags_and_reports]
    files: [lib/auto-addendum.js (new), lib/spec-document.js]
    does: >-
      When a phase's contract passes: a dated ## ADDENDUM is drafted for the phasemap that owns it and each spec its files
      belong to (spec registry + atlas ownership), from the run's facts (gates, commits, tags, proof) and the phase's
      quoted origin — proposed on the work surface, applied automatically when routing.auto_addenda is on. The atlas's
      generated section is regenerated (AT1 folds in here).
    proof: "a passing phase leaves an addendum naming its tags and proof; nothing written to a spec it does not own"
    to_confirm: "proposed-then-applied vs written directly — the coder recommends proposals, auto-applied by a setting"

  CS1_every_brick_a_component:
    status: OPEN
    depends_on: [GT2_each_gate_tags_and_reports]
    files: [lib/component-store.js, cortex/core/raid/contract-adapters.js]
    does: "every brick that passes puts its file in the component store with its contract, dependencies, gate commit and tag, who built it (provider/account) — the store grows with each build; reused by CX1"
    proof: "a passed brick is findable in the store with its gate tag; a failed one is marked failed, not stored as good"

  RT2_routed_by_intent_account_and_fallback:
    status: OPEN
    depends_on: [CX1_context_from_the_dependencies]
    files: [cortex/core/raid/contract-adapters.js, lib/model-door.js]
    does: >-
      Each brick is routed by its own intent (intent-classifier on its actions + its failure class from GT1) through the
      door's eligibility (RT1) to a provider AND an account profile (account-registry: the one with budget left), with
      the ladder as fallback; the choice is recorded on the gate.
    proof: "a reasoning-heavy brick goes to a reasoning agent; an exhausted account falls back to the next; recorded"

  MC1_macros_from_repeats:
    status: OPEN
    files: [lib/macro-miner.js (new), lib/activity-log/]
    does: "a sequence of commands seen 3+ times in the activity log is proposed as a macro (a named row of nexus.command steps); accepted ones become commands every agent has"
    proof: "a planted repeated sequence is proposed once, accepted, and runs as one command"

  LA1_one_self_model:
    status: OPEN (LA0 decided 2026-10-15)
    does: >-
      Loom is the self-model (data, read from source). Architect is the design surface for NEW projects: it draws a
      project's design and composes it from the component registry (to confirm which — see addendum), and reads loom for
      what already exists. A project designed in architect becomes loom-mapped as its bricks pass (GT2/CS1), so the design
      and the built thing meet in one model. No second hand-written registry: architect's own (registry-components.js)
      is checked against loom, not trusted beside it.

  # carried from the previous map, unchanged: RN2 (changelog from commits), RN3 (Releases view), FR1 (failure reports),
  # ST1 (check runners), RD1b (spec chunks as bricks). AT1 folds into AU1.

order: "GT2 → KT1 → CX1 → CP1 → CS1 → AU1 → RT2 → RN2 → RN3 → FR1 → MC1 → ST1 → LA1 (after LA0)"

drift_accounted:
  - "Nothing new stores a second copy: tags in Versionium, rows in the activity log, components in the store, context composed on demand."
  - "'Automatic' is a setting per kind (addenda, macros), on by default only where nothing outside the run is rewritten."

## ADDENDUM 2026-10-15 — KT1 added: observations per file and module, on one tree

# James: "like the system atlas and component store were supposed to be a map for context. like what about obervations
# per file or module, like for the learning, like a semantic tree?"
# Found (§8.6): the levels exist but are not joined — atlases (system), component store and loom (component), code-intel
# cards (chunk: what it uses, what uses it). The learning exists but is keyed by agent or plan (agent-build-learning,
# plan-learning), and fault_log by component, never by file. Nothing answers "what do we know about this file".
# Added KT1 between GT2 and CX1: the tree is a projection of those levels; observations are the one new table, keyed by
# path, each citing its source. CX1 then reads a brick's context from the tree (its node, its dependencies' nodes, their
# observations) instead of composing from scratch. Coder's reading of "semantic tree" (to confirm): a tree by structure
# with meaning attached (summaries, observations), searchable by words; embeddings added only where vector-memory runs.

## ADDENDUM 2026-10-15 — GT2 built (0.60.42)

# James: "then each gate tags and tracks progress through the system." One wrapper (contract-intake _tracker) around the
# scheduler's onEvent, so contract-gates stays system-free: the scheduler only adds what a move already knew (file, agent,
# class, commit; REWOUND is now a move too). Tags are named per run (gate/<contract>~<run>/<gate>@<n>) — the coder's
# change from the map's gate/<contract>/<gate>: the same phase built twice, or two maps' P1 in one repo, would otherwise
# collide with a tag that never moves. RAID_GATE_MOVED has no listener yet; KT1 is its first (observations per file).
# Each settled move is also a row on the Plan's ledger, so a reload keeps the run's gate timeline (no progress lost).

## ADDENDUM 2026-10-15 — LA0 decided: loom holds the data; architect designs new projects

# James: "Okay with loom. But the architect is for new projects also using the component registry"
# Context: asked whether loom or architect is the self-model. Options were (a) loom holds the data, architect draws and
# edits it, or (b) architect becomes the model, fed by loom's scanner. The coder recommended (a): loom is read from source
# (~7,900 require edges, regenerated by loom/bootstrap.js); architect's registry-components.js is hand-written, which is
# the declared ≠ served trap. He asked for the reasons first ("I need to know why. I don't do anything without knowing.")
# and then chose (a), adding the part only he knew: architect's role is designing NEW projects, from the component
# registry. Consistent with the record: architect/service.js already moved hook seeding to loom on 2026-07-20 ("loom,
# the write authority", docs/hooks-migration.spec).
# Changed: LA1 is no longer blocked; it is redefined above.
# To confirm — "the component registry": two exist. lib/component-registry.js is Nexus's own capability registry (every
# UI/CLI capability as a component). lib/component-store.js holds the components of every decomposed project, with their
# dependencies resolved — reusable parts. The coder reads "new projects also using the component registry" as the
# component store (designing a new project from proven parts); not assumed until he says.

