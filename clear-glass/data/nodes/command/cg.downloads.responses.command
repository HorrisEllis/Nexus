envelope: 1
uuid: nexus-export-command-cg.downloads.responses
type: command
id: cg.downloads.responses
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786737
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786737
lastSeenAt: 1790684786737
fingerprint: 07ed4ebbdd79dc1c3954cca0
payload:
  method: GET
  path: /cli/downloads/responses
  declared: true
  served: null
  description: >-
    Agent chats (one row per chat at its newest version; ?versions=all lists every version,
    ?chatKey=provider:chatId one chat), agent replies and provider-tab downloads in the downloads
    index, each filed under its agent; filters agentId, jobId, provider, kind
  grammar:
    - downloads responses
  capability: cg.downloads.responses
