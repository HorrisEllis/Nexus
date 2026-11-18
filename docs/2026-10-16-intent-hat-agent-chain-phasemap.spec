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

# ## ADDENDUM 2026-10-16 — every hat and repo agent physical; nothing only in the page or in memory (his rule; mapped, no code)
# James (2026-10-16), after the agent work funnel was mapped: "What about .hats for the repo agents model. All physical. Like nothing
# is supposed to be dom or lacking persistents besides temporary files."
# His rule, recorded as his: every hat and every repo agent's model is a physical node file. Nothing lives only in the DOM or in
# memory, and nothing lacks persistence, except temporary files.
# Read in code, 2026-10-16:
#   hats: JAA table forged_hats (lib/hat-forge.js:25, insert :573). A .hat file is written only by exportHat (:610), on request.
#   what a hat learned (observations) + its exchange log: JAA; in a .repo_agent bundle only on export (lib/repo-agent-node.js).
#   a repo agent's settings (provider, ollamaModel, toolScope, injectMode): JAA table repo_agent_settings (lib/repo-agent.js:97).
#   the code-repo → original link: JAA table repo_agent_links (lib/repo-hat.js:225).
#   only in the browser (localStorage): Clear Glass's gig drafts (clear-glass/renderer/gig-panel.js: cg.gig.last / offer /
#     profile) and the Void page's dials (idearium/ui/void.html: void.dials). Lost when site data is cleared.
#   view preferences in localStorage (panel open, showDone, tab, category): temporary by nature, the coder's reading. To confirm.
# Coder's reading (to confirm): JAA stays the index, written through. The node file is the record: written on every forge, update,
# learn and settings change, and read back at boot when the table lacks it. That is the same move GW27 makes for chunks and the
# funnel (FN3) for its answers.
#
# IH6_hats_and_repo_agents_are_files (proposed, OPEN; IH1 needs it: an intent node points at a .hat file):
#   does: hat-forge writes <data>/nodes/hat/<id>.hat on forge/update/learn/revoke (revoke archives, never deletes); repo-agent
#     writes <data>/nodes/repo_agent/<repo>.repo_agent (hat ref, settings, link, learned set) on every settings or learn change;
#     boot rebuilds the JAA rows from the files when they are missing. The two browser-only stores move to the backend (gig
#     drafts as a node the gig ledger owns; the Void dials as a setting), localStorage kept only for view preferences.
#   proof: "forge a hat and change a repo agent's model: both files exist and match; delete the JAA rows, boot, and they come back
#     from the files; clear the browser's storage and the gig draft and dials survive"

# ── ADDENDUM 2026-11-17 — IH3 expanded: Claude is the last resort on every ladder; its accounts fall back in order ──
# James, 2026-11-17: "needs to not be using claude unless absolutely necassary, then fallback to alternative accounts." · "no. pipeline working.
# nothing less. ollama building it."
# Read first: the ladder (lib/pipeline-routing.js) already starts with Ollama (smallest model first), then the chain (gemini, chatgpt, claude,
# deepseek); the learned order (lib/agent-record.js orderLadder) can move an agent up; the planner and the test writer take the first agent
# that is not Ollama. Guardian's account chain (account-routing.js, 0.60.25: "use routing each time tokens run out") moves to the next account
# when a tab reports its usage limit — but Claude's chain on his machine was EMPTY (two accounts, no order): no fallback could happen.
# Built: routing.last_resort (default ["claude"]) and PRt.lastResort(rungs, policy) — those agents go last, after the learned order and the
# preferred coder; applied before the planner is chosen, after the learned order, and in the chunk and brick orders (idearium/api/index.js).
# A person's pick (agent/provider) is never reordered; an agent alone on the ladder stays. Proof: test-pipeline-routing PR-30 (fails on the
# old code: "no lastResort"); the suite's ESM-path crash after it is the same on the old code.
# Set on his machine (Guardian POST /api/accounts/chain, by person, his words as the why): claude → "Claude — Account 2" (his default), then
# "Default — claude".
# Also found the same day (Guardian, recorded in R1's map): Claude's page renamed its turns ([data-testid="user-message"|"assistant-message"]),
# so its transcript was empty and no .response was ever filed; fixed in guardian/userscript-claude.js _nexusGetFullChat, proved live
# (claude:746b7b33 v1 · 3 messages filed seconds after the tab reloaded).
# Live, run 74f98418 (N1, after Idearium's restart): the build's route read "ollama:…3b > gemini > claude" (chatgpt and deepseek left off by
# readiness, signed out); Gemini planned. Claude's own jobs now end from their .response (one 12,004-character reply, source .response).
# Then the test went to Claude: Gemini's two jobs failed "the tab still shows the previous answer after 180s". Cause, read on his tab: a promo
# callout ("Hand off your to-dos …") had opened an Angular overlay whose backdrop covered the page, prompt box included (elementFromPoint at the
# box's centre = .cdk-overlay-backdrop-showing). Closed by a click on the backdrop (Escape did not); guardian/userscript-gemini.js now closes a
# backdrop that covers the prompt box before typing (_clearBackdrop, said in the log). His 2026-11-15 "gemini had a element in the way", again.
# And the test writer's fallback now puts the last-resort agents after the model that codes (Ollama writes the test before Claude does,
# independence given up, said on the row); applies at Idearium's next restart.
# Slip, said: the coder reloaded Gemini's tab before reading the check that it had one live job; Guardian holds such a job for its transcript.
# Then, the same night (run 74f98418 landed clean in 2 agent calls, 12 min; Ollama's brick passed): James, "okay, it built js, not emerge
# though...." · "ollama can use the agent tools, systems tools? right? like the intelligence system? what if each step was a new chat in
# ollama? to reset the tokens?" · "thats progress though right?" — the coder's answers, read from the code: Emerge-first (routing.emerge_first,
# EMB1) applies only to a NEW planned file; N1's file already existed in JS (4 Nov), so the build checked it and returned it unchanged (0 lines
# differ): no Emerge attempt. Ollama runs tool loops for Copilot (the bridge's tool-loop jobs) but a build rung is "bare" (one file, no tools);
# each Ollama call is already a fresh request with no chat history. Open, his: port existing JS phases to .eg through the pipeline, or only new.
