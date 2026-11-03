# CHANGELOG 0.60.381 — SC7: Updates in COS, with a gear

James, 2026-11-02: "A gear, with update settings and Build that update section in cos. With a gear"

## What was built
- **The gear.** It sits in COS's top bar and opens **Updates** with its settings showing. Updates is its own section, in the rail, and its
  own page (`cos/ui/updates/`).
- **This Nexus against GitHub:** the current version, the latest, how far behind, and **Check GitHub now**.
- **What it changes:** each system the update changes, as *restarts by itself* or *waits for you*. Clear Glass is never restarted under him.
- **In his words:** the release lines GitHub has.
- **Update now**, or **Keep mine and update** when this folder has commits GitHub lacks. Each is confirmed first: what it backs up, what it
  keeps, and what restarts.
- **History:** every update, keep-local and rollback, with **Roll back** on the last update. A rollback runs in its own process, then each
  changed system restarts.
- **The gear's settings** are the kernel's own (`lib/nexus-update.js`), not a copy:
  - automatic updates: Auto, Notify or Off;
  - check GitHub every 1–168 hours;
  - new: **your own commits**, Auto (keep them on a branch when GitHub already has them, and update) or Ask (wait for his click).
- **Records:** each change is on COS's ledger and recorded in Versionium.
- **Same setting elsewhere:** `update policy --keep-local ask` and Idearium's POST /api/update/policy take it too.
- **The COS app's own exe update** stays in its tray menu, and the page says so.
- **The icon** is a real cog. The old "gear" path read as a sun.

## Found while building
- A page opened while COS's shell was still loading its contract never showed: the stage was cleared, but its frame was kept. The gear,
  clicked at once, hit it. Fixed in `cos/ui/shell/page.js`.

## Proof
- test-cos-console 11/11:
  - CC-10: settings read, set, read back from the kernel's own file, on the ledger; bad values and an agent refused; history; rollback
    with nothing to undo refused.
  - CC-11, in Clear Glass: the gear opens Updates with its settings, Notify saved and read back, the history said empty, Updates in the rail.
- Also green: test-nexus-update 13/13, test-cos-updates 7/7, test-cos-ui 6/6, test-cos-supervisor 8/8, test-update-popup 3/3.
