envelope: 1
uuid: nexus-system-template-schema-command
type: schema
id: command
context: >-
  idearium/spec-engine/templates/system/schemas — the system template's own schemas; a new system copies them
  into its schemas/ folder and owns them from then on.
intent: >-
  James, 2026-10-05: "each component only needs to connect to the registry." · "each component has to have at least one capability, with at least one command, and events, each a node each." · "Maybe add, if applicant, data dir with the directory for the data, consumers, intent, data type/system like node, vector, database or table" · "maybe create a template or schema from that."
summary: "one way to invoke a capability"
system: template
tags: [system-template]
source: idearium/spec-engine/templates/system
payload:
  status: REAL
  fields:
    type:
      type: string
      required: true
      description: "always \"command\""
    id:
      type: string
      required: true
      description: ""
    uuid:
      type: string
      required: true
      description: ""
    capability:
      type: string
      required: true
      description: "the capability it invokes"
    cli:
      type: string
      required: true
      description: "the CLI words, e.g. \"<system> <verb>\""
    route:
      type: string
      required: false
      description: "its route id, if it has one"
    events:
      type: array
      required: true
      description: "event ids it emits"
