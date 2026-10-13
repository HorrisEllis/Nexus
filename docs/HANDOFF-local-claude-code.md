# Handoff: build one Nexus phase to `proven` on James's PC

James (2026-10-13): "youre on claude on my pc. i just installed claude code inside of nexus"

He was talking to the cloud session, which runs a Linux copy of the repo. The Claude Code installed inside his Nexus runs
on his Windows PC, and only it can run Nexus for real. This file is that copy's job.

Read `docs/CLAUDE.md` first and follow it.

James does not use the command line. Nexus starts with one command, `npm run start:all`. Anything he has to do must be a
click in Idearium, and you tell him exactly what to click.

## Why

No phase build has ever reached `proven` on his machine:
- **BL30** ended `incomplete`: the planner was dropped under memory pressure, and one agent explored the whole phase
  alone.
- **SB9** ran out of agents: Claude's page needed a ◎ pick, and DeepSeek was behind a sign-in wall with no tab.

Versions 0.60.24 to 0.60.29 were written to fix that. They have only run in tests, in the cloud copy. They are on
GitHub at `HorrisEllis/Nexus`, branch `claude/quirky-thompson-kz9xvs`:

| Version | What it changed |
|---|---|
| 0.60.25 | account fallback chain, and a missing provider tab is opened |
| 0.60.26 | services held by lean mode stay quiet; the officiator backs off |
| 0.60.27 | agent calls and tokens counted per phase |
| 0.60.28 | ready before run (`GET /api/providers/ready`), and a plan written without a model |
| 0.60.29 | phases mapped to files and dependencies (Phases tab → ⇄) |

## Steps

1. **Version.** Read `lib/version.js`. If this copy is older than 0.60.29, update it to that branch's head.
   - This folder came from a zip, so it may not be a git checkout.
   - Keep every `data/` folder; that is his state.
   - Say what you replaced.
2. **Start.** Run `npm run start:all`. Confirm Idearium, Guardian, Clear Glass and Ollama all answer.
3. **Lean mode on.** In Idearium → Settings → Routing → Lean mode, or `nexus.command` with `system lean on`.
4. **Agents.** Call `GET /api/providers/ready` on Idearium; its port is in its boot line. For each agent that is not
   ready, tell James the one thing to do, for example "open Claude in Clear Glass and pick its reply with ◎", or "sign in
   to DeepSeek".
5. **Pick a phase.** One small open phase that lists its `files:`, two to four files, in a repo that exists on disk.
   Avoid phases whose only files are hubs such as `idearium/api/index.js`.
6. **Build it.** Use `POST /api/repos/:uuid/phases/build` with `{ map, phase }`, or `repo phase <repo> <phase> build`.
   Read its rows on the Plan, or with `GET /api/repos/:uuid/phases/runs?phase=`. Expect:
   1. a `ready:` line;
   2. `planning` and `planned` (or "planned without a model");
   3. `contract`, then the bricks;
   4. `contract-complete`, then `proven`.
7. **If it stops short of `proven`.** Find the root cause from the rows and the console log. Make the smallest fix that
   carries it, run the matching test in `tests/modules/`, and build again. One thing at a time.

## When done

Tell James, in plain words:
- the phase you built;
- every state it went through;
- whether it reached `proven`;
- what you fixed, with the evidence.

If you changed code:
- bump `lib/version.js` and `package.json`;
- add a `CHANGELOG-<version>.md` that opens with his words above;
- commit to `claude/quirky-thompson-kz9xvs` only if this copy is a git checkout of it. Otherwise, list the changed
  files for him.
