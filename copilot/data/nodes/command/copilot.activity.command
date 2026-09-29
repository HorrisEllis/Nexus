envelope: 1
uuid: nexus-export-command-copilot.activity
type: command
id: copilot.activity
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787022
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787022
lastSeenAt: 1790684787022
fingerprint: f7fc30f76f8995593e8c8547
payload:
  method: GET
  path: /api/activity
  declared: true
  served: null
  description: What copilot has been up to (?hours=, ?since=, &text=1)
  grammar:
    - what have you been up to
    - activity
  capability: copilot.activity
