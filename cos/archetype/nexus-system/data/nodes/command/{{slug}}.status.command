{
  "envelope": 1,
  "uuid": "{{uuid8}}-comm-0000-0000-000000000003",
  "type": "command",
  "id": "{{slug}}.status",
  "system": "{{slug}}",
  "summary": "the status report",
  "payload": {
    "capability": "{{slug}}.core.observe",
    "cli": "status",
    "route": "{{slug}}.status",
    "events": [
      "{{slug}}.status.reported"
    ]
  }
}
