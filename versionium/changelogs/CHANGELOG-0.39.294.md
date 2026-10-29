# 0.39.294 — 2026-10-02

James: "need the spec workshop, completely destroy the spec builder, and build the spec workshop, with architect for archiecture using the component registry, components store with dependancies, you know, like maybe its time to start codex. need a better entery point, and  i figure we can start with, idea -> spec workshop -> architect -> destroy and rebuild blueprint -> Idearium repo -> Cos?"
James: "the workshop and maybe it hooks into the spec field"

The whole pipeline was mapped first (`docs/2026-10-02-workshop-codex-rewind-phasemap.spec`). James set the order: the workshop first. This release builds it.

## The spec workshop
- **Where it opens:**
  - **Welcome → Spec workshop**, now the main button;
  - an idea's **✎ spec workshop**;
  - a repo's Spec tab → **open in the spec workshop**;
  - the spec library's **✎ workshop** on a row;
  - `idearium workshop …` in the CLI.
- **Start from:** an idea, a document in the spec library, a repo's spec file, or nothing.
- **Write it yourself or ask the agent.** Six feeds, plus a draft of the open section:
  - **Open loops:** what the spec leaves undecided.
  - **Outside-the-box questions.**
  - **What ifs.**
  - **The d20 roll:** twenty fields (biology, music, logistics, games, ecology, architecture, cooking, aviation, finance, linguistics, medicine, theatre, sport, geology, law, manufacturing, astronomy, textiles, cartography, chemistry), each with one mechanism worth stealing. The roll names one, and the agent maps it onto the spec.
  - **The reverse causal chain:** an invented end-state, the way "a workbench that automatically clears off" is one for a workbench, walked back to what would have to exist.
  - **Inspiration from your work:** connections to the documents in your library and your repos.
- **The ambition dial:** 1 grounded · 2 practical · 3 stretch · 4 bold · 5 outside the box. It changes what the agent is told to reach for.
- **You are the idea generator; the agent only proposes.**
  - A proposal is its own record. Nothing reaches the spec until you accept it.
  - When you accept, it goes into the open section, as a new section, or in place of a section's text. Replaced text is kept.
  - A removed section is kept, and can be restored.
- **It hooks into the spec field.**
  - Saving (Ctrl+S) writes `spec/<name>.spec` into the repo's spec folder, the living model the Spec tab shows.
  - A repo opened in the workshop reads its spec from there.
  - With no repo yet, saving makes one: a library document's own repo (the 0.39.292 pipeline), or else a new repo for the idea, which keeps the same idea.
- **The agent it asks:** your default provider, through copilot's prompt route, the same way a repo's agent is asked.
  - Found on the way: the idea workbench's "assist" was never connected to anything. Its adapter's backend is registered nowhere, so it always answered "not connected". The workshop doesn't use it.

## What is not done yet (said, not hidden)
- **The old spec builders are still in place.** "Completely destroy the spec builder" will be done as retire and archive (§0.3), in UI12, once the workshop has carried real specs.
- **The stations after the workshop are mapped, not built.** Architect (AR2), CODEX (CX0), the destroy-and-rebuild blueprint (BP1) and the one entry point (PL1) show in the workshop's station strip, dimmed.

## Proof
- `tests/modules/test-spec-workshop.test.js`: 7/7. Covers:
  - the dial and the d20;
  - propose-then-accept, including that the agent never writes a section;
  - a failed agent adds nothing;
  - the spec file round-trips;
  - the real router: from an idea → feed → accept → save into a new repo → reopened from that repo's spec;
  - from a library document → saved into its own repo;
  - the surfaces.
- **Driven in Chromium against the real server, with a stand-in agent:** blank → dial 4 → d20 + questions → accept → save to `spec/orbit-garden.spec`. No console errors, and it stacks to one column at narrow widths.
