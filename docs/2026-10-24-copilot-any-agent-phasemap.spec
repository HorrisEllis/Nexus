# docs/2026-10-24-copilot-any-agent-phasemap.spec
# The Clear Glass CLI's Guardian route honoured, and any agent as the copilot. Phase ids CL1–CL4.
# MAPPED 2026-10-24, before building (docs/CLAUDE.md rule 1). Full spec: clear-glass/spec/copilot-any-agent.spec (compiles at full depth).
# Touches: clear-glass/renderer/float-cli.js and copilot-cli.js (BS6, docs/2026-10-21-browser-shell-phasemap.spec), copilot/lifeline.js,
# copilot/server.js (copilot.prompt), guardian/ask.js and guardian/server.js (/api/copilot/prompt).

origin:
  date: 2026-10-24
  james: '"clearglass. can you get the cli working for guardian, use any agent as the copilot"'
  context: >-
    Said with the floating CLI pasted: he picked guardian (claude), then chatgpt, said "hello", and the reply was labelled
    "guardian · chatgpt · 🎩 · ollama:qwen2.5-coder:7b" — his pick in the label, Ollama's model as the answerer. The coder traced it
    (clear-glass/spec/copilot-any-agent.spec census): lifeline refuses an agent whose tab is not open, then falls to the Ollama cascade
    in silence. The coder's reading (to confirm): "any agent as the copilot" = one copilot, and he picks which model wears it.

decisions:
  D1_open_or_refuse:
    status: DECIDED 2026-10-24 by his axioms — open it
    asked: "a picked agent whose tab is not open: refuse, or open the tab and wait?"
    chosen: >-
      Open it (USER_AUTONOMY: he picked it; §8.6: Guardian's dispatcher already opens a tab and waits for a repo agent's job). Refusing is
      what made the pick fall to Ollama.
  D2_fallback:
    status: DECIDED 2026-10-24 by his axioms — no fallback for a pick
    asked: "the picked agent cannot answer: another model, or the reason?"
    chosen: >-
      The reason (§1.2 nothing fails silently; TRUTH_OVER_COHERENCE). 'copilot' (copilot decides) keeps the cascade: that is its meaning.

phases:
  CL1_the_picked_agent_is_opened:
    status: OPEN
    layer: integration
    depends_on: [D1_open_or_refuse]
    files: [copilot/lifeline.js, copilot/server.js, guardian/ask.js, guardian/server.js, tests/modules/test-copilot-any-agent.test.js]
    spec: clear-glass/spec/copilot-any-agent.spec
    blocks: [MOD-CA-OPEN]
    does: A strict pick travels as openTab; copilot's pre-check and Guardian's fail-fast let the dispatcher open the tab and wait.
    proof: "a fake Guardian reporting chatgpt not connected still gets the job (openTab) and its answer comes back"

  CL2_a_pick_never_falls_back_in_silence:
    status: OPEN
    layer: integration
    depends_on: [CL1_the_picked_agent_is_opened, D2_fallback]
    files: [copilot/lifeline.js, copilot/server.js, tests/modules/test-copilot-any-agent.test.js]
    spec: clear-glass/spec/copilot-any-agent.spec
    blocks: [MOD-CA-LOUD]
    does: A strict pick that cannot answer returns its reason; Ollama is never asked in its place.
    proof: "a fake Guardian that fails: ok:false naming chatgpt; the fake Ollama saw no call"

  CL3_any_agent_as_the_copilot:
    status: OPEN
    layer: ui
    depends_on: [CL2_a_pick_never_falls_back_in_silence]
    files: [clear-glass/renderer/copilot-cli.js, clear-glass/src/copilot/bridge.js, copilot/server.js, clear-glass/test/copilot-cli.test.js]
    spec: clear-glass/spec/copilot-any-agent.spec
    blocks: [MOD-CA-PICK]
    does: /copilot <agent> picks who wears the copilot (Guardian agents, ollama[:model], claude-code, copilot); the pick is strict unless copilot.
    proof: "jsdom: /copilot chatgpt → guardian/chatgpt strict; /copilot ollama:llama3 → ollama, model llama3; the bridge forwards model and strict"

  CL4_each_reply_under_its_question_labelled_true:
    status: OPEN
    layer: ui
    depends_on: [CL3_any_agent_as_the_copilot]
    files: [clear-glass/renderer/float-cli.js, tests/modules/test-copilot-any-agent.test.js]
    spec: clear-glass/spec/copilot-any-agent.spec
    blocks: [MOD-CA-REPLY]
    does: Each reply replaces its own thinking line; the route line names who answered.
    proof: "jsdom: two sends answered out of order read in order; a reply from another model than the pick is labelled with it"
