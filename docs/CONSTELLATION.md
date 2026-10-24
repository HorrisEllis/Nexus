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

## Update 2026-10-24 — Raven, the master spec corpus, and the true scale (31 repos)
James: "look. and the docs folder and the phases. 31 repos. github.com/HorrisEllis/Raven"

- **Raven / CorvidObs v0.1.1** (github.com/HorrisEllis/raven) — a camera-first, transparent-UI, voice-logging
  PWA for observing corvid behaviour: a full signal vocabulary (vocal contact/alarm/mob/food/play,
  dominance/appeasement). Different domain (animal behaviour), same instinct as the toolkit — map the signals,
  log the differentials. A clean standalone PWA (README.md, app.js, index.html, sw.js, manifest).
- **The master spec corpus** (spec.zip) — a `.spec/` folder that is the architectural source for the whole
  family: Emerge, NEXUS-CORE/CORTEX/GUARDIAN/IDEARIUM/MODULES/ORCHESTRATOR/SELF/VERSIONIUM/SPEC-v9,
  NEXUS-CAUSAL, causal-nexus, genesis, forge, forge-ide, spec-parser, seam-block, nexus-tab-sovereign,
  MASTEVOS-v9, RHEON IDE/VOID. Plus the **RHEON Creative Platform** (Creative Universe, Word-Idea-Fire,
  Studio, Kernel v2.1), **MASTEVOS v1.0.0** (incl. an embodiment-studio), and system specs: AGNOSTIC-STACK-MAP,
  ARCHITECT, EIDOLON, META-EDITOR, GUARDIAN interaction/GTCI contracts, NEXUS_MASTER_AUDIT. 66 .md, 26 .spec,
  16 html, 15 svg, 9 docx. This is the "rebuild-if-lost" skeleton at constellation scale.
- **Scale: 31 repos.** What this file names is a fraction. At 31 repos, hand-mapping in chat does not scale —
  and that is precisely what idearium is for: ingest a repo, read its `docs/` and its phases, map it. The
  whole of this session's work (the dependency graph, emerge-as-language, the build pipeline, the
  consolidation) is the tooling to run a 31-repo sovereign stack as one system.

### The scale-correct next move
Register the 31 repos into idearium so it reads each repo's docs + phases itself (managerView / phases.js
already do this for any repo), instead of mapping them by hand. That needs their locations — a GitHub org, a
list, or add_repo per repo. Alternatively, pick one (ERAVOS, MASTERMIND, the mesh stack, RHEON) and drive it
to shippable now. His call.
