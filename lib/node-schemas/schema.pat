envelope: 1
uuid: nexus-export-schema-pat
type: schema
id: pat
context: lib/node-schemas — shared node-type schema registry
intent: null
summary: null
system: null
tags: []
exported_at: 1789116324008
source: nexus.lib.node-export
payload:
  status: REAL
  source: lib/case-library.js — the real case_index entry (past-compartment pattern memory)
  fields:
    uuid:
      type: string
      required: true
      description: real case id
    signature:
      type: string
      required: true
      description: real pattern signature (domain:verb)
    domain:
      type: string
      required: true
      description: real declared domain
    verb:
      type: string
      required: true
      description: real declared verb
    compartment_uuid:
      type: string
      required: true
      description: the real compartment this pattern came from
    intent_uuid:
      type: string
      required: false
      description: real intent id, if any
    working_memory:
      type: any
      required: false
      description: a real snapshot, not a live reference (§BUGFIX 2026-08-28)
    result:
      type: any
      required: false
      description: real compartment result
    trace_log:
      type: array
      required: true
      description: a real deep-copied snapshot, never the live array
    constraint_frame_uuid:
      type: string
      required: false
      description: real constraint frame this ran under
