# Looking Glass — Phase Map (v0.3, draft)

Companion to `SPEC.md`. Looking Glass is a UI renderer and app host. It is self-contained
and depends on nothing outside itself.

Legend: **DECIDED** = you said it. **PROPOSED** = suggestion, not confirmed. Sizes are
relative effort (S / M / L), not time estimates.

Rule for every phase: it must pass its exit test before the next one starts.

---

## 1. Summary

| # | Phase | Size | Depends on | Delivers |
|---|---|---|---|---|
| 0 | Foundations and decisions | S | none | Workspace that builds one exe |
| 1 | Window + one rectangle from data | S | 0 | Borderless GPU window drawing a rectangle from a data file |
| 2 | Elements, layout, variables and bindings | M | 1 | Rect, text, button as typed data; props bind to variables; hot reload |
| 3 | Layers as a runtime operation | M | 2 | Dynamic layers, compositor, toast on a second layer |
| 4 | Motion and visual effects | L | 2, 3 | Springs/tweens/timelines, SDF shapes, shadows, gradients, blur-behind, frame pacing |
| 5 | Event bus / interaction contract | M | 2, 3 | Typed events, gates, observers, per-layer contracts |
| 6 | Lifecycle, performance, motion budget | L | 3, 4, 5 | Active/idle/unloaded layers, threads, buffering, culling |
| 7 | Signal providers + live demo | M | 2, 5 | Time, input, system metrics, files, sockets feed variables; live system monitor |
| 8 | Host, app model, preferences, cross-app | M | 3, 5 | Many apps in one host; shared theme and prefs; app-to-app messaging and embedding |
| 9 | Scripting, permissions, multi-language | L | 5, 8 | WASM layers, capability permissions |
| 10 | Snapshot, replay, governor | L | 6, 7 | Layer snapshot/restore, deterministic replay, feedback-driven throttling |
| 11 | Self-hosted UI editor | L | 8, 9 | Editor built from the same elements, editing the live scene |
| 12 | Packaging and distribution | M | 8 | Single exe, installer, signing, auto-update, other OSes |

### Dependency graph

```
0 -> 1 -> 2 -> 3 -> 4
2 + 3 -> 5
3 + 4 + 5 -> 6
2 + 5 -> 7
3 + 5 -> 8 -> 9 -> 11
6 + 7 -> 10
8 -> 12
```

Parallel work once unblocked: phases 4 and 5 together after 3; phases 6, 7, and 8 once
their inputs are done.

---

## 2. Proposed repo layout

```
looking-glass/
  Cargo.toml                    workspace
  crates/
    lg-core/                    element schema, scene tree, ids, layer model
    lg-vars/                    variables, bindings, small expression set
    lg-layout/                  small flexbox-like layout
    lg-render/                  wgpu renderer, SDF shapes, text, textures, compositor, effects
    lg-motion/                  springs, tweens, timelines, frame clock
    lg-bus/                     events, gates, observers, contracts
    lg-runtime/                 lifecycle policies, scheduler, threads, governor, snapshots
    lg-signals/                 signal providers (time, input, metrics, files, sockets)
    lg-host/                    app registration, local IPC, cross-app messaging
    lg-prefs/                   preferences / theme store
    lg-wasm/                    WASM layer host (phase 9)
    lg-editor/                  editor elements and app (phase 11)
  apps/
    lg-shell/                   the borderless host exe
    lg-demo/                    one small demo per phase
  schemas/
    element.schema.json  layer.schema.json  event.schema.json
    contract.schema.json prefs.schema.json  signal.schema.json
  scenes/
    rect.json  button.json  toast.json  monitor.json
  docs/
```

Language and crates (PROPOSED): Rust. `winit` (window), `wgpu` (GPU), `serde` and
`serde_json` (data), `notify` (hot reload), a text crate such as `cosmic-text` or
`glyphon`, `sysinfo` (system metrics), `wasmtime` in phase 9. Shapes are drawn as signed
distance fields in shaders. Windows first (PROPOSED); keep the platform layer thin so
other OSes follow.

---

## 3. Phases

### Phase 0 — Foundations and decisions (S)
**Depends on:** nothing.
**Do:**
- Create the Cargo workspace and an empty `lg-shell` that builds to one exe.
- Settle: language (Rust), data format (JSON first), Windows first.
- Decide Open Questions 1 and 2 or defer them to phases 6 and 10.
**Files:** `Cargo.toml`, `apps/lg-shell/src/main.rs`, `docs/decisions.md`.
**Exit test:** `cargo build --release` yields one exe that starts and exits cleanly.

### Phase 1 — Window + one rectangle from data (S)
The smallest representable unit. No layers, no bus.
**Depends on:** 0.
**Do:** borderless window via `winit` with own drag/resize hit-testing and HiDPI scale;
GPU context via `wgpu`; draw one rectangle read from `scenes/rect.json`.
**Files:** `crates/lg-core/src/element.rs`, `crates/lg-render/src/rect.rs`,
`apps/lg-shell/src/main.rs`, `scenes/rect.json`.
**Exit test:** editing the JSON and restarting changes the rectangle; resizing keeps it
sharp and correctly scaled.

### Phase 2 — Elements, layout, variables and bindings (M)
**Depends on:** 1.
**Do:**
- Element schema: props, states, events, slots. Elements: rectangle, text, button.
- **Variables:** a named, typed value store. Any prop is a literal or a variable
  reference. Events write variables. Keep the expression set tiny (map range, clamp,
  mix); no general scripting until phase 9.
- Scene tree of schema instances; small flexbox-like layout; text rendering; hit testing;
  button states; hot reload of `scenes/*.json`.
**Files:** `schemas/element.schema.json`, `crates/lg-core/src/{schema,tree}.rs`,
`crates/lg-vars/src/lib.rs`, `crates/lg-layout/src/lib.rs`, `crates/lg-render/src/{text,shapes}.rs`.
**Exit test:** a button writes a variable on click and a text element bound to that
variable updates; editing `button.json` live updates the window.

### Phase 3 — Layers as a runtime operation (M)
**Depends on:** 2.
**Do:**
- Layer model: id, tags (names such as "meta" are conventions only), depth, bounds,
  lifecycle policy, owner.
- Operations: `layer.add`, `layer.remove`, `element.move` (re-parent).
- Per-layer GPU texture sized to the layer's bounds; compositor blends by depth.
- Start with one layer; remove empty layers; return to one.
**Files:** `schemas/layer.schema.json`, `crates/lg-core/src/layer.rs`,
`crates/lg-render/src/{compositor,texture}.rs`, `scenes/toast.json`.
**Exit test:** a button spawns a toast on a second layer; dismissing removes the layer;
no layer names are hard-coded in the engine.

### Phase 4 — Motion and visual effects (L)
**Depends on:** 2, 3 (blur-behind needs the compositor).
**Do:**
- **Motion as data:** springs, tweens, easing, timelines, staggers declared on elements
  or variables. Interruptible. Driven by a frame clock with frame pacing matched to the
  display's refresh rate.
- **Alive:** a time variable and ambient motion (breathing, noise drift, light following
  the cursor), each with an intensity setting.
- **Look:** SDF rounded shapes, soft shadows, glows, gradients in a perceptual color
  space, frosted-glass blur of whatever is under a layer, and a custom-shader element.
- Design tokens (color, radius, spacing, motion curves) so styling is shared, not
  hard-coded.
- Build order: SDF + shadow + gradient first, then blur-behind. The overall look is
  Open Question 9.
**Files:** `crates/lg-motion/src/{spring,tween,timeline,clock}.rs`,
`crates/lg-render/src/{sdf,shadow,gradient,blur,shader_element}.rs`.
**Exit test:** a button, a toast, and a panel animate smoothly at the display's refresh
rate; interrupting an animation mid-flight never snaps or stalls; ambient motion can be
turned fully off.

### Phase 5 — Event bus / interaction contract (M)
**Depends on:** 2, 3.
**Do:**
- Typed events named `{layer}:{noun}:{verb}`; one gate per event type (collisions are
  errors); read-only observers; ring buffer with sequence numbers.
- Each layer declares what it emits and accepts; the bus rejects violations.
- Layers talk only through the bus. Interaction primitive: element + target + action
  (close, toast, pop-up).
**Files:** `schemas/{event,contract}.schema.json`, `crates/lg-bus/src/{event,gate,stream,contract}.rs`.
**Exit test:** close, toast, and pop-up work through the bus only; a layer sending an
undeclared event is rejected and logged.

### Phase 6 — Lifecycle, performance, motion budget (L)
**Depends on:** 3, 4, 5.
**Do:**
- Lifecycle: active, idle (keeps texture, thread sleeps, last frame reused), unloaded
  (texture freed; data tree stays). Per-layer policy: always-warm, sleep-when-idle,
  unload-when-empty.
- **Motion budget:** a layer renders frames only while something animates; ambient motion
  has an intensity cap; power state or load can turn it down.
- Dirty regions, occlusion culling, transparent means free; per-layer threads;
  double/triple buffering.
- Resolve Open Question 1 (threads or processes) with measurements.
**Files:** `crates/lg-runtime/src/{lifecycle,scheduler,buffers,budget}.rs`,
`crates/lg-render/src/{dirty,cull}.rs`, `apps/lg-demo/src/stress.rs`.
**Exit test:** with many sparse layers an idle layer uses effectively no CPU; an unloaded
layer frees its texture; with nothing animating the whole app idles near zero frames;
wake latency is measured per policy.

### Phase 7 — Signal providers + live demo (M)
**Depends on:** 2, 5.
**Do:**
- A provider is anything that feeds variables: clock, mouse/keyboard, system metrics,
  file watcher, sockets, HTTP/SSE. Providers are plugins behind one trait.
- **Live system monitor demo:** CPU, memory, and network bars as spring-smoothed shapes
  driven by variables; a toast on a spike.
**Files:** `schemas/signal.schema.json`, `crates/lg-signals/src/{provider,time,input,metrics,net}.rs`,
`scenes/monitor.json`, `apps/lg-demo/src/monitor.rs`.
**Exit test:** the monitor updates live from real system data with no network service
running; removing a provider leaves the scene valid.

### Phase 8 — Host, app model, preferences, cross-app (M)
**Depends on:** 3, 5.
**Do:**
- Host protocol: apps register with the host over local IPC, declare their contract, and
  load live (not static packages).
- Preferences store in the meta layer: theme, fonts, accent, density, per-app overrides,
  exposed as variables so every app inherits.
- Cross-app: shared state, messaging over the bus, embedding another app's elements.
**Files:** `schemas/prefs.schema.json`, `crates/lg-host/src/{registry,ipc,session}.rs`,
`crates/lg-prefs/src/lib.rs`, `apps/lg-demo/src/two_apps.rs`.
**Exit test:** two separate demo apps run in one host; changing the accent color once
updates both; one embeds an element from the other.

### Phase 9 — Scripting, permissions, multi-language (L)
**Depends on:** 5, 8.
**Do:**
- Permission model (Open Question 3): what a layer may read or change in others; whether
  the meta layer rewrites layers below it live or only observes and routes.
- WASM host so any language that compiles to WASM can be a layer; sandboxed; cheap to
  load and unload. Rendering stays in the native core.
- Optional embedded scripting (QuickJS or Lua) for behavior; this is where the phase 2
  expression set may grow.
**Files:** `crates/lg-wasm/src/{host,api,perms}.rs`, `apps/lg-demo/wasm-toast/`.
**Exit test:** a WASM layer draws a toast through the bus; it is denied an action its
permissions do not grant.

### Phase 10 — Snapshot, replay, governor (L)
**Depends on:** 6, 7.
**Do:**
- Snapshot and restore of a layer's data tree on unload and wake; record the event
  stream; replay it deterministically; replay a bounded slice for debugging. The format
  is Looking Glass's own (Open Question 8).
- **Governor:** a feedback loop that reads signals (frame time, memory, CPU) and throttles
  or unloads layers and trims ambient motion. Start with a simple controller (Open
  Question 2).
**Files:** `crates/lg-runtime/src/{governor,snapshot,replay}.rs`.
**Exit test:** under simulated load, idle layers unload and memory drops; an unloaded
layer wakes with identical state; a recorded session replays to the same pixels.

### Phase 11 — Self-hosted UI editor (L)
**Depends on:** 8, 9.
**Do:** the editor is an app built from the same elements, running on the meta layer (or
its own), editing the live scene tree and saving scenes; schema-driven property panels;
layer inspector; drag to re-parent between layers; motion curve editor.
**Files:** `crates/lg-editor/src/*`, `apps/lg-demo/editor/`.
**Exit test:** use the editor to change an element of the editor itself and see it update
live, then undo it.

### Phase 12 — Packaging and distribution (M)
**Depends on:** 8.
**Do:** single-file release exe, installer, code signing, auto-update; Linux and macOS
ports behind the thin platform layer.
**Files:** `docs/release.md`, packaging scripts.
**Exit test:** a clean machine installs and runs Looking Glass with no other software.

---

## 4. Risks and gates

- **Scope.** Do not start a phase until the previous exit test passes.
- **Phases 4 and 6 pull against each other.** Beauty wants continuous frames; the
  lifecycle wants idle layers. The motion budget in phase 6 is how they coexist; design
  phase 4 to expose intensity controls from the start.
- **Phases 6 and 10 are the hard ones.** Keep phase 6 measurement-driven and the phase 10
  controller simple.
- **Folding back in.** The self-hosting editor stays in phase 11, after a working scene,
  bus, and runtime.
- **Open questions** (see `SPEC.md`): 1 and 2 to phases 0, 6, and 10; 3 to phase 9;
  4 to phase 6; 6 to phase 11; 7 and 8 to phase 10; 9 (the look) to phase 4.