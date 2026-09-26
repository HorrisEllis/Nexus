spec:
  # ════════════════════════════════════════════════════════════════════════════
  # idearium-templates.spec — DECOUPLED. New capability, own spec.
  # Depends on: idearium/spec-engine. Depended on by: nothing yet (the UI, later).
  # Revert = delete idearium/spec-engine/templates.js + templates/, remove the
  # templateId parameter from createSpec, remove the speceng.templates action
  # and its route. createSpec's prior behaviour is a strict subset.
  # ════════════════════════════════════════════════════════════════════════════

  meta:
    name:    idearium-templates
    version: 1.0.0
    author:  james-brooks
    status:  active
    uuid:    idearium-templates-v1-0000-2026-0709-jamesbrooks-001
    purpose: >
      A registry of spec templates, and a deterministic seed path that fills
      spec sections a compiler can derive — so those sections cost no tokens.

  # ── §T-1: The registry ──────────────────────────────────────────────────────
  registry:
    file: idearium/spec-engine/templates.js
    templates:
      - id: system            # kind: system
      - id: codebase
      - id: library
      - id: module-component
      - id: genesis           # kind: system, hasSeed: true
    seed_dir: idearium/spec-engine/templates/
    contract:
      list:  listTemplates() -> [{ id, kind, hasSeed, ... }]
      get:   getTemplate(id) -> template | undefined
      read:  readSeed(id)    -> string | null

  # ── §T-2: Honest scope of the seed ──────────────────────────────────────────
  axiom_T-2:
    statement: >
      A template seeds only what it can derive. Everything else dispatches.
    what_templates_js_promised: >
      "pre-fill whichever chunks it can" — an unimplemented promise at the time
      it was written. createSpec had no templateId; the phrase described nothing.
    what_is_actually_derivable: >
      idearium's SPEC_SECTIONS are prose sections (meta, purpose, axioms,
      schema, api, events, integration, tests, ...). genesis.spec is a GRAMMAR:
      `version 1.0.0`, `spine WARP`, `spine.primitives = Event, Gate, Stream,
      StreamLog, Axiom`, `bind kernel.boot -> Stream`. There is no structural
      mapping from a DSL to eight markdown essays. Inventing one would fabricate
      content while calling it deterministic.
    what_is_seeded: >
      Exactly one section: `meta`, extracted from the real header — version,
      UUID, spine, spine.primitives, spine.rule. Verified against the file, not
      assumed from its name.
    measured: >
      9 of 10 chunks require an agent instead of 10. A 10% reduction, measured.
      Not the 100% a "template" implies to a reader.
    failure_mode: >
      If the template's shape changes and nothing matches, _seedMetaFromTemplate
      returns null and ALL chunks dispatch normally (§1.1). It never emits an
      empty section that looks built.

  # ── §T-3: Provenance ────────────────────────────────────────────────────────
  axiom_T-3:
    statement: >
      A manifest that cannot say where its content came from cannot be audited,
      and "deterministic" becomes a claim rather than a record.
    manifest_fields:
      templateId:     "which template seeded this spec (null = none)"
      templateSeeded: "['meta'] — sectionIds filled with no agent dispatched"
    chunk_fields:
      agent:      "'template' — NOT an LLM name"
      agentModel: "'template:genesis'"
    bug_fixed: >
      The first implementation set chunk.agent='template' on a stale in-memory
      object and then returned the freshly-loaded on-disk manifest. The seeded
      chunk reported agent:'ollama' — claiming an LLM produced content no LLM
      touched. Provenance that lies is worse than provenance absent.

  # ── §T-4: §1.2 — an unknown template is an error ────────────────────────────
  axiom_T-4:
    statement: >
      createSpec({ templateId: 'nope' }) THROWS. It does not fall back to an
      unseeded spec, because that spec's manifest would then claim a template it
      never used. Surfaces as HTTP 400 through the API.

  # ── §T-5: Contract before UI ────────────────────────────────────────────────
  api:
    - method: GET
      path:   /api/spec-engine/templates
      action: speceng.templates
      returns: "{ ok, templates: [...] }"
      intent: "The first-page picker renders from THIS, never a hardcoded dropdown."
    - method: POST
      path:   /api/spec-engine/specs
      action: speceng.create
      body:   "{ name, type?, description?, agent?, templateId? }"
  wiring_notes: >
    Three real failures found while wiring this, each invisible from reading:
      1. `listTemplates` was a named export only. idearium/api loads spec-engine
         as `m.default || m`, so the DEFAULT export is the real API surface:
         `se.listTemplates is not a function` at runtime.
      2. The `speceng.templates` action existed with no entry in matchRoute's
         table — a handler no URL could reach.
      3. A scripted edit's guard string matched a different line, so the
         `templateId` manifest field was silently never added.
    All three were found by calling the live endpoint, not by reading the file.
