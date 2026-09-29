envelope: 1
uuid: nexus-export-command-guardian.chats.item
type: command
id: guardian.chats.item
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
fingerprint: 9f53f2c474fb3210c9d5c689
payload:
  method: GET
  path: /api/chats/item/:id
  declared: true
  served: false
  description: 'One chat version: the full transcript from its .response file'
  grammar:
    - chats item
    - chats-item
  capability: guardian.chats.item
