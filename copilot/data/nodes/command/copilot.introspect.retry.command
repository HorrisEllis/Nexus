envelope: 1
uuid: nexus-export-command-copilot.introspect.retry
type: command
id: copilot.introspect.retry
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787055
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730182
lastSeenAt: 1790684787055
fingerprint: a20045587e8a62172e1a8ec3
payload:
  method: POST
  path: /api/introspect/retry
  declared: true
  served: null
  description: Re-ask carrying the SPECIFIC finding that rejected the last answer, not "try again"
  grammar:
    - retry the response
    - try that again
    - redo that
  capability: copilot.introspect.retry
