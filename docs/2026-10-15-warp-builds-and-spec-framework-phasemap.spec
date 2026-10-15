# docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec
# Every build through WARP; agents write .spec files from an injected framework; Nexus collects them; intent-based
# .inject blocks with every setting shown in the repo. Registered in docs/SPEC-REGISTRY.spec. MAPPED, nothing built.

origin:
  date: 2026-10-15
  james: >-
    "make sure all builds use warp. also need the agents to use the spec compiler? like the yaml. need to inject a
    framework for generating a .spec file. then need to listen for it to collect it. intent based .inject nodes, with
    full expanded settings in the repos.e"

found:
  # §8.6, read on 2026-10-15
  - "WARP (idearium/spec-engine/warp-build-dispatch.js → lib/seam/adapters/warp-cascade.js): cache, population seed, axiom-gated cascade. USED by spec-chunk builds (idearium/api/index.js ~8436), plan drafts (~7994, ~8128) and expand (~7647)."
  - "NOT used by: the phase build (makeAttempt → RA.dispatch, lib/repo-agent.js, climbed by lib/pipeline-routing.js climb, index.js ~904–990); the whole-phase brick (BR1, same dispatch); the RAID officiator and RAID worker bricks (copilot/lifeline.js dispatchToNcpAgent). compile is deterministic T0/T1 (no agent) — nothing to route."
  - "The spec compiler's format is docs/spec-compiler.spec (meta, axioms, pipeline, modules, schemas); emerge/compiler/index.js compile/emitT0/emitT1; idearium/compiler-bridge.js turns Idearium specs into it; lib/spec-document.js parse/check reads .spec files."
  - "Prompt blocks (lib/repo-prompt-blocks.js) are the only text a repo agent is sent — James 2026-09-26: 'not to inject anything into it that i cant edit in the agent settings'. Each block has `when`: always | tools | guardian | build. No block is chosen by intent."
  - "lib/repo-inject.js fromReply already turns a fenced block with a path (```yaml spec/x.spec) into a .inject node (proposed → applied → reverted). Nothing reacts when the landed file is a .spec."
  - "lib/intent-classifier.js already classifies every request (RAID's entry gate)."

decided:
  warp_where:
    reading: >-
      Coder's reading and recommendation (to confirm): WARP wraps the ONE agent call of every build (RA.dispatch in
      makeAttempt; dispatchToNcpAgent for RAID bricks/officiator) — cache and population first, axiom gate on the
      reply, retention after a passed gate — while the ladder and RAID still choose who answers. Not: WARP's own cascade
      replacing the ladder (that would undo RAID routing, §5.2).
  intent_inject:
    reading: >-
      Coder's reading (to confirm): "intent based .inject nodes" = prompt blocks chosen by the request's intent
      (`when: intent:spec`, intent from lib/intent-classifier.js), e.g. the spec framework block is sent only when the
      intent is writing a spec; "full expanded settings" = every block and per-intent setting shown open in Repo →
      Settings → Agents, editable, nothing hidden. Other reading: each .inject NODE (a code write) carries its intent and
      the repo has per-intent landing settings — IS1 covers that too; to confirm which he meant, or both.

phases:
  WB0_census:
    status: OPEN
    does: "lib/build-paths.js: every build path, the call it makes, whether WARP is on it; a runnable check (CK) red while one bypasses WARP."
    proof: "today: red, naming phase build, whole-phase brick, officiator, RAID worker"
  WB1_warp_at_the_rung:
    status: OPEN
    depends_on: [WB0_census]
    does: "warp-wrap RA.dispatch in makeAttempt: cache/population lookup keyed by (repo, file, prompt hash), axiom gate on the injects, retain after the gate passes; the ladder unchanged."
    proof: "an identical brick retained 3× is served from WARP with no agent call; a reply failing an axiom never lands"
  WB2_raid_bricks_and_officiator_through_warp:
    status: OPEN
    depends_on: [WB1_warp_at_the_rung]
    does: "contract-intake _realAgentExecutor and the officiator call through the same wrapper; WB0's check green."
    proof: "CK green on Nexus"
  SF1_intent_blocks:
    status: OPEN
    does: "prompt blocks gain `when: intent:<name>`; dispatch passes the classified intent; the Agents settings list shows each block's intent, expanded."
    proof: "a spec-intent request carries the block; a build request does not"
  SF2_spec_framework_block:
    status: OPEN
    depends_on: [SF1_intent_blocks]
    does: "a default block 'spec-framework' (when intent:spec): the spec-compiler YAML skeleton from docs/spec-compiler.spec (meta, purpose, axioms, modules with exports, schemas, gates, tests) and the rule: reply with ```yaml spec/<name>.spec. Editable like every block."
    proof: "the block text is the compiler's own sections; edited text is what is sent"
  SF3_collect_the_spec:
    status: OPEN
    depends_on: [SF2_spec_framework_block]
    does: "when an .inject lands a *.spec (or yaml with a spec: root): validate (spec-document check + compiler shape); valid → registered on the repo's specs and the spec engine, event idearium.spec.collected; invalid → the errors go back to the agent once, said."
    proof: "a planted good reply is collected and registered; a bad one returns its errors, nothing registered"
  SF4_compile_on_collect:
    status: OPEN
    depends_on: [SF3_collect_the_spec]
    does: "per-repo setting: a collected spec runs T0/T1 (zero tokens); its files arrive as proposed .inject nodes."
    proof: "a collected spec yields its tree as proposals, nothing overwritten"
  IS1_intent_settings_per_repo:
    status: OPEN
    depends_on: [SF1_intent_blocks]
    does: "each .inject node records its intent; per repo, per intent: blocks sent, landing folder, apply mode (auto/review), validator, compile-on-collect — all shown expanded in Repo → Settings; route + `repo intents` command + UI."
    proof: "two intents with different landing modes land differently in one repo"

order: "WB0 → WB1 → WB2 (warp first: he asked 'make sure'); SF1 → SF2 → SF3 → SF4; IS1 after SF1. Each phase: backend → route → command → UI."
