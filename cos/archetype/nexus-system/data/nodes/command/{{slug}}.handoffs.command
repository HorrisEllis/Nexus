{
  "envelope": 1,
  "uuid": "{{uuid8}}-comm-0000-0000-000000000106",
  "type": "command",
  "id": "{{slug}}.handoffs",
  "system": "{{slug}}",
  "summary": "list the handoffs",
  "payload": {
    "capability": "{{slug}}.handoff.move",
    "cli": "handoffs",
    "handler": "handoffs",
    "route": "{{slug}}.handoffs",
    "events": [
      "{{slug}}.handoffs.listed"
    ]
  }
}
