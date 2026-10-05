# 0.39.340 — 2026-10-05

James: "when clicking on setup desktop, i want to have a popup with the progress. like show me what its doing. like when you run setup in the run menu in idearium. like I want a setup screen, asking for the username and password. and i want options for the vm, like vmware. like compartment destkop. also the vnc, what about replacing it with the remote desktop project in the remote desktop."

Mapped first as DK2–DK4 in `docs/2026-10-01-idearium-agent-ready-master-phasemap.spec` (1.10.0). **DK2 is built. DK3 and DK4 are mapped and need James's call** (below).

## DK2: the desktop setup popup
Two buttons open it: **⚙ set up environment** (Settings → Environment) and the new **⚙ set up desktop** (Settings → Desktop). It has three steps:

1. **Account.** The desktop login.
   - The username is prefilled and follows Linux account rules.
   - Type the password twice. Leave it empty to keep the current one.
   - It's saved as `desktop.user` / `desktop.password` before the setup starts.
2. **VM.**
   - Memory, CPUs and network (`desktop.ram_mb` / `cpus` / `network`).
   - The desktop (xfce), and the languages this repo needs, ticked and labelled "this repo needs it".
   - What this computer has: QEMU, its accelerator, whether a base image exists.
3. **Progress.** The setup's own steps, read from what `provision.js` reports:
   - QEMU, download (with a percent bar), disk, first boot, verify, ready;
   - the line it's on and the time it has taken;
   - the full log behind a button.

   When it's **done**, **Open desktop** opens this repo's desktop. When it has **failed**, you see the reason and the console's last lines, with **Try again**.

Closing the popup leaves the setup running. Opening it again while it runs goes straight to the progress.

Nothing new on the server: it saves through `/api/config` and the repo's environment route, and reads `/api/cos/testenv`.

## Found and fixed
- **The repo's setup never passed your account.** `POST /api/repos/:uuid/environment/setup` started the VM build without the desktop login; only the Run menu passed it. Once the password was changed in Settings, an image built from the repo's button kept the old account, and the viewer showed a login that didn't work. It passes the login now.
- **Found while building:** `desktop.user` and `desktop.password` refuse any writer but `user` (a person). The popup's first draft identified itself as `desktop-setup` and would have failed on your machine. It sends `user` (your click), pinned by DS-03 and DS-08 against the real config module.

## Mapped, needs your call
- **DK3: VMware as a VM engine.** Only QEMU exists today. VMware would be driven by `vmrun`, using the same Debian image converted once, with VMware's own VNC turned on so the viewer is unchanged. My input: it's a second engine for the same VM, not a better one. QEMU already uses hardware acceleration. It's worth it if you already use VMware on this machine; otherwise it's one more thing to keep working. I also can't test it here, only against a fake `vmrun`.
- **DK4: remote-desktop in place of VNC.** My input, not agreement:
  - **VNC here is QEMU's own screen of the VM.** It shows the boot, a broken setup and the login screen, with nothing installed in the guest.
  - **Your remote-desktop runs *inside* the guest.** There's no screen until Debian is up and its host is running, and it needs Electron and nut-js in the image.
  - **It's the better screen once running**, but it can't replace VNC for setup and recovery.
  - **My proposal: put it beside VNC.** remote-desktop becomes the main screen when the desktop is up, VNC stays the boot and recovery screen, and noVNC is served from the tree instead of a CDN.

## Proof
- **`tests/modules/test-desktop-setup-popup.test.js`, 8/8, driven by Clear Glass** (never Playwright):
  - **DS-01:** the repo's route passes the account.
  - **DS-02:** account checks.
  - **DS-03:** the saves happen in order, with actor `user`.
  - **DS-04:** stages and the download bar at 42%.
  - **DS-05:** done, then Open desktop.
  - **DS-06:** failed, with the reason and console lines, then Try again.
  - **DS-07:** reopening while it runs goes to progress and stops nothing.
  - **DS-08:** the real config accepts `user` and refuses any other actor.
- **Also green:** repo-settings-ui, build-surface (+2), cos-testenv-any-repo, cos-workspace, compartment-window, version-sync.
- **Loom:** `desktop-setup.js` is mapped with its real edges (app.js globals, idearium's HTTP, opened by repo-environment and repo-settings). The registry was regenerated from scratch, with nothing lost.
