# THE CONSTELLATION — James Brooks's sovereign stack, as it actually stands

Written 2026-10-24 from the real archives, not memory. Every system below shares one spine — the `warp` +
`emergence` primitives — which descend from `docs/innovation-toolkit.framework`. This is the "one framework →
many systems" proof of concept, and the artifact ERAVOS's own `MAP.md` asked a later tool to produce: the
projects, dragged together. State is marked honestly: **built/tested**, or **prepared** where unverified.

## The spine (the primitives everything is built on)
- **warp** — `@jamesbrooks/warp`. Pure functional devkit: `Event → Gate → Stream → StreamLog` + `Axiom` as an
  enforced primitive + `unifiedDispatch` (exact-cache → filter → cascade → axiom-gate → escalate). Zero
  dependencies, drop-in / npm-installable. Latest seen **v1.5.0** (emergence-6). **43 tests, real.** An
  evolved vocabulary exists in ERAVOS (`Event→Cause`, `Gate→Drawbridge`, `Stream→Flow`) — that "Drawbridge"
  is the ancestor of Nexus's boundary-drawbridge.
- **emergence / emerge** — built on warp. A text-analysis + spec-work loop: observe → create toward a named
  target → record → remember patterns → track. **221 tests in ERAVOS ("the most complete, most tested thing")**;
  the same lineage is Nexus's `emerge` (the spec→knowledge-graph compiler/verifier, and the `.eg` codegen).

## The systems (all his, all on the spine)

| System | What it is | State (from its own files) |
|---|---|---|
| **Nexus / idearium** (this repo) | The self-building platform: 15 systems, spec→phase→build→prove→close, agents + emerge. Contains warp + emerge. | Live, this session's work (SL0–SL10, consolidation mapped) |
| **MASTERMIND** v0.1.50 | "Cognitive Mapping OS" — the brain-map: canvas UI, `nexus-engine`, SISO+JAA runtime, Registry/Vault/Tags. Electron, Windows installer. | Buildable app |
| **ERAVOS** v0.30.0 (accounts) | The couples interdependence dashboard — "grow together." Stack: warp + wire (9 tests) + emergence (221) + eravos-db + server/electron + P2P userscript bridge + accounts. | emergence solid; app has GAP-AUDIT files — parts prepared-but-unverified |
| **kern** (kern-v2-fixed) | "Self-aware, cryptographically grounded, behaviorally verified, causally logged, drift-predicting, peer-to-peer authenticated mesh runtime." | Built, pkg `mesh` v1.0.0 |
| **sovereign-mesh** | Self-hosted infrastructure bundling kern — "run this on your own box instead of trusting a third party." | Built; two pieces packaged together |
| **anonymousservers-nexus** v0.1.0 | A *separate* "NEXUS" — a sovereign self-hosting platform (anonymousservers.info): own DNS, web, mail, firewall, certificate authority, one-click app installer. | v0.1.0 platform |
| **RHEON** (VOID v2, IDE) | Spec'd (RHEON_VOID_v2.spec, RHEON IDE.spec). The portfolio/IDE line (rheon.world/projects). | Specs present |

## The spec corpus (.spec.7z — rebuild-if-lost)
26 architectural specs: NEXUS-CORE, -CORTEX, -GUARDIAN, -ORCHESTRATOR, -VERSIONIUM, -SELF, -MODULES, -SPEC-v9,
Nexus, causal-nexus, genesis, forge, forge-ide, spec-parser, seam-block, seam-component-registry-addendum,
MASTEVOS-v9, RHEON_VOID_v2, RHEON IDE, SESSION-CAPTURE-2026-05-31, and more. This is the "everything specced
so it can be rebuilt if lost" corpus (toolkit Maxim: invariants are the skeleton).

## What this proves (grounded, for credibility/portfolio)
One externalized framework produced a **spine** (warp+emergence) reused and evolved across **a brain-map OS, a
couples dashboard, a P2P mesh runtime, a self-hosting platform, and a self-building dev platform** — plus a
26-spec corpus so they're regenerable. That lineage is traceable in the code, not asserted. It is the strongest
single piece of proof-of-competency: systems design + spec-driven execution, repeated, across domains.

## Live connections worth naming
- **sovereign-mesh + kern + anonymousservers-nexus** are his own *free, self-hosted, P2P* infrastructure — the
  direct answer to the earlier "free route, not money" question: his own box + a P2P authenticated mesh, not a
  rented VPN.
- **ERAVOS's P2P/WebRTC bridge** (no central servers) and **kern**'s P2P mesh are the same instinct, and could
  share transport.
- **MASTEVOS-v9.spec** reads as MASTERMIND + ERAVOS fused — worth confirming with him.

> Not yet done: none of these are merged into this repo, registered as idearium repos, or entered in
> `docs/PROOF-OF-COMPETENCY.md`. This map is the inventory; the next move is his to choose.
