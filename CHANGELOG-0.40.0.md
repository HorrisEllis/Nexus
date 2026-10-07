# 0.40.0 — VR1: every change a commit (the new numbering begins)

James: "and link the releases with versionium. needs to snapshot every accept, every change, diff, write, only the changes. like github., supposed to be an alternative to github to an extent. but i want to replace it for myself."

James: "remember to use as little tokens for as much leverage and power as possible. invent around contraints if it fits nexus better and i prefer novel if it's stable./"

James: "need a releast notes section for each projecy also which shows each version and whats been added with a clear versioning scheme, each minor improvement is 0.0.01. major changes 0.01 each iteration?"

The idea and the direction are James's; the code is the coder's.

## Numbering
From this release: the last number = a minor improvement, the middle number = a phase, the first number = James's milestone. 0.39.x is kept as it was. VR1 is the first phase under the new numbering, so it is 0.40.0.

## Built
- `lib/repo-versions.js` — every change to a repo's files becomes a versionium commit.
  - **One hook.** RepoLayer `writeFile` and `deleteFile` call `touched()`, so every write passes it: an accepted proposal, an agent's auto write, a revert, a person's save, a restore.
  - **Settle.** A burst of writes is one commit: six files written by an agent make one commit, not six.
  - **Only the changes.** The commit is the existing repo snapshot, so only changed files are sent, stored as deltas.
  - **Provenance without plumbing.** The task running when the write happens names the agent, the task and the desktop checkpoint taken before it. repo-inject adds the person who approved and the proposal.
  - **Nothing lost.** If versionium is down, the failure is logged once and the changes are kept and retried, then committed when it is back.
  - A proposal is not a commit; accepting it is.
- The snapshot record carries `provenance`. Each commit is also an activity entry: `version.commit`, or `version.failed` if it couldn't be saved yet.
- Setting `versions.every_change` (default on).

## Proof
test-repo-versions 5/5: against the real Idearium API, with versionium's own routes served on its port.
