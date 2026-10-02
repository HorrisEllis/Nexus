# 0.39.298 — 2026-10-02

James: "need the spec workshop, completely destroy the spec builder, and build the spec workshop, with architect for archiecture using the component registry, components store with dependancies"
James: "idea -> spec workshop -> architect -> destroy and rebuild blueprint -> Idearium repo -> Cos?"
James: "ccontinue"

## The Architect, the pipeline's third station
The Architect is its own page in the Void's look, all capitals. It takes a spec and lays it out as components.

- **Start from** a spec in the workshop, or a repo's spec file. The spec's sections come along and stay readable in the side panel.
- **The agent proposes, you decide.** PROPOSE THE COMPONENTS asks the agent for the spec laid out as components: a name, a layer, a purpose, and what each one needs. Each proposal waits for your ACCEPT or DISMISS, or ACCEPT ALL. Nothing becomes the architecture without your yes.
- **Your own hand:** add a component, rename it, move it to another layer, change what it needs, or remove it. Removed components are kept and can be restored.
- **Four bands, bottom-up:**
  - INTERFACE: what a person touches;
  - SERVICE: what runs;
  - LIBRARY: the logic;
  - FOUNDATION: data and storage.

  Wires run from each component to what it needs.
- **Reuse before build.** Every component is matched against loom's component registry and the component store, with a score for each candidate. REUSE marks a candidate as what this component *is*; NEW is the default. Reused components glow green.
- **What it says, never hidden:**
  - a **gap**, when something is needed and nothing here is it, drawn red and dashed in its band;
  - **cycles**;
  - **layer warnings**, when a lower layer depends on a higher one;
  - **the build order**, bottom-up.
- **Save (Ctrl+S)** writes `spec/<name>.architecture.yaml` beside the spec in its repo. The file holds the build order, the layers, each component with its reuse, and the gaps, cycles and warnings.
- **One path through the stations:** the workshop's ARCHITECT station opens this page, and this page's SPEC station goes back to the workshop. The Create menu has THE ARCHITECT.
- **API and CLI, first:**
  - `/api/architect/*`: list, sources, create, show, update, propose, accept or dismiss (one, or `all`), match, save;
  - `idearium architect list|new|show|propose|accept|add|reuse|save`.

## Found while building: loom's registry was months stale
The Architect's reuse check couldn't find the component store in loom's registry, although the store exists and is wired in the maps. The cause: `loom/data/registry.json` had not been regenerated since 0.39.262. Each release restored the old file, and nothing rebuilds it at boot.

It is now regenerated from an empty registry, with these results:
- **2740 components, 2793 hooks, 3022 wires.** The old file had 2275 components and 8751 wires.
- **The old wires were mostly duplicates.** Those 8751 were only 1838 distinct edges.
- **The 127 old edges missing from the new file are stale.** 91 point at things that no longer exist, and 36 are no longer in the code.
- **Rejections are unchanged from before:** 10 duplicate ids and 109 missing endpoints, none from the maps touched here.

The Architect is wired into loom: the API calls `idearium/lib/architect.js` and `lib/component-store.js`.

## Enterprise grade, as the Void and the workshop
- **Limits:** 200 components, a name at most 80 characters, a purpose at most 1000. Going over is refused, with the reason.
- **Every call has a deadline**, and agent calls show a running timer.
- **States:** opening, empty, and unreachable with TRY AGAIN.
- **No browser dialogs; capitals everywhere.**

Found in the browser: the wires' layer kept its wide size after the window narrowed, which held the page wide. It is now collapsed before it is measured.

## Proof
- `tests/modules/test-architect.test.js` passes 8/8. The run went through the router with a stand-in agent: workshop → architect → propose → accept all → the gap → reuse the component store (offered by loom's real registry) → close the gap → save. The saved file's build order is component-store → weather-feed → bed-planner → garden-page.
- **Chromium against the real server, with a stand-in agent:**
  - workshop spec → propose → accept all → the gap shown → reuse the component store → save;
  - no console errors, no browser dialogs, no lowercase text on the page;
  - wide and narrow, with no sideways overflow.
