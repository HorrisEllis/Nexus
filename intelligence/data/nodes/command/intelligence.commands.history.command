envelope: 1
uuid: nexus-export-command-intelligence.commands.history
type: command
id: intelligence.commands.history
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787418
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1789250756082
lastSeenAt: 1790684787418
fingerprint: cfbe851073425bc19ce2cc2d
payload:
  method: GET
  path: /api/commands/history
  declared: true
  served: null
  description: >-
    Real, persistent, queryable log of every command actually invoked — distinct from the static
    list above
  grammar:
    - commands history
    - intelligence commands
  capability: intelligence.commands.history
