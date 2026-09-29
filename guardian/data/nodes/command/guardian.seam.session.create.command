envelope: 1
uuid: nexus-export-command-guardian.seam.session.create
type: command
id: guardian.seam.session.create
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787257
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730141
lastSeenAt: 1790684787257
fingerprint: 6f55a75e3293aad5402d3f7b
payload:
  method: POST
  path: /seam/sessions
  declared: true
  served: true
  description: Create SEAM session
  grammar:
    - seam session create
    - seam-session-create
  capability: guardian.seam.session.create
