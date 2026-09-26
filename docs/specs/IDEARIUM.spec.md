# IDEARIUM

> **⚠ SUPERSEDED — 2026-09-13.** Nothing below this notice is corroborated by
> `.git`, by `idearium/spec/idearium.spec` (the real, live spec — 72 verified
> routes, `command_index: DONE`), by the node-taxonomy doc, or by any loom
> scanner. The `.map`/`.spec`/`.nex` file trio, the `NEX0` binary header,
> the miniworld manager, the revision manager, and the LAW_VIII/LAW_IX/
> §A-1–§A-4 axioms referenced here do not appear anywhere else in this
> codebase. This is aspirational content that was never wired — the exact
> pattern §1.3 (no fake/stub/skeleton in production) and AXIOMS v3.1 §0.1
> (reality is authority) exist to catch. Kept as historical record per §0.3
> (information must never be lost) rather than deleted. For the current,
> real spec, read `idearium/spec/idearium.spec` and
> `docs/IDEARIUM-PHASE-MAP-v2.md`.

**UUID:** nexus-sys-idearium-0000-2026-0531-004
**Layer:** 9 — meta / IDE
**Port:** :4800
**Status:** SUPERSEDED — aspirational, unwired (see notice above)
**Source:** NEXUS-SPEC-v9.spec, MASTEVOS-v9.spec

---

## What it is

Systems and architecture builder. The IDE. The spec builder and mapper.
Uses `.map`, `.spec`, and `.nex` files as first-class objects.
Source of truth for all architecture decisions.

Not a notes app. The cognitive OS of NEXUS and the complete systems authoring environment.

**The loop:** idea → spec → gate → artifact → memory → crystal → idea

Subsumes and extends: Idearium (v8.0), Architect spec, Rheon IDE, Forge IDE (now Guardian UI).

**File formats** (build order: `.map` → `.spec` → `.nex`):
- `.spec` — living source of truth. Built in spec builder. Never frozen, grows append-only.
- `.map` — living topology file per system. Contains all interaction maps, config, API/CLI map, hooks, manifest, living readme.
- `.nex` — compressed container. Project + versionium snapshots + revision history. Bootable sandbox.

---

## Axioms

| Axiom | Rule |
|-------|------|
| LAW_VIII | MAP BEFORE BUILD — no system built without a `.map` file first |
| LAW_IX | NEX IMMUTABILITY — original `.nex` never modified by sandbox session |
| LAW_VII | UI ISOLATION — Idearium UI connects only through the interaction contract |
| §A-1 | Architecture before implementation. No code without a spec. |
| §A-2 | Hooks are the wire. All inter-surface communication through declared hooks. |
| §A-3 | Map before build. File/data topology mapped before schemas written. |
| §A-4 | Spec is living. Never frozen. Grows append-only. |
| §6.1 | Documentation generated from proof, not written as aspiration. |
| §M1 | Everything stored. Nothing lost. |

**Living spec rule:** The `.spec` is updated at each gate when a meaningful change is requested. Deletions are deprecations with `causedBy`. A `.spec` that is not living has violated its own axiom.

---

## What it does

### Spec Builder

Guided spec creation. Idea → walks spec sections → produces complete spec feedable to gate runner.
System and module aware of all registered COBALT modules.

Required spec sections: `intent`, `api_callto`, `module_hooks`, `gap_contract`, `cli_spec`, `schemas`, `phase_map`, `failure_modes`, `test_suite`

**CLI:**
```
nexus spec new <idea-uuid>
nexus spec show <uuid>
nexus spec check <uuid>     — CI run against spec sections
nexus spec build <uuid>     — run full build pipeline
nexus spec audit <uuid>
nexus spec export <uuid>
```

### Map Builder

`.map` file builder and live topology scanner. One `.map` file per system containing:
- `interaction_maps` — how this system talks to others
- `config_files` — per-system configuration
- `api_cli_map` — all HTTP routes and CLI commands
- `component_hook_map` — all hooks and component registrations
- `manifest` — COBALT record for the system
- `living_readme` — auto-generated from JAA state (§6.1)

Component ID rule: every component ID in the `.map` MUST match its COBALT record, JAA `plugin_hooks`, interaction contract, and living readme section. Mismatch = LAW_IV violation.

**CLI:**
```
nexus map scan <root-path>
nexus map diff <before> <after>
nexus map gaps <system>
nexus map export <system> [--format svg|mermaid|json]
nexus map watch <system>
```

### IDE

Full IDE with SEAM logic and AI-assistance. Built on rheon-ide-v3.3.0 (143/143 tests).
Extends with: web grammar, `.spec`-as-container, `.nex`-as-sandbox, clip capture, GTCI loop, word-association lattice.

**The spec file IS the container. Code is a projection of the spec.**

Active modules: kernel-bridge, field-engine, grammar-engine, seam-engine, guardian-agent, ollama-agent, snr-passthrough, voice-engine, compiler, repo, causal-nexus-module, spec-builder

**Server routes (25):**
```
GET  /           — HTML UI
GET  /health
GET  /api/spec   — current spec content
GET  /api/grammar
GET  /api/gaps
GET  /api/bus/stream    — SSE
WS   /ws         — bidirectional bus bridge + CLI
```

### Compiler (gate chain — Pass 0–3)

- Pass 0: web-engine extracts web path, validates adjacency
- Pass 1: field-engine extracts constraints (WEB-TYPE-VIOLATION gaps block Pass 1 unless bridge declared)
- Pass 2: compiler emits JS
- Pass 3: artifacts written

The compiler validates against the system's `.map` topology. Type mismatches in `.map` become compiler gaps. Compiler and IDE share the same JAA tables — they are the same system at different moments of one causal history.

### File Browser

Files are not just files — they are surfaces in the topology map. Opening a file shows its COBALT record, hooks, seam contracts, and gaps.

### Miniworld Manager

Manages multiple NEXUS instances. Each miniworld is a `.nex` file opened as a COS compartment sandbox.

**CLI:**
```
nexus miniworld list
nexus miniworld boot <path.nex>
nexus miniworld fork <miniworld-id>
nexus miniworld snapshot <miniworld-id>
nexus miniworld discard <miniworld-id>
```

### Revision Manager

Manages `.nex` revision history. Every `.nex` is immutable after write. Revision history append-only. Nothing is lost.

**CLI:**
```
nexus revision list <system>
nexus revision show <revision-id>
nexus revision diff <a> <b>
nexus revision checkout <id>
```

### Architecture Builder

Spec uploader and architecture generator. Upload spec → generate full architecture map, component topology, hook registry, seam contracts, build sequence.

**22 hook types:** api, event_bus, callto, direct, webserver, siso_bus, ws, sse, cli, macro, file_watch, signal, broadcast, sink, bridge, transform, gate, compass, timer, lifecycle, debug, custom

### Idea lifecycle

Phases: `seed → expanding → tensioned → specced → building → complete → archived`

Tension engine scores each idea 0..1 based on age, gaps, phase, SNR. High tension = needs attention. SNR tracks overall system quality.

---

## JAA Tables

```
ideas              — idea records with phase + tension
specs              — spec sections, modules, build order
divergence_records — before/after snapshots with sigma/delta
projects           — project records with gate progress
maps               — topology maps per system (NEW v9.0)
map_diffs          — map delta records (NEW v9.0)
```

---

## File formats in detail

### .spec
YAML. Living document. Required blocks: `meta`, `constitutional_laws`, `intent`, `architecture`, `modules`, `causal_map`, `event_model`, `validation`, `snapshots`, `evolution_log`.

### .map
YAML. One per system. Component ID in `.map` must match COBALT record, JAA tables, and interaction contracts everywhere. Watched by `file_api_listener` → delta_engine → sigma check.

### .nex (96-byte header + ZSTD-compressed JSON payload)
```
magic:          NEX0 (4 bytes)
version:        2 bytes
type_byte:      1 byte — 0x01=spec, 0x02=map, 0x03=clip, 0x04=session,
                0x05=behavior, 0x06=grammar, 0x07=bundle,
                0x08=compartment-snapshot, 0x09=sandbox
flags:          1 byte (bit 4 = read-only for original)
sha256:         32 bytes (bytes 16-47)
uuid:           16 bytes
timestamp:      8 bytes
payload_length: 8 bytes
```
SHA-256 of payload verified before every decompress or boot. Type byte must be one of 9 declared types. Original never modified — sandbox writes to shadow layer only. On close: shadow layer discarded or saved as new `.nex` (fork).

---

## What it does NOT do

- Does not capture browser conversations — Guardian does
- Does not run inference — sends to RAID for routing
- Does not directly write to memory tables — uses `cortex.push()`
- Does not execute generated code — uses the playground/torture chamber
- Does not allow UI direct JAA access — only through API (LAW_VII)
- Does not allow IDE to write files directly — all writes through filebase hooks
- Does not allow compiler to import IDE modules — bus events only
- Does not modify `.nex` originals — only fork (LAW_IX)
- Does not build without a `.map` file first (LAW_VIII)
- Does not allow specs to be frozen — they are always living

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-IDEARIUM-01 | Idearium not yet wired to Cortex for memory pull/push | HIGH |
| G-ORCH-02 | `.world` file parser not yet implemented in Idearium | HIGH |
| G-VER-05 | Vortex (Idearium-side) and Versionium sync seam not defined | HIGH |
