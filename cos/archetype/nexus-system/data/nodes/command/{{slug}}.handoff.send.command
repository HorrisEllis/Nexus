{
  "envelope": 1,
  "uuid": "{{uuid8}}-comm-0000-0000-000000000105",
  "type": "command",
  "id": "{{slug}}.handoff.send",
  "system": "{{slug}}",
  "summary": "send a handoff",
  "payload": {
    "capability": "{{slug}}.handoff.move",
    "cli": "handoff",
    "handler": "handoff",
    "route": "{{slug}}.handoff.send",
    "events": [
      "{{slug}}.handoff.queued",
      "{{slug}}.handoff.refused"
    ]
  }
}
