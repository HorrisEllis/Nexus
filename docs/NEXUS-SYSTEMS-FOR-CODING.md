# Nexus — each system, and what it needs for Nexus to code (2026-10-29)

James, 2026-10-29: "Maybe make a full document of each system and what it needs to get nexus coding." · "Each component needs to be wired
to the module component, and ui"

Every number here comes from two scripts anyone can rerun:
- `node scripts/systems-report.js`;
- `node scripts/wired-report.js`.

What is not a number is marked as the coder's reading. Nothing below has been seen running on his PC: the sandbox cannot reach it. That is
the first gap (see "The order" at the end).

## What "Nexus coding" means: the loop

```
his words ──▶ Idearium: spec → phases → DAG (his causal chaining: lib/intent-flow.js) → contract (RAID v2)
                 │
                 ▼
          RAID (cortex) routes each piece ──▶ an agent writes it: Ollama (local, the bulk) · Guardian (Claude/ChatGPT/… in browser tabs)
                 │                                   ▲ Copilot assembles the context each agent is handed
                 ▼
          COS testenv runs the tests ──▶ pass: Versionium records the change · fail: split smaller or switch agent (HL3)
                 │
                 ▼
          Loom knows every component and wire (the spine) · Clear Glass is the browser the providers and Fiverr live in
```

## The measurements

Columns:
- **files:** code files, tests and the archive left out.
- **wired:** reachable from something that starts.
- **loom:** has a Loom component.
- **loom+wires:** that component has at least one wire.
- **spec:** a spec module owns the file (the module's `path:` names it).
- **tested:** a test names the file. This is generous: a test may name it without testing it.
- **open:** phases the maps still call open.

| system | files | wired | loom | loom+wires | spec | tested | open |
|---|---:|---:|---:|---:|---:|---:|---:|
| idearium | 137 | 88% | 97% | 77% | 15% | 77% | 151 |
| clear-glass | 230 | 96% | 90% | 62% | 36% | 78% | 89 |
| guardian | 67 | 87% | 100% | 76% | 1% | 78% | 19 |
| copilot | 45 | 93% | 100% | 87% | 4% | 58% | 13 |
| ollama | 22 | 100% | 95% | 91% | 5% | 95% | 1 |
| cortex (RAID) | 46 | 85% | 100% | 80% | 9% | 74% | 44 |
| loom | 59 | 93% | 95% | 92% | 14% | 53% | 23 |
| versionium | 25 | 96% | 80% | 76% | 8% | 92% | 4 |
| orchestrator | 26 | 92% | 96% | 85% | 8% | 54% | 10 |
| cos | 353 | 50% | 99% | 85% | 3% | 46% | 65 |
| intelligence | 81 | 91% | 98% | 91% | 2% | 77% | 9 |
| architect | 6 | 100% | 100% | 67% | 0% | 67% | 3 |
| diagnostic | 15 | 93% | 100% | 93% | 0% | 80% | 15 |
| lib (shared) | 758 | 81% | 94% | 80% | 10% | 56% | 267 |

**Idearium's routes (its doors):** 484 in all.
- 383 are called by a screen;
- 158 are called by a command row, so an agent has them;
- 68 are called by neither (the list is in the JSON the script writes).

**Caveats:**
- The Loom registry measured is the last one written to disk (2026-10-24); it is rebuilt at boot.
- "open" is the maps' own word. Many September maps were never closed after their phases were built, so that column overstates what is
  really missing. It is shown, not trusted.

## What the numbers say about his rule: component → module → UI

**Loom wiring is mostly there.** 90–100% of files are registered, and 62–93% have a wire.

**Specs are the gap.** 0–36% of files are owned by a spec module, so most components cannot be rebuilt from a spec yet. This is the
measure of his 2026-10-20 rule ("everything needs to be speccced before built, so it can be rebuilt if lost"). It has been held for new
work since that date, but not applied back to the older code.

**UI is mostly there for Idearium:**
- 79% of its routes have a screen;
- 33% have a command row;
- 14% have neither.

**The coder's recommendation, which makes no new tool:**
1. **Enforce it forward.** A new component passes only with a spec module, a Loom wire, and a screen or command. The parts exist:
   - the spec test (`test-substrate-spec`);
   - the boundary ratchet;
   - this report.
2. **Close it backward** with the Finish tool on Nexus itself: `repo convert` turns docs into specs, and `repo spine` writes the
   registry. Start with the systems on the coding loop: Idearium, Copilot, Guardian, Ollama, RAID.

## Each system: its part in the loop, and what it needs

### Idearium — where the work is defined and driven
- **Does:**
  - repos, specs, phases, the DAG, the build loop;
  - the Finish tab (spine, convert, split, refactor);
  - the Do box (his causal chaining → a contract).
- **State:** 88% wired, 77% Loom-wired.
  - His screenshot showed it not answering within 6 s ("busy").
  - His log showed missed heartbeats while the self-sync walked 4,801 files.
- **Needs:**
  1. **To answer while it syncs** (HL0). The self-sync must stop blocking its event loop. This is the root cause seen in his log, and
     the first fix.
  2. Its 68 routes with no screen or command: each gets one, or is retired with a reason.
  3. Spec modules for the ~116 of its 137 files that have none.

### Clear Glass — the browser: provider tabs, Fiverr, the gig menu
- **Does:**
  - the tabs where Guardian's providers live;
  - autofill, the gig panel and Fill menu, the macros, the driver.
- **State:** 96% wired. The Fiverr chain is mapped in `docs/2026-10-29-fiverr-income-phasemap.spec`.
- **Needs:**
  1. To be proven on the live Fiverr editor (FI10), after he passes Press & Hold.
  2. More Loom wires: 62% is the lowest of any system.

### Guardian — the only door to AI providers
- **Does:** dispatch to the provider tabs (Claude, ChatGPT, DeepSeek, Gemini, Perplexity) and to Ollama, plus the job queue.
- **State:** pre-cleaned today (82 → 67 files). 87% wired. Spec modules: 1%.
- **Needs:**
  1. A provider signed in and answering on his PC. Without one, the agents' path to Claude or ChatGPT is closed.
  2. To run in its COS compartment (GD2–GD8 open since 2026-10-24); this is also his plugin idea.
  3. Its two unwired features: `.command` nodes as the source of truth, and `.agent_model` nodes.
  4. `test-guardian-data-sovereignty` fails 3 checks here because the sandbox lacks his `data/`. Run it on his PC to know.

### Ollama — local coding, the bulk worker
- **Does:** the local model bridge; one planned file per request (his rule).
- **State:** 100% wired, 95% tested: the most finished system.
- **Needs:** memory on his PC. qwen2.5-coder:7b needs 5.2 GB, and his log showed 9–14% free. The fix is a smaller model, or not loading
  it while other heavy work runs. This is a choice for him (it trades quality for room).

### Copilot — context: what each agent is handed
- **Does:** assembles context, classifies intent, drafts (a gig from his profile).
- **State:** 93% wired, 58% tested.
- **Needs:** to run on his PC for gig drafting (FI5) and for builds. The gig files already cover the content without it.

### Cortex / RAID — routing, contracts, the end-state verdict
- **Does:**
  - routes each piece to an agent;
  - contracts (v2 gates);
  - the compartment engine (PASS commits, FAIL rewinds);
  - learned budgets (how big a piece each agent handles).
- **State:** 85% wired.
- **Needs:**
  1. Chunk-or-switch for every contract, not only phase builds (HL3).
  2. The gap graph (HL10): each step of his chain becomes a gap whose condition is checked in a compartment.

### COS — compartments, the test environment
- **Does:**
  - runs tests for the build loop (`cos/testenv` runTarget);
  - compartments that wall off a process.
- **State:** 50% wired. The lowest, and the biggest pile of unwired code: anonymity services, archetypes, remote desktop (about
  17,000 lines nothing loads).
- **Needs:**
  1. Nothing new for coding: the testenv it already serves is wired.
  2. His call on the unwired 17,000 lines: wire them, keep them, or archive them. The coder's recommendation is to leave them until the
     loop works.

### Versionium — every change and version, in full (§17.12)
- **Does:** records each change before and after, and the releases with their commits.
- **State:** 96% wired, 92% tested. Its boot freeze (0.60.278) was fixed in 0.60.285.
- **Needs:** to be seen recording on his PC (`versionium pending` shows what waits).

### Loom — the self-model: components, wires
- **Does:** the registry the system reasons over ("who uses this").
- **State:** 93% wired, 92% Loom-wired.
- **Needs:** the per-project spine (`nexus.spine.json`, 0.60.286) and Loom are two registries today. IN3 (the registry is the spine)
  makes them one; that phase is open.

### Orchestrator · Intelligence · Architect · Diagnostic
- **Orchestrator:** starts and proxies (92% wired). Needs: nothing new for the loop.
- **Intelligence:** the gaps and the causal-failure record (91% wired). Needs: its gap lifecycle joined to the gap graph (HL10).
- **Architect:** blueprints (6 files). Needs: to mirror the registry (IN5), later.
- **Diagnostic:** health and repair (93% wired). Needs: nothing for the loop.

### lib — the shared kernel
- **State:** 758 files, 81% wired.
  - About 140 lib files are reached only by tests or by nothing: `lib/ui` and parts of `lib/cli`, among others.
  - Known red, before and after this work:
    - test-node-schemas NS-003 and NS-012 (the failure_mode schema against ico.js);
    - test-build-surface BS7-04.
  - `changelog.test` was red for a stale fixture; it is fixed in 0.60.289 (5/5).
- **Needs:**
  1. The text-written tool call (qwen writing a tool call as text, shown as the answer) to run as a tool. That is in
     `lib/agent-tools` runToolLoop, and it matters as soon as Ollama does the coding.
  2. The two red suites traced.

## The order (his, and by the axioms)

1. **Nexus runs on his PC** (HL0 / FI0): Idearium answers while it syncs, memory holds, a provider answers. Everything else waits on
   this. It needs his startup log.
2. **Fiverr live** (FI10 → FI11): the shortest path to money. It needs no new code, only proof and fixes from the live page.
3. **The coding loop end to end:** an order or a phase goes from contract to agents to tests to Versionium, on his PC.
4. Then:
   - his rule backward (specs for the loop's systems);
   - chunk-or-switch everywhere (HL3);
   - the gap graph (HL10);
   - Guardian into COS (GD).

Re-measure any time: `node scripts/systems-report.js` and `node scripts/wired-report.js`.
