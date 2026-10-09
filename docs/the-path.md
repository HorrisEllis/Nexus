# The path

James: "can you get us there." · "most amount of power, and highest leverage, least amount of tokens." · "Include any useful or important."

The whole roadmap after the declutter: **53 phases**. Everything else is on the shelf, kept and visible, and can come back; the shelf was combed for anything broken, failing, losing data or security-critical, and what mattered came back here (step 0). "Check first" means part of it may already be built; it is checked against the code before anything is written.

## Step 0a — solid (docs/2026-10-10-idearium-solid-phasemap.spec)

James: "maybe we get idearium solid then start finally using nexus to build nexus". Solid has a finish line now: the map's `solid_means` checks, each proven against the running stack with tests/sim/fake-tab.js.

| phase | map | note |
|---|---|---|
| SD0_versionium_down_is_said_and_restarted | 2026-10-10-idearium-solid | his 12:46 refusal |
| SD2_copilot_never_answers_ok_with_nothing | 2026-10-10-idearium-solid | "unstructured response … via none" |
| SD3_the_person_goes_first | 2026-10-10-idearium-solid | background builds never ahead of him |
| SD1_rewind_and_versions_on_the_repo_card | 2026-10-10-idearium-solid | backend exists; the card |
| SD6_an_idea_logged_asked_expanded | 2026-10-10-idearium-solid | the void as a real back-and-forth |
| SD4_agents_live_in_guardian | 2026-10-10-idearium-solid | one .agent per model |
| SD5_account_fallback | 2026-10-10-idearium-solid | after SD4 |
| SD10_the_adversarial_gate | 2026-10-10-idearium-solid | "the adversarial is a gate for each output" — any domain |
| SD12_a_spec_starts_from_its_primitives | 2026-10-10-idearium-solid | idea → primitives & invariants → schema → the rest, as a DAG |
| SD7_blocks_that_generate_themselves | 2026-10-10-idearium-solid | the DAG; after SD6 and SD10 |
| SD8_an_agent_can_see_and_fix_a_tab | 2026-10-10-idearium-solid | Clear Glass as agent tools |
| SD9_claude_code_inside_idearium | 2026-10-10-idearium-solid | half real |
| SD13_the_machine_is_cos | 2026-10-10-idearium-solid | "the vm, i have no control over" — one COS surface: setup → start → screen → control |
| SD11_the_desktop_inside_idearium | 2026-10-10-idearium-solid | the VM's screen in a pane, not a pop-up |

## Straight after solid — every system a node system (docs/2026-09-11-sovereign-node-architecture-phasemap.spec, back from the shelf; docs/architecture-spec ADDENDUM 2026-10-10)

James: "im saying all systems are supposed to be like guardian with the nodes … cortex data is clumped together instead of being decoupled". DS1 cortex the catalog → P3 node schemas → P33 every system runs its node registry (the store a node) → DS2/P5 one system moves home at a time → P8 component registry by module → P36 an event ledger per registry → P2/P13 contracts and handoffs → P34 nodes in the lattice → P35 copilot reads, edits, creates nodes → P37 the UI floats on the registry. Self-awareness (below) builds on it.

## Straight after solid — self-awareness (docs/2026-10-10-self-awareness-phasemap.spec)

James: "the data nodes arent a reflection of guardian. which means there is blind spots … also connecting it to the associative lattice". AW0 no guessed causes (the 2 s edge never walked) → AW1 guardian's live state as nodes (jobs, tabs, agents) → AW2 every call says who asked (so the lattice gets idearium→guardian, copilot→guardian) → AW3 the field hears guardian's whole lifecycle → AW4 the door reads the lattice → AW5 a node's face.

## After solid — a snapshot is a compartment (docs/2026-10-10-snapshot-compartments-phasemap.spec)

James: "what if a snapshot is a cos compartment? that can branch, or run in parralel to for benchmarks, using deltas and sigmas? using rfr2?" SN0 one branch mechanism (three today) → SN1 open any snapshot as a compartment → SN2 one workload on N of them, repeated → SN3 measured by RFR2 delta and sigma → SN4 benchmarks teach the learned order.

## After solid — the design surface (docs/2026-10-10-design-surface-phasemap.spec)

James: "i want to make a design system for creating and editing different types of graphical interfaces. like open any file and edit the ui in real time". DS0 one token source → DS1 tokens edited live → DS2 pick and edit any page (Clear Glass ◎, written back) → DS3 components as Eravos mods → DS4 interface types by adapter → DS5 the agents design too · DS6 one module contract, nested · DS7 every editing tool an Eravos mod, typed by what it accepts and produces (native GNU tools run in a compartment) · DS8 the registry routes, the UI reflects (compartments inside compartments — logical; a VM only where isolation is needed).

## Step 0 — health and the clean-up

| phase | map | note |
|---|---|---|
| HG1_components_store_map_parses | 2026-10-05-cli-data-code | docs/2026-09-27-components-store-and-atlases-phasemap.spec is loose YAML throughout (lists and decisions with key: value text inside); the scanner reads it, js-yaml does not — rewrite its prose blocks as quoted text |
| HG2_loom_bootstrap_rejections | 2026-10-05-cli-data-code | check first: bootstrap exits 0 on 0.54.1 with 114 unresolved; what is left of the 460 rejections |
| HG9_persist_history_diff | 2026-10-05-cli-data-code | loom/test/phasemap-map.test.js still fails 'persistHistory() correctly diffs against a seeded prior state' (12/13 on 0.54.1) |
| OR1_five_answers_for_an_open_phase | 2026-10-09-one-roadmap |  |
| OR6_old_code_out | 2026-10-09-one-roadmap |  |
| OR4_one_roadmap_in_idearium | 2026-10-09-one-roadmap |  |
| OR5_it_stays_decluttered | 2026-10-09-one-roadmap |  |

## Step 1 — one engine under every model call

| phase | map | note |
|---|---|---|
| ME0_the_inventory_proved | 2026-10-09-one-model-engine |  |
| ME1_one_failure_list | 2026-10-09-one-model-engine |  |
| ME2_caller_policy | 2026-10-09-one-model-engine |  |
| ME3_one_engine_one_budget | 2026-10-09-one-model-engine |  |
| ME4_one_attempt_record | 2026-10-09-one-model-engine |  |
| ME5_one_chooser | 2026-10-09-one-model-engine |  |
| ME6_one_learner | 2026-10-09-one-model-engine |  |
| ME7_raid_spine_joins | 2026-10-09-one-model-engine |  |
| ME8_the_drainers_run_the_engine | 2026-10-09-one-model-engine |  |
| ME9_the_layers_below_report | 2026-10-09-one-model-engine |  |
| ME10_nested_ladders_folded | 2026-10-09-one-model-engine |  |
| ME11_old_settings_translated | 2026-10-09-one-model-engine |  |
| ME12_callers_moved | 2026-10-09-one-model-engine |  |
| ME13_no_bypass | 2026-10-09-one-model-engine |  |
| ME15_the_docs_tell_the_truth | 2026-10-09-one-model-engine |  |
| ME14_across_callers | 2026-10-09-one-model-engine |  |

## Step 2 — the loop: idea ⇄ back and forth → spec → phases → build

| phase | map | note |
|---|---|---|
| BK1_blocked_is_actionable | 2026-10-01-idearium-agent-ready-master | a blocked build says what you can do about it |
| BK2_phase_build_writes_code | 2026-10-01-idearium-agent-ready-master | check first: phase builds already land files through repo-inject (0.39.282 N22, 0.39.355 PB2); close as DONE-ELSEWHERE if nothing is left |
| UI6_idea_and_phases_one_tab | 2026-10-01-idearium-agent-ready-master | the idea and its phases in one tab |
| UI0_the_stations_agree | 2026-10-02-emerge-field-memory-build | the stations it walks through must read right |
| WS6_workshop_parts_and_modes | 2026-10-02-emerge-field-memory-build | the workshop; re-cut so it does not wait on CB3 (now on the shelf) |
| RC1_the_repo_main_chat | 2026-10-02-emerge-field-memory-build | "i want the repos to be able to do what im doing right now"; re-cut so it does not wait on CB1/CB2/MR3 (now on the shelf) |
| PL1_one_entry_point | 2026-10-02-workshop-codex-rewind | idea → workshop → architect → repo → code, one way in; re-cut so it does not wait on BP1 (now on the shelf) |
| UI12_workshop_surface | 2026-10-02-workshop-codex-rewind | check first: WS7 (0.39.354) built the full workshop page; what is left is retiring the old builders (OR6) |
| SB8_promote_with_full_block_options | 2026-10-05-build-from-the-spec | idea → spec, his options per block |
| SB9_the_spec_is_a_spec_file | 2026-10-05-build-from-the-spec | the .spec file is the artifact (RS3's spec-document reads it already) |
| SB10_reuse_first_keyed_on_the_contract | 2026-10-05-build-from-the-spec | check first: the chunk build already tries the component store and prior sections (idearium atlas); finish the contract key |
| SB11_each_block_chunked | 2026-10-05-build-from-the-spec | "chunked, phased, possibly chunked again" |
| SB13_each_component_chunked | 2026-10-05-build-from-the-spec | chunked again, per component |
| SB15_empty_is_not_built | 2026-10-05-build-from-the-spec | an empty file is not a build (PB2 did it for phase builds; chunks still need it) |
| SB29_the_build_flow_in_his_order | 2026-10-05-build-from-the-spec | map → phases → snapshot → Plan → build, his order |
| CT1_one_pending_change_path | 2026-10-05-cli-data-code | proposed → staged → applied → committed, one lifecycle |
| CT2_the_code_tab | 2026-10-05-cli-data-code | check first: CT3/CT5 (0.39.349–351) made the Code tab the work surface |
| WK4_the_void_feeds_the_workshop | 2026-10-05-idea-to-spec-workshop | the void → the workshop, carrying what the back-and-forth found |
| WK5_lanes_feed_gaps_and_phases | 2026-10-05-idea-to-spec-workshop | the idea's lanes feed gaps and phases |
| WK6_enterprise_grade | 2026-10-05-idea-to-spec-workshop | check first: WS7 (0.39.354) built the full workshop |
| SB3_guided_build_loop | nexus-self-build-pipeline | the same loop, for NEXUS itself: plan → spec change → phases → build |

## Step 3 — Idearium holds the systems

| phase | map | note |
|---|---|---|
| UI8_code_tab_is_code | 2026-10-01-idearium-agent-ready-master | Idearium holds the code plainly |
| UI9_plan_and_work_surface_panels | 2026-10-01-idearium-agent-ready-master | check first: CT5 and CT9 (0.39.351–353) gave the Plan and work surface their panels and pull tab |
| SB26_an_imported_project_shows_its_progress | 2026-10-05-build-from-the-spec | Idearium holds a system: its spec and phases from its code |
| SB27_expanding_a_repo_keeps_its_spec_and_phases_current | 2026-10-05-build-from-the-spec | the spec and phases stay true as the repo grows |
| CL1_commands_declared_by_their_system | 2026-10-05-cli-data-code | each system's verbs, owned by it |
| CL2_the_agent_tab_is_the_endpoint | 2026-10-05-cli-data-code | every system's CLI from one place in Idearium |
| MCO6_compartment_ownership | nexus-repository-system-build | check first: CHANGELOG-0.39.178's table lists MCO6 compartments DONE |
| MCO7_nexus_systems_as_repo_compartments | nexus-repository-system-build | Idearium holds the systems: 7a and 7b done, 7c–7h not started |
| SB5_self_modification_from_inside | nexus-self-build-pipeline | NEXUS changed from inside NEXUS, through the loop |
