# NEXUS 0.39.190 — RAID's `.agent` is now `.health`

James: change RAID's `.agent` to `.health`. `.agent` is for agent models and
personalities with an intent and commands.

- **`schema.health`** — RAID's per-agent health snapshot (`dispatchName`, `online`,
  `consecutiveFails`, `callCount`, `successRate`, `role`), unchanged content, three
  copies (`lib/node-schemas`, `guardian/schemas`, `ollama/schemas`). Registered in
  `KNOWN_TYPES`.
- **`schema.agent`** — re-grounded as an agent MODEL and PERSONALITY with an intent and
  commands: `name`, `intent`, `commands`, `personality`, optional `hat`, `scope`,
  `learned`. Status **OPEN**: no production writer yet. `lib/repo-agent-node.js` still
  writes `.repo_agent`; moving it to `.agent` is the next step. Kept in `lib/node-schemas`
  and `guardian/schemas` (guardian hosts the type). Ollama's copy is removed (ollama
  does not host agents).
- Nothing was migrated: no `.agent` or `.health` node file has ever existed, and no
  runtime code read either schema (only comments, updated).
- `NODE-TAXONOMY.md`: row 5 `agent` re-grounded, new `health` row.
- Tests: `node-schemas-split` and `test-node-schemas` pinned lists now expect `health`
  (the 6-field pin moves from `agent` to `health`).

## Verification
Run: `test-repo-agent` 34/34, `test-repo-agent-node` 37/37 (unchanged).
Two suites **fail identically before this change** and were left alone:
`node-schemas-split` (expected 30 types, got 57 at HEAD; 31 vs 58 now) and
`test-node-schemas` NS-003/NS-012.

## Not done
`.repo_agent` -> `.agent` (writer, schema fields, test); binding to a repo's `.intent`
and its commands (where a repo's `.intent` node comes from is unverified); whether
`.agent` references or absorbs `agent_model`; registering `test-repo-agent*.js` in
`tests/modules/run-all.js` (the previous session said it was; it is not).
