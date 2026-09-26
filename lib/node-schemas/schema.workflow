envelope: 1
uuid: nexus-export-schema-workflow
type: schema
id: workflow
context: lib/node-schemas — shared node-type schema registry
intent: null
summary: null
system: null
tags: []
exported_at: 1790467200000
source: nexus.lib.node-export
payload:
  status: REAL
  source: >-
    clear-glass/src/mesh/automation-engine.js — the real workflow record (create(), exportWorkflow());
    written as a node by clear-glass/src/automation/nodes.js workflowNode(), read back by importNode().
    James: "make the macros and workflow automation, exportable node types. .macro, and maybe .workflow"
  fields:
    uuid:
      type: string
      required: true
      description: the workflow's id where it was exported (a fresh one is given on import)
    format:
      type: string
      required: true
      description: always "nexus-workflow"
    version:
      type: number
      required: true
      description: 2 — the automation engine v2 step format (templates, retry/onError, cron/event/webhook triggers)
    name:
      type: string
      required: true
      description: the workflow's name
    description:
      type: string
      required: false
      description: what it is for (also the envelope's intent)
    vars:
      type: object
      required: false
      description: default values for {{vars.<name>}}
    settings:
      type: object
      required: false
      description: concurrency (skip|queue|parallel), timeoutMs, maxSteps, partition, showPage
    steps:
      type: array
      required: true
      description: >-
        [{id, type, config, label?, enabled?, saveAs?, retry?, timeoutMs?, onError?}] — step types are
        clear-glass/src/automation/steps.js's catalogue plus trigger; webhook secrets are never exported
    requires:
      type: object
      required: true
      description: >-
        {macros: [.macro payloads], workflows: [{ref, name, description, vars, settings, steps}]} — the
        macros its macro steps run and the workflows its workflow steps call, so the file imports whole
