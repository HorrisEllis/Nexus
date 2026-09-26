envelope: 1
uuid: nexus-export-schema-tool
type: schema
id: tool
context: >-
  ollama/schemas — sovereign local copy. Origin: lib/node-schemas/schema.tool (shared canonical
  version, may have moved on independently since this copy was made — sovereignty means ollama does
  not depend on it at runtime, not that the two can never drift).
intent: null
summary: null
system: ollama
tags: []
exported_at: 1789235656523
source: nexus.lib.node-export
payload:
  status: REAL
  source: >-
    lib/agent-tools/tools/**/*.js — the real, universal code-backed tool export shape (re-checked
    this pass against lib/agent-tools/tools/execution/run-closed-loop.js: exact {name, description,
    parameters, execute} match — this is also the real answer to "is agent.tool a separate type": it
    isn't, it's this same shape, agent-tools/ IS the .tool source directory). Broadened this pass to
    also cover lib/tool-forge.js's real declarative shape: {name, description, parameters, steps:
    [{call, args, as?}]} — same three header fields, but `steps` (real, serializable data) in place
    of `execute` (a live function, never serializable, in-process only). A forged tool can actually
    be written to a real .tool file and re-imported; a hand-written code tool's `execute` cannot —
    that's the real, checkable reason both belong in one schema as alternatives, not two competing
    types.
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
      description: >-
        real async function — code-backed tools only. Not serializable, present only in-process,
        absent from any exported .tool file
    steps:
      type: array
      required: false
      description: >-
        real [{call, args, as?}] composition — forged tools only (lib/tool-forge.js), the one real
        path by which a .tool is genuinely exportable/importable end to end
