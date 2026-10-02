# 0.39.293 — 2026-10-02

James: "i mean that i cant login to my desktop envirement in idearium with the default credientials, not sure if its a upstream problem"

It was not upstream. It was ours.

## What was wrong
- **The setup dropped the desktop.** Idearium's "Set up the test VM" ran `cos/testenv/setup-job.js`, which only let `go`, `ruby`, `php` and `rust` through, and the wizard never offered the desktop. So the image Idearium built had no xfce, no lightdm and no desktop account.
- **What you saw:** a repo's **Desktop** booted that image to a text console. `nexus / nexus` could not log in, because there was no `nexus` account. The guest agent's attempt to set the password failed and showed only as "(not applied)" on the login pill.
- **A second bug on the same path:** after a base rebuild, each repo's desktop disk (a qcow2 overlay) was reused as it was, over a *different* image under the same path. An overlay sitting on bytes it was not made from is a corrupt disk.

## What changed
- **The setup offers the desktop, ticked by default.** It installs xfce, a browser and an editor, with autologin as the desktop account (Settings → Desktop, default `nexus` / `nexus`).
- **A desktop on an image without one is refused, with the fix.** Instead of booting a VM nobody can use, the start answers 409 `NO_DESKTOP_IN_IMAGE` and says to rebuild with the desktop ticked, or run `node cos/testenv/provision.js --with desktop`.
- **Each repo's desktop disk is tied to its image.**
  - A stamp file beside the disk names the image it was made over.
  - After a rebuild, a disk made over the old image is renamed `desktop.stale-<time>.qcow2` and kept, never deleted (§0.3), and a fresh one is made.
  - A branch whose original's disk is stale starts from the image instead.

## What to do
1. Open a repo's run menu and choose **Set up the test VM**. **desktop** is ticked.
2. Let it build. It downloads more than before: the desktop packages.
3. Press **Desktop**. It logs in by itself as `nexus`. The password for the lock screen and sudo is `nexus`, or whatever Settings → Desktop says.

Your old repo desktop disks are kept beside the new ones, so nothing is lost.

## Proof
- `tests/modules/test-cos-workspace.test.js` 17/17. The new WS-15 covers:
  - the image without a desktop is refused with the fix, and no disk is made;
  - the stamp is written, and the same image reuses the disk;
  - a rebuilt image archives the old disk with its contents intact and makes a fresh one;
  - a branch never overlays a stale original;
  - the setup and the wizard carry the desktop option.
- `tests/modules/test-cos-testenv-any-repo.js` 63/63. `--with go,desktop` reaches `provision.js`.
- Master phasemap 1.8.1: DK1 is built, and CO1 is answered ("the original cos" was this).
