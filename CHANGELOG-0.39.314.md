# 0.39.314 — 2026-10-05

James: "dont add noise. only what we talked about. then show me."
James: "each component only needs to connect to the registry. that cuts down immensly on context. i am trying to make this need as little tokens as possible. scales as it builds, and as simple as possible."
James: "include a contract folder. also routes would be nodes right?"
James: "then bundle each capability node, in relation to any other relevant node."

## The system template, from his description only
`idearium/spec-engine/templates/architecture-spec.template.yaml` now holds three things:
1. **His words,** verbatim.
2. **The tree.** It follows Guardian's shape, plus what he added: a `contracts/` folder; routes, hooks, wires, toasts and contracts as nodes; and a bundle node per capability that references its related nodes rather than copying them.
3. **Fifteen rules** from what he said:
   - every component connects only to the registry;
   - at least one capability per component, at least one command per capability, and that command's events, each a node;
   - every node type has its own folder, schema and JAA index;
   - each system owns its own data and pulse, and announces itself;
   - everything is isolated behind a handshake-verified interaction contract;
   - the UI floats on top;
   - events go in a ledger per session, with deltas and sigmas;
   - files carry hashes and get Versionium snapshots;
   - changes start at the registry;
   - hardcoded has to earn its place.

The 0.39.312 version is archived whole.

## Open
Genesis's file list and its shape section still describe the old template. That's SB28.

## Proof
`tests/modules/test-system-template.test.js` passes **4/4**: only his words, the tree and the rules; the tree's paths, including the new ones; the rules; both archives intact.
