# 0.45.0 — CM3: this session's work as commands

James: "where is any of this? like i dont see any changes. like what have you been adding? also next make sure these are all commands first, api routes if applicaple. also where is the background tasks? it hasnt built any phase yet."

The idea and the direction are James's; the code is the coder's.

Each of these is one row in the command table, so it is available everywhere at once: the CLI (`idearium …`), copilot's `nexus.command`, and Claude Code's MCP.

| Command | What it shows or does | Route |
|---|---|---|
| `repo phasemap <repo> [--ready] [--map m]` | every phase: done, ready, blocked, and its last run | `GET /api/repos/:uuid/phases` |
| `repo phase <repo> <phase>` | that phase's runs, and why one stopped | `GET …/phases/runs?phase=` |
| `repo phase <repo> <phase> build [--provider p]` | builds the phase now as a background task; the map is found from the phase name | `POST …/phases/build` (`map` is now optional) |
| `repo versions <repo>` | every change as a versionium commit | `GET …/snapshots` |
| `store` | each table's size on disk, append segments, row cap and archive, read from the files alone | cortex `GET /api/store` (new) |
| `ollama tape [<run>]` | the recorded runs, or one run's macro (each call asked and answered) | ollama `GET /api/tape`, `GET /api/tape/:run` (new) |

`repo phases` and `repo build` remain the spec-chunk commands they already were.

Tests: test-cm3-commands 4/4; test-chunked-phase-build CB-09.
