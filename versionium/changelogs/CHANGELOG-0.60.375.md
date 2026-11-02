> Renumbered from 0.60.339 on merge (2026-11-02): built on `claude/cf1-one-word-cli-rows` as 0.60.339, in parallel with main, which used 0.60.339 first. Numbered 0.60.375 so both stand (§0.3).

# 0.60.375 — a one-word command takes free text (CF1)

James, 2026-11-01:
> "can you execute anything? like give me a sign"

and, asked whether to fix what that turned up as a phase:
> "Yes, phase it"

## Found

To give the sign, the coder ran `idearium note "Sign from Claude Code…"` on his running machine. It died with
`unknown command: note.Sign…`. `idearium/cli/index.js` keyed every line with two words as `cmd.sub` and never fell back to `cmd`.
So every row keyed by one word whose first argument is text (`note <text>`, `field …`, `access …`) could not be reached from a
terminal. The route (`POST /api/notes`) was fine, and agents were not hit, because `nexus.command` resolves the row itself. The sign was
posted to the route directly (`note-1ccdc1231d`).

## Built

- `cmd.sub` is used when that row exists. Otherwise, when `cmd` alone is a row, the line goes to it with `sub` as its first argument.
- Nothing that resolved before resolves differently. A note whose text starts with a sub-row's word (`done …`) still reaches that row.
- Mapped first: `docs/2026-10-05-cli-data-code-phasemap.spec` CF1.

## Proof

`tests/modules/test-cli-route-commands.test.js` **CL-09** green:
- `note hello world --tags a` reaches the row and posts "hello world";
- `note done <id>` still ticks it;
- `repo no-such-sub` still refuses.

The suite is 4 passed, 5 failed on his Windows machine. CL-03 to CL-07 failed the same way before the change: the Claude Code
stand-in will not spawn (`spawn EFTYPE`). That is a separate defect, not this phase's.

Live on :4800: `idearium note "CF1 live check from the terminal"` posted `note-8cacc97386`, and `note done` ticked it.

## Versionium

Recorded live on his machine through `lib/versionium-record.js` `record()`: commit `vtm-9b38cd10`. All six paths are recorded before and
after in full, except `lib/version.js`, which is about 1 MB, over the 256 KB cap, so it is recorded by hash.
