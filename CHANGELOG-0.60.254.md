# 0.60.254 — Nexus keeps itself current from GitHub, by itself

James, 2026-10-26: "should be automatic". He sent it with a screenshot of `http://127.0.0.1:4800/update.html` answering
`GET /update.html not found` on his 0.60.251. That page is in 0.60.252, which is still on the branch.

The coder's reading, to confirm: there should be no clone, no adopt step, and no manual check. The install keeps itself up to date by
default. Map: `docs/2026-10-25-nexus-update-phasemap.spec` (UP_D4, UP6–UP8).

## What changed
- **UP6, attach in place.** His install is an unzipped release folder. The first check (automatic, the page, or `check`) makes it a git
  working tree of the release it came from:
  1. `git init`, with origin set to GitHub.
  2. Fetch the tag `v<VERSION>` and main, with blobs on demand when the server allows it.
  3. `git reset --mixed` to the tag. No file is touched.

  His runtime data then reads as his local changes, which the update already archives before replacing anything. Deleting `.git` undoes
  the attach.
  - If git is missing, it says to install Git for Windows.
  - If his version has no tag, it says so and leaves the folder as it was.
- **UP7, autopilot keeps it current.** It checks 2 minutes after boot, then every 6 hours. With policy `auto`, the default from his words:
  - It applies only when autopilot's `/idle` says nothing is running.
  - It runs `npm install` off the supervisor's thread when the lockfile changed.
  - It then restarts the systems whose files changed, all of them when `lib/` or the lockfile changed, one by one through `controlKernel`.
  - **Never Clear Glass.** Idle cannot see him browsing, so its changes are announced and wait for him. A changed supervisor is said too:
    it loads at the next `npm run start:all`.
  - `notify` only says; `off` does nothing.
  - Every check is recorded in `data/update/auto.json`.
  - It never runs inside a test run: a sandbox marker, or `NEXUS_AUTO_UPDATE=0`, switches it off.
- **UP8, the policy on the page.** Routes `GET|POST /api/update/policy` and `GET /api/update/auto`. The row is
  `update policy [auto|notify|off] [--every <hours>]`. The Updates page shows the policy and what the last automatic check did.
- **Fixed on the way:** the list of changed systems counted a root file with no extension (`VERSION`) as a system.

## Proof
`tests/modules/test-nexus-update.test.js` 11/11, on real git repos. Two checks are new:
- **UP-10:** an archive of the release, unpacked like his folder, with runtime data added. It attaches with no file touched and his data
  kept. It then updates, with his data set aside first. A folder that is no release, and a version with no tag, are each refused and left
  as they were.
- **UP-11:** `auto` applies when idle and restarts cortex and idearium but never Clear Glass, with npm install run. It waits when not idle
  and touches nothing. `notify` says it and applies nothing; `off` does nothing. The default is `auto`.

## For his machine
One more manual step is left: getting 0.60.254 onto his machine at all. Either merge the branch and download main once more, or clone the
branch. After that, a Nexus started with `npm run start:all` updates itself.

## Open
1. UP5, the COS driver (the end state).
2. Clear Glass's own restart after an update stays his. A "restart now?" prompt in Clear Glass itself is not built.
