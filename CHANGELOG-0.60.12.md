# 0.60.12 — 2026-10-13

James: "can you quickly make intent mapping and routing a setting in idearium?" · "the desktop envirement … cant move the mouse, connect to the terminal, or anything regardless."

## Intent routing is now a setting

Settings → routing has two new controls:
- **`routing.reason_route`** (on / off): turns intent routing for reasoning on or off.
- **`routing.reasoner`**: names who reasons. If it's empty, the planner reasons, else the first agent on the ladder that isn't Ollama.

`lib/pipeline-routing.js` `policyFrom` carries both settings, so the model door honours them for chat, pages and builds alike.

## The VM: mouse and terminal

**Mouse.** The VM had no absolute pointer device. A VNC viewer can only steer an absolute pointer, so the screen showed but the mouse never followed. Fixed by adding `-device qemu-xhci -device usb-tablet` (`cos/compartment/qemu-runtime.js`).

**Terminal (SSH):**
- The guest's port 22 is forwarded to your machine's loopback only, on port 2200+N. `desktopPorts()` now returns that as `sshPort`.
- The guest now installs `openssh-server`, with password login on. That's safe because only loopback can reach the port.
- Connect with `ssh -p <sshPort> nexus@127.0.0.1` and the desktop login (default nexus / nexus).
- A VM set up before this version doesn't have sshd yet. Press "set up environment" again; the mouse fix works at the next VM start.

## Proof

- `test-reasoning-route` 12/12, `test-pipeline-routing` 19/19, `test-model-door` 8/8.
- `test-cos-testenv` 29/29, `test-cos-workspace` 17/17, `test-cos-testenv-any-repo` 63/63.
- The mouse and SSH fixes haven't run on a live VM here, because this machine has no QEMU guest. Check them on your machine.
