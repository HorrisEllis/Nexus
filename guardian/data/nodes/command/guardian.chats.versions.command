envelope: 1
uuid: nexus-export-command-guardian.chats.versions
type: command
id: guardian.chats.versions
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
fingerprint: 715e2016e27c436b6bd7f391
payload:
  method: GET
  path: /api/chats/versions
  declared: true
  served: false
  description: Every version of one chat (?key=provider:chatId), newest first
  grammar:
    - chats versions
    - chats-versions
  capability: guardian.chats.versions
