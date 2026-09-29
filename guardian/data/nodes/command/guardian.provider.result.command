envelope: 1
uuid: nexus-export-command-guardian.provider.result
type: command
id: guardian.provider.result
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787256
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730134
lastSeenAt: 1790684787256
fingerprint: 17342a110e30fc651e6e9081
payload:
  method: POST
  path: /result
  declared: true
  served: true
  description: NCP result from browser tab
  grammar:
    - provider result
    - provider-result
  capability: guardian.provider.result
