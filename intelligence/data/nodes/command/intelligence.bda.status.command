envelope: 1
uuid: nexus-export-command-intelligence.bda.status
type: command
id: intelligence.bda.status
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787421
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1790684787421
lastSeenAt: 1790684787421
fingerprint: 55890edd7b1cf5993f1b8289
payload:
  method: GET
  path: /api/intelligence/bda/status
  declared: true
  served: null
  description: Behavioral Drift Analyzer — current per-role pendulum/regime state
  grammar:
    - bda status
    - intelligence bda
  capability: intelligence.bda.status
