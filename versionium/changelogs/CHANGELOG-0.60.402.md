# 0.60.402 — Hide what you point at (EE2)

James, 2026-11-05: "1 and 2". That means Fiverr working end to end, then the Element Engine.

## Fiverr
The open phases of the income map are all yours:
- FI0, Nexus running on your PC;
- FI2, your profile;
- FI3, the Press & Hold check;
- FI11, Publish;
- FI14, delivery.

The code side of the fill is built, and 0.60.394's WebGL fix removes the crash in front of it.

## Built (EE2)
- After a pick, a bar offers **Hide**. The Element Engine writes one `host##selector` rule into your own filters. The element is hidden on
  that site from the next load, and not on other sites.
- The panel lists **Hidden on this site**, with remove. **Undo** on the bar takes the rule out.
- A selector a rule cannot use is refused, and the bar says so.
- Re-cut, said: EE2 no longer waits on EE1 (one identity). EE1 waits on your EE_D1 choice, and on running ErosmancerOS, which cannot run in
  the coder's sandbox.

## Proof
- `test-cg-element-engine-plugin` 5/5. EP-05 runs through the real engine: hidden on fiverr.com and not on example.com, listed, refused,
  undone.
- `test-adblock` 13/13 and plugin routes 3/3, unchanged.
