---
name: nexus-session-changelog
description: >
  Produces a structured session changelog entry for the NEXUS project.
  Triggers on: end of any NEXUS build session, when James asks for a changelog,
  or when the session-close protocol fires (§AX-10). This skill is non-optional
  at session end — it is an axiom, not a suggestion. If no changelog file exists,
  create CHANGELOG.md before closing.
---

# NEXUS Session Changelog Skill

## What This Skill Does

At the end of every session, this skill produces a complete changelog entry that is
appended (never overwritten) to the project's `CHANGELOG.md` (or `CHANGELOG-SESSION.md`
if the project uses the session-specific format).

The changelog is a ledger. It follows the same append-only rules as the event log.
Nothing is deleted. Nothing is overwritten. Every session is a permanent record.

---

## Pre-Flight (before writing the changelog)

1. Read the session transcript — what actually changed? Do not summarize from memory. Read the code.
2. Find every file that was created, modified, or deleted this session.
3. Find every system that was affected — ports, specs, tests.
4. Identify every open loop — gaps, deferred decisions, unresolved questions.
5. Identify the compounding summary — what can the system do now that it couldn't before?
6. Identify the next phase — per the phase map in the `.spec`.

---

## Output Format

```markdown
## Session YYYY-MM-DD

### Context
One sentence: what was the focus of this session? What drove it?

### Added
- `path/to/file.js` — what it is and what it does (one line each)
- `path/to/other.spec` — same

### Changed
- `path/to/file.js` — what changed and why (link to the gap or phase that drove it)

### Fixed
- Bug name / gap type — what was broken, what fixed it, what the root cause was

### Specs Updated
- `docs/system.spec` — what changed in the spec

### Tests
- N module tests (was M)
- N brutal tests (was M)
- N static audit checks (was M)
- Note any new tests added or any failures introduced

### Open Loops
Numbered. Carry forward from prior session if unresolved.

1. [OPEN] Description of gap or unresolved decision. What's blocking it? What's needed?
2. [OPEN] ...
N. [CARRIED] Loops from prior session that are still open — reference prior session date.

### Compounding Summary
One paragraph. What is the system capable of now that it wasn't before this session?
Be specific. Name the capability, name what it enables downstream.

### Financial Leverage
If any work this session moves toward something demonstrable, monetizable, or
portfolio-worthy — name it explicitly. One line is enough.

### Next Phase
- Phase N: Name — what needs to happen, per the phase map.
- Unblocked by: what this session completed that enables it.
```

---

## Rules

- **Append only.** Never overwrite a prior entry.
- **Name every file.** Vague summaries ("various fixes") are not acceptable.
- **Open loops are numbered** and carry forward until explicitly closed.
  Closing a loop = writing `[CLOSED YYYY-MM-DD]` next to it in the prior entry,
  and writing the resolution in the new entry's Fixed or Added section.
- **The compounding summary is required.** If you cannot write it, the session
  did not accumulate — that itself is a signal worth naming.
- **If CHANGELOG.md does not exist** → create it with a `# NEXUS Changelog` header,
  then append the first entry. Do not ask permission. §AX-10.
- **If the session was short or exploratory** → still write the entry. Even a
  conversation-only session has a compounding summary and open loops.

---

## Example Entry

```markdown
## Session 2026-06-27

### Context
Architecture alignment session — extracting spotlight from home UI monolith,
adding three sovereign systems (ERAVOS, Ollama Bridge, Co-pilot).

### Added
- `eravos/server.js` — ERAVOS sovereign HTTP server on :3751. Organism spawn/remove,
  wire connect, catalog, pack install, organism-queue, transport.
- `eravos/registry-components.js` — 9 components declared. Registers with orchestrator on boot.
- `ollama/server.js` — Sovereign Ollama bridge on :3749. MAX_CONCURRENT=3, job queue,
  health monitor every 10s, writes outcomes to Cortex chat_log via /api/memory/insert.
- `ollama/registry-components.js` — 5 components declared.
- `copilot/server.js` — Sovereign co-pilot on :3750. Continuous 500-event stream buffer.
  Subscribes to Cortex SSE + Guardian SSE on boot. Dual cognition: INTUITION (fast path,
  no model) + ANALYSIS (7-layer context + Ollama dispatch).
- `copilot/registry-components.js` — 4 components declared.
- `ui/tv-shell/spotlight/spotlight.js` — Extracted from home UI inline script.
  Clean public API: Spotlight.on/off/step/tension/execute/navigate.
- `ui/tv-shell/spotlight/spotlight.css` — Scoped spotlight + pressure CSS.
- `ui/tv-shell/index.html` — TV shell renamed and relocated. Loads spotlight externally.

### Changed
- `autopilot.js` — Added eravos, ollama-bridge, copilot to kernel set.
- `orchestrator.js` — Added eravos:3751, ollama:3749, copilot:3750 to systems map.
- `guardian/server.js` — Bullet density gap threshold 0.5→0.75. Added /guardian-ui/ route.
- `lib/cfr/delta.js` — dom_map tension dampened (-0.6 typeTension).
- `service/nexus-diagnostic.js` — emerge + forge-shell marked optional:true.
- `ui/home/index.html` — Synced with tv-shell. CP inline block removed, stub added.

### Fixed
- Assumption gap flood: gap-hunter was opening assumption gaps on every LLM bullet response.
  Root: threshold was 0.5 (fires on any response with >50% bullet density). Fixed to 0.75.
- Delta tension false 0.82: dom_map payloads are always large — the delta formula was treating
  size difference as instability. Fixed with type-based dampener.
- Diagnostic spam: emerge + forge-shell escalating to repair queue every 30s when offline.
  Fixed: optional:true flag gates the escalation log.

### Tests
- 630/630 module tests (unchanged)
- 187/187 brutal tests (unchanged)
- All new system files syntax-verified

### Open Loops
1. [OPEN] Component registry still has 0 entries — registry-components.js for guardian,
   cortex, architect, emerge, bridge not yet built. Blocks: grammar trie, blueprint, RAID
   component routing.
2. [OPEN] CFR sigma → RAID _decide() wire not yet built. RAID doesn't penalize high-sigma components.
3. [OPEN] Compartment engine doesn't exist as a sovereign module. Referenced in 4 places.
4. [OPEN] ui/eravos/ still exists as copy — can be deleted once eravos:3751 confirmed working.
5. [OPEN] guardian/ui/index.html is the old 3677-line Forge IDE — superseded, not served, not deleted.
6. [CARRIED 2026-06-25] Co-pilot context-assembler reads from Guardian not Cortex for some fields.

### Compounding Summary
NEXUS can now run ERAVOS, Ollama, and the co-pilot as isolated processes. If Guardian goes down,
Ollama keeps processing its queue. The co-pilot now subscribes to the live event stream from two
systems and answers questions about recent events without calling a model. The spotlight system is
a sovereign module that any system can call via HTTP — Cortex can now direct the UI without
knowing anything about HTML.

### Financial Leverage
Co-pilot with continuous stream + dual cognition is the most demonstrable capability this
session — it's a live AI that watches the system and answers from context without API calls.
Worth highlighting in portfolio work.

### Next Phase
- Phase 1 of DECOMP: registry-components.js for guardian, cortex, emerge, architect, bridge.
  This single act populates the registry (0→~150 components), grammar trie, blueprint.
  Unblocked by: ollama sovereign system (now in place as dispatch target).
```

---

## Integration with NEXUS

The changelog skill reads from:
- The session transcript (what actually changed)
- The phase map in the relevant `.spec`
- Prior changelog entries (to carry forward open loops)
- The axioms (to check for drift)

It writes to:
- `CHANGELOG.md` or `CHANGELOG-SESSION.md` in the project root
- Optionally: `docs/session-log/YYYY-MM-DD.md` for archival

The changelog is a first-class document. It is not a courtesy. It is §AX-10.
