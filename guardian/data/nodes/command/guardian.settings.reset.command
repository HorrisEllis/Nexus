envelope: 1
uuid: nexus-export-command-guardian.settings.reset
type: command
id: guardian.settings.reset
context: guardian command — declared · NOT served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - not-served
exported_at: 1790684787257
source: guardian/registry-components.js
occurrences: 1
firstSeenAt: 1789250730146
lastSeenAt: 1790684787257
fingerprint: 57b0b4e5067d794c2eae7cd8
payload:
  method: POST
  path: /settings/reset
  declared: true
  served: false
  description: Reset settings to defaults
  grammar:
    - settings reset
    - settings-reset
  capability: guardian.settings.reset
