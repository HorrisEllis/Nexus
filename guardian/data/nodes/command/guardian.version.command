envelope: 1
uuid: nexus-export-command-guardian.version
type: command
id: guardian.version
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787242
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730128
lastSeenAt: 1790684787242
fingerprint: 5a5e6eb7b5b8dad783476841
payload:
  method: GET
  path: /version
  declared: true
  served: true
  description: Guardian + userscript versions
  grammar:
    - version
    - version
  capability: guardian.version
