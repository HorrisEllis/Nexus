envelope: 1
uuid: nexus-export-command-cg.screenQa.detect
type: command
id: cg.screenQa.detect
context: clear-glass command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - clear-glass
  - command
  - declared
exported_at: 1790684786828
source: clear-glass/registry-components.js
occurrences: 1
firstSeenAt: 1790684786828
lastSeenAt: 1790684786828
fingerprint: 2ed907a1690b59549a0b3fbb
payload:
  method: IPC
  path: screen-qa:detect
  declared: true
  served: null
  description: >-
    Detect real open-ended questions on the page, excluding whatever autofill would already
    confidently fill
  grammar:
    - screenQa detect
  capability: cg.screenQa.detect
