envelope: 1
uuid: nexus-export-command-versionium.files.record
type: command
id: versionium.files.record
context: versionium command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - versionium
  - command
  - declared
exported_at: 1790684787532
source: versionium/registry-components.js
occurrences: 1
firstSeenAt: 1790684787532
lastSeenAt: 1790684787532
fingerprint: ac7ed829943b82fce1d1b819
payload:
  method: POST
  path: /api/versionium/files/record
  declared: true
  served: null
  description: Attach a repo tree's files (full copy or proven delta) to an existing repo-snapshot commit
  grammar:
    - versionium files record
  capability: versionium.files.record
