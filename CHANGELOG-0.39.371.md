# 0.39.371 — 2026-10-07

James: "I want to use snapshots, pause, rewind, etc. like full VMware style. Not actual VMware."

## VM1 — the desktop, like VMware
Every desktop VM already had a QMP channel open (QEMU's control channel). Nexus only ever used it to cut the network. `cos/workspace/vm-control.js` now uses it for the rest:

| Control | How | What it does |
|---|---|---|
| **Pause / resume** | `stop` / `cont` | The VM freezes where it is, memory and all |
| **Checkpoint** | `savevm` | A **live** snapshot: disk, memory and devices. Restoring it lands mid-session, with the programs that were running. It's kept inside the desktop disk. |
| **Checkpoints** | an index beside the disk | Each checkpoint's label, what it was taken before, and when, checked against the VM's own snapshot list |
| **Rewind** | `loadvm` | Back to that moment |

- **Refusals.** An unknown or malformed tag is refused before anything is sent to QEMU. A refusal from QEMU itself is reported in its own words.
- **Linux-host limit.** On a Linux host the repo is shared into the VM over 9p (or vvfat). QEMU can't take a live snapshot of a VM with that kind of share, so a live checkpoint is refused with the reason, as the COS machines map decided.
- **API:**
  - `POST /api/repos/:uuid/desktop/:op`, where op is pause, resume, checkpoint or rewind;
  - `GET /api/repos/:uuid/desktop/checkpoints`.

  Each of your acts on the desktop is a row of the repo's activity log.

## CK1 — the log is the rewind
**Before every task's work, the repo's desktop is checkpointed if it's running.** That covers an agent's call and a run in the compartment. The checkpoint is recorded twice:
- on the task;
- as a `checkpoint.saved` row in the log.

If the desktop refuses, the work still runs and the reason is logged. The setting is `desktop.checkpoint_before`, on by default.

**In the drawer:**
- each task has **"↶ rewind the desktop to before this"**;
- each checkpoint row has **"to here"**.

`lib/repo-activity.js` doesn't know about VMs. Idearium hands it a checkpointer.

## Proof
- New: `test-vm-control` 7/7, against a stand-in QEMU that speaks QMP on a unix socket the way QEMU does. Everything else is real: vm-control, cos-bridge, repo-activity and the activity log. It covers:
  - pause and resume;
  - a checkpoint that keeps its label and the task it was taken before;
  - the list, newest first, catching a snapshot deleted inside QEMU;
  - rewind, and the refused tags (nothing sent);
  - QEMU's refusal, the 9p refusal, and a desktop that isn't running;
  - CK1: the checkpoint is taken before the work, and recorded on the task and in the log; a refusal still lets the work run;
  - the wiring.
- Unchanged and passing:

| Suite | Result |
|---|---|
| event-contracts | 8/8 |
| repo-activity | 24/24 |
| desktop-activity | 5/5 |
| compartment-activity-log | 6/6 |
| claude-code-backend | 6/6 |
| cos-workspace | 17/17 |
| nexus-self-and-cos-run | 30/30 |
| desktop-setup-popup | 9/9 |

- Loom: compartment-activity declares 5 wires, with no failures.

## Not yet
- The `cos vm pause|resume|snapshot` CLI commands over the same module.
- The desktop window's toolbar (UI2).
