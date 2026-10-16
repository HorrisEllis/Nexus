# 0.60.68 — 2026-10-15

James: "Use the templates. The genesis by default."

(After "So it can spec now?" — I had said a compiled spec came out as the spec compiler's generic TypeScript package,
nothing like a Nexus system.)

## Read first

Genesis was already Idearium's default system template: `speceng.create` starts a system spec from it (GN1, 0.39.286).
Its file tree is the nexus-system skeleton (SB31). And `lib/file-tree-plan.js plan({ slot })` already slots components
into that skeleton: `slotIn` writes a registry entry plus component, capability, command, event, route and hook nodes
for each one. The spec pipeline ignored all of it. Now it uses it; nothing was built beside it.

## What changed

- **A collected spec is laid out from a template.** The template is chosen in this order: the request, then the
  spec's own `meta.template`, then the setting `specs.default_template`, which defaults to **genesis**.
- **Genesis**: the nexus-system skeleton (server, CLI, config, registry, interaction contract, event taxonomy, JAA
  store, node index, listener, heartbeat, handoff, modules, tests), with the spec's modules slotted in:
  - each module is a component: a registry entry, plus component, capability, command, event, route and hook nodes;
  - each export (`append(entry) → Receipt`) is one of its commands;
  - each component's own `lib/` file is listed **to build**, with what it must export, and is not stubbed. Genesis's
    rule: "nothing pretends to work".
- **Other templates still work**: `compiler` (the TypeScript scaffold, the old default) and any file-tree template
  (`cos-archetype:…`, `cos-blueprint:…`, an eravos mod). An unknown one is refused by name.
- **The spec framework tells the agent** its spec is laid out on genesis: name only the modules the system adds, and
  set `meta.template: genesis`. If your blocks were saved under 0.60.66, that stored text follows the new default; your
  own edit is kept.
- **Everywhere it shows**: the route, `repo compile-spec --template`, and the Agent tab's compile button say which
  template was used and what's left to build.

## Proof

`tests/modules/test-spec-pipeline.test.js` 12/12:
- SP-08: genesis by default — the skeleton's server, CLI, registry, contract, taxonomy and JAA store proposed; the module
  slotted in (component node, a command node per export, its events, the registry entry); its lib file listed to build
  with `append(args, ctx), read(args, ctx)`; an existing package.json not overwritten; nothing written until applied.
- SP-08b: `compiler` by request or by `meta.template`; genesis when none is named; an unknown template refused.
- SP-08c: the framework carries the genesis line; a stored 0.60.66 copy follows the new default, his own edit stays.

## To confirm

I read "use the templates" as: lay the spec out from Idearium's template catalog, genesis first. The other reading is
that the agent should fill in a template document's sections. Tell me if that's what you meant.
