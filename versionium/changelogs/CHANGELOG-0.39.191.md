# NEXUS 0.39.191 — the compartment agent is an `.agent` node

Follows 0.39.190 (RAID's health snapshot is `.health`, `.agent` re-grounded).

- `lib/repo-agent-node.js` `materialise()` now writes `<repoUuid>.agent` (was
  `.repo_agent`). The bundle is a `schema.agent`: `name`, `intent`, `commands`,
  `personality`, `hat`, `scope`, `learned`, plus the learned model (`observations`,
  `exchanges`, `indexAtExport`). Schema tag `nexus.agent/1`.
  - `name`/`hat`: the hat's name. `personality`: its persona. `scope`: the compartmentId.
  - `commands`: the hat's `toolScope`. `intent`: its `responsibilities`, else "Project agent
    for <repo>, confined to compartment <id>". **Interim:** binding to the repo's own
    `.intent` node and `.command` nodes is not built (where they come from is undecided);
    `intent_ref` carries the idea/spec uuid so the link can be made later.
  - The hat definition moved from `hat` to `hat_definition` (schema.agent's `hat` is a name).
- `importAgent` accepts `.agent` and the legacy `.repo_agent` (0.39.189). `repo_agent` stays
  in `KNOWN_TYPES` as LEGACY, read-only. Mutation-checked: dropping the legacy branch fails
  a test.
- `schema.agent` OPEN -> REAL (shared + guardian copies): it now has a writer proven by a real
  export from one repo and import into a different one.
- UI/API/registry strings say `.agent`.
- **Registered** `test-repo-agent.js` (34/34) and `test-repo-agent-node.js` (41/41) in
  `tests/modules/run-all.js`. 0.39.188 said they were; they were not.

## Not done
Binding to a repo's `.intent`/`.command` nodes; `.agent` vs `agent_model` (referenced or
absorbed) undecided; the `.agent` bundle is written by one repo path only (no guardian-hosted
`.agent` nodes exist yet). Pre-existing failures untouched: `node-schemas-split` type count,
`test-node-schemas` NS-003/NS-012.
