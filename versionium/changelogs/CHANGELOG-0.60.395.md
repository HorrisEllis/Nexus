# 0.60.395 — Clear Glass uses the GPU by default (WG2)

James, 2026-11-05: "that might explain why the tv ui or idearium is so laggy in clearglass. enable it by default"

## Built
- Hardware acceleration is **on** by default. Since 0.60.3 it had been off, so every page, the TV UI and Idearium included, was drawn by the
  CPU.
- It goes off in two cases:
  - `CG_GPU=off` is set;
  - the GPU process dies 3 times in one run (a dead or failing GPU). Then `gpu-off.flag` in Clear Glass's own folder keeps later starts in
    software mode, with WG1's software WebGL, and the log says so. Deleting the flag, or setting `CG_GPU=on`, tries the GPU again.

## Proof
- `test-cg-webgl` 2/2.
- Whether the lag goes away is for your machine to show.
