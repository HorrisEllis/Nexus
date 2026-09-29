envelope: 1
uuid: nexus-export-command-copilot.agent.switch
type: command
id: copilot.agent.switch
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787046
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787046
lastSeenAt: 1790684787046
fingerprint: 6905d988bcd7be9a28ad2f80
payload:
  method: POST
  path: /api/agent/switch
  declared: true
  served: null
  description: Switch the worn agent/hat, then check it is reachable
  grammar:
    - switch agent
    - wear hat
  capability: copilot.agent.switch
