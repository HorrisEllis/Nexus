spec:
  meta:
    name:     design-surface
    version:  1.0.0
    date:     2026-10-10
    release:  0.56.0 (base)
    uuid:     nexus-design-surface-phasemap-v1-0000-2026-1010-jamesbrooks-001
    owner:    clear-glass (the surface, the picker) · idearium (the files, the versions) · eravos (components as mods)
    status:   "MAPPED 2026-10-10, nothing built — behind docs/2026-10-10-idearium-solid-phasemap.spec (solid first)"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §1.1 nothing pretends, §3.3 map before build, §8.6 reuse before build
    origin: >
      James, 2026-10-10: "like i want to make a design system for creating and editing different types of graphical
      interfaces. like open any file and edit the ui in real time? or something?"
  exists_already:
    - "tokens, three sets: idearium/ui/css/nexus-theme.css (Idearium and its settings), ui/themes/nexus-dark.css + nexus-light.css (the main UI), eravos/ui/index.html's own DESIGN TOKENS block — three palettes, no one source"
    - "components with live parameters: Eravos mods (eravos/ui/mods/*/schema/schema.json — params, hooks, provides; mod-factory.js builds the UI from the schema, engine first)"
    - "picking an element on any page: Clear Glass's ◎ picker (guardian/lib/selector-map.js saves the pick)"
    - "seeing and driving any page: clear-glass/src/driver/glass.js — screenshot, inspect, click, evaluate"
    - "every write versioned and undoable: the repo layer → versionium (a restore takes a snapshot first)"
    - "spec → code: emerge (the SEAM compiler, .emerge files)"
  pushback: >
    "Open any file and edit the UI in real time" holds for web interfaces — every Nexus UI is HTML, CSS and JS — and
    for whatever has a renderer Nexus can run (an Eravos mod, an SVG, an image through the photo-editor mod). It does not
    hold for any file: a native app or another framework's UI needs its own adapter, one per kind, and that is the
    domain-agnostic part — an interface type is a renderer plus an adapter, added one at a time. The hard part is not
    the live edit, it is the write-back: a change made on the rendered page has to land in the source that produced it.
    Static HTML and CSS map back directly; markup a script builds from template strings (most of Idearium) maps back
    only through the script, so there the edit is proposed to the agent with the element, the change and the file —
    never silently patched into the wrong place.
  phases:
    DS0_one_token_source:
      layer: library
      status: "OPEN"
      james: '"a design system"'
      depends_on: []
      files: [idearium/ui/css/nexus-theme.css, ui/themes/nexus-dark.css, ui/themes/nexus-light.css, eravos/ui/index.html]
      does: "The three palettes become one token file (colour, type, spacing, radius, motion) the others import; each surface keeps only what is truly its own, named as an override."
      proof: "changing one token re-colours Idearium, the main UI and Eravos"
    DS1_tokens_edited_live:
      layer: ui
      status: "OPEN"
      james: '"edit the ui in real time"'
      depends_on: [DS0_one_token_source]
      files: []
      does: "A token panel: change a value, every open Nexus page updates at once (CSS variables, no reload); save writes the token file through the repo layer, versioned."
      proof: "a colour changed in the panel shows on two open pages in under a second; the save is a commit"
    DS2_pick_and_edit_any_page:
      layer: ui
      status: "OPEN"
      james: '"open any file and edit the ui in real time"'
      depends_on: [DS1_tokens_edited_live]
      files: [clear-glass/src/driver/glass.js, guardian/lib/selector-map.js]
      does: >-
        In Clear Glass: open a page (a repo's HTML file, or any Nexus surface), pick an element with ◎, edit its text,
        its styles and which tokens it uses, live. Write-back: static HTML/CSS is written to its source line; script-built
        markup is proposed to the repo's agent as {element, change, file} and lands as a reviewed change.
      proof: "an element in a repo's static page re-styled live and written back; one in Idearium proposed to the agent with its file"
    DS3_components_are_mods:
      layer: library
      status: "OPEN"
      james: '"for creating and editing different types of graphical interfaces"'
      depends_on: [DS0_one_token_source]
      files: [eravos/ui/runtime/mod-factory.js, eravos/ui/mods]
      does: "A component library in the Eravos mod shape (schema: params, hooks, provides), styled only by tokens, placeable on a canvas and exportable as HTML for a repo."
      proof: "a button and a panel built as mods, re-themed by a token change, exported into a repo"
    DS4_interface_types_by_adapter:
      layer: library
      status: "OPEN"
      james: '"different types of graphical interfaces"'
      depends_on: [DS2_pick_and_edit_any_page]
      files: []
      does: "An interface type = a renderer + an adapter (how to show it, how to map an edit back). HTML first; then SVG, an Eravos canvas, images (the photo-editor mod); each new kind is one adapter, not a new editor."
      proof: "an SVG opened, an element picked and changed, written back"
    DS5_the_agents_design_too:
      layer: backend
      status: "OPEN"
      james: '"like with guardian, we can make ai assistance."'
      depends_on: [DS2_pick_and_edit_any_page]
      files: [lib/agent-tools/index.js]
      does: "Every action of DS1–DS4 is a command and a tool, so an agent can restyle, build a component or answer 'make this calmer' — and its result is seen (a screenshot) and gated (SD10) before it is offered."
      proof: "an agent asked to restyle a panel proposes a change with a before/after screenshot and its gate verdict"
    DS6_one_module_contract_nested:
      layer: library
      status: "OPEN"
      james: '"yeah so a ui editor, which has a adapter parser. maybe using the cos ui as a template. like cos can be a reusable system for anything. like a factory. like each module is a compartment, then each module is a nestled compartment. like a russian nesting doll, like analysis."'
      depends_on: []
      files: [eravos/ui/runtime/mod-factory.js, cos/compartment, lib/nexus-self/systems.js]
      does: >-
        Found: nesting exists one level deep — nexus → its 16 systems, each a repo compartment (cos as the 16th, SY2) —
        and nowhere in cos/ is a compartment the parent of another. Eravos mods already carry a module contract (schema:
        params, hooks, provides, requires, permissions). One contract for every module at every size — a UI component, a
        code module, a system — with a parent and children, so a module opens into its parts, and the same analysis (its
        primitives, its contract, its versions) runs at every level. The UI editor's adapter parses a file into this tree
        of modules; editing one edits that module and only it.
      pushback: >-
        A COS compartment today is an isolation boundary that can carry a VM — the desktop is a whole machine. Every
        module as a VM would cost a machine per button. The doll is logical (own state, schema, events, versions, a
        parent); a runtime (a process, a VM) is attached only at the levels that need isolation — a repo, a system.
        And "the cos ui as a template": the COS desktop window is a viewer of the VM's screen, not a component model;
        the template to reuse is the compartment's contract, which is what DS6 makes one shape.
      proof: "a repo opens into its systems, a system into its modules, a module into its components — each the same contract; a change in a component is versioned at its level and seen at every level above"
