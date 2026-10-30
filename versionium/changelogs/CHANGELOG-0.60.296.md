# 0.60.296 — .pipeline node files; pipelines pick macros and workflows from Clear Glass and node files; the Fiverr gig as a pipeline; the chip on dropdowns

James, 2026-10-30:
> "what version are we on? should we rebuild the fiverr plugin? can you export the .macro and .automation nodes to the .pipeline node and
> import into the pipeline section of clearglass? ... when it shows the black autfill chip, can you make that work for drop down also? that
> way the pipeline feature can choose macros and automation nodes from clearglass and node files. these are meant to be actual persistent
> files in the backend. all nodes are supposed to be physcial files for each system."

## Grounded first

- **There was no Fiverr plugin.** "The Fiverr plugin" was the Fiverr node files Clear Glass bundles (two `.macro`, three `.workflow`),
  plus the bridge's gig fill.
- **Pipelines were JSON records**, and `.pipeline` was not a node type.
- **The chip** covered inputs and native selects only. A select was filled by its hidden value, and Fiverr's dropdowns got no chip.

## Built

- **PN1, `.pipeline` is a NEXUS node type** (`lib/node-schemas/schema.pipeline`).
  - A pipeline exports with the macros, workflows and pipelines its tasks run bundled, so the file imports and runs on another machine.
  - It imports back with each task pointed at what came in. Same macro: reused. A name taken by a different one: renamed.
  - The node library lists `.pipeline` files beside `.macro` and `.workflow`.
- **PN2, every pipeline is its own `.pipeline` file on disk**, readable and editable.
  - A JSON pipeline from before is rewritten as one, with the JSON moved to `_archive`.
  - Each save is recorded in Versionium (§17.12).
  - New routes: `/automation/pipelines/:id/node` and `…/node/save`, plus `.pipeline` import.
  - New commands: `pipeline export <id>` and `pipeline import <file>`.
- **PN3, the Pipelines editor.** A task's macro, workflow or pipeline is chosen from a list:
  - Clear Glass's macros;
  - the workflows and pipelines;
  - the node files (📄). A file picked is imported first, and the task then uses it.

  Each pipeline has **Export**, and the section has **Import**.
- **PN4, the Fiverr gig as a pipeline** (`clear-glass/automation/nodes/fiverr-gig.pipeline`, for https://www.fiverr.com):
  1. Overview: his choose-category macro, gated on the page showing the subcategory.
  2. Wait while he presses Save & Continue, which stays his click.
  3. Scope & Pricing: his workflow, with the choose-delivery macro.

  It is seeded into the library once; his edits stay his. `scripts/build-fiverr-pipeline.js` rebuilds it after its nodes are edited.
- **AF6, the black chip on dropdowns.**
  - **Which dropdowns:** on Fiverr, SELECT A CATEGORY, SELECT A SUBCATEGORY, and DELIVERY TIME and Revisions per package (the gig's
    value); anywhere, a `role=combobox` dropdown its label names (the profile's value, by the same matcher).
  - **Filling:** a click chooses the option through the driver (paced, ErosmancerOS when wired, read back). A native `<select>` is
    chosen by the text it shows. A text box is typed by the driver.

## Found and fixed on the way

The workflow engine's store is not sandboxed: it writes to the real `data/`. The Fiverr pipeline's build script and this release's test now
run the engine on a temporary folder of their own.

## Proof

`tests/modules/test-pipeline-nodes.test.js` passes 5/5:
- **PN-01:** export with what it runs bundled; import; it runs.
- **PN-02:** a pipeline is a `.pipeline` file; old JSON is migrated and archived.
- **PN-03, in Clear Glass:** the editor lists macros, workflows and node files; a node file picked is imported; Export and Import work.
- **PN-04:** the bundled Fiverr pipeline parses, validates and imports with its macros and workflow.
- **AF-06, in Clear Glass:** the dropdowns are marked for the chip; the chip chooses the category.

Also green:
- automation-v2 18/18;
- automation-engine 16/16;
- automation-nodes 8/8;
- test-pipelines 6/6;
- test-pipeline-gates 7/7;
- the autofill chip suites;
- the Fiverr suites;
- test-about-and-nodes 4/4.

The bundled node list in AN-02 and NODE-05's message changed with this release, and their tests were updated.
