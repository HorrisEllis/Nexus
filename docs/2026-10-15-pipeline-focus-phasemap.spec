# docs/2026-10-15-pipeline-focus-phasemap.spec
# One critical path through three maps that overlap: the Idearium pipeline and its gates, solid, everything wired, the Code tab upgraded.
# No new phases. It ORDERS existing ones so they are not built three times. MAPPED before building (docs/CLAUDE.md rule 1).

origin:
  date: 2026-10-15
  james: "at 90%. we need to focus on the idearium pipeline and gating, getting it solid. and everything all wired in, the code tab upgraded."
  reading: "To confirm. 'Solid' = a job cannot be lost silently, every gate holds its work and says why it stopped, one tab shows and drives the run. Not read as: more features."

three_maps_that_overlap:
  code_tab_run_state: "docs/2026-10-15-code-tab-run-state-phasemap.spec: CE1-CE5, CE10 BUILT 0.60.50; CE6-CE9, CE11, CE12 and CV0-CV6 OPEN."
  gate_held_work: "docs/2026-10-15-gate-held-work-phasemap.spec: GW0-GW0i decisions OPEN, GW1-GW16 all OPEN. GW9 and CE9/CE11 are the same panel; GW7 owns FM1-FM4."
  spec_foundation: "docs/2026-10-15-spec-foundation-model-phasemap.spec: SF1-SF7 all OPEN. SF4 (one listener) overlaps GW10."

findings:
  stale_blocker: "CE6 (one tab) is marked 'blocked by CE0_one_tab_or_two', but CE0 is DECIDED ('yes one tab.', 2026-10-15). CE6 is unblocked."
  his_run_is_old: "He runs 0.60.44; the lost-tab fallback (CE10, 0.60.50) and the pickup diagnosis (0.60.61) are not on his machine. Nothing below can be proven on his run until he updates."
  decisions_block_the_gates: "GW0..GW0i are 9 open decisions; GW0d (what the listener must hear) is unanswered and blocks GW10. GW1 and GW2 can start on GW0's recommended minimal default (GW0h)."
  duplicate_work_risk: "GW9 = CE9 = CE11 (the contract panel); SF4 = GW10 (the listener). Build each once, in the owner map, and mark the other 'see'."

critical_path:
  1_update_his_run:  "SF7: he replaces his copy with the current release (zero code; COSA1 makes this safe later). Gives CE10 + 0.60.61 diagnosis a real run."
  2_unblock_and_decide: "Answer GW0d and take the GW0h minimal default; confirm CE0b/CV0. Nine small questions, recommendations written in the GW map."
  3_gates_hold_work: "GW1 baton, GW2 the run follows the gate (build on CE1 run-state). This is the 'solid' core: a stopped job has an owner and a reason."
  4_one_tab: "CE6 (unblocked), then CE8 (CLI reads the surface), CE9/GW9 (the panel once), CE12 proof and wiring."
  5_spec_as_gate: "SF2 state + gate and SF3 evidence-not-claims feed the same gate; SF4/GW10 one listener."
  6_later: "CE7 AI editing, CV1-CV6 versions, GW13-GW16 sandbox, GW8 causal field: after the path above holds."

proof_per_step: "Each step ends in a test and a Clear Glass check (never Playwright). A step is done only when a job killed mid-run resumes or is reported lost with a reason, on his updated run."
open_questions:
  - "Is the order right, and is 'solid' = no silent loss + one tab?"
  - "GW0d: what must the listener hear? (blocks GW10)"
