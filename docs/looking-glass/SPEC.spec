# Looking Glass — Working Spec (v0.3, draft)

Name: **Looking Glass**. Status: concept stage, nothing built yet. Build plan: see `PHASEMAP.md`.
Origin: design conversation, 2026-10-13. Goal: invent an alternative to Electron
that is its own thing, not a copy of Tauri/Wails. It is a UI renderer and app host,
nothing more, and it depends on nothing outside itself.

Legend used below:
- **DECIDED** = you said it or agreed to it directly.
- **PROPOSED** = a suggestion from the conversation that you have not confirmed.
- **OPEN** = unresolved question.

---

## 1. What this is

An app platform, closer to a tiny OS layer for desktop apps than to an Electron
clone. It is a UI renderer ("HTML, but not HTML") that draws its own pixels on
the GPU and hosts apps live, with shared styling/preferences across all of them.

### Goals (DECIDED)
- Not Chromium-based.
- Not static: apps are loaded live by a host, not frozen into packages with their own copy of everything.
- Good, shared styling and preferences (theme, fonts, accent, density) that every app inherits.
- Cross-app: apps can share state, messaging, and embedding.
- Borderless, dynamically scaling windows with GPU-accelerated rendering.
- No markup language. UI is data, not tags in a file.
- RAM savings are not the main motivation.
- **Self-contained:** a UI renderer and app host. It needs no external platform or service to run.
- **Beautiful, animated, alive, dynamic:** motion and visual quality are core, and behavior is driven by events and variables.

### Non-goals (for now)
- Matching the web's feature set.
- Building the editor, scripting runtime, or multi-language support before the first slice works.

---

## 2. Core ideas

### 2.1 UI is typed data (DECIDED direction, PROPOSED details)
There is no markup source of truth. Every element (button, text, rectangle,
slider, toast, close button) is defined once by a **schema**: props, states,
events, slots. The UI itself is a tree of schema instances, which is what an
editor manipulates.

Properties:
- Deterministic: same data in, same pixels out.
- Any element can be placed at any layer or depth.
- Images and HTML are just more element types (HTML would be an optional embed element, later).
- Schemas are the "deterministic reusable factors" (buttons etc.).

### 2.2 Layers are a runtime operation (DECIDED)
- The surface starts as **one layer**. You can add layers dynamically.
- Adding a layer is an action like any other (an element action).
- Every layer has a depth coordinate, bounds, and a lifecycle policy.
- Elements can move between layers by re-parenting in the tree.
- When a layer empties, it is removed; the system returns to one layer.
- The engine must not hard-code layer names. "Meta", "interaction", etc. are
  **conventions (tags)**, not special types. The engine only knows depth,
  bounds, and permissions.

Mental model (DECIDED): a sticker on glass. Each layer is a transparent surface
with its own owner. Lower layers are plumbing; higher layers are closer to the
human. The top layer is the meta layer.

Suggested convention stack, bottom to top (PROPOSED):
1. Plumbing: OS surface, borderless window, input, GPU context.
2. Renderer: scene graph, vector shapes, text, scaling.
3. Runtime: scripting, state, messaging between apps.
4. App content: the actual elements.
5. Interaction: input routing, focus, gestures, command palette.
6. Meta: theming, preferences, cross-app control, inspection.

### 2.3 Isolation through an event bus / interaction contract (DECIDED)
Layers are isolated and talk only through typed messages on an event bus (the
"interaction contract"). A layer declares what it emits and accepts; anything
that honors the contract can be stacked on. This is what keeps the UI from
being hard-coded.

Interaction primitives reduce to one shape (PROPOSED):
**element + target + action.**
- Close button: target = own app, action = close.
- Toast: spawns an element on a higher layer.
- Pop-up: spawns an element one layer above the caller.

### 2.4 Rendering and performance (DECIDED direction, PROPOSED mechanics)
- GPU-accelerated, resolution-independent vector drawing, so scaling is free.
- Each layer renders into its own GPU texture; a compositor blends them.
- CPU/GPU "ping-pong" = double or triple buffering: a layer draws into a back
  buffer while the compositor reads the front one, then they swap.
- Threads per layer (or processes, see Open Questions).
- Memory control (DECIDED idea: layers dynamically scale and switch off when not needed):
  - Textures are sized to the layer's bounds, not full screen.
  - Transparent (not black) means "nothing here" and costs nothing.
  - Layer lifecycle: **active** (redrawing) / **idle** (keeps texture, thread sleeps, last frame reused) / **unloaded** (texture freed, only the data tree remains).
  - Each layer declares a policy: always-warm, sleep-when-idle, or unload-when-empty.
  - Occlusion culling: skip rendering beneath fully opaque regions.
  - Unloading is cheap because layer state is typed data, not pixels; the texture is a throwaway cache.

### 2.5 Any language per layer (PROPOSED, later)
Because layers only see messages, the language behind a layer does not matter.
Preferred route: WASM modules (sandboxed, cheap to load/unload). Alternative:
a process per layer. Keep high-frequency rendering in the native core; foreign
layers send small, infrequent messages. Do not build this until the bus
contract is clean.

### 2.6 Variables, bindings, and motion (DECIDED goals, PROPOSED mechanics)
- **Variables are first-class.** A named, typed value store. Any element prop is a
  literal or a variable reference. Events write variables, animations drive variables,
  signal providers feed variables, and the renderer reads them every frame. "Event and
  variable driven" is the data model, not a feature.
- **Motion is data.** Springs, tweens, easing, timelines, and staggers are declared on
  elements or variables with no animation code. They are interruptible, so the UI never
  feels stuck mid-transition. A frame clock paces frames to the display's refresh rate.
- **Alive.** A time variable and ambient motion (slow breathing, noise drift, light that
  follows the cursor), each with an intensity setting that can be turned fully off.
- **Beauty on the GPU.** Shapes drawn as signed distance fields (crisp at any scale,
  soft shadows, glows), gradients in a perceptual color space, frosted-glass blur of
  whatever sits under a layer (fits the name and layers-as-glass), and a custom-shader
  element. Styling uses shared design tokens (color, radius, spacing, motion curves).
- **Motion budget.** Continuous motion fights the idle/unload lifecycle (2.4), so a layer
  renders frames only while something animates, ambient motion has an intensity cap, and
  load or power state can turn it down.
- The overall visual feel (frosted glass, neon/glow, other) is still undecided; see Open
  Question 9.

### 2.7 Signal providers (PROPOSED)
A provider is anything that feeds variables: clock, mouse and keyboard, system metrics,
file watchers, sockets, HTTP/SSE streams, or a plugin. Providers sit behind one trait, so
the UI can react to any live source without the core knowing what it is. Example: a
live system monitor drawn as spring-smoothed bars from CPU, memory, and network
variables.

---

## 3. Prior art (for reference)

Not dependencies, just what exists so Looking Glass can differ on purpose.

- **Electron alternatives that still use a webview or Chromium:** Tauri (system webview + Rust),
  Wails (Go), Electrobun (Bun), Neutralino. Looking Glass is not based on a browser engine.
- **Non-browser UI toolkits:** Flutter, Slint, Lynx, Dioxus Blitz. They draw their own pixels
  but have no shared host, no layered runtime composition, and no cross-app preference layer.
- **Rendering pieces to learn from:** `wgpu`, Skia, Vello (GPU vector drawing).
- **Compositor design to learn from:** Wayland, macOS, and Windows DWM (each surface renders
  to its own texture; a compositor blends them).

The differentiators are the layered runtime (layers added and removed live), UI as typed
data with variables, motion as data, the shared host with cross-app preferences, and layers
in any language.

---

## 4. Smallest slice (DECIDED approach: start with the smallest unit and build up)

Smallest unit: **one borderless window that draws one rectangle from a data struct.**
No layers, no bus, nothing else.

Build order, summarized (full detail in `PHASEMAP.md`):
- Phase 0: foundations
- Phase 1: window + one rectangle from data
- Phase 2: text and button, plus variables and bindings
- Phase 3: layers as a runtime operation (spawn a toast)
- Phase 4: motion and visual effects
- Phase 5: event bus; phase 6: lifecycle and motion budget
- Phase 7: signal providers
- Phase 8: host/app model and shared preferences
- Phase 9: scripting/WASM; phase 10: snapshot, replay, governor; phase 11: editor; phase 12: packaging

First real target (PROPOSED): a **live system monitor**.
CPU, memory, and network bars, spring-smoothed, driven by variables from a system-metrics
provider, with a toast on a spike. It exercises schema, variables, motion, layers, and
live data with no external service.

Executable goal (DECIDED): it must compile into a single application (exe). Rust, Zig, or
C++ fit best because they produce a single native binary with static linking and no
runtime to install.

---

## 5. Open questions

1. **Threads or processes per layer?** Threads are faster with shared memory; processes isolate better but add messaging latency. Assigned to phase 6 (measure).
2. **What does "PID management" mean here?** Managing processes and threads, a PID controller (feedback loop that tunes resources automatically), or both? Assigned to phases 0 and 10.
3. **Layer permissions:** what can a layer read or change in the others? Should the meta layer rewrite what is below it live (devtools for everything), or only observe and route? Does an element's power change with its depth, or only its reach? Assigned to phase 9.
4. **Wake latency policy:** which layers stay warm (e.g. toasts) versus unload when empty? Assigned to phase 6.
5. ~~Name for the project.~~ Resolved: Looking Glass.
6. **Does the UI editor come before or after scripting?** Currently placed last (11).
7. **Feedback loop:** how should layer lifecycle respond to load? A local governor (10) fed by generic signals such as frame time, memory, and CPU.
8. **Replay format:** Looking Glass's own snapshot/replay format; details at 10.
9. **What is the visual feel?** Frosted glass (blur, soft light), neon/glow, or something else. Decides 4 priorities. Asked, not yet answered.
10. **Variable expressions:** how much of an expression language before scripting arrives in 9? Proposed: only map-range, clamp, and mix in 2.

---

## 6. Risks

- Scope: renderer, compositor, scripting runtime, and editor are each large. The mitigation is the rule above: add a piece only when the previous one works.
- Designing in the abstract with no target tends to fold back on itself (self-hosting editor editing itself). Keep a concrete target (the system-map panel) in view.
- Memory cost of many full-size layers; handled by bounds-sized textures and the lifecycle policy.
- Beauty vs idle: continuous animation fights the idle/unload lifecycle; handled by the motion budget (2.6).

---

## 7. Bundle contents

`SPEC.spec` (this file), `PHASEMAP.md` (phased build plan), and `README.md`.
