spec:
  meta:
    name:     contract-queue
    version:  1.0.0
    uuid:     nexus-contract-queue-v1-0000-2026-0627-jamesbrooks-001
    status:   active
    purpose: >
      Every request between systems is a contract.
      Tagged, tracked, queued, written to disk before dispatch.
      Input/output folders per system — nothing lost.
      Meta-poller watches for stuck contracts and unsticks them.

  contract_shape:
    uuid:          string    # permanent id
    requestId:     string    # end-to-end trace
    contractId:    string    # governing spec
    fromSystem:    string    # e.g. "copilot"
    fromComponent: string    # e.g. "copilot.prompt"
    fromHook:      string    # e.g. "copilot.prompt.to-raid"
    toSystem:      string    # e.g. "cortex"
    toComponent:   string    # e.g. "cortex.raid"
    toHook:        string    # e.g. "cortex.raid.receive"
    intent:        string
    agent:         string
    tags:          string[]
    payload:       object
    status:        enum      # queued|dispatched|running|complete|failed|stuck
    priority:      enum      # critical|high|normal|low
    createdAt:     number
    dispatchedAt:  number
    completedAt:   number
    ttlMs:         number
    retryCount:    number
    result:        object
    error:         string

  dual_cognition:
    INTUITION:
      speed:  "<50ms, no model"
      source: "Pattern engine + crystal lattice + user model + stream buffer"
      file:   copilot/intuition.js
    ANALYSIS:
      speed:  "100ms-45s, with model"
      source: "CFR causal kernel + vector memory + semantic + invariants + diagnostic"
      file:   copilot/analysis.js
    ADVERSARIAL:
      fires:  "Every 60s AND on high-severity gaps"
      method: "Pings INTUITION and ANALYSIS independently + against each other"
      file:   copilot/adversarial.js

  phases:
    - id: 1
      name: Bug fixes (diagnostic, user-model, forge-shell)
      status: complete
    - id: 2
      name: lib/contract-queue.js
      status: next
    - id: 3
      name: lib/contract-poller.js
      status: pending
    - id: 4
      name: ui/tv-shell/menu.js (floating menu sovereign module)
      status: pending
    - id: 5
      name: copilot/intuition.js
      status: pending
    - id: 6
      name: copilot/analysis.js
      status: pending
    - id: 7
      name: copilot/adversarial.js
      status: pending
    - id: 8
      name: TV shell wiring
      status: pending

## ADDENDUM 2026-10-24 — the job ledger replaces the Library's .response view (his, for CB3)
James, 2026-10-24, on the CB1–CB7 report from another session (CB3): "In the library can we get a queue, for contracts (.job nodes). that wait
for the respective .response node and events for completion. it would have a list of jobs, id and expands to show the details and what its
waiting on. physical files, saved in the library." Asked whether "the library" meant Clear Glass's Library window: "yes maybe replace the ui
for the .response and replace it with the job ledger including the queue".
Read as (to confirm, his "maybe"): the Library's view of .response files is replaced by one job ledger. Each .job contract is a row with its
id; open it to see its details and what it waits on; a .response node and its events close it; queued and done jobs are shown together;
they are files kept in the Library. Built on this queue and Guardian's guardian/lib/jobs.js and guardian/lib/response-sink.js, with no third
queue. Not yet mapped: the pasted CB map is not in the tree, so CB3 gets its phasemap here before any code.
