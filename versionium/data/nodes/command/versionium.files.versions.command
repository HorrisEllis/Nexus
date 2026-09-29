envelope: 1
uuid: nexus-export-command-versionium.files.versions
type: command
id: versionium.files.versions
context: versionium command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - versionium
  - command
  - declared
exported_at: 1790684787527
source: versionium/registry-components.js
occurrences: 1
firstSeenAt: 1790684787527
lastSeenAt: 1790684787527
fingerprint: 1b1928d570d4e9c24b03d2d8
payload:
  method: GET
  path: /api/versionium/files/versions
  declared: true
  served: null
  description: >-
    Every commit that wrote a path, newest first, with the file's sha256 as of each — the history
    loom reads instead of git (0.39.263)
  grammar:
    - versionium files versions
  capability: versionium.files.versions
