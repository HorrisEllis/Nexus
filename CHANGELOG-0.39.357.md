# 0.39.357 — 2026-10-05

James, asked "Should the workshop's start page become the RS5 "photoshop style" template picker?": "yes with a custom or manual."
James (RS5, as mapped): "opens a pick template screen like photoshop does when you first open it. with a custom or manual option with a plus sign. then you pick a template from the list, including all the quick spec options"

RS5 is built (`docs/2026-10-05-spec-workshop-rebuild-phasemap.spec` 1.1.0). It was mapped as its own screen; it's built as the workshop's start page, and what the WS7 start offered became the picker's START FROM.

## The picker (`idearium/ui/js/template-picker.js`)
It's laid out like a new-document dialog.
- **Tabs on the left:** ALL · DOCUMENT · COS ARCHETYPES · COS BLUEPRINTS · SAVED, each with its count. The tab you last used is remembered.
- **The grid.** Each template is drawn as a page.
  - **+ CUSTOM / MANUAL** comes first, is selected, and is always shown. It's a blank document in manual mode: you write, and the agent only points at what's missing.
  - **Then every template the quick spec offers:**
    - the 15 spec-document templates, genesis first and marked DEFAULT; a document's page lights a line for each part it fills
    - the 18 COS archetypes and 11 COS blueprints; their page shows the starting files as a tree
    - your saved templates
  - There's a filter. Arrow keys move the selection; **double-click or Enter creates**.
- **The details on the right:**
  - the title (WHAT ARE YOU SPECCING?)
  - the template's name and what it is
  - **PARTS:** the 11 parts, each shown as filled, laid out empty, or not in the template. Hover a part to see its first lines.
  - a COS template's starting files, by layer
  - **START FROM:** nothing, an idea, a library document, or a repo's spec. The source sheet sets this, and × clears it.
  - **MODE:** manual, assisted or stretched (custom defaults to manual, a template to assisted)
  - **CREATE**
- **A promoted idea** (`?from=idea:…`) now opens the picker with the idea as START FROM, not a blank document. A library document or a repo's spec still opens straight into the writer.

## What a template puts in the workshop
`POST /api/workshop {template, mode}`
- **A document template:** its seeded parts, using spec-engine's own seed parser (the one `createSpec` uses), plus the MINIMUM parts it doesn't fill, laid out empty. Nothing is invented for those.
- **A COS template:** its starting files go into the Build Order part. **The code the pipeline builds does not yet start from those files**; the New Spec modal's file-tree path does. The card says so.
- **A saved template:** its sections, as saved.
- **What the template doesn't overwrite:** a part the source already lays out. For example, an idea's Purpose isn't laid out twice.
- **With no title,** the template's name is used.

## Templates you keep
- **SAVE AS TEMPLATE** in the writer saves the spec's sections as a template.
  - Opened from a saved template, keeping its name saves **its next version**, and the old one is kept. A new name makes a new template.
- **REMOVE** on a saved template archives it. Every version is kept; it's just no longer offered.
- **The built-in templates are files in the codebase** (`idearium/spec-engine/templates.js`, `cos/`), so the page can't remove them and the server refuses. To edit one, open it, change it, and save it as a template.

## Found and fixed on the way
- `makeSession` dropped a section's `part`, so a part given at creation was lost.
- Idearium's router doesn't decode path params, so `saved%3A…` needed decoding in the remove route, as other routes do.

## Where it differs from the map
- **RS5 depended on RS4** (the pipeline on WARP 2). The picker doesn't need RS4, and I didn't wait for it.
- **The preview uses the spec engine's 11 blocks.** RS3's id-keyed document isn't built, so block ids can't be custom yet.

## Proof
- **`tests/modules/test-template-picker.test.js`, 3/3:**
  - **TP-01, the lib:** seeds; the MINIMUM laid out; nothing over the source; CUSTOM is nothing; COS files go to Build Order; saved templates are verbatim; v1 → v2; archived templates are hidden with their rows kept.
  - **TP-02, idearium's real router:** every spec-document template and every COS template is listed and previewed on the 11 parts; create with a template and a mode; idea plus template; save v1 → v2; a built-in returns 400; a removed template is archived with both versions kept; the routes are in the contract.
  - **TP-03, Clear Glass driving the real page against the real router:**
    - + CUSTOM / MANUAL first and selected (manual); genesis DEFAULT, previewed
    - the archetype tab and its files
    - filter, then double-click to create from event-system
    - SAVE AS TEMPLATE, then SAVED V1; open it, save again, V2 OF 2
    - REMOVE
    - CUSTOM by Enter is blank and manual
    - `?from=idea` puts the idea in START FROM; genesis plus STRETCHED opens stretched with the idea first
    - START FROM picked and cleared
    - no lowercase tooltip, nothing threw
- **Clear Glass gains `page.dblclick(sel)`:** real input, a second press with clickCount 2.
- **Also green:**
  - test-workshop-full 10/10, unchanged: Enter on the title with CUSTOM is the old blank spec
  - test-spec-workshop 8
  - test-architect 8
  - test-synthesis-zoom-versionium 6
  - test-spatial-void 7
  - test-route-contracts 4
  - version-sync-and-registry 30
  - test-agent-live 4

## Versions
- idearium 4.33.0 (MINOR)
- clear-glass 3.24.0 (MINOR)
