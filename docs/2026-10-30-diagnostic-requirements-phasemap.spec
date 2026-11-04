# docs/2026-10-30-diagnostic-requirements-phasemap.spec — Diagnostic takes care of what a system needs (DR1–DR5)
# The direction is James's; the census, the split and the phase cut are the coder's. Spec: diagnostic/spec/requirements.spec.

origin: >-
  James, 2026-10-30, after the coder answered his boot log with "Semantic memory is running on its fallback, because the embedding model isn't
  installed: ollama pull nomic-embed-text": "diagnostic system should be taking care of things like this."

status: "MAPPED 2026-10-30. Nothing built."

decisions:
  DR_D0_diagnostic_takes_care_of_it:
    chosen: "a missing model, package, binary, port, setting or memory is found and fixed through Diagnostic, not left to a person reading a log"
    by: "his, 2026-10-30 (origin)"
  DR_D1_detect_then_owner_fixes:
    chosen: "Diagnostic detects and asks; the system that owns the thing fixes it (a model: the Ollama bridge), through RAID"
    by_the_axioms: "§5.15 (one owner; Diagnostic does not shell out to Ollama); §5.2 and §9.1 (routing and decisions through RAID); §12.6 (every system has a diagnostic engine; Diagnostic is the one that watches all)"
  DR_D2_declared_by_each_system:
    chosen: "each system declares what it requires in its own compartment.json; Diagnostic keeps no list of its own"
    by_the_axioms: "§5.15 rule 2 (placement is ownership: the need belongs to the system that has it); §16.6; §0.1 (declared and checked, never guessed); reading the declarations is observation, which the tablet spec's boundary law leaves unrestricted and disk-backed so it works when a system is down, while every fix is a mutation and goes through the owner (docs/nexus-tablet.spec boundary)"
  DR_D3_downloads_ask_first:
    chosen: "a fix that downloads or installs runs under a policy, off / ask / auto per kind, ask by default; he can set auto"
    by_the_axioms: "USER_AUTONOMY; §4.3 (a network fetch onto his machine is his act unless he set a rule); §5.6 (the same shape as COS's update policy)"

phases:
  DR1_systems_declare_what_they_need:
    status: OPEN
    depends_on: [DR_D0_diagnostic_takes_care_of_it, DR_D2_declared_by_each_system]
    files: [lib/system-shape.js, cortex/compartment.json, copilot/compartment.json, tests/modules/test-system-shape-requires.test.js]
    spec: diagnostic/spec/requirements.spec
    blocks: [MOD-DR-DECLARE]
    does: "requires[] in compartment.json, written by each system's shape; first declarations: cortex's embedding model and vectra, copilot's probe memory"
    proof: "cortex/compartment.json declares cortex.model.nomic-embed-text with its owner and fix"
  DR2_diagnostic_checks_them:
    status: OPEN
    depends_on: [DR1_systems_declare_what_they_need, DR_D1_detect_then_owner_fixes]
    files: [diagnostic/lib/requirements.js, diagnostic/nexus-diagnostic.js, tests/modules/test-diagnostic-requirements.test.js, tests/modules/run-all.js]
    spec: diagnostic/spec/requirements.spec
    blocks: [MOD-DR-CHECK]
    does: "check every declared requirement at boot and on its cadence; one typed gap each, with the fix and the fallback"
    proof: "against a stand-in Ollama without the model: one gap with its fix; with it: none"
  DR3_the_owner_can_fix_it:
    status: OPEN
    depends_on: [DR_D1_detect_then_owner_fixes]
    files: [ollama/routes/models.js, ollama/interaction-contract.json, tests/modules/test-ollama-pull.test.js]
    spec: diagnostic/spec/requirements.spec
    blocks: [MOD-DR-OLLAMA-PULL]
    does: "the Ollama bridge pulls a model by route, with progress, disk check, ledger and record"
    proof: "a pull completes and shows installed; a second at once is refused"
  DR4_fixed_under_policy:
    status: OPEN
    depends_on: [DR2_diagnostic_checks_them, DR3_the_owner_can_fix_it, DR_D3_downloads_ask_first]
    files: [diagnostic/lib/remedy.js, diagnostic/nexus-diagnostic.js, tests/modules/test-diagnostic-remedy.test.js]
    spec: diagnostic/spec/requirements.spec
    blocks: [MOD-DR-REMEDY]
    does: "off reports, ask proposes, auto fixes through RAID; recheck before close; vector memory leaves its fallback without a restart"
    proof: "ask: the proposal taken, the model pulled, the gap closed, semantic memory on embeddings"
  DR5_seen_and_fixed_from_the_screens:
    status: OPEN
    depends_on: [DR4_fixed_under_policy]
    files: [idearium/cli/route-commands.js, lib/automation/templates.js]
    spec: diagnostic/spec/requirements.spec
    blocks: [MOD-DR-SURFACE]
    does: "rows for agents and Copilot; the cockpit lists unmet requirements with Fix (MG29); the 'ollama-models' template kept, marked superseded"
    proof: "`diagnose requirements` shows the gap; `diagnose fix` under ask makes the proposal"

# Graphs (2026-10-30): DR1 0 crossings, DR3 0, DR2 and DR4 5 each and DR5 2, all known (already in diagnostic/nexus-diagnostic.js and
# route-commands.js, in the ratchet's baseline). No new crossing.
