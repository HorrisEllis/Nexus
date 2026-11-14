# Handoff, 2026-11-14: the pipeline editor, BrainOS's backend into COS, RAID as the hub

Main is at 0.60.534. Everything below is merged.

## His words today (verbatim, in order)
- "can we make a spec or some formal document for the pipeline, im sick of trying to put it into words."
- "right tabs yes, left tabs, absolutely not. the rest of those tabs can be in the cos ui automation tab."
- "no the field/workshop would be an extensive editor for gates and steps. all of the pipeline and workflow automation, systems, commands,
  all of it, everything, migrating brainos backed not the ui its bad the ui and scrapping it"
- "okay but the pipeline runs in the canvas. the workshop only edits one gate or step at a time"
- "okay now show the canvas. thats the workshop. okay now remove any noise. less overwhelm but same amount of power and leverage."
- "better but the tabs slide out from the side like ideariums ui."
- "okay. thats more like it. and this lives in the cos ui when you click edit pipeline. also can edit it like clearglass' settings for
  automation. like the pipelines are agnostic."
- "yes and orchastrator, and autopilot are supposed to migrate to the super viser"
- "clearglass needs to have its own inside its own system. like maybe make raid the beginning step in it all. every system routes through
  it. the hub. i want the pipeline doing all of the work through it." Then: "dont worry about clearglass right now thougnh".

## Decided and recorded
- **The pipeline spec:** `cos/spec/pipeline.spec`. It compiles in kg-builder at full depth and is registered in `docs/SPEC-REGISTRY.spec`.
  - It holds the glossary, lifecycle 1–9, rules PL-001..PL-010, and modules MOD-PL-WORKSHOP / ORCHESTRATE / LENSES / SURFACE.
  - Addenda (a)–(f) hold his calls above, in order.
- **The approved look:** the canvas from preview 11, plus the Workshop from preview 9.
  - **The canvas:** a quiet ERAVOS canvas.
    - A top bar with ＋ Add and ⋯ Options only.
    - One run window.
    - Compartments shown by name, owning system and status.
    - Gates as diamonds on the wires.
    - Right tabs only; each tab slides out as a drawer.
    - The canvas holds and runs the whole pipeline.
  - **The Workshop:** double-click a step or gate and it opens over the canvas. It edits only that one item, in full: layers, conditions or
    bricks, outcomes, properties, dry-run samples, history and events.
  - **Where they open:** "Edit pipeline" in COS's UI (`cos/ui/automation`).
  - **Previews:** in `cos/ui/pipeline-editor/`. He rejected 1–3, 5 and 8; preview 9 is the Workshop on a gate, preview 11 the canvas.
- **Left tabs:** the left-hand tabs (pipeline, RAID, events, emerge, debug, frameworks, gaps) become views in COS's Automation tab
  (MOD-PL-LENSES).
- **Pipelines are agnostic:** one `.pipeline` file owned by COS. It is edited on the canvas, in Clear Glass › Settings › Pipelines, or from
  the CLI, always through COS's routes.
- **BrainOS:** its backend migrates; its UI (`lib/ui/brainos`, `lib/ui/brainos-float`) is scrapped once the Workshop covers it.

## Built: 0.60.534, SW5i slice a (`docs/2026-11-13-sovereign-and-wired-phasemap.spec`, expands AE6 slice b)
- **What moved:** the automation engine (BrainOS's backend) went from `lib/` to `cos/automation/` by git mv: `lib/automation/*` (11 files),
  `automation-nodes.js` → `nodes.js`, `automation-registry.js` → `registry.js`.
- **The old paths:** each is a one-line forwarder that names its new home. COS's door and pipeline load from `cos/automation/`.
- **Proof:** `test-cos-automation-home` passes 3/3, and the nine automation suites re-run after the move pass unchanged (104 tests).
- **The ledger:** SW5i is logged as written and built, with a note on AE6.

## Open, in order
1. **RAID as the hub (his, to confirm the reading before recording it in a spec).** The coder's reading:
   - every request starts at RAID;
   - every system routes through it;
   - the pipeline does all its work through RAID, with RAID as step one of every pipeline.

   Related: RAID moves into COS (CS11, his "moves into cos. i feel like." 2026-11-13) and SW5b. Check
   `docs/2026-10-23-cos-spine-phasemap.spec` CS11 and RD9 before writing anything new.
2. **The orchestrator and autopilot into COS's supervisor.** Already mapped: SW5, SW5a–SW5g and SW5h_the_orchestrator_retired in the
   sovereign-and-wired map.
   - SW5 depends on SW1 (each system its own map), which is open.
   - SW5a (autopilot's six duties into cos/manager/duties.js) is the smallest next piece.
3. **The canvas in COS** ("Edit pipeline" opens preview 11, wired to real runs): MOD-PL-SURFACE. Order: backend → route → command row →
   UI; tested in Clear Glass.
4. **The Workshop on one gate, then one step:** MOD-PL-WORKSHOP. Its palette is `cos/automation/steps.js` (28 browser actions, operators),
   the 7 gate types in `cos/pipeline/types/`, and the triggers.
5. **SW5i slice b: Clear Glass** stops running its own copy of the engine and reaches COS by route.
   - Its four callers: `clear-glass/src/mesh/agent-mesh.js`, `src/main/index.js`, `src/ipc/bridge.js`, `src/macros/live-recording.js`.
   - **Waits:** his "dont worry about clearglass right now".
   - **To ask him:** his "clearglass needs to have its own inside its own system". Two readings:
     - (a) Clear Glass keeps its own engine inside clear-glass/;
     - (b) the engine is COS's and Clear Glass owns only its browser actions, which COS calls by route.
6. **SW5i slice c:** retire the lib/ forwarders once nothing names them. Then BrainOS's UI is scrapped (its own phase).

## Still unanswered from earlier sessions
- The Ollama fixes from his Idearium crash log: the pulse watched under the wrong name; a missing qwen2.5-coder:7b.
- Mapping his chunking, scaling and thermal ideas into CP6.
- SW_R2 (bundles), SW7_R1 (the component store), RD9_R1 (act at once or hold), RAID approving proposals.

## Notes for the next coder
- The phase id SW5h was already taken (SW5h_the_orchestrator_retired). The new phase is SW5i.
- `phase-ledger.cjs covers` did not name AE6 for the engine's files. Grep the maps for the target folder too before writing a phase.
- Run a test file on its own as `node tests/modules/<file>`. A bash loop that only kept a tail of each output showed nothing and nearly
  passed for "no output".
- He could not attach his PC: the computer "Idonotcare" does not offer its folders (nexus, COS, nexus-0.60.356) to cloud sessions. The likely
  fix is updating the Claude app on Windows.

## ADDENDUM: RAID as the hub, confirmed (his, 2026-11-14)
"yes. like each request or input into the cli or copilot goes to raid." Recorded as RD9's expanded_2026_11_14_b
(docs/2026-10-13-projects-raid-and-gates-phasemap.spec): slice c widened to every input into the Nexus CLI, cos.exe's command line and
copilot. RD9 slice c is the next build for item 1 above.

## ADDENDUM: the shape (his, 2026-11-14)
"basically like the hub/raid in the center, cos above that, then each system/compartment stems or branches off of raid". RD9
decided_2026_11_14_topology: COS above (supervises every system, RAID included); RAID the hub; every system branches off RAID. Open: how this
reads against CS11 (RAID's code in COS's folder, or RAID its own compartment under COS).

## ADDENDUM: the wiring (his, 2026-11-14)
"each systems wires branch from the hooks (drawbridge) to raid. like the hook and wire registry, thats what its for. like each system is wired
into raid, cos wired into that, copilot as a reasoning and assistent. automation. this is meant to be autonomous"
Recorded on RD9 (decided_2026_11_14_wiring) and SW6 (expanded_2026_11_14). To confirm: does system → system go by its wire to RAID and RAID
routes it on, instead of a direct route call? That changes SW6's target.

## ADDENDUM: confirmed, and why (his, 2026-11-14)
"yes and with that you can find bottlenecks, tension and friction. like looms map. thats thepoint of cfr and now the pipeline is the final
layer". A system reaches another by its wire to RAID (SW6's crossings become wires to RAID). CP11 (the diagnostic map,
docs/2026-11-01-the-compartment-phasemap.spec) expanded: its edges are those wires, measured where they cross RAID (RFR2 bottlenecks and
friction, CFR sigma as tension); the pipeline runs on them, the final layer. Still open: RAID's code in COS's folder, or its own compartment.

## ADDENDUM: RAID is its own compartment (his, 2026-11-14)
"yes compartment". CS11 (docs/2026-10-23-cos-spine-phasemap.spec) expanded: RAID leaves Cortex as its own system and compartment (own folder,
server.js, drawbridge, routes, commands, events, data), supervised by COS, the hub every system's wires end at. Folder name read as raid/ (to
confirm). Cortex keeps the books by route.

## ADDENDUM: COS's UI, the one way in, with complete AI assistance (his, 2026-11-14)
"Cos ui needs complete ai assistance though. The only at in to nexus". CH1 (docs/2026-11-02-cos-console-phasemap.spec) expanded: an
assistant on every COS page that sees the screen, answers and acts, each ask an input to RAID. To confirm: "at in" = "way in"; other
surfaces route through COS (not closed); "complete" = it acts, not only answers.

## ADDENDUM: decomposition already exists in Idearium; Idearium's census (his, 2026-11-14)
"intelligence system to help with complex tasks, agent tools also, gates hold persistence and decomposing reduces load. look at ideariums
chunking. thats what i mean about idearium. i feel a lot of idearium is misplaced"
- PC8 expanded_2026_11_14_b: dynamic decomposition reuses Idearium's chunk builder (spec-compiler/chunk/index.js: tiers 0–3, token budgets)
  and chunk-dispatch.js (retry ladder, answer checked); gates hold persistence (a run resumes from its last passed gate).
- SW8_ideariums_census_what_is_misplaced (new): census of Idearium's ~62k lines, each part given a home by the axioms, shown to him before
  anything moves.

## ADDENDUM: the atlas, and the chunker's leaning (his, 2026-11-14)
- "We need to improve atlas. Everything nexus can do, proven with real results. What it can't currently do. What it's trying to be. What it's
  becoming. Every single system in full detail, with each component explained and why it exists. Nothing left unconverted." → SB25
  (docs/2026-10-05-build-from-the-spec-phasemap.spec) picked up and expanded: five parts per system, every file covered, a check that fails
  while any is missing, generated from each system's own registry (not Loom). Measured 2026-11-14, files with a header that says what or why:
  cos 197/413, cortex 39/52, idearium 106/170, clear-glass 219/256, copilot 39/45, intelligence 29/82, guardian 56/68, versionium 17/25,
  emerge 20/154 (.eg mostly), orchestrator 12/27.
- "Chunks, bricks, steps, etc. I feel like raid? Like with agent tools also." → SW8 his_leaning_2026_11_14: the decomposition's home leans
  RAID, with the agent tools; confirmed with the census.

## ADDENDUM: the brain and the mind (his, 2026-11-14)
"Is that good? Like raid is like the brain." · "Raid the brain and oLlama the mind". RD9 decided_2026_11_14_brain_and_mind. Coder's
recommendation awaiting his call: chunk builder to RAID, chunk dispatcher to COS's pipeline.

## ADDENDUM: 0.60.535, the focus is the pipeline (his, 2026-11-14)
"We need the highest leverage, that gets me closer to cutting depende on you and using it the pipeline to build nexus. Vital. The pipeline.
Focus on that. Raid after since it works currently right?" Built: Ollama runs on whatever is installed (PC18 slice a); his PC lacked the
default qwen2.5-coder:7b, so the build's Ollama rung was skipped and work went to paid agents. Next: run `idearium-build` on one small phase
on his PC and fix whatever stops it, step by step, until a phase lands built by Ollama (thread T11's evidence).
RAID today: records each input as a .input node and turns it into a contract (RD9 slices a, b; COS's Console reaches it, 0.60.532); it does
not yet act on what it routes. The pipeline does not wait on that.
