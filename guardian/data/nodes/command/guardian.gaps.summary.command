envelope: 1
uuid: nexus-export-command-guardian.gaps.summary
type: command
id: guardian.gaps.summary
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787233
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730143
lastSeenAt: 1790684787233
fingerprint: 9ff870021e73e8ef6a037705
payload:
  method: GET
  path: /gaps/summary
  declared: true
  served: true
  description: Gap summary by type + severity
  grammar:
    - gaps summary
    - gaps-summary
  capability: guardian.gaps.summary
