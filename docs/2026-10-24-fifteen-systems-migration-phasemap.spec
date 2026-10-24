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
      status: "OPEN — homes to confirm: none"
  phases:
    MV1_cockpit:
      status: OPEN
      depends_on: []
      files: [cockpit/, lib/cockpit/]
      does: "move cockpit/ into lib/cockpit/ (R2: shared: used by cli 2, core 2, guardian 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV2_contracts:
      status: OPEN
      depends_on: []
      files: [contracts/, lib/contracts/]
      does: "move contracts/ into lib/contracts/ (R2: shared: used by core 1, orchestrator 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV3_hooks:
      status: OPEN
      depends_on: []
      files: [hooks/, lib/hooks/]
      does: "move hooks/ into lib/hooks/ (R2: shared: used by core 2, architect 1, copilot 1, cortex 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV4_meta:
      status: OPEN
      depends_on: []
      files: [meta/, lib/meta/]
      does: "move meta/ into lib/meta/ (R2: shared: used by core 3, cortex 1, guardian 1, intelligence 1, orchestrator 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV5_sentinel:
      status: OPEN
      depends_on: []
      files: [sentinel/, lib/sentinel/]
      does: "move sentinel/ into lib/sentinel/ (R5: used only by cli, which go to core); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV6_service:
      status: OPEN
      depends_on: []
      files: [service/, (split: guardian/guardian-service.js, cortex/cortex-service.js, idearium/idearium-service.js)]
      decided_by: "decided by his axioms (code belongs to the system it serves; §0.3 — retiring would lose a working launcher), found before applying RF2; supersedes the coder's earlier 'retire' (kept under superseded)"
      does: "move service/ into (split: guardian/guardian-service.js, cortex/cortex-service.js, idearium/idearium-service.js) (D: split: service/guardian-service.js → guardian/guardian-service.js; service/cortex-service.js → cortex/cortex-service.js; service/idearium-service.js → idearium/idearium-service.js — not dead: each file is a hand-run launcher for one system (node service/<system>-service.js start|status|stop; guardian's updated 2026-10-22 for its data home), named for that system — each goes into its system); rewrite every require that points at it; the census then counts it inside split"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV7_siso:
      status: OPEN
      depends_on: []
      files: [siso/, lib/siso/]
      does: "move siso/ into lib/siso/ (R2: shared: used by cli 1, core 1, cos 1, emerge 1, idearium 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV8_ui:
      status: OPEN
      depends_on: []
      files: [ui/, lib/ui/]
      does: "move ui/ into lib/ui/ (R2: shared: used by orchestrator 6, guardian 2, diagnostic 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV9_emerge:
      status: OPEN
      depends_on: [MV7_siso]
      files: [emerge/, lib/emerge/]
      does: "move emerge/ into lib/emerge/ (R2: shared: used by core 3, cli 2, copilot 1, diagnostic 1, guardian 1, idearium 1, warp 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV10_emergence:
      status: OPEN
      depends_on: [MV11_warp]
      files: [emergence/, lib/emergence/]
      does: "move emergence/ into lib/emergence/ (R3: nothing uses it; it uses only warp → goes where warp goes (core)); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV11_warp:
      status: OPEN
      depends_on: [MV9_emerge]
      files: [warp/, lib/warp/]
      does: "move warp/ into lib/warp/ (R2: shared: used by core 9, emergence 9, ollama-bridge 5, nexus 4, cos 3, idearium 3, loom 3, cortex 1, diagnostic 1, intelligence 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV12_nexus:
      status: OPEN
      depends_on: [MV13_cli, MV11_warp]
      files: [nexus/, lib/nexus/]
      does: "move nexus/ into lib/nexus/ (R2: shared: used by core 13, orchestrator 8, intelligence 6, cli 4, guardian 3, cortex 2, architect 1, copilot 1, loom 1, ollama-bridge 1, versionium 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV13_cli:
      status: OPEN
      depends_on: [MV1_cockpit, MV9_emerge, MV5_sentinel, MV7_siso]
      files: [cli/, lib/cli/]
      does: "move cli/ into lib/cli/ (R2: shared: used by core 3, orchestrator 2, nexus 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
