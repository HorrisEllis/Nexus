envelope: 1
uuid: nexus-export-command-cortex.raid.health
type: command
id: cortex.raid.health
context: cortex command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - cortex
  - command
  - declared
exported_at: 1790684787088
source: cortex/registry-components.js
occurrences: 1
firstSeenAt: 1790684787088
lastSeenAt: 1790684787088
fingerprint: 9e222421cb712fb4e2f319b4
payload:
  method: GET
  path: /api/raid/health
  declared: true
  served: null
  description: RAID agent health + weights
  grammar:
    - raid health
  capability: cortex.raid.health
