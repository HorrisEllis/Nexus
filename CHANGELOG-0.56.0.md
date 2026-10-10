# 0.56.0 — 2026-10-10

James: "yes." · "for the confident, filler, maybe use confidence score and adversarial. like maybe the adversarial is a gate for each output. … nexus is supposed to be nonlinear and domain agnostic. like with guardian, we can make ai assistance." · "can you add the rewind engine controls and versioning to the repos box you click on to open it."

The first four phases of `docs/2026-10-10-idearium-solid-phasemap.spec`, in the order he said yes to.

## SD0 — a dropped versionium no longer loses the build

His error was "versionium unreachable at 127.0.0.1:3754 — read ECONNRESET". One cause is now reproduced and fixed. When an upload was over versionium's size limit, versionium destroyed the connection before answering, so the sender saw "connection reset" instead of "too large", which looks exactly like versionium being down. It now answers 413 on a live connection.

Idearium also tries the safe-to-repeat steps (limits, plan, stage) again while versionium restarts, waiting 2, 4, 8, 16, then 30 s. Autopilot already restarts versionium. If versionium is still down after that, the refusal says how long it waited and how to start versionium. The commit itself is never repeated, because a lost reply could otherwise double it.

Whether the 12:46 reset was the size limit or a crash can't be told from here; versionium's log at that minute would say.

## SD1 — versions and rewind on the repo's box

Each box in the Repos grid has a **⟲ versions** button. It opens inside the box, without opening the repo, and shows:
- the last three versions, each with ↶. That runs the real restore preview (what it would write and delete); restoring takes a snapshot first, so it can be undone.
- the desktop's pause, resume and checkpoint, and its last checkpoints with ↶ rewind.
- "all versions →", which opens the repo on its versions view.

It uses the same routes and the same restore and rewind functions as the Plan panel. Checked in Clear Glass against the real API and versionium (`tests/probe/idearium-one-surface-glass.js`, 21/21).

## SD2 — copilot never says "ok" with nothing

When no model answered, copilot used to return `ok: true` with empty text, which the overview showed as "[unstructured response — keys …]". It now returns `ok: false` with lifeline's reason, for example "Both Ollama and Guardian are unavailable".

## SD3 — you go before background builds

A job someone is waiting on (guardian's `askSync`) is marked high priority. When the economy's gap opens, a background build for the same agent steps back so your job goes first. When a tab reconnects, high-priority jobs are sent first.

## Mapped: SD10, the adversarial gate

Every output in any domain (a spec block, a phase, a file, an answer) passes a gate:
- An adversary, a different agent from the author, tries to break it.
- It returns its attacks and a confidence score, with the reasons for the score.
- The output then passes; is offered with the attacks beside it; or is sent back once, with the attacks as the brief.

The verdicts feed the learned order, so Nexus learns which agent writes which kind of output well. The parts to reuse already exist: draft-review's author and reviewer, the compartment engine's empty adversary slot, and the routing verdicts.

The pushback is in the map: each gate is one more model call, so it needs modes (always for spec blocks and builds, sampled or off for chat). And a model's confidence number is itself a claim, so it is never shown without its reasons.

Tests: `test-idearium-solid` 7/7 · the Clear Glass probe 21/21.
