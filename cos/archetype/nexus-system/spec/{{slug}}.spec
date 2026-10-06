# {{name}} — the living spec. Built from the nexus-system skeleton (COS archetype nexus-system), whose architecture
# is genesis (idearium/spec-engine/templates/genesis.spec). The registry and the nodes are the system; this spec says
# what it is for and grows with it.
spec:
  identity:
    system: {{slug}}
    name: {{name}}
    owns: [data/nodes, data/node-index, data/ledger, schemas, interaction-contract.json, {{slug}}.config.json]
    heartbeat: "{{slug}}.heartbeat — uptime, node counts, problems (lib/heartbeat.js)"
  context:
    purpose: >-
      {{description}}
    axioms:
      - every component connects only to the registry
      - each component has at least one capability; each capability at least one command; each command its events — each a node
      - every node type has its own folder, its own schema and its own JAA index
      - the system owns its data, schemas, contract, config, heartbeat and pulse
      - hardcoded has to earn its place
  file_structure: >-
    server.js · cli.js · config.js · {{slug}}.config.json · compartment.json · registry-components.js ·
    interaction-contract.json · event-taxonomy.js · jaa-store.js · contracts/ · schemas/ · data/ · lib/ · spec/ · tests/
  modules:
    - id: {{slug}}.core
      file: lib/core.js
      capabilities:
        - id: {{slug}}.core.observe
          commands: [{{slug}}.status, {{slug}}.nodes]
  components: []   # the idea's components, as they are added to registry-components.js
  generated: [interaction-contract (GET /contract), event-taxonomy, node-index, bundles]
