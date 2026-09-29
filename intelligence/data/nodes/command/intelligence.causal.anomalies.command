envelope: 1
uuid: nexus-export-command-intelligence.causal.anomalies
type: command
id: intelligence.causal.anomalies
context: intelligence command — declared · served unknown (no dispatch extractor)
intent: null
summary: null
system: null
tags:
  - intelligence
  - command
  - declared
exported_at: 1790684787422
source: intelligence/registry-components.js
occurrences: 1
firstSeenAt: 1790684787422
lastSeenAt: 1790684787422
fingerprint: 4a851acd5a24df268f355956
payload:
  method: GET
  path: /api/intelligence/causal/anomalies
  declared: true
  served: null
  description: Anomaly Engine — missing/unexpected event, timeout, causal_gap, path_mismatch
  grammar:
    - causal anomalies
    - intelligence causal
  capability: intelligence.causal.anomalies
