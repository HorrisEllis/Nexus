# 0.60.301 — builder, resources (RAID-balanced), networks, storage, the state timeline and merge; every section on the registry bus

James, 2026-10-30:
> "full template, architype builder. a resource manager for each compartment in cos. so each system can be throttled, allowcated, balaced using raid as a load balancer, network manager, storage management. like adding storage locations, adding virtual networks and bridging it for running a server or service on."
> "full enterprise grade system state manager and snapshot browser with the timeline, ability to branch, benchmark and merge after friction testing."
> "each page is isolated from each other, completely decomposed and bundled with each section in relation to its component, css, and js file. these needs to be isolated from each other, using the component registry as the event bus."

## Stands on (read first)
- **His network engines in COS**: proxy, tunnel, firewall, dns, storage (S3 subset), webserver and tls.
- **qemu-runtime's networking**: user-mode with port forwarding, or none.
- **`lib/safe-apply.js`**: mirror → branch → check → merge back, gated by RAID.
- **`lib/raid-port.js`**: RAID's `decide`.
- **The snapshot map, SN0–SN4**: one branch, open a snapshot, run in parallel, measured by RFR2.
- **COS phases**: CS7 (spawn and balance), CS11 (RAID in the exe), MG4 (caps), MG5 (editors) and MG8 (the factory).
- **The architecture spec**: FrictionScore and rules A and B.

## Specced (`cos/spec/cos-manager.spec`, now 37 modules, 14 schemas, 14 interfaces, all at full depth)
- **MG22, the builder.** A template or archetype built from parts, then tried in a scratch compartment before it is saved.
- **MG23, allocation and balance.** The host is a pool, and each compartment is allocated and throttled from it. RAID decides how load is balanced, using the `.benchmark` nodes. COS carries out the decision and names it.
- **MG24, networks.** Isolated, NAT or bridged. Names and rules come from his dns and firewall engines. A network is bridged to the host through his proxy or tunnel engines, or a tap bridge where the host allows it.
- **MG25, storage.** Locations (a folder, a drive, his object storage) and volumes with quotas, mounted into compartments and taken with versions.
- **MG26, branch, benchmark and merge.** A branch merges only on a MergeReport that says merge (benchmarks, friction, behaviour schemas, tests), through `mergeBack`.
- **MG27, the screens.**
  - The snapshot browser: per-compartment and whole-system timelines, lanes, compare and the merge report.
  - The resources screen: pool, allocations, the balancer log, a network map and storage.
- **The state manager** takes, restores and pins whole-system states.

## Decision MG_D7 (his)
- Every page, and every section of a page, is its own component with its own html, css and js. It is isolated in its own shadow root.
- Pages and sections talk only through the declared events on the component registry's bus.
- MG18 now waits on DB16: COS's registry is still a draft (`cos/registry-components.draft.json`), and accepting it is his call.

## Proof
- `test-substrate-spec` 3/3.
- The phase DAG has no dangling references and no cycles.
- 28 `.phase` files were written.

Spec only. Nothing is built.
