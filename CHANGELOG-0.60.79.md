# 0.60.79 — 2026-10-16

James: "tell me recent phases. can we do the code tab now?"

The Code tab map (`docs/2026-10-15-code-tab-run-state-phasemap.spec`) had CE1–CE5 and CE10 built (0.60.50). Its build
order puts CE8 next. CE8 serves his words from 2026-10-15: "so the cli can read the current worksurface in the code tab."

## What was wrong

The Code tab's surface (the open file, the picked lines, the picked chunk, the filters) lived only in the browser's `CS`
object (`idearium/ui/js/code-surface.js`).
- The CLI could not read it, so neither could an agent. The only work-surface route was the list of proposals.
- Reloading the page lost it.

## What changed (backend → route → command → UI)

- **`idearium/lib/surface-state.cjs`** (new) keeps one surface per repo under Idearium's data dir.
  - It holds the open file, the picked lines, the chunk, the filters, who set it (`ui`, `cli` or `agent`) and a `rev`.
  - Opening a new file clears the old file's lines and chunk.
  - A bad range or a path outside the repo is refused, never guessed.
- **`GET / PUT /api/repos/:uuid/surface`.**
  - GET also returns what the surface shows but does not store: the picked lines' text, the proposals waiting, and the
    repo's latest run (`lib/run-state.js`).
  - PUT checks the file exists in the repo, then emits `idearium.surface.changed`, which is declared in the taxonomy.
- **The commands**, three rows in `idearium/cli/route-commands.js`. Agents get the same rows through `nexus.command`.
  - `idearium code surface <repo>`
  - `idearium code open <repo> <path> [--lines a-b]`
  - `idearium code select <repo> <from> [to] | --chunk <id> | --clear`
- **The tab:**
  - it publishes its surface as it changes, at most every 400 ms, and only when it differs from what was last sent;
  - it follows a change made from the CLI or an agent, and ignores its own echo;
  - it opens where the surface was left.
- **Loom:** `loom/maps/run-state-map.js` wires the new module with its consumers (the API, the tab and the CLI rows) and
  the API's new use of `lib/run-state.js`.

## Proof

- `tests/modules/test-code-surface-state.test.js` 6/6. Three of its checks were driven in Clear Glass:
  - SS-10: picking lines publishes the surface;
  - SS-11: `code open` from the CLI moves the tab, with no echo;
  - SS-12: the tab reopens where it was left.
- No regressions: `test-code-tab` 16/16, `test-run-state` 33/33, `test-loom-map` 19/19, `test-cm3-commands` 4/4,
  `test-check-catalogue` 7/7.
- Two failures were already there before this change and fail the same way on main without it:
  - `test-event-contracts` EC-05: `idearium.phase.mapped`, `idearium.repo.released`, `versionium.released` and
    `versionium.tagged` are emitted but never declared;
  - `test-cli-route-commands` CL-07: it needs Guardian running.

## Not done

- No live run against his own Idearium yet.
- CE7 (AI editing by lines or chunk) is next in the build order. It will read this surface for its range.
