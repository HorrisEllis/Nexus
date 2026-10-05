# 0.39.312 — 2026-10-05

James: "why not identity context file_structure modules -> components summary, with routes and commands, anything else relevant. then everything relevant to the modules, is listed each module and component. not in seperate sections"

## The system template, in his structure
`idearium/spec-engine/templates/architecture-spec.template.yaml` is rewritten in his structure: **identity → context → file structure → modules → components.**

- **identity:** name, his words (`james`), version, date, what it extends, entry, ports, boot phase, its data folder, what it owns (data, schemas, contract, config), its heartbeat (interval, route, a snapshot that includes each node type's count), and what it was written from.
- **context:** the parts that belong to the whole system:
  - purpose and data structure;
  - principles and axioms;
  - the spine and sovereignty;
  - config layers and pulse;
  - hook kinds and system-wide diagnostics;
  - glossary, build phases and component states.
- **modules:** each module lists its own summary, status, config and seams, and its data: per node type, its folder, schema, JAA index table, ledger table and integrity.
- **components:** each component lists its own:
  - capabilities (at least one) and commands (at least one, each invoking a capability);
  - routes (each belonging to a command);
  - events it emits and hears;
  - the nodes it reads and writes;
  - schema, config, gates, diagnostics and tests.
- **generated** (the coder's addition, his to keep or cut): the contract, event taxonomy, node index, registry and atlas are named once, as lists derived from the components and never written by hand.

The old template is archived whole at `_archive/architecture-spec.template.pre-0.39.312.yaml`, and a check confirms every field it had has a place in the new one.

## Still to do in SB17
Make `docs/architecture-spec/architecture-spec.spec` and genesis agree with this template.

## Proof
- `tests/modules/test-system-template.test.js` passes **5/5**: his order; each component carries its own fields; each module carries its own data; identity covers ownership and heartbeat; nothing is lost from the old template.
- `test-nexus-atlas-refs` passes **51/51**.
