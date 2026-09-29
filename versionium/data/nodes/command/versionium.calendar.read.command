envelope: 1
uuid: nexus-export-command-versionium.calendar.read
type: command
id: versionium.calendar.read
context: versionium command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - versionium
  - command
  - declared
exported_at: 1790684787526
source: versionium/registry-components.js
occurrences: 1
firstSeenAt: 1789250756053
lastSeenAt: 1790684787526
fingerprint: b896b38418a2b9c5bc50e277
payload:
  method: GET
  path: /api/versionium/calendar/:date
  declared: true
  served: null
  description: Real calendar playback for a given date
  grammar:
    - versionium calendar
  capability: versionium.calendar.read
