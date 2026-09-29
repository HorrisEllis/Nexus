envelope: 1
uuid: nexus-export-command-guardian.seam.watchdog
type: command
id: guardian.seam.watchdog
context: guardian command — declared · served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - served
exported_at: 1790684787239
source: guardian/registry-components.js + guardian/lib/command-index-extract.js (guardian/server.js)
occurrences: 1
firstSeenAt: 1789250730141
lastSeenAt: 1790684787239
fingerprint: c6079c721124e6282b6cdcd3
payload:
  method: GET
  path: /seam/watchdog/status
  declared: true
  served: true
  description: SEAM watchdog + stall detection
  grammar:
    - seam watchdog
    - seam-watchdog
  capability: guardian.seam.watchdog
