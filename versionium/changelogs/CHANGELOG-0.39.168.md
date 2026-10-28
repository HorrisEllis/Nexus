# NEXUS 0.39.168 — the repo hat (project agent per compartment)

## New: `lib/repo-hat.js`

One agent per project, constrained to its compartment. **Not a new
subsystem** — `lib/hat-forge.js` already was this mechanism. This is the
repo-shaped caller of it, adding the three things forge() cannot know:

1. **Identity** — one hat per repo, found again rather than forged twice.
   Uses hat-forge's own `seedKey`, which already refuses two live hats
   claiming the same role, so uniqueness stays in one place.
2. **Constraint** — an 18-tool scope curated for "understand, fix, expand
   ONE project", every name proven against the live 101-tool registry at
   forge time. Host-wide surface (`account_manage`, `browser_action`,
   `clear_glass_*`, `switch_agent`, `agent_council`) is deliberately out.
   A hat carrying all 101 tools is not constrained to anything.
3. **Grounding** — the persona is built from the repo's REAL index:
   atlas file count, languages, kinds, chunk count, compartment id. Not a
   template with a name substituted in.

A repo with **no compartmentId is refused**: "constrains the agent to the
compartment" is the whole point, and a hat scoped to nothing would be a
host-wide agent wearing a project's name.

### The unindexed case
If the repo has no atlas, the persona says so, in those words, and tells
the agent not to describe contents it has not read. It does **not** report
"0 files" — an agent told it is working on an empty project has been lied
to just as surely.

### Auto-refresh on chunk completion
`repo.chunk.run` now re-grounds the persona after a successful pipeline.
A hat forged before indexing says "this project has NOT been indexed yet";
once chunking lands that is false, and a stale persona is a falsehood
repeated to the agent on every dispatch. Best-effort: no hat is a no-op,
and a refresh failure never fails a chunk run that succeeded.

## Added to `lib/hat-forge.js`: `update()`

Needed because the only way to change a persona was revoke-and-re-forge,
which discards the hat's uuid and every scheduled responsibility keyed off
it — far too destructive for a text change.

Narrow by design. `uuid`, `id`, `legacyId`, `seedKey`, `ts` and `_forged`
are refused outright; `name` is refused too (`rename()` owns that, because
it has collision rules this does not). Everything else runs through the
**same** `validate()` a forge does, so a patch cannot put a hat into a
state `forge()` would have rejected.

## Three bugs found by testing

1. **`seedKey` format.** I used `repo:<full-uuid>`. hat-forge's validate()
   requires snake_case, 3-49 chars, starting with a letter — colons are
   illegal and a prefixed uuid overruns 49 anyway. Failed on the very
   first forge. Now `project_agent_<16-char-slug>`.
2. **`update()` vs stored records.** `validate()` is written against a
   *definition*, where an absent optional is `undefined`. A *stored*
   record is not that shape: `forge()` writes explicit nulls **after**
   validation has run, so validate() never sees them. Feeding a stored
   record back in made every patch fail with "allowedAgents: if given,
   must be a non-empty array" — for a hat that had never been given one.
   Now normalised back to definition shape before validating.
3. Bug 2 masked a real assertion: "fake tool refused" was passing for the
   wrong reason (it died on `allowedAgents`, not the tool). After the fix
   it fails correctly with `toolScope[0]: no registered tool
   "no_such_tool_xyz"`.

## Surface

| | |
|---|---|
| `GET /api/repos/:uuid/hat` | show the project agent (`exists:false` is a state, not an error) |
| `POST /api/repos/:uuid/hat` | forge it — idempotent |
| `POST /api/repos/:uuid/hat/refresh` | re-ground the persona against the current index |
| `DELETE /api/repos/:uuid/hat` | revoke |

All four registered in `registry-components.js` as real commands, so the
CLI and any agent reach them like any other capability.

## Stated limit

Forging a hat does **not** sandbox anything at the OS level. `toolScope`
is a genuine restriction on which tools the agent is offered — a real
capability boundary — but it is not a filesystem jail. `run_command`,
scoped in, can still reach outside the repo directory. Said here rather
than left for someone to discover.

## Tests — `lib/repo-hat.smoke.cjs`, all passing
Compartment-less repo refused · all 18 scoped tools proven present in the
live registry · host-wide tools proven absent · forge against an unindexed
dir produces an honest persona with no fabricated counts · idempotency
(same uuid, `created:false`) · refresh against the real indexed repo
yields `files: 9`, `chunks: 83`, `languages: javascript (9)` with uuid,
seedKey and toolScope preserved · `update()` refusing uuid/seedKey/name/
unknown-field/nonexistent-tool patches · revoke.

Idearium UI suite and CI suite re-run: 0 failures.

## Next
Key management in compartment options, per your ordering. Then: agents tab
+ per-repo CLI (both now have an agent to talk to), Map tab, chunk tags,
chunk editing, AI IDE, Versionium tab, spacial void, CI triggers.
