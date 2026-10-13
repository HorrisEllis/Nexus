# 0.60.14 — 2026-10-13

James: "need to use nexus as persitent storage, each interaction gated … a tool to request lines from a file to copy to the worksurface or a new file to edit so it can be tiny amounts of code … need to be able to change the intent map and routing." · "the contract is like a reference … each blocvk a task or phase to the llm to reference each gate"

## His 0.60.13: merged, and one merge mistake put right

- **Merged.** His one-cookie-session-per-provider work is in (`clear-glass/src/cookies/session-hub.js` and the rest), as committed in `50291f5`.
- **Fixed on merge.** The Providers settings section no longer throws when the preload has no `providers.account`.
- **Put back.** His copies of four files predated this branch's 0.60.12. Merging them took out:
  - the routing settings (on/off and reasoner);
  - the VM mouse device (`usb-tablet`);
  - SSH (the forwarded port and the guest's `openssh-server`).

  All are put back.
- **Both changelogs kept.** Two different releases were both numbered 0.60.12. `CHANGELOG-0.60.12.md` now holds this branch's first and his after it, as written.

## New

- **Tiny amounts of code:**
  - `repo lines <repo> <path> <from> [to]` reads a numbered line range (`GET /api/repos/:uuid/lines`).
  - `repo lines copy <repo> <path> <from> <to> [--to newPath]` copies those lines to the work surface as a new file to edit (`POST /api/repos/:uuid/lines/copy`). It's a proposal: apply writes the file, revert undoes it.
- **The intent map is yours to change.** Settings → routing → `reason_kinds` adds your own reasoning job kinds on top of the built-in spec/map/plan/read: `prefix*` matches many, and `!kind` removes a built-in.

## Mapped

`docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec` covers the rest of the message, each phase built on what exists:
- **CT0, the contract as a reference.** One block per task: dependencies, gate and status, with every input a pointer (file:line, component id, spec section id), never pasted text.
- **GT0, every interaction gated.** Each gate is a kind at the model door, so each gate can have its own agent, and the ledger carries what the previous gate saw and decided.
- **MEM0, checkpoints.** A checkpoint per passed gate, so work resumes from the last passed block.
- **CX0, context from dependencies.** A block's context is what its dependencies expose (exports, signatures), not their whole files.
- **TD0, Idearium working end to end.** Today's and yesterday's open phases, run in order through the pipeline itself.
- **PF0, profiles linked to hats.** This is ID1, built on his session hub.

## Proof

- `test-reasoning-route` 15/15: DR-04 (the intent map), DR-05 (the settings reach the door), WR-04 (the lines tool).
- His `session-hub`, `provider-account-sync` and `login-portal-elsewhere` tests pass; `test-cg-accounts-portal-settings` is 40/40.
