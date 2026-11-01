# 0.60.358 — Fiverr out of the menu; his agent CLI and the macro toast specced and mapped

James, 2026-11-01:
> "can you remove the fiverr from the menu" · "just give the copilot the ability to update. wait, what if we create a cli, literally for the
> agents to use, a mode made for each of them, dynamic, and spectific in relation to them. give them as much power as possible. connects to
> each system using the commands, then each command index for each systems database that the server.js uses with the command nodes. that way
> it updates when any of the systems do. add what of that is missing to genesis and architecture spec."
> "also the macro toast for playback and recording, shows what step your on, out of how many. with a pause and skip, goes back one step."

## Built
- **Fiverr gigs retired from Clear Glass's toolbar.** A new `retired` flag hides it even where his saved pins name it. It stays in the
  palette (§0.3).

## Specced and mapped (not built)
- **His agent CLI:** `docs/architecture-spec/architecture-spec.spec` RULE THE_AGENT_CLI, mapped as CP3a in
  `docs/2026-11-01-the-compartment-phasemap.spec`.
  1. Every system's server.js serves `GET /commands` from its own command nodes. Guardian and Ollama already do; genesis
     (`cos/archetype/nexus-system`) gains it, so every system built from it has it.
  2. One agent CLI reads them live through each system's door, so it updates when any system does.
  3. A mode per agent: that set filtered by the agent's hat scope, with every power a person has except personOnly rows, which are held
     for him.
- **The macro toast** (step i of n, pause, skip, back one step, for playback and recording): MB4 in
  `docs/2026-11-01-macro-blocks-phasemap.spec`.

## Already there
- **Copilot can update Nexus:** procedure `update-nexus` (PD1, 0.60.354), with his yes at the confirm step.
- **COS has an exe:** the `cos-v<version>` GitHub release (portable exe and installer). It starts Nexus itself, with no PowerShell.

## Proof
`test-cg-toolbar-live` 3/3.
