# docs/2026-10-16-intent-hat-agent-chain-phasemap.spec
# One chain, as data: .intent -> .hat -> .agent. An intent names the hat that serves it; the hat names the agents (and
# model) it wears. Every router reads the chain instead of its own table.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Touches: docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec IS1 (intent settings per repo),
# docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec RT1 (eligibility then preference) and PF1 (profiles <-> hats <-> tabs),
# docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec IM0 (his intent map, done 0.60.14).

origin:
  date: 2026-10-16
  james: '"intent map needs to link to hats? .intent to .hat to .agen"'
  reading: >-
    The coder's reading, to confirm: '.agen' = .agent. He wants the link to be nodes on disk (.intent, .hat, .agent), each
    pointing at the next, so the intent map he edits decides which hat answers, and the hat decides which agent and model.
    Written as a question ('needs to link to hats?'); read as a direction, since the half that exists is in code, not data.

found:
  # §8.6, read 2026-10-16 from source.
  the_link_today:
    - "intent -> hat exists, in code: lib/intent-hat-router.js VERB_TO_HAT (diagnose/the_diagnostician, build+write/the_builder, validate+analyze/the_auditor, recall/the_librarian), confidence floor 0.5. Used by guardian/lib/jobs.js:143 (suggestHat), the agent tool lib/agent-tools/tools/identity/intent-hat.js, and withIntentHat (switch, dispatch, restore). Not editable by him; his preference is options over code (shape-of-nexus, OP0)."
    - "hat -> agent exists, as data: the .hat node (lib/node-schemas/schema.hat, lib/hat-forge.js HAT_SCHEMA) carries baseAgent, allowedAgents, model, toolScope, personaPrompt, and allowedIntents (a hat may refuse an intent: the reverse direction)."
    - ".intent and .agent node types exist (lib/node-export.js KNOWN_TYPES; schema.intent, schema.agent). schema.intent has no hat field. schema.agent says its binding to a repo's .intent and to .command nodes 'is not built'."
  vocabularies:
    # three intent vocabularies, never joined. The chain needs one name per intent or a declared mapping between them.
    - "lib/intent-classifier.js VERB_PATTERNS: verbs (delete, rollback, overwrite, forge, build, write, officiate, analyze, explain, dispatch, ...); what VERB_TO_HAT keys on."
    - "lib/context-prereqs.js intentOf: explain, change, debug, build, spec; what prompt blocks key on (when: intent:spec, SF1 0.60.66)."
    - "copilot/intents.js + hooks/copilot.hooks.js: ask, build, diagnose, navigate, note, tool, action (schema.intent's grounding)."
    - "lib/reasoning-route.js reason_kinds: his routing kinds (IM0, Settings -> routing)."
  hats_seeded: "lib/hat-seed.js: the_auditor, the_diagnostician, the_builder, the_librarian, the_officiator, the_clearglass_operator."

decisions:
  IH0a_one_vocabulary:
    asked: "three intent vocabularies: one list, or keep each and map between them?"
    options:
      a: "one .intent node per intent, each with aliases (its names in the classifier, intentOf and copilot); every classifier resolves to the node."
      b: "keep the three, add a mapping table."
    coder_recommends: "a. One node per intent is the 'one home per concept' rule (SH1); aliases keep every caller working unchanged. To confirm."
    status: OPEN
  IH0b_per_repo:
    asked: "may a repo point an intent at its own hat (its compartment hat, lib/repo-hat.js)?"
    coder_recommends: "yes, as an override in the repo's intent settings (that is IS1); the global chain is the default. To confirm."
    status: OPEN

phases:
  # backend -> API -> command -> UI. Tested in Clear Glass, never Playwright. Loom-wired.

  IH1_intent_nodes_point_at_hats:
    status: OPEN
    systems: [core]
    files: [lib/node-schemas/schema.intent, lib/intent-chain.js (new), lib/intent-hat-router.js, lib/hat-seed.js]
    depends_on: [IH0a_one_vocabulary]
    does: >-
      schema.intent gains hat (a hat's seedKey, so a rename never breaks it), fallbackHats[], aliases[] and minConfidence.
      .intent nodes are seeded from VERB_TO_HAT and the three vocabularies (data/intents/*.intent; seed in code, his edits
      win, as hat-seed does). lib/intent-chain.js resolve(text|intentName, { repo }) -> { intent, hat, agents, model, why }:
      intent node -> hat by seedKey -> hat's baseAgent/allowedAgents/model; a hat whose allowedIntents refuses the intent is
      skipped, said. VERB_TO_HAT stays as the seed and the fallback when no .intent node exists (§0.3, kept, not deleted).
    proof: "edit a .intent node's hat; suggestHat and the next dispatch follow it with no code change."

  IH2_agents_bound:
    status: OPEN
    systems: [core, guardian]
    files: [lib/node-schemas/schema.agent, lib/repo-hat.js, lib/intent-chain.js]
    depends_on: [IH1_intent_nodes_point_at_hats]
    does: >-
      The .agent node's open binding is built: an agent lists the intents it serves (through its hat) and the hat it
      wears; a repo compartment's agent points at its repo's .intent overrides (IH0b). The chain is walkable both ways:
      intent -> hat -> agents, and agent -> hat -> intents.

  IH3_routers_read_the_chain:
    status: OPEN
    systems: [guardian, copilot, idearium, cortex]
    files: [guardian/lib/jobs.js, lib/intent-hat-router.js, lib/repo-prompt-blocks.js, lib/pipeline-routing.js, cortex/core/raid/index.js]
    depends_on: [IH1_intent_nodes_point_at_hats]
    does: >-
      Every place that turns an intent into a hat or an agent asks lib/intent-chain.js: guardian's suggestHat, withIntentHat,
      the prompt blocks' 'when: intent:', the pipeline-routing ladder. RAID still chooses among the agents the hat allows
      (RT1 eligibility then preference; §5.2, no side door): the chain gives eligibility, RAID gives preference.

  IH4_api_command_ui:
    status: OPEN
    systems: [idearium, core]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/settings.html]
    depends_on: [IH1_intent_nodes_point_at_hats]
    does: >-
      GET /api/intents (the chain, resolved), PUT /api/intents/:name (hat, fallbacks, aliases); `intents` / `intent set
      <name> --hat <seedKey>` / `intent resolve "<text>"` in route-commands (every agent has them through nexus.command);
      Settings -> routing shows each intent -> hat -> agents (model) as one row, editable, beside IM0's reasoner settings.

  IH5_proof_and_wiring:
    status: OPEN
    systems: [core, loom]
    files: [tests/modules/test-intent-chain.test.js (new), tests/modules/run-all.js, loom/maps/observability-map.js, lib/version.js]
    depends_on: [IH1_intent_nodes_point_at_hats]
    does: >-
      Tests registered; loom wires for lib/intent-chain.js and its consumers (rule 3); a dated ADDENDUM on IS1, RT1 and the
      hat schema's owner; a version line opening with his words.

build_order: [IH1, IH5, IH3, IH4, IH2]
first_slice: "IH1 + IH5: .intent nodes that name their hat, resolved through to the agent, with the current table as the seed. The routers switch over in IH3."

not_verified:
  - "copilot/intents.js PATTERNS and reasoning-route reason_kinds were not read in full; the vocabularies list is from their headers and schema.intent."
  - "whether data/intents/ or any .intent node already exists on his machine (data/** is not in the repo)."

# ## ADDENDUM 2026-10-16 (a) — his rule for this map
# James: "all data  is meant to persist. hardcoded has to earn its place..."
# Read for IH1: the VERB_TO_HAT table in lib/intent-hat-router.js does not earn its place as the authority; it stays only as
# the seed for the .intent nodes and the fallback when none exists. To confirm that the fallback earns its place.
