# Open phases of 2026-10-10 — where each one goes

James: "Can you look at all the phases. Spec anything that be created into a spec file to build." · "Build a spec for the full language routing, anything else from today"

Today's six phasemaps have **63 phases, 16 done and 47 open**. Each open phase is either covered by a buildable spec below or stays in its map, with the reason. Nothing is removed: the phasemaps stay the plan, and the specs are what Idearium builds from.

Every spec is in the workshop's own format (`sections:`, each with an id, title and body), in the owning system's spec folder, so that system's Nexus repo opens it in the workshop. Every decision is written as **choices**:
- options [A], [B], [C], plus a [custom] line;
- the coder's recommendation marked;
- `chosen: open` until James picks.

They are written in the section body, because the workshop keeps only a section's id, title and body when it loads and saves.

## The ten specs

| Spec | Covers | Choices |
|---|---|---|
| `idearium/spec/idea-to-spec.spec` | SD6 (idea thread), SD12 (primitives + relations), SD7 (blocks that generate themselves), SD10 (the adversarial gate), SD14 (chunks at primitives), CH (new: choices in every block) | 6 |
| `docs/language-routing.spec` | LR0 (glyph readers per language, skeletons), LR1 (a language per component, the registry contract, adapters proven in COS) | 4 |
| `cos/spec/torture-chamber.spec` | SN0–SN4 (branch, snapshot as compartment, parallel, rfr2, results teach) + the test/attack/QA catalog as stations | 3 |
| `guardian/spec/agents-and-accounts.spec` | SD4 (.agent per model), SD5 (account fallback), SD8 (an agent fixes a tab), IA5 (accounts per hat/repo), DeepSeek and Gemini parity | 2 |
| `docs/remote-access.spec` | SD15 (security floor, remaining services), IA6 (local key), IA7 (hat is the actor), SSH / tunnel / chat-bot doors | 1 |
| `docs/system-architecture.spec` | the per-system THE_STACK fitness table, loom's future, RAID's order, SH1 (one home per concept) | 4 |
| `clear-glass/spec/design-surface.spec` | DS0–DS8 | 2 |
| `intelligence/spec/self-awareness.spec` | AW0–AW5, EP1 (how each claim is known), EP2 (COS as the empirical layer) | 1 |
| `clear-glass/spec/guided-browser.spec` | CG1 (inject once), CG2 (one source of truth), CG3 (Fiverr tutorial), TU1 (Nexus tutorial), SH2 (explain this anywhere) | 2 |
| `cos/spec/the-machine.spec` | SD11 (desktop inside Idearium), SD13 (the machine is COS's) | 1 |

That is 26 decisions offered as choices across the ten specs.

## Open phases that stay in their map (and why)

| Phase | Why no separate spec |
|---|---|
| SD16 — a plan step never proposes code | A bug fix with a clear proof; build it directly. |
| SD9 — Claude Code inside Idearium | "Check first" work: what the provider list offers for claude-code today. Spec after the check. |
| OP1 — every system declares its options | Mechanical rollout of 0.57.0's shape, system by system; the phase already says how. |

## Every open phase, by map

- **idearium-solid:**
  - idea-to-spec: SD6, SD7, SD10, SD12, SD14
  - agents-and-accounts: SD4, SD5, SD8
  - the-machine: SD11, SD13
  - remote-access: SD15
  - stays in its map: SD9, SD16
- **idearium-access:**
  - agents-and-accounts: IA5
  - remote-access: IA6, IA7
- **shape-of-nexus:**
  - language-routing: LR0, LR1
  - guided-browser: CG1, CG2, CG3, TU1, SH2
  - self-awareness: EP1, EP2
  - system-architecture: SH1
  - stays in its map: OP1
- **snapshot-compartments:**
  - torture-chamber: SN0, SN1, SN2, SN3, SN4
- **design-surface:**
  - design-surface: DS0–DS8
- **self-awareness:**
  - self-awareness: AW0–AW5
