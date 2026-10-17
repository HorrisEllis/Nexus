envelope: 1
uuid: nexus-export-command-nexus-healer.evaluate
type: command
id: nexus-healer.evaluate
context: nexus-healer command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - nexus-healer
  - command
  - declared
exported_at: 1790684787490
source: nexus-healer/registry-components.js
occurrences: 1
firstSeenAt: 1789250730155
lastSeenAt: 1790684787490
fingerprint: b100fcc75beb17ad3ad4a895
payload:
  method: POST
  path: /proposals/:id/evaluate
  declared: true
  served: null
  description: >-
    Generate a real patch via forge (RAID-routed) for the given targetFile, run against the isolated
    evaluation pipeline.
  grammar: []
  capability: nexus-healer.evaluate
