# His loop: Fiverr, then applications, portfolio, calendar, email — every field a gate; every problem a DAG from its end state (2026-10-29)

origin: >-
  James, 2026-10-29, after deciding to make Nexus for himself ("I'm saying nexus."): "Cos can be used for any code recursively." ·
  "Beyond getting fiverr gigs working. We then need the applications, port folios, appointments, calender, emails, maybe make a synthesis of
  each application filled out, with contact email and each input field is a event gate that waits for the correct data, using the autofill,
  and copilot." · "What about sorting some tools by intent." · "Each problem needs to build a dag using reverse end state reasoning. Then
  dynamically chunk until the llm is capable or we have to switch"

status: "MAPPED 2026-10-29 — nothing built from this map yet; each phase gets its spec (emerge format) before code"

## Grounded (read from the code, 2026-10-29)
- Applications: lib/opportunity/ (sources, score, draft, apply, answers, stages, contacts — contacts captured from a page, 0.60.281). No
  "synthesis" of a filled application exists: what was typed into each field is not kept as one record.
- Calendar: CAL0_calendar open in docs/2026-10-29-gigs-contacts-snowflake-phasemap.spec (the recommendation there: Nexus's own calendar, an
  .ics feed Google and Apple subscribe to). Email: nothing that reads or sends his mail (cos/services/anonymous/engines/smtp.js is an
  anonymity engine, not a mailbox). Portfolio: docs/PROOF-OF-COMPETENCY.md is the record; no page a buyer opens.
- Gates on fields: macro steps have gates (KB4, choose read back, checkAt, typeAt — gated-flows); the autofill knows fields (detect, chips,
  page memory). A field is not yet an event gate that waits.
- Tools: lib/agent-tools/tools — 27 groups, 111 files, grouped by system, not by intent. lib/intent-classifier.js reads verbs and domains.
- DAG + chunk + switch: cortex/core/raid/contract-gates.js already splits a gate when its packet exceeds what the agent has passed
  (Boundaries.budget, learned from every check) or after two failures (shouldSplit, split, units, depth bound 3); idearium's contract build
  orders agents per kind of job (RA1, lib/agent-record.js) and moves down that ladder. lib/intent-flow.js (0.60.286) builds a DAG forward
  from his words. Reverse end-state reasoning does not exist: nothing starts from done-when and asks what must be true before it.
- COS: cos/app installs, switches and rolls back an app (COSA, VE7); cos/compartment holds a process.

decisions:
  HL_D1_cos_hosts_any_code:
    status: "READING 2026-10-29 — to confirm"
    chosen: >-
      "Cos can be used for any code recursively", said right after the question "is there any reason why guardian can't be compressed down
      into a plugin for nexus?". The coder's reading: the host for Guardian (and any system made a plugin) is COS — a COS app, which may itself
      host apps — not the orchestrator the coder proposed. To confirm before GP1 is specced.
  HL_D2_order_is_his:
    status: "DECIDED 2026-10-29 — his words"
    chosen: >-
      "Beyond getting fiverr gigs working. We then need …": Fiverr first; the rest after. And "I'm saying nexus": Nexus working on his PC
      comes before any of it (HL0).
  HL_D3_reverse_end_state:
    status: "DECIDED 2026-10-29 — his words, twice"
    chosen: >-
      First: "Each problem needs to build a dag using reverse end state reasoning." Asked whether that meant starting from done and working back
      until reaching what exists, he answered: "Yes the same way I reason. Bidirectional causal changing." (read: chaining). So the DAG is built
      from both ends: backward from the end state (what must be true for it — the things it uses, recursively) and forward from the change
      (what the change reaches — the things that use it, recursively). The nodes reached from both sides are the causal path; reached only
      backward, a precondition the change never touches (asked, not assumed); reached only forward, a side effect to verify; nothing reached
      from both, the change cannot cause the end state — said before any work is done. Built as FA11 in docs/2026-10-29-finish-any-project-phasemap.spec.

  HL_D4_the_gap_graph:
    status: "DECIDED 2026-10-29 — his idea; how it joins the existing parts is the coder's reading, to confirm"
    chosen: >-
      James, 2026-10-29, right after the bidirectional chain was built: "Wait. What if we use each step in the bidirectional chaining, as an
      event gate. A gap that needs filling. A gap graph? Each a condition as a compartment condition to pass the gate. Raid or cos is built for
      end state reasoning." The chain's steps stop being a plan and become live state: every node is a gap, open until its condition holds;
      the edges between them make the gap graph; a gate opens on the event that closes its gap; the condition is checked inside a compartment.
      Three parts that exist and were never joined: (1) the gap lifecycle (docs/gap-lifecycle.spec, intelligence/gap/predicate.js, phase 23.7)
      — a gap is an open loop with a checkable predicate, closed only when the predicate is false AND an artifact exists; (2) RAID's compartment
      engine (lib/compartment-engine.js, phase 25; "Contract as the end state", cortex/core/raid/contract-intake.js checkEndState) — work runs
      in a compartment with a frozen constraint frame, PASS commits its delta, FAIL rewinds; (3) the v2 contract's gates (contract-gates.js) —
      depends_on, pass_when, evidence. The coder's reading of "Raid or cos": RAID holds the condition and the end-state verdict (its compartment
      engine is the logic); COS holds the process when the gap's work runs code (its compartment is the wall, cos/compartment/boundary.js).
      Each does its own job (§5.15). Mapping: a chain node → a gap (predicate: its condition is not yet true; artifact: what proves it); a
      precondition that holds → a gap already closed (its evidence attached); a missing one → an open gap asked of him; a side effect → a gap
      "still works"; the gate on a gap opens when verifyClosure says closed; a gap that will not close is split into smaller gaps, or moved
      to the next agent (HL3) — chunking is splitting a gap.

phases:
  HL0_nexus_runs_on_his_pc:
    status: OPEN
    depends_on: [HL_D2_order_is_his]
    files: [idearium/api/index.js, idearium/repo/nexus-self.js, lib/agent-tools/index.js]
    does: "Idearium answers while the self-sync runs; memory under the 5.2 GB model; a tool call written as text is run, not shown — from his logs"
  HL1_fiverr_on_the_live_site:
    status: OPEN
    depends_on: [HL0_nexus_runs_on_his_pc]
    files: [clear-glass/src/ipc/bridge.js, clear-glass/renderer/gig-menu.js]
    does: "the Fill menu proven on his real gig editor (he passes Press & Hold himself); what the live page differs on, fixed"
  HL2_reverse_end_state_dag:
    status: "DONE 0.60.287 as FA11_bidirectional_causal_chain (docs/2026-10-29-finish-any-project-phasemap.spec)"
    depends_on: [HL_D3_reverse_end_state]
    files: [lib/intent-flow.js]
    does: "done-when → preconditions → … → what exists; the DAG built backwards; feeds the contract (FA8)"
  HL3_chunk_until_capable_or_switch:
    status: OPEN
    depends_on: [HL2_reverse_end_state_dag]
    files: [cortex/core/raid/contract-gates.js, lib/agent-record.js]
    does: "one loop for every contract (not only phase builds): split while the packet is over the agent's learned budget; when a piece is indivisible and still fails, the next agent on the ladder; said each time"
  HL4_tools_by_intent:
    status: OPEN
    depends_on: [HL0_nexus_runs_on_his_pc]
    files: [lib/agent-tools/index.js, lib/intent-classifier.js]
    does: "the intent map: his intents (fill a gig, answer a buyer, build an order, finish a repo, apply to a job …) → which tools, which agent, what it may do unasked, its budget, its done-when; a screen with dropdowns"
  HL5_every_field_a_gate:
    status: OPEN
    depends_on: [HL1_fiverr_on_the_live_site]
    files: [clear-glass/src/autofill, clear-glass/src/driver/index.js]
    does: "each input on an application is an event gate: it waits for the right data (autofill's profile, the copilot's draft, or him), checks it, and only then opens"
  HL6_application_synthesis:
    status: OPEN
    depends_on: [HL5_every_field_a_gate]
    files: [lib/opportunity/apply.js, lib/opportunity/contacts.js]
    does: "every application he fills becomes one record: the job, each field and what went in it, the contact's email, the date — in the Applications screen and Versionium"
  HL7_portfolio_page:
    status: OPEN
    depends_on: [HL1_fiverr_on_the_live_site]
    files: [docs/PROOF-OF-COMPETENCY.md]
    does: "a page a buyer opens, built from the proof record: what he made, with the checkable evidence"
  HL8_calendar_and_appointments:
    status: OPEN
    depends_on: [HL6_application_synthesis]
    files: [lib/opportunity/stages.js]
    does: "CAL0: Nexus's own calendar (interviews, deliveries, follow-ups from the synthesis), an .ics feed his phone subscribes to"
  HL9_email:
    status: OPEN
    depends_on: [HL6_application_synthesis]
    files: [lib/opportunity/contacts.js]
    does: "his mail, read and drafted (never sent without him): replies to buyers and employers matched to their application or order"
  GP1_guardian_as_a_plugin:
    status: OPEN
    depends_on: [HL_D1_cos_hosts_any_code, HL0_nexus_runs_on_his_pc]
    files: [guardian/server.js, cos/app/runtime.js]
    does: "Guardian loadable as its own process or hosted (COS, per HL_D1), keeping :7820; one fewer process on his PC"
  HL10_the_gap_graph:
    status: OPEN
    depends_on: [HL_D4_the_gap_graph, HL2_reverse_end_state_dag, HL3_chunk_until_capable_or_switch]
    files: [lib/intent-flow.js, intelligence/gap/predicate.js, lib/compartment-engine.js, cortex/core/raid/contract-gates.js]
    does: "the chain becomes the gap graph: each node a gap with a predicate and the artifact that closes it; each gate an event gate opened by the gap's closure; each condition checked in a RAID compartment (PASS commits, FAIL rewinds), the work in a COS compartment when it runs code; a stuck gap split or moved on"

