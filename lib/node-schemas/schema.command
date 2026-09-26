envelope: 1
uuid: nexus-export-schema-command
type: schema
id: command
context: lib/node-schemas — shared node-type schema registry
intent: null
summary: null
system: null
tags: []
exported_at: 1789116323980
source: nexus.lib.node-export
payload:
  status: REAL
  source: clear-glass/src/ipc/bridge.js — _buildCommandIndex()'s real, live-introspected route entries
  fields:
    method:
      type: string
      required: true
      description: real HTTP method, e.g. 'GET'
    path:
      type: string
      required: true
      description: real route path, introspected from Express's own route table, never hand-maintained
