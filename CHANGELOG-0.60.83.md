# 0.60.83 — 2026-10-16

James: "here, use this. what about using cos for the canvas, then each tool a nested compartment? remove it from
idearium also. creating templates for cos and ideariun spec workshop" (with Eravos-merged.zip)

The map is `docs/2026-10-16-canvas-compartments-phasemap.spec`, written before the code.

## His idea, and the coder's reading

The idea is his: COS holds the canvas, and each tool is a nested compartment. It fits what both sides already have.
- COS already nests (`lib/cos-bridge.js` createCompartment with a parentId, and tree()).
- His ERAVOS already keeps "the canvas and the tools … separate". A tool is a sealed folder with a manifest, declared
  ports and declared permissions.

The coder's reading, to confirm: the tool's compartment is the unit Nexus **builds, versions and tests**. The tools still
run together in the one canvas page, because audio has to stay sample-accurate.

## Built (CN1–CN4)

- **COS archetypes**, from his files and assembled each time they are read (as nexus-system is):
  - **eravos-canvas:** his domain-free `canvas/` byte for byte, `schemas/`, `templates/`, his dependency-free build
    scripts (new-tool, index-tools, validate), his test `harness.js` with a `run.html` for each tool's own tests,
    `serve.js` and `index.html`;
  - **eravos-tool** and **eravos-sound-tool:** his tool templates. His `__MARKS__` are filled by his own
    `build/new-tool.mjs` rules: `eravos.<tool>` in music, `eravos.<domain>.<tool>` elsewhere; the author defaults to
    "me";
  - **eravos-domain-music** and **eravos-domain-dataflow:** found needed while building. A sound tool calls
    `S.audio_out`, which his music core defines, so a canvas that gets a music tool gets his real music domain. A sound
    tool outside the music domain is refused, and the refusal says why.
- **`lib/canvas-compartments.js`:**
  - a canvas is a COS compartment;
  - each tool is a **nested** compartment (parentId = the canvas), linked into
    `tools/<domain>/tools/<category>/<tool>/` (a junction on Windows) and recorded as a mount;
  - his own `build/index-tools.mjs` writes the loaders;
  - `canvas.json` lists the canvas's tools with their acceptance lines.
- **Route → command:**
  - routes: `GET/POST /api/canvas`, `GET /api/canvas/:id`, `POST /api/canvas/:id/tools`;
  - commands: `idearium canvas list | new "<name>" | show <canvas> | add-tool <canvas> <domain> <category> <tool-id>
    "<Label>" [--sound]`. Agents get them through `nexus.command`.
  - Events `idearium.canvas.created` and `idearium.canvas.tool.added`, both declared.
- **Spec-workshop templates:**
  - **eravos-canvas**: from his README layout and the canvas/tools boundary;
  - **eravos-tool**: from his tool spec (identity, ports, params, behaviour, needs, packs, acceptance) and the tool
    schema.
  - Every section is a real block, and every line is quoted from his files.

## Not shipped, and why

- His scripts that load Playwright (shots, perf, run.mjs, tool-kit, specs, planned-deps, migrate-tools). Nexus's
  CG-001b fails any file that loads Playwright. Clear Glass drives the canvas here instead.
- His music domain's own test suites. A canvas from the template runs its tools' tests on his harness.

## "remove it from idearium also"

Idearium's code was cleared in 0.60.82; only history comments name it. An ERAVOS repo he imported into his own Idearium
is his data on his machine. `idearium repo archive <uuid>` archives it. Nothing was done to it from here. To confirm
which he meant.

## Also in this release (from 0.60.82's full suite)

- `lib/build-paths.js` classifies the Code tab's code.edit / code.assist call: not a build, the same footing as the
  Agent tab chat (the coder's classification).
- `test-loom-phasemap` counts 15 systems.
- `README.md` regenerated from the atlas.
- **loom's prune** now drops a record whose file lives in a top-level directory that no longer exists. ERAVOS's
  hand-mapped records had stayed in loom's registry, so the atlases still listed its routes. 96 removed, all ERAVOS's.
  The template files under `cos/archetype/eravos-*` are scanned into loom as `nexus-system`'s are (72 components).

## Proof

- `tests/modules/test-canvas-compartments.test.js` 7/7. **CC-10, in Clear Glass:** a canvas made by Nexus, served by
  **his** `serve.js`, loads its nested tools, and **his** harness passes each tool's contract, 12/12. His
  `build/validate.mjs` passes on the generated canvas (CC-03).
- Unchanged and passing: `test-file-tree-plan` 58/58, `test-spec-workshop` 8/8, `test-build-paths` 6/6,
  `test-loom-phasemap` 7/7, `test-loom-map` 19/19, `test-nexus-atlas-refs` 49/49, `test-readme-atlas` 1/1.

## Open

- CN6: a screen for a canvas tree, to place with James.
- To confirm: that a nested compartment means the build unit, not a process per tool; what "remove it from idearium
  also" asks; the template names.
