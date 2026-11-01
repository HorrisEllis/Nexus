# 0.60.354 — procedures you and copilot run like a .bat (PD1)

James, 2026-11-01, after updating Nexus by hand:
> "can you make that a macro or framework and then into a command like a batch but a .framework or .macro that me and copilot can use. i feel we need more proceedures."

Asked to name the file (`.macro` is taken by Clear Glass's browser macros; the coder recommended `.procedure` or `.framework`):
> ".procedure"

## Found

`.procedure` was already his. In 0.60.118 (DK1) he asked for "replayable proceedures", and `lib/repo-procedures.js` keeps a repo's tool calls as
`.procedure` files, replayed through copilot's one tool door. Neither the procedures map nor the coder's first draft found it before building.
The draft, a second module (`lib/automation/procedure.js`), was never committed and was dropped as a duplicate (§8.6, §10.3).

Also, the map said a procedure's steps would be the automation engine's own `command` and `gate`. In the code, the engine's `command` is an HTTP
call to one system, and its `gate` waits on a page element. Neither is a row of the command table or his yes.

## Built

- **His `.procedure` gains two step kinds** beside `{ tool, args }`:
  - `{ confirm: "…" }`: his yes. Without it the run stops there and says it is waiting.
  - `{ check: { of: <step>, contains | equals | matches | notEmpty } }`: what an earlier step gave must hold, or the run stops and says why.
- **A library of Nexus procedures shipped with the code**, in `idearium/procedures/`. Idearium serves it at `/api/procedures`. A library step is
  `nexus.command` with a command row, so it goes through the one door.
- **Commands for him and copilot alike:** `procedure list`, `procedure show <id>`, `procedure run <id> [--yes]`.
  - Copilot gets the same stop: through `nexus.command` a run waits at the yes, and `--yes` is refused to an agent.
  - After his yes, the steps run as the person (`command.js` `runAsPerson`), so a row that is his, like `update apply`, can run.
- **The first procedure, `update-nexus`:** `update` → his yes → `update apply` → `system version` → a check that Nexus answers with its version.
- A repo's own procedures (the Code tab's dock) can carry the new steps too; `replay` takes `yes`.
- Each library run is recorded in Versionium (§17.12).

## Proof

- `tests/modules/test-procedures.test.js` **9/9**: PD-02 stops at the yes and runs nothing after it; PD-04 a refusal, a throw or a failing check
  stops the run, named; PD-08 `procedure run` from a terminal waits, then with `--yes` runs through; PD-09 copilot waits and its `--yes` is refused.
- `test-repo-procedures` **7/7** unchanged (his DK1 behaviour). `test-nexus-command-tool` 8/8, `run-command-tool` 4/4, `test-boundary-code-only` 5/5.
- `test-system-boundary` is 8/10 with this change and without it. SB-06 is two crossings from `cos/manager/autopilot-door.js`, and SB-08 a Windows ESM
  path error. Neither is from this release.

## Not yet

- No command row restarts a system, so `update-nexus` names "restart what changed" as text; the Updates page still does it (PD5).
- The version check is a pattern, not "equals the version the update brought".
- PD2 (updates done by hand, recorded) was ordered first in the map and is still open.

## Versionium

Recorded live on his machine through `lib/versionium-record.js` `record()`: commit `vtm-5670f9cd`, twelve paths. Three are over the 256 KB cap
(`idearium/api/index.js`, `idearium/cli/route-commands.js` and `lib/version.js`) and are recorded by hash; the rest are recorded in full.
