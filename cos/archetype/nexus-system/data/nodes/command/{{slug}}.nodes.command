{
  "envelope": 1,
  "uuid": "{{uuid8}}-comm-0000-0000-000000000004",
  "type": "command",
  "id": "{{slug}}.nodes",
  "system": "{{slug}}",
  "summary": "list nodes of a type",
  "payload": {
    "capability": "{{slug}}.core.observe",
    "cli": "nodes",
    "route": "{{slug}}.nodes",
    "events": [
      "{{slug}}.nodes.listed"
    ]
  }
}
