# 0.60.401 — A failing GPU restarts Clear Glass in software mode at once (WG3)

James, 2026-11-05: "clearglass is looping" · "finish clearglass."

## Found
This is the coder's miss in WG2. Clear Glass passes `disable-gpu-process-crash-limit`. With the GPU on by default, a failing GPU process
therefore restarted forever. WG2's software-mode flag only took effect at the next start.

## Built
On the third GPU death, the flag is written and Clear Glass restarts itself once, in software mode.

## Proof
- `test-cg-webgl` 2/2.
- Whether this was your loop is for your machine to show.
