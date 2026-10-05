# 0.39.315 — 2026-10-05

James: "Maybe add, if applicant, data dir with the directory for the data, consumers, intent, data type/system like node, vector, database or table, etc. anything else."
James: "Okay, maybe create a template or schema from that."

## The registry, in the template
The system template now has a `registry` section: the shape of `registry-components.js`. Each component has:
- type, id, uuid, file and intent;
- version and status;
- capabilities (at least one) and hooks;
- if applicable, its consumers and its data (folder, store type — node, vector, database, table or file — and the node types it keeps).

## The template's own node schemas
The template now has its own node schemas, written in Nexus's node-envelope format, in `idearium/spec-engine/templates/system/schemas/`:
- schema.component, schema.capability, schema.command, schema.event;
- schema.route, schema.hook, schema.wire, schema.bundle.

A new system copies them and owns them from then on. The shared `lib/node-schemas.js` is unchanged, because other code validates against it.

## Proof
`test-system-template` passes **5/5**. ST-05 checks that:
- every node type the registry points at has a schema;
- every key the registry writes is in the component schema, and every required field is in the registry;
- data and consumers are optional;
- "at least one" is stated for capabilities and commands.
