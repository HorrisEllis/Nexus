spec:
  meta:
    name:     self-awareness
    version:  1.0.0
    date:     2026-10-10
    release:  0.56.0 (base)
    uuid:     nexus-self-awareness-phasemap-v1-0000-2026-1010-jamesbrooks-001
    owner:    intelligence (cfr graph, field, lattice) · guardian (its nodes, its ledger rows) · copilot (the door reads the lattice)
    status:   "MAPPED 2026-10-10, nothing built — straight after the solid map (James asked what it would do; the shelved CF1 is folded in here, the rest of the field-memory map stays on the shelf)"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §1.1 nothing pretends, §1.2 nothing silently fails, §3.3 map before build
    origin: >
      James, 2026-10-10: "look at the causal graph. also the data nodes arent a reflection of guardian. which means there is
      blind spots. okay but what would that do? also connecting it to the associative lattice" — after "look at the phases
      about using cfr as a face or brain, of nodes … like awareness of itself. tell me how powerful that could be".
  found:
    graph: >
      intelligence/cfr/graph.js: every ledger entry is a node; edges from causedBy, sessionId, jobId — and "temporal": any
      two events within 2 s on the same system (graph.js:88). Guardian is the most concurrent system Nexus has (several
      tabs, retries, background builds beside a chat): the 2 s rule links unrelated jobs, and root cause walks those links.
    nodes: >
      guardian/data/nodes holds what guardian IS (63 commands, 36 capabilities, 32 components, 5 providers, 1 system) and
      12 responses — not what it is DOING: no node for a job, a tab, an account, a selector map, a gate trail, an economy
      hold, an agent (SD4). Anything that reads nodes (loom, Idearium, an agent through the node registry) sees a guardian
      with no work in it.
    field: >
      intelligence/cfr/field.js's nudge table knows 12 guardian events (queued, dispatched, complete, error, chunk, …) and
      none of its lifecycle since 0.55.2 — accepted, the pickup failure, cancelled, the economy's hold, awaiting the
      transcript, retrying, needs-you. The field cannot see a tab that never took a job.
    lattice: >
      intelligence/lattice/associative-lattice.js holds a field per directed SYSTEM PAIR; fanin-listener.js (booted by
      autopilot through lib/ledger-fanin/boot.js) makes a pair only when a ledger row's causedBy names another system.
      Guardian's rows carry no causedBy (its component-ledger writes have system, component, session — not who asked),
      so idearium → guardian and copilot → guardian — the pairs every failure this week was in — never get a field.
  what_it_would_do: >
    Today a failure is found by someone running the stack and reading logs (this week: the simulator). With these
    phases, the same failures show themselves: a job is a node with its causes; the copilot → guardian pair's friction
    rises when jobs wait; resonance rises on chatgpt when the same job is retried; a tab that never takes a job is a
    broken expectation with both ends named. The door (and RAID, ME5) reads the pair fields when it chooses — an agent
    whose relationship is turbulent is tried later — and a failure's sentence carries its causal chain. That is the
    awareness: what happened, why, what state each relationship is in, used while choosing, not only after.
  pushback: >
    The field's numbers are a hand-written nudge table (+0.02 here, -0.03 there), not learned. Until they are checked
    against outcomes (the gate SD10, benchmarks SN4), a "high friction" is a reading of the table, not of the world — it
    is shown with the events that moved it, never as a bare number. And every live thing as a node is memory: jobs and
    tabs are bounded by RFR2's ring buffer and evicted with their edges (CF1's kernel bounds).
  phases:
    AW0_no_guessed_causes:
      layer: library
      status: "OPEN"
      james: '"look at the causal graph."'
      depends_on: []
      files: [intelligence/cfr/graph.js, intelligence/cfr/ledger.js]
      does: "CF1(a) brought forward: an edge says how it is known — explicit (causedBy), rule, adapter (a lifecycle pair), or observed (the 2 s neighbour). Observed edges are still drawn and never walked for root cause."
      proof: "two unrelated guardian jobs 1 s apart are not each other's cause in traceToRoot; a job's error still walks to the prompt that made it"
    AW1_guardian_reflected_in_nodes:
      layer: guardian
      status: "OPEN"
      james: '"also the data nodes arent a reflection of guardian. which means there is blind spots."'
      depends_on: [AW0_no_guessed_causes]
      files: [guardian/lib/node-registry.js, guardian/lib/jobs.js, guardian/lib/ncp.js, guardian/lib/selector-map.js, lib/node-schemas]
      does: "Guardian's live state as nodes, written by the code that owns it: .job (its gates, its attempts, who asked), .tab (provider, account, chat, claimed, last heartbeat), .agent per model (SD4 — accounts, selectors, limits, health); the response node already links its job. Live nodes are bounded and archived when done (§0.3), never piled up."
      proof: "with a job running, the node registry lists the job, its tab and its agent; a finished job's node carries its gate trail and outcome"
    AW2_every_call_says_who_asked:
      layer: library
      status: "OPEN"
      james: '"also connecting it to the associative lattice"'
      depends_on: []
      files: [lib/repo-agent.js, copilot/lifeline.js, guardian/ask.js, guardian/lib/jobs.js, lib/component-ledger.js]
      does: "causedBy flows with every cross-system call — idearium → copilot → guardian — onto the job and onto guardian's ledger rows, so the fan-in listener makes the pair (idearium→guardian, copilot→guardian) and the job's node links to the run or chat that asked."
      proof: "after one repo-agent message, relationship_lattice has a copilot→guardian edge moved by that job, and the job node's causedBy names the Idearium run"
    AW3_the_field_hears_the_lifecycle:
      layer: library
      status: "OPEN"
      james: '"tell me how powerful that could be"'
      depends_on: [AW2_every_call_says_who_asked]
      files: [intelligence/cfr/field.js, guardian/event-taxonomy.js]
      does: "The nudge table learns guardian's whole lifecycle — accepted, pickup failure, cancelled, economy hold, awaiting transcript, retrying, needs-you — each nudge written beside the event's taxonomy entry, so a new event cannot be added without saying what it does to the field."
      proof: "a retried job raises resonance on its pair; a pickup failure raises friction; a clean answer lowers both; an event with no nudge fails the taxonomy check"
    AW4_the_door_reads_the_lattice:
      layer: library
      status: "OPEN"
      james: '"like awareness of itself"'
      depends_on: [AW3_the_field_hears_the_lifecycle]
      files: [lib/model-door.js, lib/pipeline-routing.js, intelligence/lattice/associative-lattice.js]
      does: "When the door (and RAID after ME5) orders a route, a hop whose pair is turbulent or chaotic goes later — said on the hop with the events that made it so, beside the open-tab ordering (HP18). A failure's sentence names its causal chain (AW0) and the pair's state."
      proof: "with chatgpt's pair driven turbulent by retried jobs, auto tries the next agent first and says why, naming the jobs"
    AW5_its_own_face:
      layer: ui
      status: "OPEN"
      james: '"look at the phases about using cfr as a face or brain, of nodes"'
      depends_on: [AW1_guardian_reflected_in_nodes, AW4_the_door_reads_the_lattice]
      files: [idearium/ui/js/plan-panel.js]
      does: "P19's generalisation, seen: a node's face — its field, what caused it, what it caused — opened from wherever the node is shown (a job in the Plan, an agent in Settings, a system on the overview); and the lattice as a map of relationships with their state."
      proof: "clicking a failed job shows its causal chain and its pair's field; the overview shows copilot→guardian turbulent while jobs are retrying"
