envelope: 1
uuid: nexus-export-workflow-fiverr-gig-pricing-steps-v1
type: workflow
id: fiverr-gig-pricing-steps-v1
context: Clear Glass → Settings → Automation
intent: >-
  Scope & Pricing page, as editable steps: stops at a human check, types each package name and
  description by its placeholder, picks each delivery time with the "choose delivery" macro. A step
  that cannot find its field is skipped, not fatal. Never saves or publishes.
summary: 14 steps; runs manual; bundles 1 macro
system: clear-glass.automation
tags:
  - workflow
  - trigger:manual
  - step:extract
  - step:condition
  - step:browser
  - step:macro
  - step:stop
  - step:notify
exported_at: 1793207566470
source: clear-glass/src/automation/nodes.js
occurrences: 1
firstSeenAt: 1793207566470
lastSeenAt: 1793207566470
fingerprint: ec7bc55841df23ca
payload:
  uuid: fiverr-gig-pricing-steps-v1
  format: nexus-workflow
  version: 2
  name: Fiverr gig - Scope & Pricing (steps)
  description: >-
    Scope & Pricing page, as editable steps: stops at a human check, types each package name and
    description by its placeholder, picks each delivery time with the "choose delivery" macro. A
    step that cannot find its field is skipped, not fatal. Never saves or publishes.
  vars:
    basic_name: ''
    basic_description: ''
    basic_delivery: ''
    standard_name: ''
    standard_description: ''
    standard_delivery: ''
    premium_name: ''
    premium_description: ''
    premium_delivery: ''
  settings:
    concurrency: queue
    timeoutMs: 120000
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
    - id: s_basic_name
      type: browser
      label: BASIC name
      onError: continue
      config:
        action: fill
        page: auto
        selector: (//*[@placeholder="Name your package"])[1]
        value: '{{vars.basic_name}}'
    - id: s_basic_desc
      type: browser
      label: BASIC description
      onError: continue
      config:
        action: fill
        page: auto
        selector: (//*[@placeholder="Describe the details of your offering"])[1]
        value: '{{vars.basic_description}}'
    - id: s_basic_days
      type: macro
      label: BASIC delivery
      onError: continue
      config:
        name: Fiverr gig - choose delivery
        agentId: default
        params: |-
          tier = BASIC
          delivery = {{vars.basic_delivery}}
    - id: s_standard_name
      type: browser
      label: STANDARD name
      onError: continue
      config:
        action: fill
        page: auto
        selector: (//*[@placeholder="Name your package"])[2]
        value: '{{vars.standard_name}}'
    - id: s_standard_desc
      type: browser
      label: STANDARD description
      onError: continue
      config:
        action: fill
        page: auto
        selector: (//*[@placeholder="Describe the details of your offering"])[2]
        value: '{{vars.standard_description}}'
    - id: s_standard_days
      type: macro
      label: STANDARD delivery
      onError: continue
      config:
        name: Fiverr gig - choose delivery
        agentId: default
        params: |-
          tier = STANDARD
          delivery = {{vars.standard_delivery}}
    - id: s_premium_name
      type: browser
      label: PREMIUM name
      onError: continue
      config:
        action: fill
        page: auto
        selector: (//*[@placeholder="Name your package"])[3]
        value: '{{vars.premium_name}}'
    - id: s_premium_desc
      type: browser
      label: PREMIUM description
      onError: continue
      config:
        action: fill
        page: auto
        selector: (//*[@placeholder="Describe the details of your offering"])[3]
        value: '{{vars.premium_description}}'
    - id: s_premium_days
      type: macro
      label: PREMIUM delivery
      onError: continue
      config:
        name: Fiverr gig - choose delivery
        agentId: default
        params: |-
          tier = PREMIUM
          delivery = {{vars.premium_delivery}}
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
    macros:
      - uuid: fiverr-gig-choose-delivery-v1
        name: Fiverr gig - choose delivery
        urlPattern: fiverr.com
        steps:
          - action: wait_for
            data:
              selector: body
          - action: choose
            data:
              column: '{{tier}}'
              shows: DELIVERY TIME
              option: '{{delivery}}'
        params:
          - tier
          - delivery
        profile: null
        description: >-
          Scope & Pricing: in the BASIC / STANDARD / PREMIUM column named by {{tier}}, open the
          DELIVERY TIME dropdown and pick {{delivery}} (e.g. "3 Days"). What _gigFill does for each
          *.delivery part.
        createdAt: 1793207566448
        runCount: 0
        lastRunAt: null
    workflows: []
