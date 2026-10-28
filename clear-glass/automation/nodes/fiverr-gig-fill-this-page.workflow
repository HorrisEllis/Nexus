envelope: 1
uuid: nexus-export-workflow-fiverr-gig-fill-this-page-v1
type: workflow
id: fiverr-gig-fill-this-page-v1
context: Clear Glass → Settings → Automation
intent: >-
  Fills whichever Fiverr gig editor page is open from a written gig, through Clear Glass's own gig
  fill (POST :7702/cli/autofill/gig/fill). Stops at a human check and types nothing. Never saves or
  publishes.
summary: 6 steps; runs manual
system: clear-glass.automation
tags:
  - workflow
  - trigger:manual
  - step:http
  - step:condition
  - step:notify
  - step:stop
  - step:log
exported_at: 1793207566459
source: clear-glass/src/automation/nodes.js
occurrences: 1
firstSeenAt: 1793207566459
lastSeenAt: 1793207566459
fingerprint: 2d47b004d63b97be
payload:
  uuid: fiverr-gig-fill-this-page-v1
  format: nexus-workflow
  version: 2
  name: Fiverr gig - fill this page
  description: >-
    Fills whichever Fiverr gig editor page is open from a written gig, through Clear Glass's own gig
    fill (POST :7702/cli/autofill/gig/fill). Stops at a human check and types nothing. Never saves
    or publishes.
  vars:
    gig: ''
    agentId: default
    minConfidence: medium
  settings:
    concurrency: queue
    timeoutMs: 120000
  steps:
    - type: trigger
      config: {}
    - id: s_fill
      type: http
      label: Fill
      config:
        method: POST
        url: http://127.0.0.1:7702/cli/autofill/gig/fill
        headers: Content-Type = application/json
        body: >-
          {"gig": {{vars.gig}}, "agentId": "{{vars.agentId}}", "minConfidence":
          "{{vars.minConfidence}}"}
        failOnHttpError: false
    - id: s_is_held
      type: condition
      label: Held at a human check?
      config:
        left: '{{steps.Fill.output.status}}'
        op: '=='
        value: '409'
        onTrue: s_held
        onFalse: s_done
    - id: s_held
      type: notify
      label: Held
      config:
        title: 'Fiverr: a human check is up'
        body: Nothing was typed. The check is yours to pass; run this again after.
    - id: s_held_stop
      type: stop
      label: Stop
      config: {}
    - id: s_done
      type: log
      label: Result
      config:
        message: >-
          status {{steps.Fill.output.status}} · page {{steps.Fill.output.body.page}} · filled
          {{steps.Fill.output.body.filled | length}} · not found {{steps.Fill.output.body.notFound |
          length}} · failed {{steps.Fill.output.body.failed | length}}
    - id: s_notify
      type: notify
      label: Done
      config:
        title: Fiverr gig filled
        body: >-
          Read the page, then press Save yourself. Not found: {{steps.Fill.output.body.notFound |
          length}}.
  requires:
    macros: []
    workflows: []
