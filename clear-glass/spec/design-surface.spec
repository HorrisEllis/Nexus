# Design surface — made in the spec workshop (idearium)
# Written 2026-10-10 from docs/2026-10-10-design-surface-phasemap.spec DS0–DS8. To be opened in the workshop
# (nexus/clear-glass → clear-glass/spec) and built through Idearium. Decisions as choices [A] [B] [C] [custom],
# recommendation marked; "chosen:" open until James picks. Nothing here is built yet; the map puts it behind "solid".
spec:
  name: Design surface
  ambition: 4 — novel
  source: "map: docs/2026-10-10-design-surface-phasemap.spec DS0–DS8"
  owner: clear-glass (the surface, the picker) · idearium (the files, the versions) · eravos (components and tools as mods) · cos (native tools run in a compartment)
  status: specced 2026-10-10, not built
  james: >-
    "i want to make a design system for creating and editing different types of graphical interfaces. like open any file
    and edit the ui in real time" · "a ui editor, which has a adapter parser" · "eravos for the editing tools … imagine,
    gnu or image manipulation tools, that can be added with the gui, like its also agnostic" · "what about changing to
    the component registry for the event bus instead of hooking into each other then the ui is a reflection of that"
sections:
  - id: purpose
    title: Purpose
    body: |
      One surface to open any interface file — a page, an SVG, a canvas, an image — and edit it live, with tools that are
      mods wired together through the registry, so a person or an agent assembles a toolbox instead of using one editor.

      Evidence: three palettes today (Idearium's nexus-theme.css, the main UI's, Eravos's); Clear Glass has the ◎ picker
      and the interaction field; Eravos mods carry a module contract (params, hooks, provides) and a wire system that
      republishes one mod's event as another's input; the photo-editor mod exists; loom is a registry of hooks and wires.

  - id: primitives
    title: Primitives
    body: |
      token       (thing)     colour · type · spacing · radius · motion — one file, the others import; an override is named
      module      (thing)     one contract at every size (DS6): {id, parent, children[], params, hooks, provides, requires, permissions}
      adapter     (action)    an interface type = render + map an edit back to its source (html first; svg, eravos canvas, image next)
      tool        (thing)     an Eravos mod declaring accepts / produces as media types (image/png, text/html, an element …)
      wire        (relation)  a registry entry joining one tool's hook to another's input; says its transport (kernel bus | nexus-bus)
      write-back  (action)    static source edited in place; script-built markup proposed to the repo's agent as {element, change, file}

  - id: axioms
    title: Axioms
    body: |
      AX1  One token file; a surface keeps only what is truly its own, named as an override.
      AX2  The registry is the truth for tools and wires; the canvas is drawn from it and holds no state of its own (DS8).
      AX3  A new interface type is one adapter, never a new editor (DS4).
      AX4  Native programs (ImageMagick, ffmpeg, Inkscape/GIMP CLIs) run only inside a COS compartment, batch not live.
      AX5  A tool added from the GUI is a proposal until a trial run proves accepts → produces (gated, SD10).
      AX6  Every action is a command and an agent tool (DS5); an agent's design change comes with a before/after screenshot and its gate verdict.
      AX7  Logical nesting (the doll) is free; a runtime (process, VM) is attached only where isolation is worth it.

  - id: schema
    title: Schema
    body: |
      ui/tokens/nexus.tokens.json        the one token file (+ generated CSS variables per surface)
      eravos mod schema                  + accepts[], produces[] (media types), + parent / children (DS6)
      loom live registry                 tools, hooks, wires — with a runtime store (loom today is rebuilt at build time)
      write-back proposals               the repo's inject proposals (existing), carrying {element, change, file}

      choices — the token format:
        [A] a JSON token file compiled to CSS variables  ← recommended (one source, readable by agents, already the shape eravos and the console use)
        [B] CSS custom properties only — no build step, harder for agents and other renderers (SVG, canvas) to read
        [C] the W3C design-tokens format — a standard, more ceremony
        [custom] ____
      chosen: open

  - id: api
    title: API
    body: |
      Commands (and agent tools): design tokens · design token set <name> <value> · design open <file> ·
      design pick <n> (through the field) · design set <element> <prop> <value> · tool add <schema> · tool wire <a.hook> <b.input>
      Routes: GET/POST /api/design/tokens · POST /api/design/edit {file, element, change} → written or proposed ·
      GET/POST /api/registry/wires (live)

  - id: build_order
    title: Build order
    body: |
      1 DS0 one token file   2 DS1 tokens edited live   3 DS2 pick and edit any page (html adapter, write-back)
      4 DS8 wires as registry entries (a live loom store)   5 DS7 tools as mods (browser tools first)   6 DS3 components as mods
      7 DS4 more adapters (svg, canvas, image)   8 DS6 one module contract nested   9 DS5 the agents design too

      choices — where this starts:
        [A] after Idearium is solid (the map's own order)  ← recommended (it is a second product; the first must work)
        [B] DS0 + DS1 now — small, visible, independent
        [C] DS8 first — the registry change underpins tools and the self-model
        [custom] ____
      chosen: open

  - id: tests
    title: Tests
    body: |
      T1 one token changed re-colours Idearium, the main UI and Eravos   T2 a static page's element restyled and written to its source line
      T3 a script-built element's change arrives as a proposal with its file   T4 a wire added in the canvas is a registry entry, and removing the entry removes the wire
      T5 a crop → filter → export chain edits a PNG; an ImageMagick mod runs in a compartment and feeds the export mod
      All screens proven in Clear Glass (never Playwright).
