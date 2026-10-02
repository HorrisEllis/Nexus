spec:
  meta:
    name:        rich-addressable-editable-atlas
    version:     0.1.0-phasemap
    status: >-
      PHASEMAP 2026-09-22. James: "all of this needs to have the
      context, not a list, but all mapped and listed, and
      referenced with ids, nodes, all you can map... rich full
      context and history for each atlas with links embedded
      for everything addressed or referenced. also be able to
      edit the atlas with a editor."
    uuid:        nexus-rich-atlas-v0-0000-2026-0922-001

  phases:

    AT1_full_enumeration_and_clickable_links:
      does: >-
        Replace category/family summaries with every real entity,
        individually addressed by id and file:line, as a clickable
        markdown link resolvable in any IDE/file browser.
      reuse: "atlas-template.md's existing id-addressing rule, extended to file:line links."
      gate: "a reader can click any reference in the atlas and land on the exact real line it describes, not just the right file."
      status: >-
        DONE this pass — proven against clear-glass's real
        registry-components.js: >-
        79 components, individually
        addressed, file:line linked, replacing a stale 11-family/
        67-component summary. Not yet done for any other system's
        atlas.

    AT2_atlas_editor:
      does: >-
        A real tool to edit one atlas section by node id, instead of
        hand-editing the whole markdown file — the same "small surface
        area" principle SMALLEST_UNIT already applies to node files,
        applied to atlas editing.
      reuse: "create-atlas.js's own text-manipulation approach, generalized from whole-file scaffolding to targeted section edits."
      gate: "editing one module's entry updates only that section's text, verified by diffing the file before/after and asserting every other line is byte-identical."
      status: pending — this phasemap's own T1, see below.

    AT3_agent_queryable_atlas:
      does: >-
        Beyond human clicking: an agent should be able to ask "what's
        at id X" and get the atlas's own entry for it directly, not
        need to parse markdown.
      reuse: "registry-api.js's GET /nodes/:type — the same query shape, pointed at atlas sections instead of node files."
      gate: "a query for one real id (e.g. cg.screenQa.detect) returns exactly that entry's context, not the whole file."
      drift: "requires AT1's id-addressing discipline to already be true for the system being queried — an atlas that's still family-summarized has nothing precise to query."

  ordering: "AT1 before AT2 (nothing to edit precisely without real addressing first). AT2 before AT3 (query needs a stable edit boundary to query against)."
