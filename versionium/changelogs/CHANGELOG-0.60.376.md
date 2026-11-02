# 0.60.376 — 2026-11-02

James: "i want toasts in cos ui for gibhub updates with a update tool. so i can update nexus automatically. per system" · "Yes. I need the cos ui
to be a full enterprise grade, windows service, option to close or minimize to tray, manage systems,"

Map: `docs/2026-11-02-cos-enterprise-phasemap.spec` (CE1–CE5).

## Why your updates never landed

You pasted three starts of 0.60.338. Each found 0.60.343 on GitHub and stopped at "diverged: 1 local commit(s) not on GitHub — merging is
yours". One local commit in your folder blocked every automatic update for good.

## Keep mine and update (CE3)

- **Your local commits are kept on a branch** (`local/<date>`), and the folder moves to GitHub's commit. Nothing is lost.
- **Safe first:** a backup comes first, as for every update, and your colliding data is set aside first. `git reset --keep` refuses rather
  than overwrite an uncommitted edit.
- **The check says how many of your local commits GitHub already has by content.** When it has all of them, the automatic update does this
  by itself. Otherwise the choice is yours, on COS's card.
- **Also as a command:** `idearium update keep-local --yes`, and the route `POST /api/update/keep-local`.

## The update tool in COS, per system (CE2, CE4)

- **COS's manager answers `GET /api/cos/update`:** what GitHub has, the release lines in your words, and, per system, what restarts by
  itself, what waits for you (Clear Glass), and whether COS or the kernel changed.
- **`POST /api/cos/update/apply`:**
  - backs up, updates (or keeps yours, then updates), then restarts each changed system by itself through COS's supervisor;
  - Clear Glass is never restarted under you;
  - one update runs at a time, and each step goes out on COS's event stream;
  - the git work runs in its own process, so a slow fetch never stops the supervisor.
- **The update card in COS's window is now the tool:**
  - it names the systems;
  - Update now (or Keep mine and update), confirmed once on the card;
  - then what restarted, with Restart for what waits for you.
- **While COS is in the tray,** the same update comes as a Windows notification, once per version.

## Close and minimize are yours (CE1)

The tray menu has two new choices:
- **Closing the window:** hide to the tray (the default; every system keeps running), or quit COS.
- **Minimizing:** the taskbar (the default), or the tray.

## Waiting on you (CE2 below, CE5)

- **"Per system", as read (to confirm):** one update from GitHub, announced and restarted per system. Git can't take half a commit, and a
  half-updated folder matches no version at all.
- **The Windows service.**
  - The part of COS with no window (the manager, and the systems with no window) can be a real service in services.msc, running before you
    log in. Your windows (COS, Clear Glass) start in your session and attach to it.
  - It needs a small third-party service wrapper with SYSTEM rights. The coder recommends WinSW, pinned and hash-checked. The alternative
    is a Task Scheduler task, with no new binary but not a real service.

## Proof

- **test-cos-updates 7/7 (new):**
  - per system: what restarts, and Clear Glass waiting;
  - no backup, no update;
  - updated and restarted by itself, Clear Glass never;
  - keep mine and update;
  - one at a time;
  - wired;
  - the card driven in Clear Glass: the systems, the confirm step, the update, what restarted, Restart Clear Glass, and Keep mine when
    diverged.
- **test-nexus-update 13/13:** UP-14 is new (keep mine and update; the local commit reachable on its branch).
- **test-cos-app-window 7/7:** CW-07 is new (close and minimize).
- **test-update-popup 3/3.**
- **On Windows, unverified until your run:** the tray menu's new choices and the Windows notification.
