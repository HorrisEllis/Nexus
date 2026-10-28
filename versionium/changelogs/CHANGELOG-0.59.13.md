# 0.59.13 — 2026-10-12

James: "youre open in clearglass. the point of nexus also is so im not held bacvk by token limits"

This release came from the first live run from inside Clear Glass. The agent in the chat drove his running Nexus with `nexus>` lines:

| Command | What it showed |
|---|---|
| `nerve` | Cortex is up. Every node's presence is `unknown`, with 0 events. |
| `perf` | The Orchestrator is up (111 s uptime). 6.3 GB of 15.9 GB free, CPU 25% of 16 cores. |
| `activity --status failed` | Idearium is up. The first Eravos kernel phase (`ER0_primitives`, kernel amendment 3.1) ran out of rungs about 2 days ago; the last rung was DeepSeek, with no tab open. |

The next line hit a bug:

    nexus> repo phase 7ffe2ae6 ER0_primitives
    ✗ which repo? give repo (its uuid or name)

## Fixed

- **A repo named as the first word now works.** In a typed line, the repo is the first word after the command, as in the CLI. `nexus.command` read only its `repo` field, so every `repo …` command typed in a chat, heard by a listener or sent from the pane failed. Now, when no repo is given and the caller has no repo of its own, the first word is taken as the repo.
- **That never unlocks a command reserved for the person.** Those commands are checked on the words as typed and again without the first word. `repo system 7ffe2ae6 stop` and `repo apply 7ffe2ae6 …` are still refused.

## Tests

- `test-nexus-command-tool` passes 8/8, including the new NC-08:
  - The repo is taken from the first word.
  - The person's rows are still refused when the repo comes first.
  - Its first run caught an earlier version of this fix letting `repo system restart` slip past the person check.
- These still pass:

| Suite | Result |
|---|---|
| `test-nexus-read` | 4/4 |
| `test-nexus-ask` | 6/6 |
| `test-nexus-chat` | 8/8 |
| `test-listener-commands` | 5/5 |
| `test-cli-route-commands` | 8/8 |
