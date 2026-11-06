# docs/2026-11-06-cie-eg-build-phasemap.spec — building CIE-EG's modules (emerge/emerge/spec/cie-eg.spec), one phase per module.
# The decisions are James's (cie-eg.spec section 12, D1–D10, all decided 2026-11-06); the cut into phases and the order are the coder's.
# Spec: emerge/emerge/spec/cie-eg.spec. Each module's own build: entry there says what is built; a phase here says when and with what proof.

origin: >-
  James, 2026-11-06, the focus: "Emerge first then fiverr maybe? I’m struggling. Emerge is the highest leverage." · on the contract (D7):
  "New contract block" · offered the contract block as the next step: "Next".

status: "CIE1 BUILT 0.60.423."

phases:

  CIE1_the_contract_block:
    status: BUILT 0.60.423
    # James, 2026-11-06 (CIE-EG D7): "New contract block". 2026-11-06, after PIL1 was merged: "Next" (the coder had offered the contract block as
    # the next step in the focus, before Pillar's contracts, PIL2, which are written in it).
    depends_on: [EAS4_callers_through_the_door]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-CONTRACT]
    files: [emerge/emerge/lang/parser.js, emerge/emerge/lang/contract.js, emerge/emerge/lang/index.js, emerge/emerge/lang/runtime.js, emerge/emerge/lang/interpreter.js, emerge/emerge/lang/checker.js, emerge/emerge/lang/emitter.js, emerge/emerge/lang/cie/contract.eg, emerge/emerge/lang/test/contract.test.js, emerge/emerge/spec/cie-eg.spec, emerge/emerge.cos]
    requires: [node]
    prerequisites: ["CIE-EG D7 decided (2026-11-06)", "Emerge's lock retaken after the change (scripts/emerge-lock.js --write)"]
    does: >-
      The contract block in the language (CIE-EG 6.1): contract <name> { version, text { }, gate { block_at max_steps checkpoint_every }, road A.h -> B.h }.
      Validated at parse (a road end not an identifier, an unknown setting, a second contract: refused). Defaults are the primitives' own values. Its
      contract_hash (SHA-256 over the canonical form, ECF) goes into the genesis entry and every checkpoint; its gate settings replace the
      primitives' for that run (max_steps the storm limit, checkpoint_every, block_at for observe); each road runs as a wire (a wire is a road).
      The same parse and hash written again in Emerge (lang/cie/contract.eg: parse_contract, contract_hash, roads_from), checked against the
      scaffold byte for byte. Not in this phase: emerge.exe's own parser (native front.eg) learning the block, with MOD-NATIVE-LANG; the gate's
      use of block_at to close a road (MOD-GATE).
    proof: "contract.test.js: the block parses and runs its roads; each refusal; the hash is in genesis and every checkpoint; changing the contract changes the hash; contract.eg gives the same hash as the scaffold; lang suites unchanged"

order: "CIE1 (the contract block) first: Pillar's contracts (PIL2) are written in it; MOD-STORE's schema next (PIL2's other prerequisite)."
