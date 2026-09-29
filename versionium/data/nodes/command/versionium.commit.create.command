envelope: 1
uuid: nexus-export-command-versionium.commit.create
type: command
id: versionium.commit.create
context: versionium command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - versionium
  - command
  - declared
exported_at: 1790684787531
source: versionium/registry-components.js
occurrences: 1
firstSeenAt: 1789250756042
lastSeenAt: 1790684787531
fingerprint: 9ae1efd1eb1e0fd7d48d677f
payload:
  method: POST
  path: /api/versionium/commit
  declared: true
  served: null
  description: Real commit — manual or agent-mesh dispatched
  grammar:
    - versionium commit
    - vc
  capability: versionium.commit.create
