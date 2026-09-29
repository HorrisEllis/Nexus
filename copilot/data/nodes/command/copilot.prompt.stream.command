envelope: 1
uuid: nexus-export-command-copilot.prompt.stream
type: command
id: copilot.prompt.stream
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787072
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730178
lastSeenAt: 1790684787072
fingerprint: 4633dca3214c6b1c1c7cf39a
payload:
  method: POST
  path: /api/prompt/stream
  declared: true
  served: null
  description: Streaming SSE prompt — token-by-token, no timeout (P112)
  grammar:
    - stream ask
    - cp stream
  capability: copilot.prompt.stream
