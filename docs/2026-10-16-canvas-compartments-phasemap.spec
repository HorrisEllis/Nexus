# docs/2026-10-16-canvas-compartments-phasemap.spec
# The canvas as a COS compartment, each tool a nested compartment; COS and spec-workshop templates from his ERAVOS.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.

origin:
  date: 2026-10-16
  james: >-
    "here, use this. what about using cos for the canvas, then each tool a nested compartment?
    remove it from idearium also.
    creating templates for cos and ideariun spec workshop"
  attached: >-
    Eravos-merged.zip (1,341 files, 20 MB), the standalone ERAVOS. It has a domain-free canvas/ (23 files), tools/
    (874 files: 58 tools across six domains), schemas/ (tool, pack, mode, category, domain), and templates/
    (copy-to-start folders for a tool, a sound tool, a pack, a mode, a category, a domain). Read from the zip, not from
    memory. His README: "the canvas and the tools are separate".
  context: >-
    It arrived right after 0.60.82, where he had ERAVOS deleted from Nexus ("Delete it outright."). The idea is his:
    COS holds the canvas, and each tool is a nested compartment. The coder's part is the reading below and the code.

reading:
  coder: >-
    Yes, with one boundary.
    Why it fits:
      - COS already nests. lib/cos-bridge.js createCompartment({ parentId }) and tree(); the nexus repo uses exactly
        this shape, one parent and a child per system (idearium/repo/nexus-self.js).
      - A tool in his zip is already a sealed unit: its own folder, a tool.json naming its needs and permissions, and an
        engine whose declared ports are its only way in or out. That is a compartment's contract.
    The boundary: a COS compartment is also a process sandbox (watchdog, resources, network). Audio tools must run
    together in the canvas page's audio thread, sample-accurate. So the tool compartment is the unit Nexus BUILDS,
    VERSIONS, TESTS and PERMISSIONS. At run time the canvas page still loads every tool. The tool's folder is linked
    into the canvas's tools/ tree (a directory junction on Windows, a symlink elsewhere), so his own serve.js serves it
    unchanged. His build/index-tools.mjs rule (loaders generated from the folders) is kept: Nexus writes the same
    loaders.
  to_confirm:
    - "that 'nested compartment' means the build/manage unit, not a separate running process per tool"
    - >-
      "remove it from idearium also": Idearium's code was cleared in 0.60.82 (only history comments remain). Read as
      his own Idearium on his machine, where an ERAVOS repo he imported is his data: `idearium repo archive <uuid>`
      archives it (archive, not delete; his call either way). Or, read: do not import ERAVOS into Idearium; build it
      from these templates instead.
    - "the template names eravos-canvas / eravos-tool keep his schema's own names (eravos.tool/1); a neutral name is a rename away"

phases:
  CN1_canvas_archetype:
    status: BUILT 0.60.104 (tests/modules/test-canvas-compartments.test.js CC-01)
    systems: [cos]
    files: [cos/archetype/eravos-canvas/ (new), cos/archetype/eravos-canvas.js (new), cos/archetype/registry.js]
    does: >-
      The COS archetype eravos-canvas: his domain-free canvas/ verbatim, schemas/, the copy-to-start templates
      (category, domain, mode, pack), serve.js and index.html. It has an empty tools/index.js, and a README naming the
      layout in his words. It is assembled from its folder each time it is read, as nexus-system is. His code is not
      rewritten.

  CN2_tool_archetypes:
    status: BUILT 0.60.104 (CC-01, CC-02)
    systems: [cos, core]
    files: [cos/archetype/eravos-tool/ (new), cos/archetype/eravos-sound-tool/ (new), cos/archetype/eravos-tool.js (new), cos/archetype/registry.js, lib/file-tree-plan.js]
    does: >-
      The COS archetypes eravos-tool and eravos-sound-tool, from templates/tool and templates/tool-sound. His __TOOL__,
      __LABEL__, __ID__, __DOMAIN__ and __CATEGORY__ markers become {{slug}}, {{name}}, {{toolId}}, {{domain}} and
      {{category}}, in paths and contents. lib/file-tree-plan.js fromCosTemplate takes extra vars, with defaults
      domain/category "custom" and toolId "<domain>.<slug>".

  CN3_nested_compartments:
    status: BUILT 0.60.104 backend, route, commands (CC-03, CC-04, CC-06, CC-10); UI is CN6, open
    systems: [core, cos, idearium]
    files: [lib/canvas-compartments.js (new), idearium/api/index.js, idearium/cli/route-commands.js]
    does: >-
      create({ name, tools: [{ slug, label, domain, category, sound }] }) gives a parent compartment laid out from
      eravos-canvas, and per tool a child compartment (parentId = the canvas) laid out from eravos-tool. Each child's
      root is linked into the canvas at tools/<domain>/tools/<category>/<slug>/ and recorded as a mount (role 'tool').
      The loaders are generated: tools/index.js (the domain list), tools/<domain>/index.js, domain.json and domain.js
      (a mode), and tools/<domain>/tools/index.js, which follows his index-tools rule. addTool() adds one later;
      tree() reads it back. Each child's intent carries the tool's acceptance lines. Routes: POST /api/canvas, GET
      /api/canvas/:id, POST /api/canvas/:id/tools. Commands: canvas new | canvas show | canvas add-tool. The UI is
      deferred to CN6 and said so.

  CN4_workshop_templates:
    status: BUILT 0.60.104 (CC-05)
    systems: [idearium]
    files: [idearium/spec-engine/templates/eravos-canvas.spec (new), idearium/spec-engine/templates/eravos-tool.spec (new), idearium/spec-engine/templates.js]
    does: >-
      Two spec-workshop templates, seeded with `## SECTION: <id>` markers into the real blocks (meta, purpose, schema,
      api, events, integration, failure_modes, build_order, tests). The seed text comes from his files:
      - eravos-tool from his __TOOL__.spec (identity, ports, params, behaviour, needs, packs, acceptance) and
        tool.schema.json;
      - eravos-canvas from his README layout and the canvas/tools boundary.
      Nothing is invented. Each seed names its source.

  CN5_idearium:
    status: DONE in code by 0.60.82; his own ERAVOS repo on his machine is his data (to confirm)
    does: "Nothing more in code (0.60.82 cleared it). His Idearium's own ERAVOS repo is his data: the command to archive it is named, and nothing is done to it from here."

  CN6_canvas_screen:
    status: OPEN
    does: "A screen for a canvas tree: the canvas, its tools as nested compartments, add a tool. To place with James (COS's own page or a repo tab)."

build_order: [CN2 (vars), CN1, CN2, CN4, CN3, CN6]

## ADDENDUM 2026-10-16 (b) - built (0.60.104), and what the build found

- Built to the plan above:
  - the COS archetypes eravos-canvas, eravos-tool and eravos-sound-tool;
  - lib/canvas-compartments.js, the /api/canvas routes and the `canvas` commands;
  - the spec-workshop templates eravos-canvas and eravos-tool.
- Found while building: a sound tool calls S.audio_out, which his music domain's core defines (tools/music/core,
  sdk-music.js). A generated empty music domain could not run one: the tool never defined itself in the browser.
  - So his domains with a shared core became archetypes too: eravos-domain-music (core, data, content, domain.js,
    index.js; 180 files) and eravos-domain-dataflow ("the shared language other domains meet in").
  - A canvas that gets a tool in one of those domains gets his real domain.
  - A sound tool outside the music domain is refused, and the refusal says why.
  - This matches his own layout (shared engines per domain, tools beneath), so the nesting is
    canvas → domain → tools in the folder tree. Only tools are separate compartments (his words: "each tool a nested
    compartment"); domains live in the canvas compartment. To confirm.
- His scripts that load Playwright (shots, perf, run.mjs, tool-kit, specs, planned-deps, migrate-tools) are not shipped:
  Nexus's CG-001b fails any file that loads Playwright. The canvas carries new-tool, index-tools and validate, which
  use Node built-ins only.
- His tests/run.html also ran the music domain's own suites. A canvas made from the template carries his harness.js and
  a run.html that runs each tool's own tests.
- Proof (CC-10): a canvas made by Nexus is served by his serve.js; it loads its nested tools, and his harness runs
  each tool's contract. 12/12 passed in Clear Glass. His build/validate.mjs passes on the generated canvas (CC-03).
- Open: CN6 (the screen), and the to_confirm lines above.
