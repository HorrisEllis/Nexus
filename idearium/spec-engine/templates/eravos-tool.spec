// ERAVOS TOOL TEMPLATE v1.0.0
// UUID: idearium-template-eravos-tool-v1-0000-2026-1016-jamesbrooks-001
// §0.60.104 CN4 — James, 2026-10-16: "creating templates for cos and ideariun spec workshop" (with Eravos-merged.zip).
// Source, quoted not invented: his templates/tool/__TOOL__.spec (identity, ports, params, behaviour, needs, packs,
// acceptance), templates/tool/__TOOL__.engine.js (the engine's comment) and schemas/tool.schema.json (the manifest).
// One tool on one canvas; in Nexus it is its own COS compartment nested under the canvas (cos-archetype:eravos-tool).

version 1.0.0

## SECTION: meta

# Meta — ERAVOS tool

- schema: eravos.tool/1 · version 0.1.0 · status building
- id: <domain-qualified, e.g. eravos.pads or eravos.image.curves> · label (≤ 40 chars) · domain (folder under tools/) ·
  category (folder under tools/<domain>/tools/)
- Laid out from the COS archetype eravos-tool (or eravos-sound-tool): tool.json, <tool>.engine.js, <tool>.ui.js,
  <tool>.spec, <tool>.test.js, preview.svg, packs/factory/pack.json.

## SECTION: purpose

## Purpose & Intent

purpose: <one sentence — what someone can do with it>

## SECTION: schema

## Data Schema — the manifest (tool.json)

"Packaging + meta for one tool. The engine's define() stays the truth for params and ports; build/validate.mjs checks
the two agree." Required: schema, id, version, label, domain, category, summary (≤ 200 chars: "one sentence: what you can
do with it"), files (engine required; ui optional — "services and headless tools have none"), needs.

params (the engine's config — each with key, type, default, range, label, group):
  amount: number 0..1 def 0.5
  mode: enum [a, b] def a

## SECTION: api

## Ports & Params

"The engine is the truth for params (config) and ports (hooks). It runs with no window (headless) and talks to the world
only through its ports: declared events in/out, typed wires. Nothing else."

ports:
  in:  [<tool>.hook.in  (event <tool>:input)]
  out: [<tool>.hook.out (event <tool>:value {value})]
ui_hooks: UI → engine events this tool accepts (besides the standard ones), e.g. poke

## SECTION: events

## Events

behaviour:
  - emits <tool>:value whenever amount or mode changes, or on poke
Types: event topics (with a JSON schema), or typed wires (audio, modulation, image…).

## SECTION: integration

## Integration Points

needs: units [] · tools [] · permissions [bus_publish, bus_subscribe]
packs: accepts [presets] · ships [factory] ("keep presets empty: presets ship as content packs in packs/<id>/pack.json")
works_with: [] · conflicts: []
On the canvas: the canvas finds the tool through tools/<domain>/tools/index.js, which build/index-tools.mjs writes from
the folders. In Nexus the tool's compartment is linked into the canvas at tools/<domain>/tools/<category>/<tool>/.

## SECTION: failure_modes

## Failure Modes

- unmount must leave zero subscribers, ports and wires ("release anything ctx.track() does not")
- params clamp to their range
- a shipped pack preset that does not load is a failure, not a skip

## SECTION: build_order

## Build Order

1. tool.json (the manifest) · 2. <tool>.engine.js (define() + engine(ctx), headless) · 3. <tool>.ui.js (the window, if
any) · 4. packs/factory/pack.json · 5. <tool>.spec, kept true · 6. <tool>.test.js · then on the canvas:
node build/index-tools.mjs (the loader picks it up) · node build/validate.mjs (checks it against the schemas).

## SECTION: tests

## Tests

acceptance (each must pass before status → built):
  - setting amount emits exactly one <tool>:value with that value
  - standard: unmount leaves zero subscribers/ports/wires; params clamp; every shipped pack preset loads
"The contract is shared (tests/harness.js TH.toolContract): spawns clean, every shipped preset loads in range, save →
load is exact, closing leaves nothing behind, Stop all is obeyed. Add this tool's own tests below it."
