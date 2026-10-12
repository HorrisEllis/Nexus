{
  "envelope": 1,
  "uuid": "{{uuid8}}-comm-0000-0000-000000000107",
  "type": "command",
  "id": "{{slug}}.module.new",
  "system": "{{slug}}",
  "summary": "lay out a module",
  "payload": {
    "capability": "{{slug}}.modules.nest",
    "cli": "module",
    "handler": "newModule",
    "route": "{{slug}}.module.new",
    "events": [
      "{{slug}}.module.created"
    ]
  }
}
