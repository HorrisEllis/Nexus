# docs/2026-11-05-sovereignty-phasemap.spec — every system sovereign: its door, then no file of another system opened, and none of its own
# opened by another. The order is James's ("doors. then we need to make each one soveriegn"); the measure, the cut and the sequence are the
# coder's, decided by his axioms (cited). MAPPED 2026-11-05.

origin: >-
  James, 2026-11-05: "okay. doors. then we need to make each one soveriegn" — after "doors is best right? that gets each system soveign?" and
  the coder's answer that a door is the way in, and sovereignty is also nothing crossing into or out of a system's folder. His rules: "Each
  system is sovereign. It is responsible for its own data, its own modules. Its own commands" (2026-11-03) · "Like I can’t just move a folder
  and have nexus run still that’s why they need to use the cli and api routes for the server.js. Then connect through the door" (2026-11-05).

the_measure: >-
  lib/system-boundary.js sovereignty() (built 0.60.129, reused): per system, its crossings out (files of others it opens: data — Cortex's JAA
  database — primitive, capability) and in (files of its own others open). Sovereign = 0 and 0. `node lib/system-boundary.js sovereign <system>`
  lists them. On 2026-11-05 (main 0.60.399): 400 crossings; sovereign only components and emerge (no running system). By system, out/in:
  cortex 15/128 · intelligence 7/88 · cos 0/72 · copilot 21/35 · idearium 31/7 · loom 0/34 · orchestrator 26/7 · guardian 19/5 ·
  clear-glass 9/9 · versionium 9/3 · ollama 0/11 · diagnostic 10/1 · architect 3/0. lib/ itself opens systems' files 250 times.
  Every phase below lowers these numbers; the census may never grow (the ratchet, DB1).

found: >-
  The blocker shared by every system is data: cortex/memory/jaa-db.js, Cortex's store over data/cortex/memory, is opened directly by 91 files
  (127 synchronous call sites: insert, query, tail, update) — even Versionium opens it five times. It is the kernel's engine (lib/jaa-store.js,
  JaaStore(dir)) under Cortex's singleton. Precedent: Guardian got its own store on the same engine and reaches Cortex by its routes (SS1, 0.60.208).

decisions:
  SV_D0_each_system_keeps_its_own_tables:
    status: "DECIDED 2026-11-05 by his axioms"
    chosen: >-
      Each system keeps the tables it writes in its own store (the kernel's JaaStore over <system>/data/memory, as Guardian since SS1), and
      asks another system for that system's data through its routes. Cortex keeps Cortex's tables. Which table is whose is found by who writes
      it (the census of inserts), never guessed; a table two systems write is a question for him.
    by_the_axioms: >-
      his 2026-11-03 "Each system is sovereign. It is responsible for its own data" (§5.9, §5.15); "one system going down must break no
      other" (docs/CLAUDE.md 2026-10-29) — one shared database breaks every system when Cortex is down; §8.6 reuse: the engine and Guardian's
      pattern exist.
  SV_D1_where_the_engine_lives:
    status: "OPEN — his (asked 2026-11-05 with genesis: a copy of the deterministic core in every system, or one read-only kernel in lib/)"
    note: "SV_D0 does not wait on it: each system's store uses lib/jaa-store.js today (a kernel primitive, not another system's file); if he
      chooses copies, the engine moves into each system with genesis's hash check, as one later phase."

phases:
  SV1_the_tables_and_their_writers:
    status: "LATER — an idea, shelved 2026-11-07 (his: 'Those are all top of my head ideas'; the door is one idea, docs/FRAMEWORK-THREADS.md T8; picked up as ERV0 or the door spec, docs/2026-11-07-phases-are-ideas-phasemap.spec PIC0); was: OPEN"
    depends_on: [SV_D0_each_system_keeps_its_own_tables]
    files: [lib/system-boundary.js, scripts/jaa-table-owners.js, docs/2026-11-05-sovereignty-phasemap.spec]
    does: "For every JAA table: which files insert or update it, and so which system owns it. Printed per system; a table with writers in two systems listed for him."
    proof: "every table in data/cortex/memory has an owner or is listed as shared"
  SV2_versionium_sovereign:
    status: "LATER — an idea, shelved 2026-11-07 (his: 'Those are all top of my head ideas'; the door is one idea, docs/FRAMEWORK-THREADS.md T8; picked up as ERV0 or the door spec, docs/2026-11-07-phases-are-ideas-phasemap.spec PIC0); was: OPEN"
    depends_on: [SV1_the_tables_and_their_writers]
    files: [versionium/lib/store.js, versionium/lib/causality.js, versionium/lib/engine.js, versionium/lib/snapshot.js, versionium/routes, intelligence/routes.js, lib/change-record.js, lib/repo-inject.js, cortex/snapshot/index.js]
    does: >-
      The smallest system with a door first. Out 9: its 5 data crossings onto its own store (its tables moved home, said); the 4 into
      Intelligence's rfr2 and cfr onto Intelligence's routes. In 3: lib/change-record.js and lib/repo-inject.js ask Versionium's routes for
      text diff and merge3, and Cortex's snapshot asks its route.
    proof: "sovereign versionium → 0 and 0; its suites unchanged; with Cortex stopped, Versionium still answers"
  SV3_diagnostic_and_ollama:
    status: "LATER — an idea, shelved 2026-11-07 (his: 'Those are all top of my head ideas'; the door is one idea, docs/FRAMEWORK-THREADS.md T8; picked up as ERV0 or the door spec, docs/2026-11-07-phases-are-ideas-phasemap.spec PIC0); was: OPEN"
    depends_on: [SV1_the_tables_and_their_writers]
    files: [diagnostic, ollama, lib]
    does: "Diagnostic (10 out, 1 in) and Ollama (0 out, 11 in): the same, one system at a time."
    proof: "sovereign diagnostic and sovereign ollama → 0 and 0"
  SV4_cortex_sovereign:
    status: "LATER — an idea, shelved 2026-11-07 (his: 'Those are all top of my head ideas'; the door is one idea, docs/FRAMEWORK-THREADS.md T8; picked up as ERV0 or the door spec, docs/2026-11-07-phases-are-ideas-phasemap.spec PIC0); was: OPEN"
    depends_on: [SV1_the_tables_and_their_writers, DO3_cortex_door]
    files: [cortex/server.js, cortex/routes, cortex/memory/jaa-db.js]
    does: >-
      The 128 in: each caller's own tables move to its own store (SV_D0); what is really Cortex's is asked of its door (memory, RAID, snapshots
      — DO3b moves the handlers it needs into cortex/routes). Its 15 out the same way.
    proof: "sovereign cortex → 0 and 0; every system's suite unchanged; Cortex stopped, the others run"
  SV5_the_rest_one_at_a_time:
    status: "LATER — an idea, shelved 2026-11-07 (his: 'Those are all top of my head ideas'; the door is one idea, docs/FRAMEWORK-THREADS.md T8; picked up as ERV0 or the door spec, docs/2026-11-07-phases-are-ideas-phasemap.spec PIC0); was: OPEN"
    depends_on: [SV4_cortex_sovereign]
    files: [intelligence, cos, copilot, idearium, orchestrator, guardian, clear-glass, architect, lib]
    does: "Intelligence, COS, Copilot, Idearium, Orchestrator, Guardian, Clear Glass, Architect: each its door (DO1, DO5, DO7, DO8 where missing), then its crossings; lib/'s 250 move home to the systems they serve."
    proof: "the census at 0; every system sovereign; each folder moved and Nexus still runs (his test)"

order: "SV1 (who owns which table) first, then the smallest systems (SV2, SV3) as proof, then Cortex (SV4), then the rest (SV5)."
