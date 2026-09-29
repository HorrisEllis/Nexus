envelope: 1
uuid: nexus-export-command-sentinel.post.sentinel.faults.uuid.ack
type: command
id: sentinel.post.sentinel.faults.uuid.ack
context: sentinel command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - sentinel
  - command
  - declared
exported_at: 1790684787518
source: sentinel/interaction-contract.json
occurrences: 1
firstSeenAt: 1790684787518
lastSeenAt: 1790684787518
fingerprint: e95d16cb9352de1910e2b5a5
payload:
  method: POST
  path: /sentinel/faults/:uuid/ack
  declared: true
  served: null
  description: Acknowledge a fault — a governed write, not UI state
  grammar: []
  capability: sentinel.post.sentinel.faults.uuid.ack
