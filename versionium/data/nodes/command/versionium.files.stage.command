envelope: 1
uuid: nexus-export-command-versionium.files.stage
type: command
id: versionium.files.stage
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
fingerprint: 98c5b366313d3239738e3c8d
payload:
  method: POST
  path: /api/versionium/files/stage
  declared: true
  served: null
  description: >-
    Put file content into the blob store ahead of record(), in batches under the per-request cap
    (0.39.263)
  grammar:
    - versionium files stage
  capability: versionium.files.stage
