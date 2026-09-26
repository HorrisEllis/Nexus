envelope: 1
uuid: nexus-export-schema-tool
type: schema
id: tool
context: lib/node-schemas — shared node-type schema registry
intent: null
summary: null
system: null
tags: []
exported_at: 1789200000400
source: nexus.lib.node-export
payload:
  status: REAL
  source: >-
    lib/agent-tools/tools/**/*.js — the real, universal code-backed tool export shape (re-checked
    this pass against lib/agent-tools/tools/execution/run-closed-loop.js: exact {name, description,
    parameters, execute} match). Broadened this pass to also cover lib/tool-forge.js's real
    declarative shape: {name, description, parameters, steps: [{call, args, as?}]} — same three
    header fields, but `steps` (real, serializable data) in place of `execute` (a live function,
    never serializable, in-process only). A forged tool can actually be written to a real .tool
    file and re-imported; a hand-written code tool's `execute` cannot — that's the real, checkable
    reason both belong in one schema as alternatives, not two competing types.
  correction_2026-09-12: >-
    This file previously claimed "is agent.tool a separate type? it isn't, it's this same shape" —
    that claim is superseded, not just stale. lib/agent-tools/naming.js (built same day, after this
    file) gives agent.tool a genuinely different id grammar (provider.agentName.name.agent.tool vs
    this type's system.name.tool) and its own parseName() `kind` ('agent_tool' vs 'tool') — two
    distinct regexes, not a formatting choice. Left visible rather than deleted so the reversal is
    traceable. See lib/node-schemas/schema.agent_tool (status: OPEN — real naming grammar, zero real
    instances built against it yet).
  fields:
    name:
      type: string
      required: true
      description: real, unique tool name agents call by
    description:
      type: string
      required: true
      description: real, model-facing description
    parameters:
      type: object
      required: true
      description: real JSON-schema-shaped {type, properties, required}
    execute:
      type: any
      required: false
      description: real async function — code-backed tools only. Not serializable, present only in-process, absent from any exported .tool file
    steps:
      type: array
      required: false
      description: 'real [{call, args, as?}] composition — forged tools only (lib/tool-forge.js), the one real path by which a .tool is genuinely exportable/importable end to end'
