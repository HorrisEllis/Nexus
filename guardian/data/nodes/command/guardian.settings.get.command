envelope: 1
uuid: nexus-export-command-guardian.settings.get
type: command
id: guardian.settings.get
context: guardian command — declared · NOT served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - not-served
exported_at: 1790684787241
source: guardian/registry-components.js
occurrences: 1
firstSeenAt: 1789250730146
lastSeenAt: 1790684787241
fingerprint: 02da19206897b309cc0179b1
payload:
  method: GET
  path: /settings
  declared: true
  served: false
  description: Guardian settings
  grammar:
    - settings get
    - settings-get
  capability: guardian.settings.get
