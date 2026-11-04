# 0.60.357 — open a pull request, for any agent (UP12)

James, 2026-11-01, after the coder could not open a PR (no `gh` on his machine, and the built-in browser not signed in to GitHub):
> "Open the PR" · "okay but for all agents, as a agent tool"

Map: `docs/2026-10-25-nexus-update-phasemap.spec` UP12.

## Built

- `lib/git-pr.js` `open()`, and the row `pr open [dir] [--base main] [--title …] [--body …]` in the one command table, run locally, so
  every agent and he have it through `nexus.command`.
- It pushes the branch with git, using his own credential helper (Nexus never reads or holds a token). It opens the PR with `gh` when
  `gh` is installed and signed in; otherwise it answers with GitHub's compare link, title and body prefilled, and says so.
- Refused on the base branch itself and on a tree with uncommitted changes; nothing is stashed.

## Proof

`tests/modules/test-git-pr.test.js` **4/4** (gh present; gh absent → the prefilled link; refusals; the row in the table). Run for real on
`claude/cos-compartments-resources`: pushed, and answered the compare link, since `gh` is not installed here.

## Versionium

His Versionium runs on this machine, but this release is on a branch, not his running tree. The boot sync records it when it lands.
