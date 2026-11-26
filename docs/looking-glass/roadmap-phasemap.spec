spec:
  meta:
    name:    roadmap-phasemap
    version: 0.1.0-phasemap
    status:  "IMPORTED 2026-11-26 from docs/looking-glass/PHASEMAP.md by Idearium (roadmap-import 1.1.0); the source files are kept and stay the project's own words"
    files:   "named by the source per phase (named_in_source: its changelog and build list, or the paths an issue names); the rest unknown until mapped"
    source_shape: phased-spec

  phases:
    P0_foundations_and_decisions_s:
      status: pending
      title: "Foundations and decisions (S)"
      depends_on: []
      named_in_source: [Cargo.toml, apps/lg-shell/src/main.rs, docs/decisions.md]
      does: >-
        - Create the Cargo workspace and an empty `lg-shell` that builds to one exe. - Settle: language (Rust), data format (JSON first), Windows first. - Decide Open Questions 1 and 2 or defer them to phases 6 and 10.
      proof: "`cargo build --release` yields one exe that starts and exits cleanly."

    P1_window_one_rectangle_from_data_s:
      status: done
      title: "Window + one rectangle from data (S)"
      source_state: "done (README.md)"
      depends_on: [P0_foundations_and_decisions_s]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P0 → P1"
      named_in_source: [crates/lg-core/src/element.rs, crates/lg-render/src/rect.rs]
      does: >-
        borderless window via `winit` with own drag/resize hit-testing and HiDPI scale; GPU context via `wgpu`; draw one rectangle read from `scenes/rect.json`.
      proof: "editing the JSON and restarting changes the rectangle; resizing keeps it"

    P2_elements_layout_variables_and_bindings_m:
      status: done
      title: "Elements, layout, variables and bindings (M)"
      source_state: "done (README.md)"
      depends_on: [P1_window_one_rectangle_from_data_s]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P1 → P2"
      named_in_source: [schemas/element.schema.json, crates/lg-core/src/{schema,tree}.rs]
      does: >-
        - Element schema: props, states, events, slots. Elements: rectangle, text, button. - **Variables:** a named, typed value store. Any prop is a literal or a variable reference. Events write variables. Keep the expression set tiny (map range, clamp, mix); no general scripting until phase 9. - Scene tree of schema instances; small flexbox-like layout; text rendering; hit testing; button states; hot reload of `scenes/*.json`.
      proof: "a button writes a variable on click and a text element bound to that"

    P3_layers_as_a_runtime_operation_m:
      status: done
      title: "Layers as a runtime operation (M)"
      source_state: "done (README.md)"
      depends_on: [P2_elements_layout_variables_and_bindings_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P2 → P3"
      named_in_source: [schemas/layer.schema.json, crates/lg-core/src/layer.rs]
      does: >-
        - Layer model: id, tags (names such as "meta" are conventions only), depth, bounds, lifecycle policy, owner. - Operations: `layer.add`, `layer.remove`, `element.move` (re-parent). - Per-layer GPU texture sized to the layer's bounds; compositor blends by depth. - Start with one layer; remove empty layers; return to one.
      proof: "a button spawns a toast on a second layer; dismissing removes the layer;"

    P4_motion_and_visual_effects_l:
      status: pending
      title: "Motion and visual effects (L)"
      depends_on: [P2_elements_layout_variables_and_bindings_m, P3_layers_as_a_runtime_operation_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P2 → P4"
        - "PHASEMAP.md each phase's own **Depends on:**: P3 → P4"
      named_in_source: [crates/lg-motion/src/{spring,tween,timeline,clock}.rs]
      does: >-
        - **Motion as data:** springs, tweens, easing, timelines, staggers declared on elements or variables. Interruptible. Driven by a frame clock with frame pacing matched to the display's refresh rate. - **Alive:** a time variable and ambient motion (breathing, noise drift, light following the cursor), each with an intensity setting. - **Look:** SDF rounded shapes, soft shadows, glows, gradients in a perceptual color space, frosted-glass blur of whatever is under a layer, and a custom-shader element. - Design tokens (color, radius, spacing, motion curves) so styling is shared, not hard-coded. - Build order: SDF + shadow + gradient first, then blur-behind. The overall look is Open Question 9.
      proof: "a button, a toast, and a panel animate smoothly at the display's refresh"

    P5_event_bus_interaction_contract_m:
      status: pending
      title: "Event bus / interaction contract (M)"
      depends_on: [P2_elements_layout_variables_and_bindings_m, P3_layers_as_a_runtime_operation_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P2 → P5"
        - "PHASEMAP.md each phase's own **Depends on:**: P3 → P5"
      named_in_source: [schemas/{event,contract}.schema.json, crates/lg-bus/src/{event,gate,stream,contract}.rs]
      does: >-
        - Typed events named `{layer}:{noun}:{verb}`; one gate per event type (collisions are errors); read-only observers; ring buffer with sequence numbers. - Each layer declares what it emits and accepts; the bus rejects violations. - Layers talk only through the bus. Interaction primitive: element + target + action (close, toast, pop-up).
      proof: "close, toast, and pop-up work through the bus only; a layer sending an"

    P6_lifecycle_performance_motion_budget_l:
      status: pending
      title: "Lifecycle, performance, motion budget (L)"
      depends_on: [P3_layers_as_a_runtime_operation_m, P4_motion_and_visual_effects_l, P5_event_bus_interaction_contract_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P3 → P6"
        - "PHASEMAP.md each phase's own **Depends on:**: P4 → P6"
        - "PHASEMAP.md each phase's own **Depends on:**: P5 → P6"
      named_in_source: [crates/lg-runtime/src/{lifecycle,scheduler,buffers,budget}.rs]
      does: >-
        - Lifecycle: active, idle (keeps texture, thread sleeps, last frame reused), unloaded (texture freed; data tree stays). Per-layer policy: always-warm, sleep-when-idle, unload-when-empty. - **Motion budget:** a layer renders frames only while something animates; ambient motion has an intensity cap; power state or load can turn it down. - Dirty regions, occlusion culling, transparent means free; per-layer threads; double/triple buffering. - Resolve Open Question 1 (threads or processes) with measurements.
      proof: "with many sparse layers an idle layer uses effectively no CPU; an unloaded"

    P7_signal_providers_live_demo_m:
      status: pending
      title: "Signal providers + live demo (M)"
      depends_on: [P2_elements_layout_variables_and_bindings_m, P5_event_bus_interaction_contract_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P2 → P7"
        - "PHASEMAP.md each phase's own **Depends on:**: P5 → P7"
      named_in_source: [schemas/signal.schema.json, crates/lg-signals/src/{provider,time,input,metrics,net}.rs]
      does: >-
        - A provider is anything that feeds variables: clock, mouse/keyboard, system metrics, file watcher, sockets, HTTP/SSE. Providers are plugins behind one trait. - **Live system monitor demo:** CPU, memory, and network bars as spring-smoothed shapes driven by variables; a toast on a spike.
      proof: "the monitor updates live from real system data with no network service"

    P8_host_app_model_preferences_cross_app_m:
      status: pending
      title: "Host, app model, preferences, cross-app (M)"
      depends_on: [P3_layers_as_a_runtime_operation_m, P5_event_bus_interaction_contract_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P3 → P8"
        - "PHASEMAP.md each phase's own **Depends on:**: P5 → P8"
      named_in_source: [schemas/prefs.schema.json, crates/lg-host/src/{registry,ipc,session}.rs]
      does: >-
        - Host protocol: apps register with the host over local IPC, declare their contract, and load live (not static packages). - Preferences store in the meta layer: theme, fonts, accent, density, per-app overrides, exposed as variables so every app inherits. - Cross-app: shared state, messaging over the bus, embedding another app's elements.
      proof: "two separate demo apps run in one host; changing the accent color once"

    P9_scripting_permissions_multi_language_l:
      status: pending
      title: "Scripting, permissions, multi-language (L)"
      depends_on: [P5_event_bus_interaction_contract_m, P8_host_app_model_preferences_cross_app_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P5 → P9"
        - "PHASEMAP.md each phase's own **Depends on:**: P8 → P9"
      named_in_source: [crates/lg-wasm/src/{host,api,perms}.rs, apps/lg-demo/wasm-toast/]
      does: >-
        - Permission model (Open Question 3): what a layer may read or change in others; whether the meta layer rewrites layers below it live or only observes and routes. - WASM host so any language that compiles to WASM can be a layer; sandboxed; cheap to load and unload. Rendering stays in the native core. - Optional embedded scripting (QuickJS or Lua) for behavior; this is where the phase 2 expression set may grow.
      proof: "a WASM layer draws a toast through the bus; it is denied an action its"

    P10_snapshot_replay_governor_l:
      status: pending
      title: "Snapshot, replay, governor (L)"
      depends_on: [P6_lifecycle_performance_motion_budget_l, P7_signal_providers_live_demo_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P6 → P10"
        - "PHASEMAP.md each phase's own **Depends on:**: P7 → P10"
      named_in_source: [crates/lg-runtime/src/{governor,snapshot,replay}.rs]
      does: >-
        - Snapshot and restore of a layer's data tree on unload and wake; record the event stream; replay it deterministically; replay a bounded slice for debugging. The format is Looking Glass's own (Open Question 8). - **Governor:** a feedback loop that reads signals (frame time, memory, CPU) and throttles or unloads layers and trims ambient motion. Start with a simple controller (Open Question 2).
      proof: "under simulated load, idle layers unload and memory drops; an unloaded"

    P11_self_hosted_ui_editor_l:
      status: pending
      title: "Self-hosted UI editor (L)"
      depends_on: [P8_host_app_model_preferences_cross_app_m, P9_scripting_permissions_multi_language_l]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P8 → P11"
        - "PHASEMAP.md each phase's own **Depends on:**: P9 → P11"
      named_in_source: [crates/lg-editor/src/*, apps/lg-demo/editor/]
      does: >-
        the editor is an app built from the same elements, running on the meta layer (or its own), editing the live scene tree and saving scenes; schema-driven property panels; layer inspector; drag to re-parent between layers; motion curve editor.
      proof: "use the editor to change an element of the editor itself and see it update"

    P12_packaging_and_distribution_m:
      status: pending
      title: "Packaging and distribution (M)"
      depends_on: [P8_host_app_model_preferences_cross_app_m]
      depends_from:
        - "PHASEMAP.md each phase's own **Depends on:**: P8 → P12"
      named_in_source: [docs/release.md]
      does: >-
        single-file release exe, installer, code signing, auto-update; Linux and macOS ports behind the thin platform layer.
      proof: "a clean machine installs and runs Looking Glass with no other software."

# ADDENDUM 2026-11-26 — P1 in Emerge: a native window and one rectangle from data (James: "Anyway you could get looking glass beginning?",
# his call the same day: "everything in Emerge (the renderer too)"). emerge/emerge/lang/native/window.eg compiles window-screen.json into
# window.exe, no JavaScript and no markup in it. Seen on his machine 2026-11-26. Next: its own window procedure (input), then the screen's
# elements as data (P2) drawn by the same compiler. Shared with CIE12 (docs/2026-11-06-cie-eg-build-phasemap.spec).
# · then to his spec's smallest slice word for word (SPEC v0.3 §4, DECIDED: "one borderless window that draws one rectangle from a data
#   struct"; he sent the bundle 2026-11-26): WS_POPUP, the whole surface painted from the data (background, then the rectangle), Escape
#   ends it (exit 0). Seen on his machine. The bundle (D:\Projects\4-Specs-Ideas\Glass Engine\looking-glass-bundle.zip) is v0.3, already
#   here word for word; nothing new in it.
