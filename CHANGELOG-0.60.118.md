# 0.60.118 — 2026-10-17

James: "Okay. Keep going."

He also asked about Clear Glass: "I was thinking of using a repo to keep track of it all. What do you think?" That is noted
in `docs/2026-10-16-repo-carve-phasemap.spec` as an open question, with the coder's reading. It is not decided.

## FR4a: the flight recorder on its own

`products/flight-recorder/bin/flight-recorder.js` works over any project folder. Everything it keeps goes in
`<project>/.flight-recorder/`: the changes, the versions (through Versionium in-process, with no server), the activity and
the runs. It needs no Idearium, no Versionium server and no Nexus checkout, and it runs from a copy branched out of Nexus.

| command | what it does |
|---|---|
| `init` | starts recording the folder |
| `propose <path> [--from <file>] [--agent <name>] [--why <goal>]` | a change, written nowhere yet. `--why` records the run and the task, the way an agent dispatch does, so the record can say who asked and why |
| `test <id>` | its linked tests, before and after, in the project (FR2) |
| `apply <id>` | writes it, or refuses if it broke a test; it becomes a version |
| `show <id>` | the record (FR1) |
| `undo <id>` | what was there before comes back and later edits are kept (FR3); it becomes a version |
| `list`, `versions` | every change; every version |

`--json` writes only the answer to stdout. The libraries' own log lines go to stderr.

## Found while building

- **The command was losing its data.** A short-lived command ends with `process.exit()`, and `guardian/jaa-store.js`
  only flushed on a signal, so the versions and the activity were buffered and never reached disk.
  `flushAllStores()` is now exported, and the command calls it before it exits.
- **Tests compared against nothing.** The file as it was before a change was read through a layer that only the
  proposing process remembered. In any other process (this command, or Idearium after a restart), "before" read as no
  file, and every test came out "fixed". `attachEvidence()` and `evidenceNow()` now take a layer.
- **The first branched copy could not run the command.** The product's own code loaded Nexus files through computed
  paths, which the branch tool cannot follow, so the copy lacked `lib/repo-activity.js` (caught by FS-02). The product
  now uses plain relative requires, and its `must` list grew.
- **Adjacent edits clash.** A later edit on the line right after the undone one is a clash, as in git's merge. It is
  reported with the lines, not merged.

## Proof

`tests/modules/test-flight-recorder-standalone.test.js`: 6/6, run from a copy carved into an empty folder, on a fixture
project.
- FS-01: init.
- FS-02: propose writes nothing; test runs the linked test; apply makes a version.
- FS-03: the record is complete, with nothing missing.
- FS-04: a later change, then the first one undone with the later edit kept; three versions.
- FS-05: a change that breaks its test reports REGRESSED, and apply refuses with nothing written.
- FS-06: every state file is under `.flight-recorder/`.

Neighbouring suites stay green: repo-inject 83, change-record 7, tested-before-lands 5, undo 6, repo-carve 14,
reject-learn-retry 7, run-state 33, and the jaa store suites (53, 5, 7, 8, 1).

## Not yet

FR4b, a small server and page over the same commands.
