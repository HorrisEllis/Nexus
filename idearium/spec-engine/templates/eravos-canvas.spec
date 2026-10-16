// ERAVOS CANVAS TEMPLATE v1.0.0
// UUID: idearium-template-eravos-canvas-v1-0000-2026-1016-jamesbrooks-001
// §0.60.83 CN4 — James, 2026-10-16: "what about using cos for the canvas, then each tool a nested compartment?" ·
// "creating templates for cos and ideariun spec workshop". Source, quoted not invented: his ERAVOS README.md (the
// layout), canvas/scripts.js and tools/index.js (how the canvas finds its tools), build/new-tool.mjs and
// build/index-tools.mjs (how a tool is added). The canvas is COS archetype eravos-canvas; each tool a nested compartment.

version 1.0.0

## SECTION: meta

# Meta — ERAVOS canvas

- Laid out from the COS archetype eravos-canvas: canvas/ (kernel, runtime, index.html, scripts.js), tools/, schemas/,
  templates/, build/, tests/, serve.js, index.html.
- One COS compartment for the canvas; one nested compartment per tool (parentId = the canvas).

## SECTION: purpose

## Purpose & Intent

"A canvas of living instruments" — and, his README: "the canvas and the tools are separate". The canvas is domain-free:
"Nothing in canvas/ names a domain". Everything you drag onto it is a tool, one folder per domain.

## SECTION: schema

## Data Schema

The formats both sides agree on, in schemas/: tool (eravos.tool/1), pack, mode, category, domain.
canvas.json (Nexus): the canvas's tools — id, domain, category, compartment, where it is linked, its acceptance lines.

## SECTION: api

## Layout

    canvas/      the empty canvas — domain-free: kernel/, runtime/, index.html, scripts.js
    tools/       one folder per domain; inside a domain: tools/<category>/<tool>/ (one tool each)
    schemas/     the formats both sides agree on (tool, pack, mode, category, domain)
    templates/   copy-to-start folders for a new tool, pack, mode, category, domain
    build/       new-tool · index-tools · validate
"The canvas finds the tools through one setting: canvas/scripts.js sets ERAVOS_TOOLS (default ../tools/) and loads
tools/index.js last."

## SECTION: integration

## Integration Points

- COS: the canvas compartment, and a child compartment per tool, linked into tools/<domain>/tools/<category>/<tool>/ and
  recorded as a mount (role tool). Adding a tool: idearium canvas add-tool, or node build/new-tool.mjs on the canvas.
- Serving: serve.js serves the folder at http://localhost:4747 ("browsers only allow MIDI controllers, the microphone
  and dependable saving for pages served from an address like localhost").

## SECTION: build_order

## Build Order

1. the canvas (kernel → runtime, the order in canvas/scripts.js: "order = bottom-up") · 2. a domain (domain.json,
domain.js, index.js) · 3. each tool (its own compartment) · 4. node build/index-tools.mjs · 5. node build/validate.mjs ·
6. tests/run.html (each tool's own tests).

## SECTION: tests

## Tests

- every tool passes its own contract (tests/harness.js TH.toolContract)
- the canvas stays domain-free: nothing in canvas/ names a domain
- build/validate.mjs: every manifest valid against schemas/
