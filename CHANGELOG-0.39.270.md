# NEXUS 0.39.270: the Idearium atlas, written from the code

**Date:** 2026-09-27 · base: 0.39.269

James:

> *"tell me about idearium. agent tabs. expand the atlas if you can. it needs to be solid"*

**Mapped before building:** `docs/2026-09-27-idearium-atlas-phasemap.spec` (A1–A4), written before any file below was touched.

## What was wrong

`docs/atlases/idearium-atlas.md` came from an earlier session:

- **Dead references:** 56 of its 150 references did not resolve in the tree, including placeholder paths in code spans.
- **Unfinished sections:** several read "not enumerated this session".
- **Out of date:** it listed the ten default spec agents as current.
- **Missing coverage:** it gave no account of the 13 repo tabs, and described the Agent tab only as three release notes.
- **Wrong in the Nexus atlas too:** the Nexus atlas's Idearium paragraph named six repo tabs, one of them a Run tab that is really a menu.

## What changed

**The Idearium atlas is rewritten.** Every number in it (routes, tabs, blocks, tools, tiers) was read from the source. It covers:

- the process: its port, boot phase, CLI, contract, config, data and ledger;
- the file structure;
- the interface: the 7 views, and the 13 repo tabs with what each shows and reads;
- **the Agent tab, end to end:**
  - one hat per compartment;
  - the nine steps one message goes through;
  - the ollama · copilot · guardian switch;
  - the 14 prompt blocks;
  - context, both kinds of memory, and 109 tools in three scopes;
  - every command, injects and the apply gate;
  - the live feed and late replies;
  - Settings → Agents, where its state lives, and its 37 routes;
- ideas → specs → one chunk's build, in the order it spends tokens;
- repos: import, tiers L0–L8, snapshots, run, git and CI;
- NEXUS inside Idearium;
- the 217 routes by group, the event names, specs and tests;
- what is not built.

**It is held to it.** All 137 references resolve. `tests/modules/test-nexus-atlas-refs.test.js` now includes it in the atlases that must have 0 dead references and 0 plain-text code spans (49/49).

**Nothing is lost.** The old atlas is kept, with a superseded banner, in `docs/atlases/_archive/idearium-atlas.pre-0.39.270.md`.

**The Nexus atlas is corrected.** Its Idearium paragraph now lists the 13 tabs and says what the Agent tab is, and its open-items line no longer names the Idearium atlas as stale. All 405 of its references still resolve.

**Records:** an addendum to `idearium/spec/idearium.spec`, the phasemap registered in `docs/SPEC-REGISTRY.spec`, and `lib/version.js` at 0.39.270.

**Scope:** documentation and one test only. No runtime code changed.
