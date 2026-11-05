# CHANGELOG 0.60.407 — EAS4 L2/L3, Emerge's side: build and run through the door; host and model named by route

> Renumbered from 0.60.390 on merge (2026-11-05): main took 0.60.388–0.60.404 for other work built in parallel. Main's 0.60.390 keeps its own changelog.

James, 2026-11-05, asked how Nexus's pieces take part when it asks Emerge through its door: "Emerge calls back by route"

## Why
lib/emerge's pipeline runs Cortex's preflight and writeback, and Idearium's sync, in-process. Its t2-gate sends T2 to Guardian. emerge/
had removed that coupling on purpose (his, 2026-10-28: "don't couple to nexus"), and nothing can be handed over in-process through the
door. His decision is EAS_D9 in the map. The coder's earlier plan to "port t2-gate's 52 lib-only lines" was wrong: those lines are the
coupling his rule removed. It is corrected in the map.

## Built (in Emerge)
- `compiler/model.js`: api `route`. It POSTs `{ prompt, meta }` to a URL and expects `{ ok, text }` back. Any system that answers that
  contract can be the model.
- `compiler/host.js`: `routeHost`. Settings naming `ping`, `preflight`, `writeback` and `sync` as URLs; a method left out behaves like the
  local host's. A route that does not answer is said in the result, never taken as a pass.
- `POST /compiler/build` (L2, the whole pipeline) and `POST /compiler/run` (L3: compile, then T2 through the model). Each command node
  states what it takes, what it returns and how it fails. Files come back as text. Run's progress comes back as a list at the end, where
  in-process it was a live callback; that difference is named here.
- A host or a model given as a path (a module) is refused at the door (400). Only settings cross it.

## Proof
- `emerge/emerge/tests/compiler-door.test.js` 8/8, against a stand-in system that answers the host and model contracts:
  - CD-05: preflight, writeback and sync reached;
  - CD-06: a dead route named in the result;
  - CD-07: 11 T2 nodes asked the model route, 11 complete;
  - CD-08: paths refused at the door.
- Emerge's own `npm test` green.
- Emerge's lock taken again.

## Next (Nexus's side)
- Cortex serves preflight and writeback, Idearium serves sync, and Guardian serves the model, each on its own route.
- Then the four callers switch.
