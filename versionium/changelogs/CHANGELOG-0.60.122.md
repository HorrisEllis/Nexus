# 0.60.122 — 2026-10-17

James: "the ui editor is for editing uis, whether its electron, html, etc. can pull from outside sources but we need a full
editor like your design feature, or any of those you listed. like full enterprise grade" · "always make effective use of
what you already have."

UE0 + UE1 of `docs/2026-10-10-design-surface-phasemap.spec` (addendum 2026-10-17).

## The engine: an outside source, checked (UE0)

- **GrapesJS 0.23.8**, a full web-builder framework: canvas, layers, style manager, element settings (traits), blocks,
  device preview, undo and redo, code view, a plugin API.
- **Licence:** BSD-3-Clause, per npm and the LICENSE file in the package. The LICENSE is kept beside the engine in
  `idearium/ui/vendor/grapesjs/`.
- **Offline:** Idearium serves it itself (a new `/vendor/` static path). No CDN at runtime.
- **Not chosen:**
  - Onlook (Apache-2.0) is a desktop app for React, not an engine to embed.
  - Craft.js and Penpot: their licences were not confirmed.

## Open, edit, save a repo's page (UE1)

- **`idearium/ui/ui-editor.html`** opens a repo's HTML file, with its local stylesheets, in the full editor. The Code tab
  has an "edit UI" button on any open `.html` file.
- **The page's own stylesheets are never rewritten.** They load into the canvas as they are. What you change in the editor
  is kept in one marked `<style data-nexus-ui-editor>` in the page's head, and a later save replaces that block rather
  than adding another. So a save never drops a CSS rule the editor did not understand.
- **Only the body is replaced.** Everything outside `<body>…</body>` is kept byte for byte (`js/ui-editor-doc.js`).
- **Save** writes through `POST /api/repos/:uuid/file`, the one write path, so every save is a version and can be undone.
- **A page that builds its markup from script** opens, but cannot be saved over, because the save would erase what the
  script makes. The page says so. Its edits going to the agent instead is UE2, not built.

## Scope, said

- Electron's UIs are web pages, so this one adapter covers Electron, Idearium, Clear Glass's renderer and any repo's HTML.
- A native toolkit (Qt, WinForms, SwiftUI) needs its own adapter; it is not promised.
- Live editing of a running page (UE3), design tokens (UE4), the agents using the editor (UE5) and more adapters (UE6)
  are open.

## Proof

- `tests/modules/test-ui-editor.test.js` 9/9.
  - UE-01..05: the round trip, run as plain functions.
  - UE-10..13: driven in Clear Glass on the real page and the vendored engine. A page opens with its stylesheet; an element
    is restyled and a button added; Save writes the page back with its head kept, the edits in the marked block and the
    stylesheet untouched; a page whose markup is built by script cannot be saved over.
- `test-code-tab` 16/16, `test-code-dock` 10/10, `test-loom-map` 19/19.
