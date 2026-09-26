# Gap Migration Manifest — 2026-09-11

Staging artifact only. Zero filesystem mutation. Companion to
`2026-09-11-gap-migration-manifest.json` (full per-gap detail, 175 entries,
529KB).

## Pipeline, as run

```
1574 snapshots (cortex/data/snapshots/)
      ↓ parse + filter empty
899 non-empty (675 empty envelopes discarded — 43%)
      ↓ dedupe by gap uuid, latest by lastSeenAt
175 real, unique gaps (from 10,132 raw occurrences — ~58x duplication)
      ↓ classify by source
6 categories, below
      ↓ propose destination under BOTH candidate layouts
manifest (no write)
```

## Classification — real, evidence-checked, not defaulted to Cortex

| Category | Count | Basis |
|---|---|---|
| `system-owned` | 79 | source's top-level segment matches a known sovereign system |
| `nexus-global` | 57 | all `intent-classifier` — confirmed via `lib/intent-classifier.js`'s own header: "Every request — from user, orchestrator, or autonomous loop — enters RAID through this gate" |
| `shared-infrastructure` | 20 | `nexus.lib.*` sources — real shared `lib/` components, not single-system property |
| `test-discovered` | 10 | `nexus.tests.modules.*` — real gaps surfaced during a real test run, tagged by the test's module path. Checked, not assumed: the actual test files (`error-capture.test.js` etc.) use different, unrelated source strings internally (`'main-process'`) — these aren't fixture noise, they're real findings from real test execution, just not owned by a system |
| `stale-reference` | 2 | `nexus.service.bridge-service` — checked: `service/bridge-service.js` does not exist in this tree. Bridge is retired; this almost certainly references now-dead code |
| `unresolved` | 7 | 5 with no `source` field at all; 2 `nexus.ui.forge-shell` — checked via grep against `hooks/`, `guardian/`, `cockpit/`, no clear ownership signal found. Left unresolved rather than guessed |

**79 system-owned, by system:**

copilot 18 · cortex 8 · ollama-bridge 8 · loom 6 · guardian 6 · eravos 6 ·
diagnostic 6 · emerge 7 · architect 4 · clear-glass 2 · idearium 2 ·
ollama 2 · orchestrator 2 · bridge 2

## The two frozen decisions, restated

Nothing below gets written until both are answered:

1. **Nesting order.** `data/ledger/<system>/<component>/<date>.jsonl` (87
   real files, already live) is **type → system → date**. This manifest's
   `proposedDestination.systemFirst` (`data/<system>/gap/<date>/<uuid>.gap`)
   is **system → type → date** — the opposite. One of these is the
   exception, not both simultaneously canonical.
2. **Where do `shared-infrastructure`, `nexus-global`, `test-discovered`,
   `stale-reference`, and `unresolved` actually live?** Not defaulted to
   `cortex/` — that would recreate the exact ownership inversion this
   phase exists to remove. `proposedDestination` currently stubs these as
   `data/_unresolved/...` / `data/nexus/...` as placeholders, not
   recommendations.

## What's still unpriced

`event_log` (~2,550 rows/snapshot, no node schema yet, dedup ratio unknown
— likely lower than gaps' 58x since events may be closer to append-only,
not checked) and the other 14 mostly-empty table types in the same
snapshot envelope. Sizing those is real, separate work, not attempted here.
