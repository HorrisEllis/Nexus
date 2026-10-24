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
      status: "OPEN — homes to confirm: erosmancer, jaa, remote-desktop, seams, security, sentinel, service, tablet, ui"
  phases:
    MV1_architecture_spec:
      status: OPEN
      depends_on: []
      files: [architecture-spec/, idearium/architecture-spec/]
      does: "move architecture-spec/ into idearium/architecture-spec/ (R1: only idearium uses it (1 require)); rewrite every require that points at it; the census then counts it inside idearium"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV2_auth:
      status: OPEN
      depends_on: []
      files: [auth/, orchestrator/auth/]
      does: "move auth/ into orchestrator/auth/ (R1: only orchestrator uses it (1 require)); rewrite every require that points at it; the census then counts it inside orchestrator"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV3_cockpit:
      status: OPEN
      depends_on: []
      files: [cockpit/, lib/cockpit/]
      does: "move cockpit/ into lib/cockpit/ (R2: shared: used by core 2, guardian 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV4_contracts:
      status: OPEN
      depends_on: []
      files: [contracts/, orchestrator/contracts/]
      does: "move contracts/ into orchestrator/contracts/ (R1: only orchestrator uses it (1 require)); rewrite every require that points at it; the census then counts it inside orchestrator"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV5_erosmancer:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [erosmancer/]
      does: "erosmancer/ has no home yet (R4: no edge either way — a home by purpose, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV6_hooks:
      status: OPEN
      depends_on: []
      files: [hooks/, lib/hooks/]
      does: "move hooks/ into lib/hooks/ (R2: shared: used by core 2, architect 1, copilot 1, cortex 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV7_jaa:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [jaa/]
      does: "jaa/ has no home yet (R4: no edge either way — a home by purpose, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV8_mesh:
      status: OPEN
      depends_on: []
      files: [mesh/, guardian/mesh/]
      does: "move mesh/ into guardian/mesh/ (R1: only guardian uses it (1 require)); rewrite every require that points at it; the census then counts it inside guardian"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV9_meta:
      status: OPEN
      depends_on: []
      files: [meta/, lib/meta/]
      does: "move meta/ into lib/meta/ (R2: shared: used by core 3, cortex 1, guardian 1, intelligence 1, orchestrator 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV10_remote_desktop:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [remote-desktop/]
      does: "remote-desktop/ has no home yet (R4: nothing uses it; it uses core 1 — no single home, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV11_seams:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [seams/]
      does: "seams/ has no home yet (R4: no edge either way — a home by purpose, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV12_security:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [security/]
      does: "security/ has no home yet (R4: no edge either way — a home by purpose, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV13_sentinel:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [sentinel/]
      does: "sentinel/ has no home yet (R4: no edge either way — a home by purpose, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV14_service:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [service/]
      does: "service/ has no home yet (R4: nothing uses it; it uses core 6, intelligence 3, cortex 1, guardian 1, idearium 1 — no single home, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV15_siso:
      status: OPEN
      depends_on: []
      files: [siso/, lib/siso/]
      does: "move siso/ into lib/siso/ (R2: shared: used by cos 1, emerge 1, idearium 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV16_tablet:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [tablet/]
      does: "tablet/ has no home yet (R4: no edge either way — a home by purpose, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV17_ui:
      status: OPEN
      depends_on: [MV0_unplaced_homes]
      files: [ui/]
      does: "ui/ has no home yet (R4: no edge either way — a home by purpose, to confirm)"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV18_cli:
      status: OPEN
      depends_on: [MV21_nexus]
      files: [cli/, lib/cli/]
      does: "move cli/ into lib/cli/ (R2: shared: used by core 1, orchestrator 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV19_emerge:
      status: OPEN
      depends_on: [MV15_siso]
      files: [emerge/, lib/emerge/]
      does: "move emerge/ into lib/emerge/ (R2: shared: used by core 2, copilot 1, guardian 1, idearium 1, warp 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV20_emergence:
      status: OPEN
      depends_on: [MV22_warp]
      files: [emergence/, lib/emergence/]
      does: "move emergence/ into lib/emergence/ (R3: nothing uses it; it uses only warp → goes where warp goes (core)); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV21_nexus:
      status: OPEN
      depends_on: [MV22_warp]
      files: [nexus/, lib/nexus/]
      does: "move nexus/ into lib/nexus/ (R2: shared: used by core 11, orchestrator 8, intelligence 6, guardian 3, cli 2, cortex 2, architect 1, copilot 1, loom 1, ollama-bridge 1, versionium 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV22_warp:
      status: OPEN
      depends_on: [MV19_emerge]
      files: [warp/, lib/warp/]
      does: "move warp/ into lib/warp/ (R2: shared: used by core 9, emergence 9, ollama-bridge 5, nexus 4, cos 3, idearium 3, loom 3, cortex 1, diagnostic 1, intelligence 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
