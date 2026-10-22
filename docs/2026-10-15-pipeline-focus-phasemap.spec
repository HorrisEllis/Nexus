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

# ## ADDENDUM 2026-10-16 — his four musts, in one order (no new phases)
# James (2026-10-16): "give me a opinion about all of this and the recent phases. all phases on the phasemap. all the ones to
# help me make money, need to be done. heklp wirth overwhekm need to be done. that get the pipeline working need to e done. cos
# as a working test env need to be done. pipeline is vitam, the intent and ruoting and chubkiing and gating"
# His decision, recorded as his: four kinds of phase must be done: money, overwhelm, the pipeline, COS as a working test env.
# The pipeline is vital, and it means intent, routing, chunking and gating.
# The coder's ordering (a recommendation, his to change). The pipeline comes first because the money phases that build for
# clients (FV1) depend on it. Each line names its existing owner phase.
#   0  his run on the current release ....... SF7 (zero code; he runs 0.60.44)
#   1  overwhelm: one list of his projects ... COSA10 (small, read-only; independent of the pipeline)
#   2  gating: what a gate is, and a trace ... GW0 (decision: a brick is the unit), GW3
#   3  gating + chunking: the gate holds, the
#      agent gets a budgeted slice .......... GW1 baton + GW24 budget (the whole-phase brick and GA1's uncapped dependency code
#                                             are what fail small models)
#   4  gating: the run follows the gate ..... GW2 (a fallback resumes the same brick; the 3h stall and the fail/rewind loop)
#   5  routing: one chooser, a slow agent
#      routed away, parked work cleared ..... ME5 (RAID _decide the one chooser) + the officiator on a slow local model
#                                             (no owner phase found: 63 failed syntheses, 45 parked, cleared only by hand)
#   6  chunking + gating: dependencies per
#      chunk, drift → retry or rewind ....... GW26
#   7  intent: per-repo intent, the listener  IS1 + SF4/GW10 (blocked on GW0d)
#   8  routing to browser providers survives
#      a markup change ...................... SP3 (SP1/SP2 built, unverified in Electron)
#   9  COS as a working test env ........... testenv provision run once for real (never run against a downloaded image), then
#                                             GW12 minimal default → GW13 sandbox door → GW14 copy in, diff out → GW11 snapshot
#                                             per gate → GW15 every file tested
#  10  money ................................ the gig writer exists (clear-glass/src/autofill/gig.js) and the claim ledger PF0 is
#                                             built: fiverr-ledger PF1-PF3 and the portfolio section (clear-glass-surfaces PF1-PF3)
#                                             can run beside 2-8; FR1 the guide; FV1 client jobs after the pipeline holds
# Everything else stays mapped and waits (§0.3: nothing dropped), behind this list.

# ## ADDENDUM 2026-10-16 (b) — step 5 (routing), first slice built: RT1, the officiator stops failing on one slow agent (0.60.78)
# James: "Next" (after step 4). His 0.60.44 boot log: 63 failed syntheses and 45 parked drops, all "no real agent response
# (forAgent=ollama)", parked drops cleared only by hand-editing data/officiator-attempts.json, 40 minutes between tries.
# Found in cortex/core/raid/officiator.js: an agent's silence was charged to the drop (its tries spent, then parked); RAID was
# never told and picked the same agent each tick; parked was forever. No phase owned this (step 5 said so); this slice is RT1.
# Built (the GT1 rule, classify before learning): a drop walks RAID's ranked candidates (up to 3). A silence skips to the next
# and teaches nothing. An answer with no contract counts against the drop, teaches RAID (recordOutcome false) and tries the
# next. A success teaches RAID. When no agent answers, no drop is charged: the agents wait (2 min, doubling to an hour,
# persisted). Records written before this that charged a silence are released, said. A parked drop gets a daily try.
# parked()/unpark(): cortex GET /api/raid/officiator and POST .../unpark; `idearium raid parked`, `idearium raid unpark [id]`;
# My projects shows a RAID intake line with "Try all again".
# Open in step 5: ME5 (RAID _decide as the one chooser across copilot and the pipeline-routing ladder), routing builds away
# from a slow local model (the ladder climbs on failure, not on slowness).


# ## ADDENDUM 2026-10-16 (c) — work lost at a restart: a new map, slotted before the Code tab UI
# James: "clearglass closed and nexus didnt recover. like need a timeline with the checkpoints, and gates rewind points. it
# wrote the whole spec 17 chunks but then lost it on the restart. that needs to change. ... it need has to be physcial files
# in the backedn for persistence"
# Mapped in docs/2026-10-16-durable-work-timeline-phasemap.spec (TL0-TL6). The coder's recommendation (his call): TL1 + TL2
# (chunks are files the moment they exist; a restart resumes them) go before step 4's Code tab UI, and TL5 (the timeline
# panel) is the Code tab's first panel, after CE6. TL4 is the one rewind CV3 and GW7 both point at (build once).

## ADDENDUM 2026-10-22 (0.60.203, SD20) — a starved machine does not spin
James, 2026-10-22: "yes" — to the coder's three fixes after his SP5 run at 1–9% free memory (map: docs/2026-10-10-idearium-solid-phasemap.spec
SD20_a_starved_machine_does_not_spin; CHANGELOG-0.60.203.md). What changes for the behaviour this map owns:
- Routing (MF1 here): a build with no ladder whose repo Settings pins Ollama climbs the pin, then the chain's agents
  (lib/pipeline-routing.js pinnedLadder). present and the MF1 fit check now apply to the pin: missing or too big for free memory → left off;
  critical memory → moved after the agents. Said on the run's route. The pin is never dropped by minBuildB.
- The officiator (RT1): a synthesized goal (intention + file) already queued, running, or failed/blocked within the hour is not queued again
  (the drop is marked duplicateOf); three of its own contracts failing in a row hold synthesis for an hour (unpark all clears it); memory is
  read before each synthesis, and the RAID worker waits on memory too.
- Landing an agent's files (CC1): while a phase builds, a file outside the phase's files, or a spec/doc while it asked for code, stays a
  proposal with why, whatever the inject mode (lib/repo-inject.js expectPhase/outOfPhase; land(); lib/code-edit.js commit).
Decided by his axioms: §8.6 (each fix routes into what existed: present, byFit, the attempts store, land's propose), §1.2 (every hold and
skip is said), USER_AUTONOMY (an off-phase file is his call), §0.3 (nothing deleted; a duplicate drop is kept and points at its contract).
