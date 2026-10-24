spec:
  meta:
    name:     fifteen-systems-migration
    version:  1.0.0
    date:     2026-10-24
    owner:    "core (lib/architecture-migrate.js wrote this proposal; RF2 applies it one phase at a time)"
    origin: "James, 2026-10-24: \"15 systems. the rest of the folders need to migrate.\" · \"need to make the refactor tool from the phgases. so we can make each system sovereignfor the cos migratoin\""
    generated: "node lib/architecture-migrate.js --write <this file> — regenerate, do not hand-edit the phases; decisions are his"
  decisions:
    MV0_unplaced_homes:
      status: "DECIDED — every home placed (his: remote-desktop, tablet, security → cos; the rest by his axioms)"
  phases:
    MV1_cockpit:
      status: DONE (0.60.241)
      depends_on: []
      files: [cockpit/, lib/cockpit/]
      does: "move cockpit/ into lib/cockpit/ (R2: shared: used by cli 2, core 2, guardian 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV2_contracts:
      status: DONE (0.60.241)
      depends_on: []
      files: [contracts/, lib/contracts/]
      does: "move contracts/ into lib/contracts/ (R2: shared: used by core 1, orchestrator 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV3_hooks:
      status: DONE (0.60.241)
      depends_on: []
      files: [hooks/, lib/hooks/]
      does: "move hooks/ into lib/hooks/ (R2: shared: used by core 2, architect 1, copilot 1, cortex 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV4_meta:
      status: DONE (0.60.241)
      depends_on: []
      files: [meta/, lib/meta/]
      does: "move meta/ into lib/meta/ (R2: shared: used by core 3, cortex 1, guardian 1, intelligence 1, orchestrator 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV5_sentinel:
      status: DONE (0.60.241)
      depends_on: []
      files: [sentinel/, lib/sentinel/]
      does: "move sentinel/ into lib/sentinel/ (R5: used only by cli, which go to core); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV6_service:
      status: DONE (0.60.236)
      depends_on: []
      files: [service/, (split: guardian/guardian-service.js, cortex/cortex-service.js, idearium/idearium-service.js)]
      decided_by: "decided by his axioms (code belongs to the system it serves; §0.3 — retiring would lose a working launcher), found before applying RF2; supersedes the coder's earlier 'retire' (kept under superseded)"
      does: "move service/ into (split: guardian/guardian-service.js, cortex/cortex-service.js, idearium/idearium-service.js) (D: split: service/guardian-service.js → guardian/guardian-service.js; service/cortex-service.js → cortex/cortex-service.js; service/idearium-service.js → idearium/idearium-service.js — not dead: each file is a hand-run launcher for one system (node service/<system>-service.js start|status|stop; guardian's updated 2026-10-22 for its data home), named for that system — each goes into its system); rewrite every require that points at it; the census then counts it inside split"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV7_siso:
      status: DONE (0.60.241)
      depends_on: []
      files: [siso/, lib/siso/]
      does: "move siso/ into lib/siso/ (R2: shared: used by cli 1, core 1, cos 1, emerge 1, idearium 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV8_ui:
      status: DONE (0.60.241)
      depends_on: []
      files: [ui/, lib/ui/]
      does: "move ui/ into lib/ui/ (R2: shared: used by orchestrator 6, guardian 2, diagnostic 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV9_emerge:
      status: DONE (0.60.241)
      depends_on: [MV7_siso]
      files: [emerge/, lib/emerge/]
      does: "move emerge/ into lib/emerge/ (R2: shared: used by core 3, cli 2, copilot 1, diagnostic 1, guardian 1, idearium 1, warp 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV10_emergence:
      status: DONE (0.60.241)
      depends_on: [MV11_warp]
      files: [emergence/, lib/emergence/]
      does: "move emergence/ into lib/emergence/ (R3: nothing uses it; it uses only warp → goes where warp goes (core)); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV11_warp:
      status: DONE (0.60.241)
      depends_on: [MV9_emerge]
      files: [warp/, lib/warp/]
      does: "move warp/ into lib/warp/ (R2: shared: used by core 9, emergence 9, ollama-bridge 5, nexus 4, cos 3, idearium 3, loom 3, cortex 1, diagnostic 1, intelligence 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV12_nexus:
      status: DONE (0.60.241)
      depends_on: [MV13_cli, MV11_warp]
      files: [nexus/, lib/nexus/]
      does: "move nexus/ into lib/nexus/ (R2: shared: used by core 13, orchestrator 8, intelligence 6, cli 4, guardian 3, cortex 2, architect 1, copilot 1, loom 1, ollama-bridge 1, versionium 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV13_cli:
      status: DONE (0.60.241)
      depends_on: [MV1_cockpit, MV9_emerge, MV5_sentinel, MV7_siso]
      files: [cli/, lib/cli/]
      does: "move cli/ into lib/cli/ (R2: shared: used by core 3, orchestrator 2, nexus 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"

# ## ADDENDUM 2026-10-24 (0.60.241): every phase applied — the 22 folders are inside the 15 systems
# James, 2026-10-24: "yes start rf2, security goes with remote desktop" · "need the systems soveriegn". RF2 (lib/architecture-apply.js)
# applied every phase above, one commit per move (0.60.236: jaa, seams, service, auth, mesh, architecture-spec, erosmancer, security,
# remote-desktop, tablet; 0.60.241: siso, cockpit, sentinel, meta, hooks, contracts, ui, warp, emergence, emerge, nexus, cli). The
# census now counts 14 systems: the 15 with core as the kernel (lib/). This map is no longer regenerated (it would come back empty);
# it stays as the record. Said plainly (§1.2): regenerating it after batch 1 dropped batch 1's nine phases from this file; their record
# is CHANGELOG-0.60.236.md and the git history of this file (0.60.235's version lists all 22). Sovereignty of those 14 (no crossing between them) is the drawbridge work (DB6), not this map.


# ## ADDENDUM 2026-10-24 (b): two maps of one folding, his consolidation, and where the changelogs go
# 1. Two contracts, surfaced (docs/CLAUDE.md rule 4). Main's #160 brought docs/2026-10-24-system-consolidation-phasemap.spec (CN0–CN11),
#    mapped in another session from his placement words, while RF2 applied this map. They agree on warp, siso, auth and mesh. They differ:
#    - cockpit: CN6 idearium/forge-ide (his "cockpit into idearium"); RF2 lib/cockpit. His words win: RF3_cockpit_to_idearium.
#    - erosmancer: CN8 clear-glass/erosmancer-os (his "clear-glass/erosmancer-os"); RF2 clear-glass/erosmancer. His name: RF3_erosmancer_os.
#    - cli: CN7 nexus/cli (his "cli maybe into nexus", tentative); RF2 lib/cli. Asked 2026-10-24, not yet answered. OPEN.
#    - remote-desktop, security: CN9 archive; RF2 cos/ by his later words ("remote desktop, tablet was meant to tbe the front end for cos",
#      "security goes with remote desktop"). RF2 stands.
#    - jaa: CN4 guardian/jaa; RF2 archived it. jaa/ held only two SQL schema files; the store everyone opens is lib/jaa-store.js. RF2 stands.
# 2. His consolidation. James, 2026-10-24, asked where emerge should live (lib, or idearium as he had proposed): "emerge and warp
#    consolidated. spec compiler and idearium consolidate." The coder's reading, to confirm: emerge's primitives and runtime become
#    one with warp in lib/; emerge's spec compiler (lib/emerge/compiler: kg-builder, pipeline, phase-specs, SPEC_COMPILER.spec) joins
#    idearium's spec engine (idearium/spec-engine, which has its own compiler-t0.js). Found: Event, Gate, Stream and StreamLog exist four
#    times, all diverged (lib/warp/core 27/58/298/111 lines; lib/emerge/siso 15/15/137/29; lib/siso 11/23/77/89; lib/siso/core, ESM).
#    warp's MANIFEST decoupling rule (warp imports nothing outside warp/) means emerge's seams to cortex and idearium (cortex-query,
#    idearium/client) cannot go into warp. They go with the compiler to idearium, or stay behind a route.
# 3. The changelogs. James, 2026-10-24: "the changelogs need to be somewhere else, maybe in docs or versionium." 442 CHANGELOG-*.md files
#    sit at the root; 11 modules read them (lib/version.js, lib/release-notes.js, lib/nexus-releases.js, lib/release-version.js,
#    lib/context-atlas.js, lib/phase-census.js, lib/spec-census.js, lib/readme-generate.js, lib/checks/ck-253-versions.js,
#    lib/architecture-apply.js, scripts/release-zip.js). The coder's recommendation, by the axioms: docs/changelogs/. Every reader is in core,
#    and core reaching into a system (versionium) is an upward crossing that the ratchet refuses. Versionium serves them through its own
#    route, reading docs/. His to choose; the phase below assumes docs/changelogs/.
spec_b:
  phases:
    RF3_cockpit_to_idearium:
      status: OPEN
      depends_on: []
      files: [lib/cockpit, idearium/cockpit]
      does: "lib/cockpit → idearium/ (his \"cockpit into idearium\"), through lib/architecture-apply.js. The folder's name (cockpit or CN6's forge-ide) was asked 2026-10-24; until he answers, the name stays cockpit."
      proof: "the refactor tool's check is clean; idearium's tests pass; npm run start:all boots"
    RF3_erosmancer_os:
      status: OPEN
      depends_on: []
      files: [clear-glass/erosmancer, clear-glass/erosmancer-os]
      does: "clear-glass/erosmancer → clear-glass/erosmancer-os (his name); Clear Glass's spawn path follows."
      proof: "Clear Glass starts ErosmancerOS from the new path"
    RF3_changelogs_to_docs:
      status: OPEN
      depends_on: []
      files: [docs/changelogs, lib/version.js, lib/release-notes.js, lib/nexus-releases.js, lib/release-version.js, lib/context-atlas.js, lib/phase-census.js, lib/spec-census.js, lib/readme-generate.js, lib/checks/ck-253-versions.js, lib/architecture-apply.js, scripts/release-zip.js]
      does: "the 442 CHANGELOG-*.md move to docs/changelogs/ (git mv, history kept); the 11 readers read one constant for the folder, old root too (installed releases); the rule in docs/CLAUDE.md names the new place."
      proof: "release-notes, releases, context-atlas and ck-253 read the same changelogs as before; the root holds none"
    RF4_primitives_one_copy:
      status: OPEN
      depends_on: []
      files: [lib/warp/core, lib/emerge/siso, lib/siso, lib/siso/core]
      does: >-
        One Event/Gate/Stream/StreamLog. warp/core (the most complete, with tests) is the base; each other copy's API is compared
        method by method, what it has that warp lacks is added to warp (opt-in, warp's own rule), and each copy becomes a re-export of
        warp, kept for its callers (§0.3). The ESM copy re-exports the same through an ESM wrapper.
      proof: "every caller of the four copies passes its tests against warp; warp's own tests pass; one implementation left"
    RF4_emerge_into_warp:
      status: OPEN
      depends_on: [RF4_primitives_one_copy]
      files: [lib/emerge, lib/warp]
      does: "emerge's runtime (core/, chunk/, emerge-kernel, codegen, ide) joins warp in lib/ under warp's decoupling rule; its seams to cortex and idearium (cortex-query, idearium/client) do not, and move with the compiler (RF4_spec_compiler_into_idearium) or go behind a route."
      proof: "warp's decoupling check holds; emerge's tests pass from the new place"
    RF4_spec_compiler_into_idearium:
      status: OPEN
      depends_on: [RF4_emerge_into_warp]
      files: [lib/emerge/compiler, idearium/spec-engine, copilot/module-builder.js, guardian/server.js]
      does: >-
        emerge's compiler joins idearium's spec engine (kg-builder, pipeline, phase-specs, SPEC_COMPILER.spec), merged with compiler-t0.js
        where they do the same job. copilot and guardian call it today in-process; that becomes a new crossing, so they call idearium's
        compile route instead (designed out before code, per the phase-graph rule).
      proof: "test-substrate-spec compiles every spec at specDepth 1.0 from the new place; copilot and guardian compile through the route; the ratchet adds no crossing"
