envelope: 1
uuid: nexus-export-command-guardian.provider.channel
type: command
id: guardian.provider.channel
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787230
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730133
lastSeenAt: 1790684787230
fingerprint: c204ff7995480ab62d944306
payload:
  method: GET
  path: /channel
  declared: true
  served: true
  description: NCP SSE channel — browser tabs connect here
  grammar:
    - provider channel
    - provider-channel
  capability: guardian.provider.channel
