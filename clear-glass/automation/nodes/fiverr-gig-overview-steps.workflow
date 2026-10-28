envelope: 1
uuid: nexus-export-workflow-fiverr-gig-overview-steps-v1
type: workflow
id: fiverr-gig-overview-steps-v1
context: Clear Glass → Settings → Automation
intent: >-
  Overview page, as editable steps: stops at a human check, then clicks the Suggested categories
  link "Category > Subcategory". Edit the selector if Fiverr changes the page.
summary: 6 steps; runs manual
system: clear-glass.automation
tags:
  - workflow
  - trigger:manual
  - step:extract
  - step:condition
  - step:browser
  - step:stop
  - step:notify
exported_at: 1793207566467
source: clear-glass/src/automation/nodes.js
occurrences: 1
firstSeenAt: 1793207566467
lastSeenAt: 1793207566467
fingerprint: 46ff76fc551e630d
payload:
  uuid: fiverr-gig-overview-steps-v1
  format: nexus-workflow
  version: 2
  name: Fiverr gig - Overview (steps)
  description: >-
    Overview page, as editable steps: stops at a human check, then clicks the Suggested categories
    link "Category > Subcategory". Edit the selector if Fiverr changes the page.
  vars:
    category: ''
    subcategory: ''
  settings:
    concurrency: queue
    timeoutMs: 60000
  steps:
    - type: trigger
      config: {}
    - id: s_page
      type: extract
      label: Page
      config:
        page: auto
        mode: page
    - id: s_gate
      type: condition
      label: Human check?
      config:
        left: '{{steps.Page.output.text}}'
        op: matches
        value: >-
          /press\s*(&|and)\s*hold|px-captcha|verify you are human|checking if the site connection is
          secure/i
        onTrue: s_held
        onFalse: next
    - id: s_cat
      type: browser
      label: Category
      config:
        action: click
        page: auto
        selector: text={{vars.category}} > {{vars.subcategory}}
        waitAfterMs: 500
    - id: s_ok
      type: stop
      label: Done
      config: {}
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
  requires:
    macros: []
    workflows: []
