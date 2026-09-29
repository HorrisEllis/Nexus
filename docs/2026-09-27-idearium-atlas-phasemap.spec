spec:
  meta:
    name:     idearium-atlas
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.270
    uuid:     nexus-idearium-atlas-phasemap-v1-0000-2026-0927-jamesbrooks-001
    owner:    docs.atlases.idearium · idearium.ui.nexus-atlas · tests.modules.test-nexus-atlas-refs
    status:   built (0.39.270)
    origin: >-
      James, 2026-09-27: "tell me about idearium. agent tabs. expand the atlas if you can. it needs to be solid".

  # ── Mapped before building (docs/CLAUDE.md rule 1) ─────────────────────────
  drift: >-
    None at the start: this map was written before any file below was touched.

  exists:
    - >-
      docs/atlases/idearium-atlas.md — 230 lines from an earlier session: 150 references, 56 not in the tree
      (test-nexus-atlas-refs), placeholder paths in code spans, "not enumerated this session" sections, the 10
      default spec agents stated as current, no account of the 13 repo tabs, the Agent tab only as three
      release notes.
    - >-
      tests/modules/test-nexus-atlas-refs.test.js — renders an atlas with the page's own renderer and resolves every
      reference against the real tree; atlases in its OURS list must have 0 dead references and 0 plain-text code
      spans; the rest are only reported.
    - >-
      docs/atlases/nexus-atlas.md — its idearium section names repo tabs "Home, Idea, Files, Agent, Run and Debug"
      (there are 13, and Run is a menu, not a tab) and its open-items list names idearium-atlas.md as one of the
      two atlases with the most stale references.
  missing:
    - M1 an Idearium atlas written from the code as it is (0.39.269), every reference real.
    - M2 the Agent tab explained end to end — what it is, what one message goes through, every command, every
      setting, what it remembers, where its code goes.
    - M3 nothing stops the Idearium atlas from going stale again.

  invariants:
    I1: every code span in the atlas resolves to a file, directory, system, doc or port in the tree (§1.1) — routes,
        identifiers and env vars are written as plain text, never as code spans.
    I2: every stated number (routes, tabs, lines, tiers, commands, tools) is read from the source, not recalled.
    I3: the superseded atlas is archived, not deleted (§0.3).

  phases:
    - id: A1
      status: built (0.39.270)
      name: archive the old atlas to docs/atlases/_archive/ with a superseded banner
      closes: [M1]
    - id: A2
      status: built (0.39.270)
      name: >-
        write docs/atlases/idearium-atlas.md — what it is · the process · the interface (7 views, 13 repo tabs) ·
        the Agent tab (identity, one message's path, backends, prompt blocks, context, memory, tools, commands,
        injects, the live feed, late replies, settings, stores) · ideas → specs → builds · repos · nexus-self ·
        the API (217 routes by group) · events · stores · specs and tests · what is not built
      closes: [M1, M2]
      depends_on: [A1]
    - id: A3
      status: built (0.39.270)
      name: >-
        lock it — add idearium-atlas.md to test-nexus-atlas-refs' OURS (0 dead references, 0 plain code spans);
        correct the Nexus atlas's idearium paragraph (the 13 tabs) and its open-items line
      closes: [M3]
      depends_on: [A2]
    - id: A4
      status: built (0.39.270)
      name: >-
        release — addendum to idearium/spec/idearium.spec, SPEC-REGISTRY, lib/version.js 0.39.270, CHANGELOG,
        one nexus.zip without data/**
      depends_on: [A3]
