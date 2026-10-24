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
    MV1_architecture_spec:
      status: OPEN
      depends_on: []
      files: [architecture-spec/, idearium/architecture-spec/]
      does: "move architecture-spec/ into idearium/architecture-spec/ (R1: only idearium uses it (1 use: require or path load)); rewrite every require that points at it; the census then counts it inside idearium"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV2_auth:
      status: OPEN
      depends_on: []
      files: [auth/, orchestrator/auth/]
      does: "move auth/ into orchestrator/auth/ (R1: only orchestrator uses it (1 use: require or path load)); rewrite every require that points at it; the census then counts it inside orchestrator"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV3_cockpit:
      status: OPEN
      depends_on: []
      files: [cockpit/, lib/cockpit/]
      does: "move cockpit/ into lib/cockpit/ (R2: shared: used by cli 2, core 2, guardian 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV4_contracts:
      status: OPEN
      depends_on: []
      files: [contracts/, lib/contracts/]
      does: "move contracts/ into lib/contracts/ (R2: shared: used by core 1, orchestrator 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV5_erosmancer:
      status: OPEN
      depends_on: []
      files: [erosmancer/, clear-glass/erosmancer/]
      does: "move erosmancer/ into clear-glass/erosmancer/ (R1: only clear-glass uses it (1 use: require or path load)); rewrite every require that points at it; the census then counts it inside clear-glass"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV6_hooks:
      status: OPEN
      depends_on: []
      files: [hooks/, lib/hooks/]
      does: "move hooks/ into lib/hooks/ (R2: shared: used by core 2, architect 1, copilot 1, cortex 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV7_jaa:
      status: OPEN
      depends_on: []
      files: [jaa/, _archive/2026-10-24-retired-systems/jaa/]
      decided_by: "decided by his axioms (§0.3 archive, not delete; evidence: no require and no path load) after his \"not all of them retired\" — he can overturn"
      does: "move jaa/ into _archive/2026-10-24-retired-systems/jaa/ (D: retired: two SQL files nothing loads (the artifact schemas cite them as reference) — archived with its history, recoverable); rewrite every require that points at it; the census then counts it inside retired"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV8_mesh:
      status: OPEN
      depends_on: []
      files: [mesh/, guardian/mesh/]
      does: "move mesh/ into guardian/mesh/ (R1: only guardian uses it (1 use: require or path load)); rewrite every require that points at it; the census then counts it inside guardian"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV9_meta:
      status: OPEN
      depends_on: []
      files: [meta/, lib/meta/]
      does: "move meta/ into lib/meta/ (R2: shared: used by core 3, cortex 1, guardian 1, intelligence 1, orchestrator 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV10_remote_desktop:
      status: OPEN
      depends_on: []
      files: [remote-desktop/, cos/remote-desktop/]
      decided_by: "James, 2026-10-24: \"not all of them retired.,remote desktop, tablet was meant to tbe the front end for cos i fele like\""
      does: "move remote-desktop/ into cos/remote-desktop/ (D: his decision: the front end for COS); rewrite every require that points at it; the census then counts it inside cos"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV11_seams:
      status: OPEN
      depends_on: []
      files: [seams/, _archive/2026-10-24-retired-systems/seams/]
      decided_by: "decided by his axioms (§0.3; evidence: no require and no path load) — he can overturn"
      does: "move seams/ into _archive/2026-10-24-retired-systems/seams/ (D: retired: one file (seam-contracts.js) nothing loads; lib/seam/ is the live seam code — archived, recoverable); rewrite every require that points at it; the census then counts it inside retired"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV12_security:
      status: OPEN
      depends_on: []
      files: [security/, cos/security/]
      decided_by: "decided by his axioms (code belongs to the system it serves) after his remote-desktop call — to confirm"
      does: "move security/ into cos/security/ (D: the coder's reading, to confirm: the encrypted WebRTC channel and kill switch of the remote session (his 2026-09-16 \"an encrypted wrapper over webrtc. a kill switch if the connection drops\") — it goes with remote-desktop); rewrite every require that points at it; the census then counts it inside cos"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV13_sentinel:
      status: OPEN
      depends_on: []
      files: [sentinel/, lib/sentinel/]
      does: "move sentinel/ into lib/sentinel/ (R5: used only by cli, which go to core); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV14_service:
      status: OPEN
      depends_on: []
      files: [service/, _archive/2026-10-24-retired-systems/service/]
      decided_by: "decided by his axioms (§0.3; evidence: nothing starts them) — he can overturn"
      does: "move service/ into _archive/2026-10-24-retired-systems/service/ (D: retired: OS-service wrappers for cortex, guardian and idearium that nothing starts (no script, no require, no path load); COS runs the systems now — archived, recoverable); rewrite every require that points at it; the census then counts it inside retired"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV15_siso:
      status: OPEN
      depends_on: []
      files: [siso/, lib/siso/]
      does: "move siso/ into lib/siso/ (R2: shared: used by cli 1, core 1, cos 1, emerge 1, idearium 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV16_tablet:
      status: OPEN
      depends_on: []
      files: [tablet/, cos/tablet/]
      decided_by: "James, 2026-10-24: \"not all of them retired.,remote desktop, tablet was meant to tbe the front end for cos i fele like\""
      does: "move tablet/ into cos/tablet/ (D: his decision: the front end for COS); rewrite every require that points at it; the census then counts it inside cos"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV17_ui:
      status: OPEN
      depends_on: []
      files: [ui/, lib/ui/]
      does: "move ui/ into lib/ui/ (R2: shared: used by orchestrator 6, guardian 2, diagnostic 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV18_emerge:
      status: OPEN
      depends_on: [MV15_siso]
      files: [emerge/, lib/emerge/]
      does: "move emerge/ into lib/emerge/ (R2: shared: used by core 3, cli 2, copilot 1, diagnostic 1, guardian 1, idearium 1, warp 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV19_emergence:
      status: OPEN
      depends_on: [MV20_warp]
      files: [emergence/, lib/emergence/]
      does: "move emergence/ into lib/emergence/ (R3: nothing uses it; it uses only warp → goes where warp goes (core)); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV20_warp:
      status: OPEN
      depends_on: [MV18_emerge]
      files: [warp/, lib/warp/]
      does: "move warp/ into lib/warp/ (R2: shared: used by core 9, emergence 9, ollama-bridge 5, nexus 4, cos 3, idearium 3, loom 3, cortex 1, diagnostic 1, intelligence 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV21_nexus:
      status: OPEN
      depends_on: [MV22_cli, MV20_warp]
      files: [nexus/, lib/nexus/]
      does: "move nexus/ into lib/nexus/ (R2: shared: used by core 13, orchestrator 8, intelligence 6, cli 4, guardian 3, cortex 2, architect 1, copilot 1, loom 1, ollama-bridge 1, versionium 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
    MV22_cli:
      status: OPEN
      depends_on: [MV3_cockpit, MV18_emerge, MV13_sentinel, MV15_siso]
      files: [cli/, lib/cli/]
      does: "move cli/ into lib/cli/ (R2: shared: used by core 3, orchestrator 2, nexus 1 — shared code is kernel); rewrite every require that points at it; the census then counts it inside core"
      proof: "the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass"
