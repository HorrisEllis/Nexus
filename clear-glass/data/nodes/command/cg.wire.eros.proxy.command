envelope: 1
uuid: nexus-export-command-cg.wire.eros.proxy
type: command
id: cg.wire.eros.proxy
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786844
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1789250730164
lastSeenAt: 1790684786844
fingerprint: d23438d91d88edb90e172150
payload:
  method: POST
  path: /eros/*
  declared: true
  served: null
  description: Proxy command to ErosmancerOS
  grammar:
    - wire eros proxy
  capability: cg.wire.eros.proxy
