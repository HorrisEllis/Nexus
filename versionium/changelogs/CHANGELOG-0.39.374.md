# 0.39.374 — 2026-10-07

James: "That was fantastic. Everything needs to be available as commands."

## CM1 — every capability a command
`idearium/cli/route-commands.js` holds **one table and one runner**. Each command is a row that says three things:
- its usage;
- the request it makes, to the running Idearium or to another Nexus system;
- how it prints the answer.

The runner does the same steps for every row:
- finds the repo by uuid, prefix, suffix or **name**;
- makes the call;
- prints the answer;
- if the request is refused, exits 1 with the reason.

**`--json`** on any of them prints the answer as it came, for scripts and agents. A new capability is a new row, never a new code path.

| Command | What it does |
|---|---|
| `repo ask <repo> "…"` | Talk to the agent wearing the hat; its code lands as proposals |
| `repo agent <repo> [--provider claude-code…] [--inject review]` | Who wears it, and how its code lands |
| `repo changes <repo> [--prove]` | Its proposals; `--prove` checks them on a scratch copy against the charter |
| `repo apply / reject / revert <repo> <id>` | Act on one proposal |
| `repo charter <repo> [show / set <file> / check]` | Axioms, conditions and end state, with what it inherits |
| `repo tasks <repo> [--running / --failed]` | Background tasks |
| `repo activity <repo> [--kind --actor --status --q --limit --before]` | The repo's activity log |
| `activity` | Every compartment's log (what BrainOS shows) |
| `repo desktop <repo> [status / start / stop / pause / resume / checkpoint / checkpoints / rewind <tag>]` | The desktop VM |
| `repo system <repo> [status / restart / stop / start]` | A Nexus system's processes, through autopilot |
| `perf` | Memory, heap and CPU, as the resource monitor sees them |
| `models` | The Ollama models, and which fit in memory now |

`idearium help` lists them, and `nexus /idearium …` reaches them.

**Clean output:** `idearium/cli/store-chatter.js` is imported first. Every module's tagged line (`[jaa]`, `[IdeaOS]` …) goes to stderr, as `cli/sentinel.js` already did. So stdout is the answer and nothing else, and `--json` always parses. The test caught this: before the fix, `--json` output began with the store's loading lines.

## Proof
- New: `test-cli-route-commands` 8/8. The real CLI runs as its own process against the real API, with a Claude Code stand-in answering `repo ask`. It covers:
  - `help` lists every row;
  - `agent` sets claude-code by repo name;
  - `ask` produces a proposal, and `changes` lists it;
  - `apply` applies it, and the log names the actor *cli*;
  - `tasks`, `activity` and the all-compartment `activity`;
  - `charter` show, `set <file>` and `check` (1/1 met);
  - refusals exit 1 with the reason: not a Nexus system, a missing tag, a missing message, an unknown repo;
  - an unreachable system is reported as such.
- Unchanged, the other suites that run the CLI:

| Suite | Result |
|---|---|
| architect | 8/8 |
| build-verify | 11/11 |
| plan-lands | 17/17 |
| proof-run | 7/7 |
| spatial-void | 7/7 |
| spec-library | 10/10 |
| spec-workshop | 8/8 |

## Not as commands yet
- **`cos vm pause|checkpoint` in the COS CLI.** A desktop's VM session lives inside the running Idearium, so the Idearium command is the one that can reach it.
