# §SEED PROVENANCE — extracted verbatim from NEXUS-GUARDIAN.spec, the
# `cockpit_forge` block (lines 731-769 of the source file), authored by
# james-brooks. Real spec for a shipped "AI-powered self-modification
# engine" (routing priority across local/remote models, entry points,
# fail-loud fallback) — chosen as the reference shape for an "AI Agent
# System" archetype.
  cockpit_forge:
    file: "cockpit/forge/cockpit-forge.js"
    formerly: "forge.js"
    uuid: rheon-forge-0000-2026-0529-jamesbrooks-001
    component_id: rheon.forge
    version: "1.0.0"
    description: "AI-powered self-modification engine. Local-first. No API key."

    routing_priority:
      1: "Guardian HTTP — http://127.0.0.1:7820/command"
      2: "Ollama — http://127.0.0.1:11434/api/generate"
      3: "FAIL LOUD — §1.2"

    entry_points:
      - "forgeModule(src, instruction, opts) — full module rewrite"
      - "forgePatch(src, patchSpec, opts)    — minimal targeted patch"
      - "forgeGate(description, opts)        — generate SISO gate function body"
      - "forgeHook(src, hookSpec, opts)      — add new exported function with UUID"

    invariants:
      - "ForgePatchRecord written to JAA before patch applied (§2.1)"
      - "Zero external npm dependencies"
      - "All mutations via SISO bus emit(), never direct calls"
      - "Every new exported symbol gets @hook UUID comment"
      - "Never remove existing @hook UUIDs or change existing signatures"
      - "Source is CommonJS (require/module.exports)"

    system_prompt_nucleus:
      laws:
        - "§1.1 Nothing pretends to work"
        - "§1.2 Nothing silently fails"
        - "§2.1 JAA write before behavior"
        - "§5.1 UUID on everything"
        - "§CF No engine consumes raw meaning — all engines operate on ConstraintField"
        - "§SISO Every gate has exactly one signature"

  # ════════════════════════════════════════════════════════════════
  # GTCI — GAP-TRIGGERED CONTEXT INJECTION
  # ════════════════════════════════════════════════════════════════
