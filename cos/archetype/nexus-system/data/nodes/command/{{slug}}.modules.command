{
  "envelope": 1,
  "uuid": "{{uuid8}}-comm-0000-0000-000000000108",
  "type": "command",
  "id": "{{slug}}.modules",
  "system": "{{slug}}",
  "summary": "list the modules",
  "payload": {
    "capability": "{{slug}}.modules.nest",
    "cli": "modules",
    "handler": "modules",
    "route": "{{slug}}.modules",
    "events": [
      "{{slug}}.modules.listed"
    ]
  }
}
