# The lab — made in the spec workshop (idearium)
# Written 2026-10-10 from James's words. Builds on cos/playground (llm-lab.js, compare.js, branch.js, sandbox.js) and
# cos/spec/torture-chamber.spec. Opened in the workshop (nexus/cos → cos/spec, or NEXUS in START FROM). Decisions as choices
# [A] [B] [C] [custom], recommendation marked; "chosen:" open until James picks. Nothing here is built yet.
spec:
  name: The lab
  ambition: 5 — outlier
  source: "James 2026-10-10 · existing: cos/playground/llm-lab.js (NEXUS Lab: run twice under different conditions, compare, log the verdict), compare.js, branch.js, sandbox.js · cos/spec/torture-chamber.spec (the verdicts)"
  owner: cos (compartments, the runs) · cortex / RAID (which agent does which step) · intelligence (rfr2 measures) · idearium (end-states come from the Void)
  status: specced 2026-10-10, not built
  james: >-
    "cos lab, uses end state, to have the agents, do anything it can in nexus inside a comaprtnmer to achieve the end state,
    then we could speed up optimizing, could be used for anything, ifwe can test maticoulsly enough."
sections:
  - id: purpose
    title: Purpose
    body: |
      Give the lab an end-state ("the loop builds a phase with a real agent", "pickup never loses a job", "this page loads
      in under a second") and let agents try anything Nexus can do — inside a branched compartment, never the real tree —
      until the end-state is met, measured by tests strict enough to trust. Many attempts in parallel; the best one is
      offered to him as a proposal.

      His own condition is the right one: "if we can test meticulously enough". The lab is only as good as its check of
      the end-state — so the end-state must be a test (the torture chamber's stations), never a judgment by the agent
      that did the work.

  - id: primitives
    title: Primitives
    body: |
      end-state   (rule)     a goal + its check: { says, check: test | measurement | station preset, threshold }
                             invariant: the check exists and fails before the run starts (otherwise the goal is already met or untestable)
      attempt     (thing)    one agent's path in its own compartment: { agent, plan, steps[], diff, verdict, cost }
      step        (action)   any Nexus command or tool call the agent's scope allows, logged
      budget      (rule)     time, tokens, attempts, compartments — refused by the economy when spent
      result      (thing)    the best passing attempt: its diff, its proof, its cost — a proposal, never applied by the lab

  - id: axioms
    title: Axioms
    body: |
      AX1  The end-state is a check that fails first. No check, no run.
      AX2  Every attempt is in a branched compartment from a snapshot; the working tree is never touched.
      AX3  The lab proposes; he applies (the inject gate). Nothing self-merges.
      AX4  Judged by tests, not by the agent: the torture chamber's stations decide.
      AX5  Every step is logged and reproducible; a winning attempt can be replayed from its log.
      AX6  Budgets are hard; the cost is shown before and after.

  - id: loop
    title: The loop
    body: |
      1 he states an end-state (from the Void, or `cos lab <end-state>`); the lab confirms its check fails now
      2 N attempts start in parallel compartments, each an agent with the end-state, the failing check and its scope
      3 each attempt: plan → steps (commands, edits, runs) → run the check → keep going or stop
      4 passing attempts go through the torture chamber's preset (not only the one check)
      5 the best survivor is offered: diff, proof, cost, the log; failures kept as evidence (which agent, which plan failed how)
      6 results teach the learned order (SN4): which agent reaches which kind of end-state

      choices — how attempts differ:
        [A] different agents on the same end-state (a race)  ← recommended (it also measures the agents)
        [B] one agent, several plans it proposes first
        [C] evolutionary: the best attempt's state is branched and tried again with variations
        [custom] ____
      chosen: open

  - id: build_order
    title: Build order
    body: |
      1 LB1 end-state as data + "the check fails now" (reuse llm-lab's run/compare)
      2 LB2 one attempt in a compartment with an agent and a scoped tool set (nexus.command through the compartment)
      3 LB3 N attempts in parallel (torture-chamber TC3 / SN2), budgets enforced
      4 LB4 survivors through a chamber preset; the result offered as a proposal
      5 LB5 the Void hands end-states to the lab; results back to the Void as momentum
      Depends on: a real agent building one phase (the loop), the torture chamber's runner, the adversarial gate.

      choices — the first end-state to run:
        [A] "the Idearium loop builds a phase with a real agent and the phase proves itself"  ← recommended (it is the one that matters most and its check exists: tests/sim/loop.js)
        [B] a small, safe one first ("guardian's pickup window loses no job" over recorded jobs)
        [C] his choice from the Void
        [custom] ____
      chosen: open

  - id: tests
    title: Tests
    body: |
      T1 an end-state whose check already passes is refused ("already met"); one with no check is refused
      T2 two attempts in parallel compartments; the working tree is unchanged; both logs replay
      T3 a passing attempt that fails a chamber station is not offered
      T4 the budget stops a run and says what was spent
