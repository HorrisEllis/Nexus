# 0.60.362 — CP5b: pause and resume a compartment; the whole sandbox mapped

James, 2026-11-01: "like im saying setting threads/cores, memory/ram, hard drive space, sandboxed, system state hooked into controls, the entire sandbox is rewindable/pausable/recordable/branchable/parraelel and benchmarked, using deltas inbetween events, state recording, orchastration, all of cos features that exist in relation to the systems, also network switch and throttling. full snapshot system and menu for every system."
· then: "axioms 3.1 are law."

## Mapped (docs/2026-11-01-the-compartment-phasemap.spec, CP_D9)
His whole list, every control on one menu per system, over two tiers:
- **The process tier** is the default. It is light, and it is how Nexus's systems run now.
- **The QEMU machine tier** is opt-in per system. It is already built for COS desktops, with cores, RAM, disk, network switch, pause, checkpoints and rewind.

The default follows §0.5 with §0.1's evidence: his machine reached 0.2% free memory today.

A capability table says, for each control and each tier, whether it is enforced, watched, or not enforced, and why.

New phases:
- CP6c: cores
- CP6d: disk
- CP6e: network switch and throttle
- CP5b: pause
- CP5c: recording the deltas between events
- CP5d: rewind and branch
- CP5e: parallel
- CP5f: benchmark

The order follows §3.1 and §3.4: pause, then snapshots (CP5a), then the menu (CP2).

The coder asked him the tier and the order, though both were the axioms' to decide. That error is recorded in the map.

## Built: pause and resume (CP5b)
Built in the rule's order: the spec modules first (MOD-CP-SUSPEND and MOD-CP-PAUSE, compiled at full depth), then the phase graph (no new crossing), then the code.

**The OS act: `cos/manager/suspend.js`**
- Suspends a system's process together with its children.
- Linux and macOS use SIGSTOP and SIGCONT. Windows uses NtSuspendProcess through PowerShell, with no native module.
- Every act is read back from the OS, and the read-back decides success.

**The supervisor**
- `pause` and `resume` write the ledger line first (§9.2).
- The state says `paused` only when the OS reads the process tree as suspended.
- A paused system is never idled or restarted by rule.
- Stopping a paused system resumes it first, so it can exit.

**Who may pause: `POST /api/cos/systems/:name/pause|resume { by }`**
- A person's act is his.
- A rule's act needs RAID's approval, and RAID's answer fails closed.
- An agent is refused (403).

**Command rows:** `cos pause <system>` and `cos resume <system>`.

## Proof
tests/modules/test-cos-pause.test.js passes 4/4 on real process trees:
- a parent and its child both stop beating, and then both beat again;
- the supervisor's ledger order is right, and nothing restarts a paused system;
- stop works while paused;
- the route refuses an agent, refuses a rule with RAID unreachable, and lets a person pause.

These ran on Linux. **The Windows path is written but unproven until it runs on his machine.**

## Not yet
- The screen: the per-system menu, CP2, comes after snapshots (CP5a).
- CW-05 in test-cos-walls fails in this sandbox: Electron refuses to run as root. It fails the same way without this change, so it is an environment problem, not a regression.
