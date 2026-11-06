# docs/2026-11-06-agents-build-in-his-framework-phasemap.spec — agents build codebases through his framework, Emerge and RAID.
# END STATE FIRST (his method: bidirectional chaining, the end state before the steps). No phases yet: they are chained back from the end state
# once he confirms it. The direction is James's (quoted); this draft of the end state is the coder's, from his words, every line to confirm.

origin: >-
  James, 2026-11-06: "lets get it to the point of being able to build codebases in idearium" · chose "Any language, from specs" · "also i have
  no ollama so need a framework to inject into agents" · "emerge, first. i want better code, less tokens, and more control" · "we have a toolset
  of agent tools for giving the agents what context is needed. what if we use my framework and coding language for agents?" · "end state
  first. using my framework. emerge. and raid"

status: "END STATE DRAFTED 2026-11-06, to confirm with him. No phases (end state first)."

end_state:
  one_line: >-
    Any agent he has (ChatGPT, Claude or Gemini through Guardian's tabs, Claude Code; a local model if he gets one) builds a codebase from
    Idearium's specs, guided by his framework, checked by Emerge, decided by RAID — with better code, fewer tokens and more control than now,
    shown by numbers from a real build on his machine.
  holds:
    E1_the_framework_is_the_brief: >-
      Every request an agent receives is assembled by Nexus, never written ad hoc: the piece's end state (its contract and expectation test,
      first), his Innovation Toolkit's steps as the method it follows (docs/innovation-toolkit.framework: Section 0 is this a framework problem,
      3 find the gap, 4 constraints and deconstruct, 6 map the leverage, 10 hostile verification), only the context that gate needs (WARP), and
      the axioms that bind it. One pack, versioned, his to read and edit; the same for every agent.
    E2_emerge_holds_the_shape: >-
      The plan, the contracts (CIE1), the roads and the expectation tests are Emerge. What can be checked without a model is checked by Emerge,
      at no tokens: it compiles, the contract holds, the tests pass. A failure goes back to the agent word for word (the retry engine).
    E3_raid_decides: >-
      RAID decides each step: which agent takes it (§5.2), whether a result is accepted (the gate's verdict under the constitution), and records
      why (§9.1). Nothing lands without RAID; no side door.
    E4_any_language: >-
      The codebase is in the project's own language, as the spec says; that language's own toolchain verifies it (its compiler, its tests).
    E5_measured: >-
      Tokens, tries and pass rate per gate are recorded (AG1), and compared with today's ladder on the same work: "less tokens" is a number.
    E6_control: >-
      He can see and change, in Idearium: the pack (E1), the contract (E2), RAID's rules (E3). Every decision traces to a ledger entry and a
      Versionium record.
  done_when: >-
    A codebase he names is built end to end this way on his machine, with his agents, through his Remote Control, and the numbers (E5) are
    better than today's.
  today_for_comparison: >-
    Per planned file: Emerge tried first (0.60.421, compiled to JavaScript), else the JavaScript agent ladder, whose bulk rung expects Ollama
    (he has none). The pieces of E1 exist apart: lib/coder-brief.js (a per-file brief with the axioms), his .inject nodes
    (lib/repo-prompt-blocks.js), WARP (context per gate); RAID is reached through lib/raid-port.js. Never measured with a real model.

to_confirm:
  Q1_what_the_agent_writes: >-
    (A) the agent writes Emerge, and Emerge emits the project's language; or (B) the agent writes the project's language directly, and Emerge
    holds the plan, the contract and the tests that judge it. The coder's reading of "Any language, from specs" with "my ... coding language
    for agents" leans to (B) for languages Emerge cannot emit yet and (A) where it can; his to say.
  Q2_which_steps_of_the_toolkit: "the five sections named in E1, all of Parts 1–8 and Sections 0–10, or others he names"
  Q3_the_proof_codebase: "which codebase is built for done_when"

phases: {}
