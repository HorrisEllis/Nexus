# NEXUS 0.39.167 — CI/CD per compartment, as commands

## New: `cos/ci/index.js`

CI/CD scoped to a compartment. Every stage runs in a real isolated child
process with a real exit code, real captured stdout/stderr, a real timeout
and a real output cap. No stage is ever reported as passing without a
process having actually exited 0.

**No second sandbox.** Execution goes through `cos/playground/sandbox.js`'s
`SandboxRunner` — the isolation model already in the tree. On the
`'working-tree'` branch that function reads exactly `compartment.id`,
`fs.root`, `runtimeId`, `entryFile`, `entryArgs` and never touches
`compartmentPaths()`, so driving it with a repo descriptor is using its
documented API, not impersonating a live compartment. A real compartment
from `CompartmentManager.get()` passes straight through unchanged.

### Pipeline definition — `.nexus-ci.json` in the compartment root
```json
{ "version": 1,
  "stages": [
    { "name": "install", "kind": "command", "run": "npm ci" },
    { "name": "test", "kind": "command", "run": "npm test", "timeoutMs": 300000 },
    { "name": "deploy", "kind": "ssh", "host": "deploy@box",
      "keyRef": "/home/j/.ssh/id_ed25519", "run": "cd /srv/app && git pull" }
  ],
  "triggers": { "onChunkDone": false, "onCommit": false } }
```

`validate()` **refuses** a stage it cannot execute (unknown `kind`,
duplicate name, missing `run`) rather than skipping it — a stage that
does not run must never be counted as passing.

### Status vocabulary — deliberately four, not two
- `passed` — every stage exited 0.
- `failed` — a stage exited non-zero and halted the pipeline.
- `timeout` — a stage was killed by the watchdog. Its own status, because
  it is a different failure with a different fix.
- `unstable` — a `continueOnError` stage failed but the pipeline finished.
  **Never reported as `passed`**; that would hide a real failure behind a flag.

### SSH — the honest boundary
There is no key-management subsystem in this codebase and this module does
not invent one. Key **material** is never accepted, stored or logged. An
ssh stage names a key by **path** (`keyRef`), and preflight — before
anything is spawned — refuses: a relative path, a missing file, a
non-file, anything pasted that looks like key material, and a key that is
group/world readable (mode `0o077`), which ssh rejects anyway. Argv sets
`BatchMode=yes` and `IdentitiesOnly=yes` so a locked key fails fast
instead of hanging on a passphrase prompt nothing can answer.
`StrictHostKeyChecking` is left at the system default on purpose —
silently disabling it would make every deploy unauthenticated.

## Surface

Routes (idearium, scoped by repo because that is what carries the
`compartmentId`), all registered in `registry-components.js` as real
commands so the CLI and any agent reach them like any other capability:

| | |
|---|---|
| `GET /api/repos/:uuid/ci` | read pipeline definition |
| `PUT /api/repos/:uuid/ci` | write pipeline definition |
| `POST /api/repos/:uuid/ci/run` | run it (optional `{only:[...]}`) |
| `GET /api/repos/:uuid/ci/runs` | history, summaries only |
| `GET /api/repos/:uuid/ci/runs/:runId` | one run, full stage logs |

Also registered as commands this pass: `repo.scan`, `repo.chunk.run`.

A repo with **no compartment is refused** by `ci/run` rather than quietly
run against a bare path — "per compartment" means the compartment is the
unit, and pretending otherwise would make the scoping a lie.

Stage events are re-emitted as `idearium.ci.stage.*` / `idearium.ci.run.*`,
so CI progress reaches the UI and event log like everything else.

Run history is bounded at 50 per compartment under `.nexus-ci-runs/`.

## Bug found by testing

The runner originally read `result.killed` / `result.truncated` — fields
`SandboxRunner` does not return. It reports `killedByTimeout` and
`killedByOutputLimit`. A stage killed by the watchdog therefore recorded
`killed:false` and was indistinguishable from an ordinary non-zero exit.
Fixed, and `timeout` promoted to its own status.

## Tests — `cos/ci/ci.smoke.cjs`, all passing

Validation refusals (unknown kind, ssh without keyRef, pasted key
material, duplicate names) · a real passing pipeline with cwd proven to be
the repo root · a real non-zero exit halting the pipeline with the exit
code captured and the next stage proven not to have run ·
`continueOnError` producing `unstable` · ssh preflight refusing a mode-644
key with the real reason, accepting it after `chmod 600` · run history
round-trip · the timeout watchdog actually killing `sleep 10` at 800ms.

Idearium UI suite re-run: 0 failures.

## Still not built
Agents tab + per-repo CLI · Map tab · tags per chunk · chunk editing on
the build surface · AI-assisted IDE · Versionium tab · Brainstorm
"spacial void" · CI triggers (`onChunkDone`/`onCommit` are accepted in
config and stored, but nothing fires them yet — runs are on-demand only).
