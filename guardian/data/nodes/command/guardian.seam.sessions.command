envelope: 1
uuid: nexus-export-command-guardian.seam.sessions
type: command
id: guardian.seam.sessions
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787238
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730140
lastSeenAt: 1790684787238
fingerprint: 7487388169ad4aa1e1bf858a
payload:
  method: GET
  path: /seam/sessions
  declared: true
  served: true
  description: SEAM session history
  grammar:
    - seam sessions
    - seam-sessions
  capability: guardian.seam.sessions
