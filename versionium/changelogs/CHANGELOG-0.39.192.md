# NEXUS 0.39.192 — the compartment agent reads its chunk nodes; its commands say where they come from

James: commands come from cos, agent tools, idearium tools and guardian tools; the agent
needs to be able to query the chunk nodes for context when needed.

## Chunk query — `idearium.repo_chunks.tool`
`lib/agent-tools/tools/idearium/repo-chunks.js`, registered in `lib/agent-tools/index.js`.
Wraps three real idearium routes, unchanged: `search` (`GET /api/repos/:uuid/search?q=`),
`list` (`/chunks?file=`), `get` (`/chunks/:chunkId`). Search or list finds an address; `get`
reads ONE chunk. A chunk over 12000 chars is cut and reports `truncated`. Bad input (missing
or unsafe uuid, unknown action, missing query/chunkId) is refused before any request.
- Added to the hat's `REPO_TOOL_SCOPE`; the persona names the tool and the repo uuid when the
  repo is indexed, and says nothing when it is not (no pointing an agent at chunks that don't exist).
- **Limit, stated in the tool:** `repoUuid` is a parameter. Nothing here can tell which agent is
  calling, so keeping an agent to its own repo is behavioural, the same class as `toolScope` not
  being enforced on the dispatch path.

## Commands
The `.agent` bundle's `commands` are now source-labelled ids: `agent-tools:read_file`,
`cos:cos_compartment`, `idearium:idearium.repo_chunks.tool`, and `guardian:` for a guardian
tool. The label is derived from the tool registry's own files (folder, or the `cos_` prefix),
not typed. A test checks every command resolves to a tool in the LIVE registry and none is
`unknown`.

## Verification
`test-repo-chunks-tool` 10/10 (the real tool over real HTTP to a recording stub server, so
the tests check what went over the wire), `test-repo-agent-node` 44/44, `test-repo-agent`
34/34, repo-hat smoke; the new test is in `run-all.js`.

## Not done
- No guardian tool is in the hat's scope today (the label exists; nothing uses it). Which
  guardian tools a project agent should hold is undecided.
- Commands are ids of registry tools, not `.command` node uuids.
- Retrieval is agent-initiated only. Nothing pre-fetches chunks at dispatch time, which is the
  only way to make the scoping real by construction rather than by instruction.
- Binding to the repo's own `.intent` node is still undecided.
