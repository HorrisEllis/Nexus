# diagnostic — Not Confirmed As a Standalone System

> **status: unresolved** · no central `diagnostic.spec` found this session · real pieces exist scattered across at least two other systems

---

## What This Atlas Actually Is

Unlike every other atlas in this handoff, this one does not describe a confirmed real system. "Diagnostic" was requested as one of eight systems to atlas, on the strength of one real comment — `loom/registry-components.js`'s description of `GET /api/friction`: *"proxied live from the diagnostic kernel (:7825)."* This session searched for a standalone diagnostic system matching that description and did not find one. Writing a confident atlas anyway would mean inventing a system that may not exist in the form implied. This document records what *was* found instead.

---

## Real pieces found, none of them a standalone "diagnostic kernel"

| Path | What it is |
|---|---|
| `clear-glass/src/diagnostic/engine.js` | real, 14KB — a diagnostic engine, but scoped to `clear-glass` (the browser), not NEXUS-wide |
| `clear-glass/src/diagnostic/process-metrics.js` | real — process-level metrics, same scope |
| `clear-glass/src/diagnostic/error-capture.js` | real — error capture, same scope |
| `ui/eravos/organisms/nexus-diagnostic/nexus-diagnostic.engine.js` + `schema/schema.json` | real, small (~1.2KB engine file) — a UI organism named "nexus-diagnostic," not confirmed as a backend system |
| `data/ledger/diagnostic/` | real directory, confirmed to exist in the zip listing — a ledger exists for *something* called diagnostic, contents not read |
| `tests/modules/test-diagnostic-*.js` (4 real files) | real tests exist for diagnostic sweep, heal-path, causal, and general diagnostics — suggests real diagnostic *behavior* exists somewhere these tests exercise, even without a located standalone spec |

## The `:7825` question, still open

`loom.spec` and `loom/registry-components.js` both reference a diagnostic kernel for friction/tension data, but disagree with each other about the actual computation mechanism (see `loom-atlas.md`'s own Self-diagnostics section). Port `:7825` was never confirmed against any file this session. `intelligence.spec`'s `meta/cfr/` (real sigma/friction/regime math, 24 real consumers) is the strongest candidate for where this logic actually lives — but that's a lead, not a confirmed match, and `meta/cfr/`'s own port was not read this session either (`intelligence` itself is `:3753`, not `:7825` — so if `meta/cfr/` is the answer, it isn't necessarily reached the same way `intelligence`'s other capabilities are).

## What to do with this

Before building anything against "the diagnostic system," confirm which of these real pieces (if any) is actually what `:7825` refers to — by reading `meta/cfr/`'s own source, or by grepping the real codebase for `7825` directly, neither done this session.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
