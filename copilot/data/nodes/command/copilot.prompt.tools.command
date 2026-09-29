envelope: 1
uuid: nexus-export-command-copilot.prompt.tools
type: command
id: copilot.prompt.tools
context: copilot command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
exported_at: 1790684787073
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1790684787073
lastSeenAt: 1790684787073
fingerprint: 21111346a37ca897ae9513fb
payload:
  method: POST
  path: /api/prompt/tools
  declared: true
  served: null
  description: A prompt with the full tool loop (all 109 tools unless a scope is given)
  grammar:
    - use tools
  capability: copilot.prompt.tools
