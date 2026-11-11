# 0.60.486 — every input reaches RAID first (RD9 slice a)

James, 2026-11-12: "I want raid to get done. That way we can have the cli in nexus hooked into raid, inputs into raid, saved as a .input
node, then raid decides what to do with using the routing." · "I meant as cos.exe. like i feel like im trying to make a operating system.
eravos the desktop ui, cos the runtime, resource manager the task manager, clearglass the browser, idearium the explorer.exe."

## Built
- `POST /api/raid/input { text, from, by }` on Cortex (`cortex/core/raid/input.js`):
  1. the input is written as a `.input` node file before anything is decided;
  2. RAID's envelope is made from it;
  3. RAID decides where it goes;
  4. the decision and its why are written back on the node.
- RAID failing to decide keeps the input and says so.
- `GET /api/raid/inputs` lists the latest. Command: `raid input <words>`, `raid input --list`.
- Mapped: RD9_every_input_through_raid (docs/2026-10-13-projects-raid-and-gates-phasemap.spec).

## Proof
`tests/modules/test-raid-input.test.js` 2/2, with RAID's decision handed in.

## Not yet
- It records the decision; it does not act on it (slice b).
- cos.exe's command line is not hooked to it yet (slice c).
- Not run against a live Cortex here. The route is not yet declared in `cortex/interaction-contract.json`.
- Mapped only in a note, each to be mapped in its own map: the panel's engines as templates, `.erv` opened by ERAVOS, `cos import`.

## JavaScript, said
`input.js` is new JavaScript: Cortex's RAID is JavaScript, and no Emerge port of RAID is mapped yet.
