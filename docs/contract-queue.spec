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
