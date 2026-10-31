# Looking Glass — Editor Spec (v0.2, draft)

Companion to `SPEC.spec` (v0.3) and `PHASEMAP.md` (v0.3). Status: concept stage, nothing built.
Origin: design conversation, 2026-10-18. v0.2 removes AI generation and replaces it with
deterministic code generation from the elements, in the way the WordPress block editor
builds a page from its blocks.

Structured in the spec-engine's ten slots (meta, purpose, schema, api, events, integration,
failure_modes, build_order, axioms, tests) with `## SECTION: <id>` markers, so it can be
seeded slot by slot. Open questions sit after the last slot.

Legend (same as `SPEC.spec`):
- **DECIDED** = you said it or agreed to it directly.
- **PROPOSED** = a suggestion you have not confirmed.
- **OPEN** = unresolved question.

---

## SECTION: meta

- Name: **Looking Glass Editor** (working name, see E-OQ8).
- Version: `0.2.0-draft`. Status: proposed.
- Depends on `SPEC.spec` §2.1 (UI is typed data), §2.2 (layers), §2.3 (bus/contract),
  §2.6 (variables, bindings, motion), §2.7 (signal providers).
- Touches `PHASEMAP.md` phases 2, 3, 4, 5, 8, 9, and 11. Proposed amendments are listed in
  `build_order`.
- New crates (PROPOSED):

```
crates/
  lg-editor-core/    document, ops, transactions, undo/redo, validation, queries (headless)
  lg-gen/            deterministic code generation: per-element emitters, serializer,
                     parser for round-trip, drift detection
  lg-export/         emitter packs for targets beyond scene JSON (gated on E-OQ1)
  lg-editor/         the editor UI, built from Looking Glass elements (= PHASEMAP phase 11)
```

  Particles are a renderer and motion feature, not an editor feature. They go into
  `lg-render` and `lg-motion` (see `build_order`, amendment A1).

---

## SECTION: purpose

### What you asked for (DECIDED)
- A full UI editor that automatically produces beautiful, animated UI, with **particles**
  and **styles driven by variables or events**.
- Enterprise grade and fully expanded, not a toy.
- **No AI.** The editor writes the code itself, based on the UI elements you place and set,
  the way WordPress builds a page from its blocks. (This replaces the earlier "visual
  editing plus AI" answer.)
- Architecture spec first.
- "Agnostic" (what the editor's output can target): **on hold** at your request. See E-OQ1.

### What "automatically code" means here (PROPOSED)
Looking Glass has no markup and no code-as-source (`SPEC.spec` §2.1). The scene document
*is* the program. So the editor does not write code; it writes **typed scene data**, which
the runtime executes directly. "Code" in any other language is an *export*, a projection
of the document (E-OQ1).

That gives the central design rule: **the editor has no format of its own.** It edits
Looking Glass scenes using the same operations the runtime already understands
(`layer.add`, `element.move`, ...). Anything the editor makes runs without the editor.

### The WordPress model (PROPOSED, following your direction)
The WordPress block editor works like this: every block has a type and attributes, and a
fixed `save` function turns those attributes into markup. The page is the blocks serialized
in order, each wrapped in a comment marker so the editor can parse the page back into blocks.
Nothing is guessed; the same blocks always produce the same markup.

Looking Glass does the same with elements:
- Every element schema carries an **emitter**: a fixed, deterministic mapping from its props
  (plus styles, motion, and bindings) to output.
- As you edit, every op re-emits only the elements it touched, and the code view updates
  live. The canvas and code are two views of the same document.
- Generated code carries **element markers** (the equivalent of `<!-- wp:paragraph -->`),
  so the code can be parsed back into elements.
- Code edited by hand that no longer matches what its emitter would produce is flagged,
  just as WordPress flags an "invalid block." You choose to keep it as a **raw** element (the
  equivalent of WordPress's Custom HTML block) or to regenerate it.
- The first target is the scene JSON itself. Other languages are additional emitter packs
  (E-OQ1).

### Goals (PROPOSED)
1. Every visual property can be a literal, a token, a variable binding, or a style rule
   reacting to state, variables, or events.
2. Motion, particles, and ambient life are authored as data with live preview, never as
   animation code.
3. Every change, whether from a person, a script, a plugin, or a replay, is one kind of
   thing: an **op**, validated by one set of gates, undoable, and logged.
4. Code is generated from elements by fixed emitters. Same document in, byte-identical code
   out. There is no AI, no model, and no network involved.
5. Inspector panels are generated from element schemas, so new element types (including
   plugin elements) are editable without new editor code.

### Non-goals (for now)
- A web or Chromium-based editor shell (conflicts with `SPEC.spec` goals; see E-OQ2).
- Exporters before E-OQ1 is decided.
- Multi-user real-time collaboration before single-user op logs are proven (E-OQ5).

---

## SECTION: schema

All data is JSON first, matching `PHASEMAP.md` phase 0. These are additions to or
refinements of the phase 2 element schema. They are runtime schema, not editor-only.

### 1. Prop values: literal, token, binding
```json
{
  "fill":    "#3a7bff",
  "radius":  { "$token": "radius.md" },
  "width":   { "$var": "cpu.load", "map": [0, 1, 0, 240], "clamp": true },
  "opacity": { "$var": "toast.visible", "mix": [0, 1] }
}
```
Expression set stays at map-range, clamp, and mix (`SPEC.spec` OQ10). Style rules need
comparisons; see E-OQ7.

### 2. Style rules (variable- and event-driven styles)
Ordered rules on an element. A rule's `when` is a condition on element state, a variable,
or a recent event. The last matching rule wins per prop. Changes animate with the named motion.
```json
"styles": [
  { "when": { "state": "hover" },                      "set": { "fill": { "$token": "color.accent.hi" } }, "motion": "spring.snappy" },
  { "when": { "state": "pressed" },                    "set": { "scale": 0.97 },                           "motion": "spring.snappy" },
  { "when": { "var": "cpu.load", "gt": 0.85 },         "set": { "fill": { "$token": "color.danger" }, "glow": 12 }, "motion": "tween.200.out" },
  { "when": { "event": "app:alert:raise", "within_ms": 600 }, "set": { "shake": 1 },                   "motion": "spring.wobbly" }
]
```

### 3. Motion (from `SPEC.spec` §2.6, made concrete)
```json
"motion": {
  "spring.snappy": { "kind": "spring", "stiffness": 420, "damping": 32, "mass": 1 },
  "tween.200.out": { "kind": "tween", "ms": 200, "ease": "cubic-out" },
  "intro":         { "kind": "timeline", "tracks": [
                     { "target": "#card", "prop": "y", "keys": [[0, 24], [320, 0]], "ease": "expo-out" },
                     { "target": ".row",  "prop": "opacity", "keys": [[0, 0], [240, 1]], "stagger_ms": 40 } ] },
  "breathe":       { "kind": "ambient", "prop": "glow", "wave": "sine", "period_ms": 4200, "amp": 4, "intensity": { "$var": "prefs.ambient" } }
}
```
Every motion is interruptible. A new target retargets from current position and velocity, so
nothing snaps (`PHASEMAP.md` phase 4 exit test).

### 4. Particle emitter element (new element type)
```json
{
  "type": "emitter", "id": "spark",
  "props": {
    "seed": 7,
    "max": 600,
    "rate": { "$var": "net.rx_rate", "map": [0, 5e6, 0, 120] },
    "burst": { "on": "monitor:spike:detect", "count": 80 },
    "lifetime_ms": [600, 1400],
    "shape": { "kind": "outline", "of": "#cpu-bar" },
    "velocity": { "speed": [40, 140], "angle": [-100, -80] },
    "forces": [
      { "kind": "gravity", "y": 220 },
      { "kind": "drag", "k": 0.8 },
      { "kind": "curl_noise", "scale": 0.004, "strength": 60, "speed": 0.3 },
      { "kind": "attractor", "to": { "$var": "input.cursor" }, "strength": 90, "falloff": 160 }
    ],
    "over_life": {
      "size":    [[0, 2], [0.2, 5], [1, 0]],
      "opacity": [[0, 0], [0.1, 1], [1, 0]],
      "color":   { "space": "oklch", "stops": [[0, "#ffe7a0"], [0.5, { "$token": "color.accent" }], [1, "#20004000"]] }
    },
    "sprite": { "kind": "sdf_circle", "softness": 0.6 },
    "blend": "add",
    "space": "layer",
    "intensity": { "$var": "prefs.motion" }
  }
}
```
- Sprites: SDF circle, SDF shape, glyph, or a snapshot of another element.
- Forces: gravity, drag, curl noise, attractor (to a point, element, or variable), vortex,
  bounds collision.
- `seed` makes the simulation deterministic, so replay gives identical pixels (`PHASEMAP.md`
  phase 10 exit test).
- `max` and `intensity` are what the motion budget and governor turn down (phases 6 and 10).

### 5. Components
A reusable schema with typed params, slots, internal variables, and its own styles and
motion. Instances override params. Components are versioned (`name@major.minor`) so a
library update cannot silently change existing scenes.
```json
{ "component": "GlassCard@1.2",
  "params": { "title": "string", "accent": "color", "elevated": "bool" },
  "slots": ["body"],
  "vars": { "hovered": false },
  "root": { "type": "rect", "props": { "...": "..." }, "children": ["..."] } }
```

### 6. Tokens
Named design values (color, radius, spacing, type, motion curves, particle presets) served
from `lg-prefs` (phase 8) as variables, so a theme change reaches every app.

### 7. Op (the unit of change)
```json
{ "op": "prop.set", "target": "el:7f3a", "args": { "prop": "fill", "value": { "$token": "color.accent" } },
  "base_rev": 412, "origin": "user", "txn": "t:9c01" }
```
- `origin` is one of: `user`, `script`, `replay`, `plugin`, `code` (an op parsed back from
  a hand edit in the code view).
- The core computes and stores each op's inverse when it is applied. Undo means applying
  the inverse.
- A transaction groups ops into one undo step (for example, one drag, or one paste).
- Op set: `element.add/remove/move/duplicate`, `prop.set/unset`, `bind.set/clear`,
  `style.add/remove/reorder`, `motion.define/attach/detach`, `layer.add/remove/set`,
  `var.define/remove`, `wire.add/remove` (event → target → action),
  `component.define/instantiate/detach/upgrade`, `token.set`.

---

## SECTION: api

### 1. Editor core (`lg-editor-core`, headless, no rendering)
```
Document::open(path) -> Result<Document, E>
Document::save(path) -> Result<(), E>
doc.apply(Txn) -> Result<Rev, Rejection>        // validates all ops, atomic
doc.preview(Txn) -> Result<Diff, Rejection>     // dry run, nothing committed
doc.undo() / doc.redo() -> Result<Rev, E>
doc.query(Selector) -> Vec<ElementRef>           // "#id", ".tag", "type:emitter", "bound:cpu.*"
doc.validate() -> Vec<Problem>                   // whole-document lint
doc.schema_of(type) -> ElementSchema             // drives generated inspector panels
doc.subscribe(Fn(Change))                        // canvas, panels, and plugins listen here
doc.log(range) -> Vec<Op>                        // audit and history
```
A CLI ships with the core, so it can be tested before any UI exists:
`lg-edit apply scene.json ops.json`, `lg-edit validate scene.json`, `lg-edit undo-check scene.json ops.json`.

### 2. Code generation (`lg-gen`, deterministic)
```
trait Emitter {                                   // one per element type, per target
    fn element_type(&self) -> &str;
    fn target(&self) -> TargetId;
    fn emit(&self, el: &Element, ctx: &EmitCtx) -> Fragment;   // pure function
}
trait Target {                                    // a language or format
    fn id(&self) -> TargetId;
    fn assemble(&self, doc: &Document, frags: &FragmentMap) -> FileSet;  // file layout, imports, tokens
    fn parse(&self, files: &FileSet) -> Result<Vec<MarkedFragment>, ParseError>;
    fn coverage(&self, doc: &Document) -> Coverage;  // which features map, degrade, or drop
}
gen.emit_all(doc, target) -> FileSet
gen.emit_incremental(doc, change, target) -> Patch     // only touched elements
gen.read_back(files, target) -> Result<Txn, Drift>     // code view edits become ops
```

How it works (PROPOSED):
1. **Emit.** Each element's emitter is a pure function of its props, styles, motion, and
   bindings. `EmitCtx` gives only stable inputs (token table, id map, indentation rules), so
   output cannot depend on time, hash order, or machine.
2. **Mark.** Every fragment is wrapped in a marker carrying the element id and type, for
   example `// lg:button id=el:7f3a` ... `// /lg:button` in code targets. In scene JSON the
   id is already present.
3. **Assemble.** The target lays out files (one per scene or component), hoists shared
   tokens and variables, and orders everything by tree order. Formatting is fixed, so diffs
   in version control stay small and readable.
4. **Live.** After every op, `emit_incremental` replaces only the touched fragments. The code
   view (split, or toggled like WordPress's Code editor) updates as you drag.
5. **Read back.** Editing in the code view reparses the marked fragments. A fragment that
   parses into valid props becomes ops (`origin: code`). A fragment its emitter wouldn't
   produce raises `E_CODE_DRIFT`, and you choose **keep as raw** (stored verbatim and
   emitted untouched) or **regenerate**.

Emitter sources (PROPOSED): built-in emitters ship with each element type. Components emit
by composing their children's emitters, so a new component needs no new emitter. Plugin
element types must register an emitter for each target they support; the scene JSON
target is mandatory.

### 3. Additional targets (`lg-export`, gated on E-OQ1)
Each additional target is an emitter pack: one `Target` plus an `Emitter` per element type.
`coverage` runs before writing and lists losses explicitly (for example: particles to CSS
cannot map; particles to canvas can). There is no silent degradation.

### 4. Plugin API
Plugins can register element schemas, custom inspector widgets for a prop type, signal
providers (`SPEC.spec` §2.7), emitters, and targets. Plugins run under the phase 9
permission model.

---

## SECTION: events

The editor is an app on the bus (`PHASEMAP.md` phase 5). Events follow `{layer}:{noun}:{verb}`.
The editor runs on a meta-tagged layer. The tag is a convention; the engine does not know
the name.

Emits (PROPOSED):
```
editor:selection:change      editor:doc:apply       editor:doc:reject
editor:txn:undo              editor:txn:redo        editor:doc:save
editor:code:emit             editor:code:readback   editor:code:drift
editor:preview:enter         editor:preview:exit    editor:problem:raise
```
Accepts: `scene:*` change notifications from the runtime, `prefs:*` (theme), and
`runtime:frame:stats` (performance HUD).

Live editing of another app's scene requires a capability to rewrite lower layers. That is
`SPEC.spec` OQ3, so **the editor forces OQ3 to be decided** (E-OQ3). Until then the editor
edits its own scene and scenes loaded as documents.

Wiring (`wire.add`) produces the bus primitive **element + target + action** (`SPEC.spec`
§2.3). The editor validates each wire against the target layer's contract and refuses
undeclared events at edit time, not run time.

---

## SECTION: integration

### Editor surfaces (all built from Looking Glass elements, phase 11)
| Surface | What it does |
|---|---|
| Canvas | The live scene running in the real renderer, not a mock. Select, drag, resize, re-parent across layers. Toggle between edit and play. |
| Layer stack | Layers by depth, tags, bounds, lifecycle state (active, idle, unloaded), and texture memory. |
| Tree | Scene hierarchy, components, and slots. |
| Inspector | Generated from `schema_of(type)`. Each prop shows literal, token, binding, or style-rule mode. |
| Variables | All variables with live values. Scrub a value to see every bound element react. Shows which provider feeds each one. |
| Style rules | Ordered rule list per element, with live highlighting of the rule that currently matches. |
| Motion | Spring visualizer (drag stiffness and damping, see the curve), easing editor, multi-track timeline, stagger. |
| Particles | Emitter editor with forces drawn as gizmos on the canvas, over-life curve editors, presets, and a live particle count against budget. |
| Wiring | Graph of element → target → action, checked against contracts. |
| Tokens / theme | Edits `lg-prefs` tokens; every open app updates. |
| Library | Versioned components, with upgrade previews shown as diffs. |
| Code view | Generated code for the current target, updated live. Split or toggled. Selecting an element highlights its fragment and the reverse. Editable; edits read back into elements. Drift is flagged inline. |
| History | Op log with origin (user, script, code, plugin), jump to any revision, replay a range. |
| Problems | `validate()` output, accessibility lint (contrast, hit-target size, focus order, reduced-motion respect). |
| Performance HUD | Frame time, active layers, particle count, motion-budget state. |

### Relation to the rest of Looking Glass
- Variables and providers: `lg-vars`, `lg-signals` (phases 2 and 7).
- Tokens and theme: `lg-prefs` (phase 8).
- Replay-based visual tests: `lg-runtime` snapshot and replay (phase 10).
- Permissions: phase 9.

### Relation to anything outside Looking Glass
Only through files on disk: saved scenes and generated code. Nothing else.

---

## SECTION: failure_modes

Every failure is named and typed. Nothing fails silently.

| Code | When | Behavior |
|---|---|---|
| `E_SCHEMA_UNKNOWN_TYPE` | Op or file uses an unregistered element type | Reject; name the type and its source (file or plugin). |
| `E_PROP_TYPE` | Value doesn't match the prop's schema type | Reject; name element, prop, expected and actual types. |
| `E_BIND_UNKNOWN_VAR` | Binding to an undefined variable | Reject at edit time. At load time, mark the element and keep the scene valid (matches phase 7: removing a provider leaves the scene valid). |
| `E_BIND_CYCLE` | Variable graph forms a cycle | Reject; print the cycle path. |
| `E_EXPR_UNSUPPORTED` | Expression outside the allowed set | Reject; list allowed operators. |
| `E_CONTRACT_UNDECLARED` | Wire emits or accepts an event the layer didn't declare | Reject at edit time. |
| `E_PERM_DENIED` | Op needs a capability the editor or plugin lacks | Reject; name the capability. |
| `E_OP_STALE` | `base_rev` is behind and the op conflicts with later changes | Reject; offer rebase onto the current revision. |
| `E_RELOAD_CONFLICT` | Scene file changed on disk during an edit session (hot reload) | Stop; show a three-way diff. Never overwrite either side automatically. |
| `E_EMIT_MISSING` | An element type has no emitter for the current target | Reject the target switch (or export); name the type. Scene JSON emitters are mandatory, so this never blocks saving. |
| `E_EMIT_NONDETERMINISTIC` | Emitting the same element twice gives different output | Fails the emitter's registration test; a plugin emitter that fails is refused at load. |
| `E_CODE_PARSE` | Code view edit breaks a marker or the target's syntax | Keep the last good document; underline the broken span; nothing is applied until it parses. |
| `E_CODE_DRIFT` | A marked fragment differs from what its emitter produces | Flag inline; offer keep-as-raw or regenerate. Never discard either version silently. |
| `E_BUDGET_PARTICLES` | Emitter `max` exceeds the layer's budget | Clamp at run time and raise a problem in the editor. |
| `E_EXPORT_UNSUPPORTED` | Exporter can't represent a feature | Listed in `coverage` before export; export only proceeds if the user accepts the losses. |
| `E_SELF_EDIT_LOCKOUT` | An edit to the editor's own scene makes it unusable (phase 11 risk) | Undo is bound natively, outside the scene. The editor pins a last-known-good copy of its own scene and restores it on a failed frame or a missing required surface. |

---

## SECTION: build_order

Bottom-up. Each step passes its exit test before the next starts (`PHASEMAP.md` rule).

### Track E (PROPOSED), alongside the main phase map
| # | Step | After | Exit test |
|---|---|---|---|
| E0 | Document, ops, transactions, undo, validation, CLI (`lg-editor-core`) | Phase 2 | Every phase 2 scene round-trips byte-identical. A fuzzed op sequence followed by full undo returns the original document byte-identical. |
| E1 | Layer ops; schema-to-inspector descriptors (as data) | Phase 3 | Layer add, move, and remove through ops; descriptors generated for rect, text, button with no per-type code. |
| E2 | Style rules, motion defs, tokens, emitter schema in the document model | Phase 4 + A1 | Style rules switch on a variable and animate. Emitter with a fixed seed renders identical frames on two runs. |
| E3 | Wiring ops with contract validation | Phase 5 | An undeclared wire is rejected at edit time with `E_CONTRACT_UNDECLARED`. |
| E4 | Code generation (`lg-gen`) for the scene JSON target: emitters, markers, incremental emit, read-back, drift | E0 | Every scene emits byte-identical output on repeated runs. Emit then read back gives the same document. A hand edit that matches an emitter becomes ops; one that doesn't raises `E_CODE_DRIFT`. |
| E5 | Editor UI, self-hosted (this **is** PHASEMAP phase 11) | Phases 8, 9; E1–E4 | Phase 11's exit test (edit the editor live, then undo), plus: dragging an element updates the code view live; editing the code view updates the canvas; `E_SELF_EDIT_LOCKOUT` recovery works. |
| E6 | Additional targets (emitter packs) | E-OQ1 decided | Per target: `coverage` matches a fixture of expected losses; exported output renders the conformance scenes; repeated export is byte-identical. |
| E7 | Enterprise layer: component versioning and upgrades, accessibility lint, replay-based visual regression, multi-user (E-OQ5) | E5, phase 10 | A component upgrade shows a diff and is undoable; a recorded session replays to the same pixels in CI. |

E0 and E4 are headless. They can start as soon as phase 2 schemas exist, long before the
renderer can host an editor UI. Both are testable from the CLI (`lg-edit emit`,
`lg-edit readback`).

### Proposed amendments to `PHASEMAP.md` (not applied)
- **A1. Particles in phase 4:** add `crates/lg-render/src/particles.rs` (GPU simulation with
  a CPU fallback) and `crates/lg-motion/src/emitter.rs`. Extend the exit test: an emitter
  with a fixed seed is frame-identical across runs, and at intensity 0 it emits nothing.
- **A2. Style rules in phase 2:** add `styles` to `element.schema.json`, plus the
  comparisons from E-OQ7.
- **A3. Phase 11 points here:** phase 11 becomes E5 and depends on E1–E4.

---

## SECTION: axioms

1. **One source of truth.** The scene document. Editor-only data lives under
   `meta.editor` and is never required to run the scene.
2. **Everything is an op.** Users, scripts, plugins, code-view edits, and replay all change
   the document the same way, through the same gates.
3. **Code comes from elements.** Every line of generated code traces to an element through
   its marker. There is no AI and no model in the editor.
4. **Emitters are pure.** Same element and context in, byte-identical fragment out.
5. **Hand edits are never lost.** Drift is flagged and kept as raw on request, never
   silently overwritten.
6. **Panels come from schemas.** No hand-written per-element inspector code. Plugins may add
   widgets per prop type.
7. **Output runs without the editor.**
8. **Determinism.** Seeded randomness only. Same document plus same event stream gives the
   same pixels.
9. **No hard-coded layer names** (inherited from `SPEC.spec` §2.2).
10. **Motion obeys the budget.** Intensity 0 means fully off, for ambient motion and
    particles alike.
11. **Loud, named failures.** Every rejection names its code, target, and cause.

---

## SECTION: tests

- **Op inverse property:** for random valid op sequences, apply then undo-all gives a
  byte-identical document. Fuzzed in CI.
- **Validation fuzz:** random malformed ops are each rejected with a named code, and never
  panic.
- **Round-trip:** every file in `scenes/` loads and saves byte-identical.
- **Particle determinism:** fixed seed and fixed event stream give identical frames twice.
- **Budget:** intensity 0 with nothing else animating gives zero frames rendered (ties to
  phase 6 exit test).
- **Emit determinism:** every scene and component emits byte-identical output across runs
  and machines. Every registered emitter is run twice at registration.
- **Round-trip:** emit then read back gives the original document for every fixture.
- **Incremental equals full:** after any op sequence, the incrementally patched code equals a
  full re-emit.
- **Drift:** fixture hand edits (matching, non-matching, broken markers) each give their
  expected outcome (ops, `E_CODE_DRIFT`, `E_CODE_PARSE`).
- **Contract:** wiring an undeclared event is rejected at edit time.
- **Self-edit lockout:** a fixture edit breaks the editor's own scene; recovery restores the
  last-known-good copy.
- **Visual regression (E7):** recorded sessions replay to the same pixels.
- **Performance:** no targets are claimed yet. E0 sets them after measuring named benchmarks
  (for example: apply latency on a 10,000-element scene; validate time on the same scene).

---

## Open questions

1. **E-OQ1. What does "agnostic" mean for output?** On hold at your request. Options: Looking
   Glass scenes only; plus web exporters (HTML/CSS/JS, framework components); plus native or
   other toolkits. The emitter design works for all of them: each target is an emitter pack.
   Only `lg-export` waits on this.
2. **E-OQ2. Editor before the renderer?** The phase map puts the editor last, and it can't
   self-host until phases 8 and 9. Proposed: build the headless core (E0, E4) early, and no
   temporary web shell, since that would contradict "not Chromium-based." The alternative is
   a throwaway preview shell for earlier hands-on use.
3. **E-OQ3. Permissions (`SPEC.spec` OQ3).** Live-editing another app's scene requires the meta
   layer to rewrite lower layers. The editor cannot fully exist without deciding this.
4. **E-OQ4. Is the code view editable?** WordPress lets you edit a page's markup directly.
   Proposed: yes, with read-back and drift handling as specified. The alternative is a
   read-only code view, which removes `E_CODE_DRIFT` and read-back entirely.
5. **E-OQ5. Collaboration:** single user first, then multi-user merge over the op log?
   Proposed: single user; ops already carry `base_rev`, which leaves room for merging later.
6. **E-OQ6. Visual feel (`SPEC.spec` OQ9):** decides default tokens, particle presets, and the
   editor's own look.
7. **E-OQ7. Expressions (`SPEC.spec` OQ10):** style rules need comparisons (`gt`, `lt`, `eq`,
   `between`) and event recency (`within_ms`). Proposed: add these to phase 2's set, still
   no general scripting.
8. **E-OQ8. Name.**