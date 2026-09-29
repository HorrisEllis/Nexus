envelope: 1
uuid: nexus-export-command-copilot.agent.calibrate
type: command
id: copilot.agent.calibrate
context: copilot command — declared · NOT served
intent: null
summary: null
system: null
tags:
  - copilot
  - command
  - declared
  - not-served
exported_at: 1790684787047
source: copilot/registry-components.js
occurrences: 1
firstSeenAt: 1789250730182
lastSeenAt: 1790684787047
fingerprint: 460ba1bb8160dddbe49edc7c
payload:
  method: POST
  path: /api/agents/calibrate
  declared: true
  served: false
  description: 'Binary-search an agent’s real input limit from live probes — NOT SERVED: no live probe is wired'
  grammar:
    - calibrate agent
    - find the limit
  capability: copilot.agent.calibrate
  notServed: lib/agent-capability.js calibrate() needs a live probe(size) function; none is wired
