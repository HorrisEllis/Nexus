envelope: 1
uuid: nexus-export-command-guardian.chats.list
type: command
id: guardian.chats.list
context: guardian command — declared · NOT served
intent: null
summary: null
system: null
tags:
  - guardian
  - command
  - declared
  - not-served
exported_at: 1790684787220
source: guardian/registry-components.js
occurrences: 1
firstSeenAt: 1790684787220
lastSeenAt: 1790684787220
fingerprint: 93b10d075da8a415324e95b4
payload:
  method: GET
  path: /api/chats
  declared: true
  served: false
  description: Every logged chat at its newest version (?agentId ?provider ?q=text recall ?limit)
  grammar:
    - chats list
    - chats-list
  capability: guardian.chats.list
