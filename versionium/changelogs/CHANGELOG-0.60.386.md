# CHANGELOG 0.60.386 — genesis.spec and the architecture spec: the boundaries of 2026-11-03

ADDENDUM 2026-11-03 — boundaries: one door per system, COS the orchestrator (his decisions, in his words; recorded, not yet built)
James, 2026-11-03: "Okay. I’m overwhelmed. This is a shit show. That’s why boundaries need to exist. Cli and API routes through the component
registry like the ui. All of this needs to update the genesis spec and architecture spec"
Every decision below is his, said on 2026-11-03, with its record in docs/2026-11-03-registry-per-system-phasemap.spec (PL_D1–PL_D13) and AXIOMS §5.16.
1. THE DOOR. "No component registry is the spine." · "The drawbridge is the the component registry, which is also the event bus, and
   interaction contract and bridge into the compartment." · "Cli and API routes through the component registry like the ui." Each system has
   one door: its own component registry. Its CLI, its API routes and its UI all go through it.
2. PER SYSTEM, SOVEREIGN. "No component registry is per system. That needs to be implemented" · "And enforce that. … It’s fucking sovereign."
   · "Each system is sovereign. It is responsible for its own data, its own modules. Its own commands, lib is not a directory for anything that
   a system uses that it does not have within its own directory. Each system needs to work independent of the system." · "Nothing a system
   needs lies outside of its own boundaries, beyond another system. Like Idearium needs Guardian, right? But I could slot another system in
   its place to use. It's not hardwired, it just uses the API routes and the CLI server". No central registry (AXIOMS §5.16; the ratchet
   lib/registry-sovereign-check.js holds today's 12 central callers and 22 Loom maps from growing). "Not loom. Never said loom. Loom is going
   to be removed" · "The lib folder is not the component registry."
3. THE PROCESS. "the server.js is the process for each system. It’s what cos manages. The spine and component registry for each system routes
   through there. Cli and api."
4. THE SYSTEM REGISTRY AND COS. "Then the system registry is for connecting the component registries. Cos and The orchastrator uses that to
   orchestrate." · "Cos is the orchastrator now. That’s the point. The reason for the sandbox is to seperate the systems." · "Cos is meant to
   be the orchastrator complelely. Replace autopilot." · "Cos ui stays the cos ui. It’s already for ochastrating." · automation: "It’s in the
   orchastrator." (its AE phases follow the orchestrator to COS — the coder's reading, to confirm).
5. DUMB COMPONENTS. "Yes so each component can be dumb, and agnostic at some point." · "Yes. This reduces the complexity for each
   complement." A component takes its input and returns its output; the door checks the caller and the contract, carries the events, routes.
6. SANDBOXED, NOT VIRTUAL MACHINES. "I just want them to be isolated from each other. This should make the system easier to manage but give me
   more control over resource usage and limits." Each system an ordinary process in its own sandbox (its folder, its code, no other programs
   unless allowed, its limits), on his 16 GB machine.
7. ONLY CHANGES. "I just don’t want the versions to be bigger than only the changes." · "Look at versionium. It’s meant to record changes."
   Snapshots and versions are Versionium's, recorded as changes, through its routes.
8. EVERY PHASE A DAG. "Okay we also need to clean the phases at some point. Add to the Claude.md. That every phase needs a dag."
9. THE TEMPLATE. "Look at iseariums template for a new systme" — idearium/spec-engine/templates/architecture-spec.template.yaml (his,
   2026-10-05 → 10-17) is the shape each system is rebuilt toward; it already says "the registry is the interaction contract, the event bus,
   the queue, the dependency graph, the wiring harness and the spine" and "hardcoded has to earn its place".
Measured on 2026-11-03, against 1–3: 6 of 14 systems have a server.js COS runs; 11 have their own registry, 4 serve it themselves, 7 also send
it to the old orchestrator's central registry; in none is the registry the event bus; 152 places reach past a registry into another system's files.
Still his, not decided (do not build on a guess): whether .nex names a snapshot in Versionium or drops out; the TV shell (its own thing, or
gone); one source for registry, contract and events (the template lists three files); the template's "what every system uses is the kernel's"
against "lib is not a directory …"; where the .cos sits in the tree; network isolation; the qcow2 virtual disk's future.

## Where
- idearium/spec-engine/templates/genesis.spec: the addendum above, at its end (its version stays 1.5.0; its header moves it to 1.6.0 only when built).
- docs/architecture-spec/architecture-spec.spec: the same addendum; version 0.15.0 (test-genesis-and-architecture-spec's version check allows 0.15).

## Proof
- test-genesis-and-architecture-spec 7/7, test-genesis-sandboxed 4/4, test-system-template 5/5, test-spec-document 8/8.
- Found, said: test-substrate-spec has failed since 0.60.380 (the coder's modules added to cos/spec/cos-manager.spec name phases in other maps and depend on names the spec does not declare). test-system-skeleton also fails, identically before this change (lib/boundary.js requires x.js, not in the tree).
