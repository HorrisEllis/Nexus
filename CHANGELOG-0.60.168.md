# 0.60.168 — 2026-10-19 — the repo desktop: a failed WHPX launch no longer drops straight to a desktop too slow to steer; the way in by terminal is shown

James, 2026-10-19: "can you fix the cos envirement? i can't control it or access it. idearium. look at the spec in the idearium folder called genesis, and architecure spec. look at looms cos template." (Repo desktop for looking-glass-bundle-v0.4; the viewer header read "connected" and "accel tcg (whpx failed)".)

## What the screenshot and the code show
- The viewer was **connected** and the desktop **drew**: the VM was alive and the guest agent had copied the repo in (`files: /home/nexus/looking-glass-bundle-v0.4`). So this is not "no VM".
- `accel tcg (whpx failed)`: `startDesktop` retried a failed hardware launch **once, in software**. An XFCE desktop under TCG boots for minutes and answers the mouse slowly; the busy spinner in the middle of the screenshot is consistent with that. This is the coder's reading from the screenshot and the code (to confirm) — no QEMU ran here.
- **Access**: `desktopPorts().sshPort` (0.60.12) never reached the session status (`sess.ports` was built without it), so no viewer could say how to get in by terminal.
- The viewer's header wraps in a narrow window, but the screen sat at a fixed 44 px and painted over it (the cut-off "Repo desktop", "login: nexus / nexus" and buttons in the screenshot).

## The fix
- `cos/workspace/index.js` — the retry is a **ladder**: the accelerator as before → (whpx only) **whpx in safe mode**: conservative CPU `qemu64,+ssse3,+sse4.1,+sse4.2,+popcnt` and `kernel-irqchip=off` → **tcg**. kvm/hvf go straight to tcg as before. Every rung that died is kept (`accelTried`) with QEMU's last lines; a death in software is reported as it is, never a fourth try. `sess.ports` now includes `sshPort` (`_portsOf`).
- `cos/compartment/qemu-runtime.js` — `irqchipOff` adds `kernel-irqchip=off` on whpx; under tcg `-accel tcg,tb-size=512` (a bigger translation cache).
- `idearium/ui/desktop.html` — an ssh pill (`ssh -p <port> <user>@127.0.0.1`, click to copy); the accel text says "safe mode" when whpx is running on its second try, and the hover on it shows what QEMU said; the screen starts under the header's **real** height (ResizeObserver).

## Proof
`tests/modules/test-cos-workspace.test.js` 18/18: WS-13 (updated, the earlier whpx→tcg-once behaviour is superseded, kept in the 0.39.280 addendum) walks the three rungs and the reported death; WS-13b covers kvm→tcg, the qemu argv for whpx safe mode and the tcg cache, the usb-tablet from 0.60.12, and the viewer's ssh pill and header sizing. `test-cos-testenv` 29/29, `test-cos-testenv-any-repo` 57/57 (real VM boot skipped: no QEMU), `test-cos-vm-shell` 6/6, `test-desktop-setup-popup` 9/9. `test-compartment-window` CW-03 fails the same way on the untouched 0.60.167 (not caused here).

## Not proven
No VM was booted. Whether WHPX safe mode now starts on his machine, and whether the pointer follows, needs a look on it: Start VM, then hover the accel pill. If WHPX still dies, the pill's hover now has QEMU's words for it.

## Spec and registry
- Addendum to `docs/cos.spec` (0.60.168). No new component and no new `require()` edge, so no new Loom wire: the changed files are already mapped, and `loom/templates/cos-compartment.js` (the compartment's intent, mounts, drawbridge, seal) is unchanged by this.
